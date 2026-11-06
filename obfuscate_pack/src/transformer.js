import fs from "node:fs";
import path from "node:path";

let unicodeEnabled = true;

// JSON.parse/stringify turns 0.0 into 0, which Bedrock rejects for float properties.
// Decimal literals are wrapped in marker strings before parsing and unwrapped after stringifying.
const FLOAT_MARK = "@@float@@";
const FLOAT_RESTORE = new RegExp(`"${FLOAT_MARK}(-?\\d+\\.\\d+(?:[eE][+-]?\\d+)?)"`, "g");

function protectFloats(text) {
  return text.replace(/("(?:\\.|[^"\\])*")|(-?\d+\.\d+(?:[eE][+-]?\d+)?)/g, (match, str, num) => (str ? str : `"${FLOAT_MARK}${num}"`));
}

function restoreFloats(text) {
  return text.replace(FLOAT_RESTORE, "$1");
}

function parseJson(text) {
  return JSON.parse(protectFloats(stripComments(text)));
}

export function setUnicodeEnabled(enabled) {
  unicodeEnabled = enabled === true;
}

function encodeUnicodeString(value) {
  // Iterate UTF-16 code units (not code points) so astral characters become valid surrogate-pair escapes.
  let result = "";
  for (let idx = 0; idx < value.length; idx++) result += `\\u${value.charCodeAt(idx).toString(16).padStart(4, "0")}`;
  return result;
}

export function unicodeJsonText(text) {
  if (!unicodeEnabled) return text;
  let result = "";
  let idx = 0;
  while (idx < text.length) {
    if (text[idx] !== '"') {
      result += text[idx++];
      continue;
    }
    const start = idx++;
    let escaped = false;
    while (idx < text.length) {
      const char = text[idx++];
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') break;
    }
    const token = text.slice(start, idx);
    let value;
    try {
      // Decode the token so escapes like \n and \" are re-encoded by meaning, not character by character.
      value = JSON.parse(token);
    } catch {
      result += token;
      continue;
    }
    let next = idx;
    while (/\s/.test(text[next] ?? "")) next++;
    const isKey = text[next] === ":";
    const keep = isKey && value === "format_version";
    result += keep ? token : `"${encodeUnicodeString(value)}"`;
  }
  return result;
}

