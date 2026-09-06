import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export function walk(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  for (const name of fs.readdirSync(dir)) {
    const file = path.join(dir, name);
    if (fs.statSync(file).isDirectory()) walk(file, files);
    else files.push(file);
  }
  return files;
}

export function readMap(mapFile) {
  try {
    return JSON.parse(fs.readFileSync(mapFile, "utf8"));
  } catch {
    return {};
  }
}

export function writeMap(map, mapDir, mapFile) {
  fs.mkdirSync(mapDir, { recursive: true });
  fs.writeFileSync(mapFile, JSON.stringify(map, null, 2), "utf8");
}

function serialize(value) {
  return JSON.stringify(value);
}

export function makeKey(value) {
  const alphabet = "abcdefghijklmnopqrstuvwxyz";
  const digest = crypto.createHash("sha1").update(value).digest();
  return Array.from(digest.subarray(0, 6), (byte) => alphabet[byte % alphabet.length]).join("");
}

function makeName(value, used) {
  let suffix = 0;
  let name;
  do name = makeKey(`${value}:${suffix++}`);
  while (used.has(name));
  used.add(name);
  return name;
}

function ensure(symbols, group, value) {
  if (!symbols[group][value]) symbols[group][value] = makeName(`${group}:${value}`, symbols.used);
  return symbols[group][value];
}

function ensureAlias(symbols, value) {
  return ensure(symbols, "aliases", value);
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

function collectScript(value, symbols) {
  if (Array.isArray(value)) return value.forEach((item) => collectScript(item, symbols));
  if (value && typeof value === "object") return Object.values(value).forEach((item) => collectScript(item, symbols));
  if (typeof value !== "string") return;
  for (const match of value.matchAll(/\bv\.([A-Za-z_][\w]*)/g)) ensure(symbols, "vars", match[1]);
}

function collectClientDefinitions(description, symbols) {
  const aliases = ["materials", "textures", "geometry", "animations"];
  for (const section of aliases) {
    for (const [key, value] of Object.entries(description[section] ?? {})) {
      const backed = typeof value === "string" && (symbols.refs[value] || symbols.paths[value] || symbols.paths[value.replace(/\.png$/i, "")]);
      if (key !== "default" && backed) ensureAlias(symbols, key);
    }
  }
  collectScript(description.scripts, symbols);
}

function collectEntityDefinitions(entity, symbols) {
  const description = entity.description;
  if (!description) return;
  if (typeof description.identifier === "string" && !description.identifier.startsWith("minecraft:")) ensure(symbols, "refs", description.identifier);
  for (const section of ["properties", "components", "component_groups", "events"]) {
    const values = section === "properties" ? description.properties : entity[section];
    for (const key of Object.keys(values ?? {})) {
      if (!key.startsWith("minecraft:")) ensureAlias(symbols, key);
    }
  }
}

function collectControllerDefinitions(controllers, symbols) {
  for (const [name, controller] of Object.entries(controllers ?? {})) {
    if (name.startsWith("controller.")) ensure(symbols, "refs", name);
    for (const state of Object.keys(controller.states ?? {})) ensure(symbols, "states", state);
  }
}

function collectAnimationDefinitions(animations, symbols) {
  for (const name of Object.keys(animations ?? {})) {
    if (name.startsWith("animation.")) ensure(symbols, "refs", name);
  }
}

function collectGeometryDefinitions(geometries, symbols) {
  for (const geometry of geometries ?? []) {
    const description = geometry.description;
    if (typeof description?.identifier === "string") ensure(symbols, "refs", description.identifier);
    for (const bone of geometry.bones ?? []) {
      if (typeof bone.name === "string") ensure(symbols, "bones", bone.name);
    }
  }
}

function collectRenderDefinitions(controllers, symbols) {
  for (const [name, controller] of Object.entries(controllers ?? {})) {
    if (name.startsWith("controller.")) ensure(symbols, "refs", name);
    for (const values of Object.values(controller.arrays ?? {})) {
      for (const key of Object.keys(values ?? {})) ensureAlias(symbols, key.replace(/^array\./, ""));
    }
    for (const value of JSON.stringify(controller).matchAll(/(?:texture|Geometry|Material|Array)\.([A-Za-z_][\w.]*)/g)) {
      if (value[1] !== "default") ensureAlias(symbols, value[1]);
    }
  }
}

function collectSoundDefinitions(definitions, symbols) {
  for (const name of Object.keys(definitions ?? {})) {
    if (!name.startsWith("minecraft:") && name.includes(":")) ensure(symbols, "refs", name);
  }
}

function collectMusicDefinitions(definitions, symbols) {
  for (const name of Object.keys(definitions ?? {})) {
    if (!name.startsWith("minecraft:") && name.includes(":")) ensure(symbols, "refs", name);
  }
}

export function replaceString(value, symbols) {
  let result = value;
  for (const [original, replacement] of Object.entries(symbols.paths).sort(([a], [b]) => b.length - a.length)) {
    result = result.split(original).join(replacement);
  }
  for (const [original, replacement] of Object.entries(symbols.refs).sort(([a], [b]) => b.length - a.length)) {
    result = result.split(original).join(refName(original, replacement));
  }
  for (const [original, replacement] of Object.entries(symbols.aliases).sort(([a], [b]) => b.length - a.length)) {
    result = result.split(original).join(aliasName(original, replacement));
    if (!original.includes(".")) {
      for (const prefix of ["texture.", "Geometry.", "Material.", "Array."])
        result = result.split(`${prefix}${original}`).join(`${prefix}${aliasName(original, replacement)}`);
    }
  }
  result = result.replace(/\bv\.([A-Za-z_][\w]*)/g, (_, name) => `v.${symbols.vars[name] ?? name}`);
  return result;
}

export function replaceScriptString(value, symbols) {
  let result = value;
  for (const [original, replacement] of Object.entries(symbols.paths).sort(([a], [b]) => b.length - a.length)) {
    result = result.split(original).join(replacement);
  }
  for (const [original, replacement] of Object.entries(symbols.refs).sort(([a], [b]) => b.length - a.length)) {
    result = result.split(original).join(refName(original, replacement));
  }
  return result;
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
  return JSON.stringify(
    values.map((value) => symbols.paths[value] ?? value),
    null,
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
      } else if (context === "sound_definitions" && symbols.refs[key]) {
        nextKey = refName(key, symbols.refs[key]);
      } else if (context === "music_definitions" && symbols.refs[key]) {
        nextKey = refName(key, symbols.refs[key]);
      } else if (context === "array_definition" && key.startsWith("array.")) {
        const name = key.slice("array.".length);
        nextKey = `array.${symbols.aliases[name] ?? name}`;
      } else if (context === "animation_bones" && symbols.bones[key]) {
        nextKey = symbols.bones[key];
      } else if (context === "bones" && key === "name") {
        childContext = "bone_name";
      } else if (context === "bones" && key === "parent") {
        childContext = "bone_parent";
      } else if (context === "transition" && symbols.states[key]) nextKey = symbols.states[key];
      else if (symbols.aliases[key]) nextKey = aliasName(key, symbols.aliases[key]);
      if (context === "controller" && key === "initial_state") childContext = "state_value";
      if (context === "state" && key === "transitions") childContext = "transition";
      if (context === "render_controller" && key === "geometry") childContext = "render_geometry";
      if (context === "render_controller" && key === "textures") childContext = "render_textures";
      if (context === "render_controller" && key === "arrays") childContext = "arrays";
      if (context === "arrays" && key !== "textures") childContext = "array_definition";
      if (context === "arrays" && key === "textures") childContext = "array_definition";
      if (context === "geometry_root" && key === "bones") childContext = "bones";
      if (context === "animation" && key === "bones") childContext = "animation_bones";
      if (key === "minecraft:geometry") childContext = "geometry_root";
      return [nextKey, transform(item, symbols, childContext)];
    })
  );
}

