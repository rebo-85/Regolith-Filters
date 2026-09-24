import fs from "node:fs";
import path from "node:path";

let unicodeEnabled = false;

export function setUnicodeEnabled(enabled) {
  unicodeEnabled = enabled === true;
}

function encodeUnicodeString(value) {
  let result = "";
  for (const char of value) result += `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`;
  return result;
}

export function unicodeJsonText(text) {
  if (!unicodeEnabled) return text;
  let result = "";
  let idx = 0;
  let preserveVersion = false;
  while (idx < text.length) {
    if (text[idx] !== '"') {
      result += text[idx++];
      continue;
    }
    const start = idx++;
    let value = "";
    let escaped = false;
    while (idx < text.length) {
      const char = text[idx++];
      if (escaped) {
        value += `\\${char}`;
        escaped = false;
      } else if (char === "\\") {
        value += char;
        escaped = true;
      } else if (char === '"') break;
      else value += char;
    }
    let next = idx;
    while (/\s/.test(text[next] ?? "")) next++;
    const isKey = text[next] === ":";
    const keep = preserveVersion || (isKey && value === "format_version");
    result += keep ? text.slice(start, idx) : `"${encodeUnicodeString(value)}"`;
    preserveVersion = preserveVersion ? false : isKey && value === "format_version";
  }
  return result;
}

function serialize(value, indent) {
  return unicodeJsonText(JSON.stringify(value, null, indent));
}

export function stripComments(text) {
  let result = "";
  let quoted = false;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;
  for (let idx = 0; idx < text.length; idx++) {
    const char = text[idx];
    const next = text[idx + 1];
    if (lineComment) {
      if (char === "\n" || char === "\r") {
        lineComment = false;
        result += char;
      }
      continue;
    }
    if (blockComment) {
      if (char === "*" && next === "/") {
        blockComment = false;
        idx++;
      } else if (char === "\n" || char === "\r") result += char;
      continue;
    }
    if (quoted) {
      result += char;
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') quoted = false;
      continue;
    }
    if (char === '"') {
      quoted = true;
      result += char;
    } else if (char === "/" && next === "/") {
      lineComment = true;
      idx++;
    } else if (char === "/" && next === "*") {
      blockComment = true;
      idx++;
    } else result += char;
  }
  return result;
}