function serialize(value, indent) {
  return unicodeJsonText(restoreFloats(JSON.stringify(value, null, indent)));
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

// Compiled replacers are cached per symbols object. Each stage is one regex built from every entry,
// instead of one RegExp per symbol per string.
let stageCache = new Map();
let stageSymbols = null;

/**
 * Clears cached replacers. Pass "paths" when only symbols.paths changed, so the (stable) id, ref and
 * alias replacers are kept. Call with no argument after anything else in the symbols changes.
 */
export function resetReplacerCache(scope = "all") {
  if (scope === "paths") {
    for (const key of stageCache.keys()) if (key.startsWith("paths:")) stageCache.delete(key);
    return;
  }
  stageCache = new Map();
  stageSymbols = null;
}

function cachedStage(symbols, key, build) {
  if (stageSymbols !== symbols) {
    stageCache = new Map();
    stageSymbols = symbols;
  }
  let stage = stageCache.get(key);
  if (!stage) {
    stage = build();
    stageCache.set(key, stage);
  }
  return stage;
}

function compileReplacer(entries, { allowDotPrefix = false } = {}) {
  const pairs = entries.filter(([original]) => original);
  if (!pairs.length) return (value) => value;
  pairs.sort(([a], [b]) => b.length - a.length);
  const replacements = new Map(pairs);
  const pattern = new RegExp(`(^|[^A-Za-z0-9_:/-])(${pairs.map(([original]) => escapePattern(original)).join("|")})(?=$|[^A-Za-z0-9_:/-])`, "g");
  return (value) =>
    value.replace(pattern, (match, prefix, original) => (prefix === "." && !allowDotPrefix ? match : `${prefix}${replacements.get(original)}`));
}

function pathStage(symbols, allowDotPrefix) {
  return cachedStage(symbols, `paths:${allowDotPrefix ? 1 : 0}`, () => compileReplacer(Object.entries(symbols.paths), { allowDotPrefix }));
}

function refStage(symbols, group, allowDotPrefix) {
  return cachedStage(symbols, `${group}:${allowDotPrefix ? 1 : 0}`, () =>
    compileReplacer(
      Object.entries(symbols[group] ?? {}).map(([original, replacement]) => [original, refName(original, replacement)]),
      { allowDotPrefix }
    )
  );
}

function aliasEntries(symbols) {
  return cachedStage(symbols, "aliasEntries", () =>
    Object.entries(symbols.aliases).map(([original, replacement]) => [original, aliasName(original, replacement)])
  );
}

function aliasStage(symbols, allowDotPrefix) {
  return cachedStage(symbols, `aliases:${allowDotPrefix ? 1 : 0}`, () => compileReplacer(aliasEntries(symbols), { allowDotPrefix }));
}

function prefixedAliasStage(symbols, allowDotPrefix) {
  return cachedStage(symbols, `prefixed:${allowDotPrefix ? 1 : 0}`, () => {
    const entries = [];
    for (const [original, replacement] of aliasEntries(symbols))
      if (!original.includes("."))
        for (const prefix of ["texture.", "Geometry.", "Material.", "Array."]) entries.push([`${prefix}${original}`, `${prefix}${replacement}`]);
    return compileReplacer(entries, { allowDotPrefix });
  });
}

function templateAliasStage(symbols) {
  return cachedStage(symbols, "templates", () => {
    const templateAliases = new Map();
    const ambiguousSuffixes = new Set();
    for (const [original, replacement] of aliasEntries(symbols)) {
      const separator = original.indexOf(":");
      if (separator < 0) continue;
      const suffix = original.slice(separator + 1);
      const replacementSuffix = replacement.slice(replacement.indexOf(":") + 1);
      if (templateAliases.has(suffix) && templateAliases.get(suffix) !== replacementSuffix) ambiguousSuffixes.add(suffix);
      else templateAliases.set(suffix, replacementSuffix);
    }
    return (value) =>
      value.replace(/\$\{[^{}]+\}:([A-Za-z_][\w.-]*)/g, (match, suffix) => {
        const replacement = templateAliases.get(suffix);
        return replacement && !ambiguousSuffixes.has(suffix) ? match.slice(0, match.lastIndexOf(":") + 1) + replacement : match;
      });
  });
}

export function replaceString(value, symbols, { skipAssetIds = false, allowDotPrefix = false } = {}) {
  let result = pathStage(symbols, allowDotPrefix)(value);
  if (!skipAssetIds) {
    result = refStage(symbols, "blockIds", allowDotPrefix)(result);
    result = refStage(symbols, "itemIds", allowDotPrefix)(result);
  }
  result = refStage(symbols, "tags", allowDotPrefix)(result);
  result = refStage(symbols, "refs", allowDotPrefix)(result);
  result = aliasStage(symbols, allowDotPrefix)(result);
  result = prefixedAliasStage(symbols, allowDotPrefix)(result);
  return result.replace(/\bv\.([A-Za-z_][\w]*)/g, (_, name) => `v.${symbols.vars[name] ?? name}`);
}

export function replaceScriptString(value, symbols) {
  let result = pathStage(symbols, false)(value);
  for (const group of ["blockIds", "itemIds", "tags", "refs"]) result = refStage(symbols, group, false)(result);
  result = aliasStage(symbols, false)(result);
  return templateAliasStage(symbols)(result);
}

function transform(value, symbols, context = "") {
  if (Array.isArray(value)) return value.map((item) => transform(item, symbols, context));
  if (typeof value === "string") {
    if (value.startsWith(FLOAT_MARK)) return value;
    if (context === "render_geometry" && value.startsWith("Geometry.")) return `Geometry.${replaceString(value.slice("Geometry.".length), symbols)}`;
    if (context === "render_textures" && value.startsWith("Texture.")) return `Texture.${replaceString(value.slice("Texture.".length), symbols)}`;
    if (context === "block_id") return symbols.blockIds[value] ? refName(value, symbols.blockIds[value]) : value;
    if (context === "item_id") return symbols.itemIds[value] ? refName(value, symbols.itemIds[value]) : value;
    if (context === "texture") return replaceString(value, symbols, { skipAssetIds: true });
    if (context === "texture_id") {
      const replacement = symbols.aliases[value];
      return replacement ? aliasName(value, replacement) : replaceString(value, symbols, { skipAssetIds: true });
    }
    if (context === "state_value") return symbols.states[value] ?? value;
    if (context === "bone_name" || context === "bone_parent") return symbols.bones[value.toLowerCase()] ?? value;
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
      } else if ((context === "animation_bones" || context === "bone_visibility") && symbols.bones[key.toLowerCase()]) {
        nextKey = symbols.bones[key.toLowerCase()];
      } else if (context === "bones" && key === "name") childContext = "bone_name";
      else if (context === "bones" && key === "parent") childContext = "bone_parent";
      else if (context === "transition" && symbols.states[key]) nextKey = symbols.states[key];
      else if (symbols.aliases[key]) nextKey = aliasName(key, symbols.aliases[key]);
      if (key === "minecraft:block") childContext = "block_root";
      if (key === "minecraft:item") childContext = "item_root";
      if ((context === "block_root" || context === "item_root") && key === "description") childContext = `${context}_description`;
      if ((context === "block_description" || context === "item_description") && key === "identifier")
        childContext = context === "block_description" ? "block_id" : "item_id";
      if (context === "block_root" && key === "components") childContext = "block_components";
      if (context === "block_root" && key === "permutations") childContext = "block_permutations";
      if ((context === "block_permutations" || context === "block_permutation") && key === "components") childContext = "block_components";
      if (context === "block_components" && key === "minecraft:material_instances") childContext = "material_instances";
      if (context === "material_instances") childContext = "material_instance";
      if (context === "material_instance" && key === "texture") childContext = "texture";
      if (key === "atlas_tile") childContext = "texture_id";
      if (context === "block_permutations") childContext = "block_permutation";
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
  return serialize(transform(parseJson(fs.readFileSync(source, "utf8")), symbols, context));
}

export function obfuscateJsonText(source) {
  return unicodeJsonText(fs.readFileSync(source, "utf8"));
}

export function obfuscateBlockJson(source, symbols) {
  const value = parseJson(fs.readFileSync(source, "utf8"));
  const result = Object.fromEntries(
    Object.entries(value).map(([key, item]) => {
      const replacement = symbols.blockIds[key];
      return [replacement ? refName(key, replacement) : key, item];
    })
  );
  return serialize(result, 2);
}

export function obfuscateLang(source, symbols) {
  return fs
    .readFileSync(source, "utf8")
    .split(/(\r?\n)/)
    .map((line) => {
      if (!line || line.startsWith("#") || !line.includes("=")) return line;
      const separator = line.indexOf("=");
      return `${replaceString(line.slice(0, separator), symbols, { allowDotPrefix: true })}${line.slice(separator)}`;
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

export function replacePathsString(value, symbols) {
  return pathStage(symbols, false)(value);
}

export function obfuscatePathsJson(source, symbols) {
  const text = fs.readFileSync(source, "utf8");
  if (Object.entries(symbols.paths).every(([original, replacement]) => original === replacement)) return text;
  const rewritePaths = (value) => {
    if (Array.isArray(value)) return value.map(rewritePaths);
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, rewritePaths(item)]));
    return typeof value === "string" ? (value.startsWith(FLOAT_MARK) ? value : replacePathsString(value, symbols)) : value;
  };
  const value = parseJson(text);
  return restoreFloats(JSON.stringify(rewritePaths(value), null, 2));
}

export function obfuscateTextureJson(source, symbols) {
  return obfuscateJson(source, symbols);
}

export function obfuscateTextureSet(source, symbols, textureRel) {
  const value = parseJson(fs.readFileSync(source, "utf8"));
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