function stripComments(text) {
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

export function obfuscateJson(source, symbols, context = "") {
  const value = JSON.parse(stripComments(fs.readFileSync(source, "utf8")));
  return serialize(transform(value, symbols, context));
}

export function createSymbols(map) {
  const symbols = map.__symbols ?? { aliases: {}, refs: {}, vars: {} };
  if (symbols.keyFormat !== "letters6-v5") {
    symbols.aliases = {};
    symbols.refs = {};
    symbols.vars = {};
    symbols.states = {};
    symbols.bones = {};
    symbols.paths = {};
    symbols.keyFormat = "letters6-v5";
  }
  symbols.aliases ??= symbols.keys ?? {};
  symbols.refs ??= {};
  symbols.vars ??= {};
  symbols.states ??= {};
  symbols.bones ??= {};
  symbols.paths ??= {};
  delete symbols.keys;
  symbols.used = new Set(Object.values(symbols.aliases).concat(Object.values(symbols.refs), Object.values(symbols.vars)));
  map.__symbols = symbols;
  return symbols;
}

export function collectSymbols(source, symbols) {
  const value = JSON.parse(stripComments(fs.readFileSync(source, "utf8")));
  const entity = value?.["minecraft:entity"];
  if (entity) collectEntityDefinitions(entity, symbols);
  if (value?.animation_controllers) collectControllerDefinitions(value.animation_controllers, symbols);
  if (value?.animations) collectAnimationDefinitions(value.animations, symbols);
  if (value?.render_controllers) collectRenderDefinitions(value.render_controllers, symbols);
  if (value?.sound_definitions) collectSoundDefinitions(value.sound_definitions, symbols);
  if (path.basename(source).toLowerCase() === "music_definitions.json") collectMusicDefinitions(value, symbols);
  if (Array.isArray(value?.["minecraft:geometry"])) collectGeometryDefinitions(value["minecraft:geometry"], symbols);
}

export function collectClientSymbols(source, symbols) {
  const value = JSON.parse(stripComments(fs.readFileSync(source, "utf8")));
  const description = value?.["minecraft:client_entity"]?.description;
  if (description) collectClientDefinitions(description, symbols);
}