function escapePattern(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function replaceExactTokens(value, entries) {
  let result = value;
  for (const [original, replacement] of entries) {
    if (!original) continue;
    const pattern = new RegExp(`(^|[^A-Za-z0-9_:/-])${escapePattern(original)}(?=$|[^A-Za-z0-9_:/-])`, "g");
    result = result.replace(pattern, (match, prefix) => `${prefix}${replacement}`);
  }
  return result;
}

function replaceTokenSet(value, entries) {
  if (!entries.length) return value;
  const replacements = new Map(entries);
  const pattern = new RegExp(`(^|[^A-Za-z0-9_:/-])(${entries.map(([original]) => escapePattern(original)).join("|")})(?=$|[^A-Za-z0-9_:/-])`, "g");
  return value.replace(pattern, (match, prefix, original) => `${prefix}${replacements.get(original)}`);
}

function refName(value, name) {
  const namespaced = value.match(/^([^:]+):(.+)$/);
  if (namespaced) return `${namespaced[1]}:${name}`;
  if (value.startsWith("geometry.")) return `geometry.${name}`;
  const dotted = value.match(/^(controller\.(?:animation|render)|animation|geometry|texture)\.([^\.]+)\..+$/);
  if (dotted) return `${dotted[1]}.${dotted[2]}.${name}`;
  if (value.startsWith("textures/")) return name;
  return name;
}

function aliasName(value, name) {
  const namespaced = value.match(/^([^:]+):(.+)$/);
  return namespaced ? `${namespaced[1]}:${name}` : name;
}

export function replaceString(value, symbols) {
  let result = value;
  for (const [original, replacement] of Object.entries(symbols.paths).sort(([a], [b]) => b.length - a.length))
    result = replaceExactTokens(result, [[original, replacement]]);
  for (const [original, replacement] of Object.entries(symbols.refs).sort(([a], [b]) => b.length - a.length))
    result = replaceExactTokens(result, [[original, refName(original, replacement)]]);
  const aliases = Object.entries(symbols.aliases)
    .sort(([a], [b]) => b.length - a.length)
    .map(([original, replacement]) => [original, aliasName(original, replacement)]);
  result = replaceTokenSet(result, aliases);
  for (const [original, replacement] of aliases) {
    if (!original.includes(".")) {
      for (const prefix of ["texture.", "Geometry.", "Material.", "Array."])
        result = replaceExactTokens(result, [[`${prefix}${original}`, `${prefix}${aliasName(original, replacement)}`]]);
    }
  }
  return result.replace(/\bv\.([A-Za-z_][\w]*)/g, (_, name) => `v.${symbols.vars[name] ?? name}`);
}

export function replaceScriptString(value, symbols) {
  let result = value;
  for (const [original, replacement] of Object.entries(symbols.paths).sort(([a], [b]) => b.length - a.length))
    result = replaceExactTokens(result, [[original, replacement]]);
  for (const [original, replacement] of Object.entries(symbols.refs).sort(([a], [b]) => b.length - a.length))
    result = replaceExactTokens(result, [[original, refName(original, replacement)]]);
  return replaceTokenSet(
    result,
    Object.entries(symbols.aliases)
      .sort(([a], [b]) => b.length - a.length)
      .map(([original, replacement]) => [original, aliasName(original, replacement)])
  );
}

function transform(value, symbols, context = "") {
  if (Array.isArray(value)) return value.map((item) => transform(item, symbols, context));
  if (typeof value === "string") {
    if (context === "render_geometry" && value.startsWith("Geometry.")) return `Geometry.${replaceString(value.slice("Geometry.".length), symbols)}`;
    if (context === "render_textures" && value.startsWith("Texture.")) return `Texture.${replaceString(value.slice("Texture.".length), symbols)}`;
    if (context === "state_value") return symbols.states[value] ?? value;
    if (context === "bone_name" || context === "bone_parent") return symbols.bones[value] ?? value;
    return replaceString(value, symbols);
  }
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => {
      let nextKey = key;
      let childContext = key;
      if ((context === "animation_controllers" || context === "animations") && symbols.refs[key]) {
        nextKey = refName(key, symbols.refs[key]);
        childContext = context === "animation_controllers" ? "controller" : "animation";
      } else if (context === "states" && symbols.states[key]) {
        nextKey = symbols.states[key];
        childContext = "state";
      } else if (context === "render_controllers" && symbols.refs[key]) {
        nextKey = refName(key, symbols.refs[key]);
        childContext = "render_controller";
      } else if ((context === "sound_definitions" || context === "music_definitions") && symbols.refs[key]) {
        nextKey = refName(key, symbols.refs[key]);
      } else if (context === "array_definition" && key.startsWith("array.")) {
        nextKey = `array.${symbols.aliases[key.slice("array.".length)] ?? key.slice("array.".length)}`;
      } else if ((context === "animation_bones" || context === "bone_visibility") && symbols.bones[key]) {
        nextKey = symbols.bones[key];
      } else if (context === "bones" && key === "name") childContext = "bone_name";
      else if (context === "bones" && key === "parent") childContext = "bone_parent";
      else if (context === "transition" && symbols.states[key]) nextKey = symbols.states[key];
      else if (symbols.aliases[key]) nextKey = aliasName(key, symbols.aliases[key]);
      if (context === "controller" && key === "initial_state") childContext = "state_value";
      if (context === "state" && key === "transitions") childContext = "transition";
      if (context === "render_controller" && key === "geometry") childContext = "render_geometry";
      if (context === "render_controller" && key === "textures") childContext = "render_textures";
      if (context === "render_controller" && key === "arrays") childContext = "arrays";
      if (context === "arrays") childContext = "array_definition";
      if (context === "geometry_root" && key === "bones") childContext = "bones";
      if (context === "geometry_root" && key === "bone_visibility") childContext = "bone_visibility";
      if (context === "animation" && key === "bones") childContext = "animation_bones";
      if (context === "geometry_part" && key === "bone") childContext = "bone_name";
      if (key === "minecraft:geometry") childContext = "geometry_root";
      return [nextKey, transform(item, symbols, childContext)];
    })
  );
}

export function obfuscateJson(source, symbols, context = "") {
  return serialize(transform(JSON.parse(stripComments(fs.readFileSync(source, "utf8"))), symbols, context));
}

export function obfuscateJsonText(source) {
  return unicodeJsonText(fs.readFileSync(source, "utf8"));
}

export function obfuscateLang(source, symbols) {
  return fs
    .readFileSync(source, "utf8")
    .split(/(\r?\n)/)
    .map((line) => {
      if (!line || line.startsWith("#") || !line.includes("=")) return line;
      const separator = line.indexOf("=");
      return `${replaceString(line.slice(0, separator), symbols)}${line.slice(separator)}`;
    })
    .join("");
}

export function obfuscateTextureList(source, symbols) {
  const values = JSON.parse(fs.readFileSync(source, "utf8"));
  return serialize(
    values.map((value) => symbols.paths[value] ?? value),
    "\t"
  );
}

export function obfuscateTextureSet(source, symbols, textureRel) {
  const value = JSON.parse(stripComments(fs.readFileSync(source, "utf8")));
  const textureSet = value?.["minecraft:texture_set"];
  const sourceDir = path.posix.dirname(textureRel);
  if (!textureSet) return serialize(value);
  for (const [key, item] of Object.entries(textureSet)) {
    if (typeof item !== "string") continue;
    const mapped = symbols.paths[path.posix.join(sourceDir, item)] ?? symbols.paths[path.posix.join(sourceDir, `${item}.png`)];
    if (mapped) textureSet[key] = path.posix.basename(mapped, path.posix.extname(mapped));
  }
  return serialize(value);
}
