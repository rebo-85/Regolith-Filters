import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { stripComments } from "./transformer.js";
import { SYMBOL_FORMAT } from "./constants.js";

const SYMBOL_GROUPS_BY_CATEGORY = {
  entityIds: ["refs"],
  blockIds: ["blockIds"],
  itemIds: ["itemIds"],
  tags: ["tags"],
  components: ["aliases"],
  properties: ["aliases"],
  componentGroups: ["aliases"],
  events: ["aliases"],
  geometry: ["refs", "aliases"],
  animations: ["refs", "aliases"],
  animationControllers: ["refs"],
  renderControllers: ["refs", "aliases"],
  materials: ["aliases"],
  textures: ["aliases"],
  particles: ["refs"],
  sounds: ["refs"],
  animationStates: ["states"],
  bones: ["bones"],
  renderArrays: ["aliases"],
  scriptVariables: ["vars"],
  blockStates: ["aliases"]
};

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

function collectScript(value, symbols) {
  if (Array.isArray(value)) return value.forEach((item) => collectScript(item, symbols));
  if (value && typeof value === "object") return Object.values(value).forEach((item) => collectScript(item, symbols));
  if (typeof value !== "string") return;
  for (const match of value.matchAll(/\bv\.([A-Za-z_][\w]*)/g)) ensure(symbols, "vars", match[1]);
}

function collectCustomTags(value, symbols, key = "") {
  if (Array.isArray(value)) {
    if (key === "tags" || key === "family" || key.endsWith(":tags")) {
      for (const tag of value)
        if (typeof tag === "string" && tag.includes(":") && !tag.startsWith("minecraft:")) ensure(symbols, "tags", tag);
    }
    for (const item of value) collectCustomTags(item, symbols);
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [childKey, childValue] of Object.entries(value)) collectCustomTags(childValue, symbols, childKey);
}

function collectEntityDefinitions(entity, symbols) {
  const description = entity.description;
  if (!description) return;
  if (typeof description.identifier === "string" && !description.identifier.startsWith("minecraft:")) ensure(symbols, "refs", description.identifier);
  for (const section of ["properties", "components", "component_groups", "events"]) {
    const values = section === "properties" ? description.properties : entity[section];
    for (const key of Object.keys(values ?? {})) if (!key.startsWith("minecraft:")) ensureAlias(symbols, key);
  }
}

function collectClientDefinitions(description, symbols) {
  for (const section of ["materials", "textures", "geometry", "animations"]) {
    for (const [key, value] of Object.entries(description[section] ?? {})) {
      const backed = typeof value === "string" && (symbols.refs[value] || symbols.paths[value] || symbols.paths[value.replace(/\.png$/i, "")]);
      if (key !== "default" && backed) ensureAlias(symbols, key);
    }
  }
  collectScript(description.scripts, symbols);
}

function collectControllerDefinitions(controllers, symbols) {
  for (const [name, controller] of Object.entries(controllers ?? {})) {
    if (name.startsWith("controller.")) ensure(symbols, "refs", name);
    for (const state of Object.keys(controller.states ?? {})) ensure(symbols, "states", state);
  }
}

function collectRenderDefinitions(controllers, symbols) {
  for (const [name, controller] of Object.entries(controllers ?? {})) {
    if (name.startsWith("controller.")) ensure(symbols, "refs", name);
    for (const values of Object.values(controller.arrays ?? {}))
      for (const key of Object.keys(values ?? {})) ensureAlias(symbols, key.replace(/^array\./, ""));
    for (const value of JSON.stringify(controller).matchAll(/(?:texture|Geometry|Material|Array)\.([A-Za-z_][\w.]*)/g))
      if (value[1] !== "default") ensureAlias(symbols, value[1]);
  }
}

function collectDefinitions(value, symbols, source) {
  collectCustomTags(value, symbols);
  if (source.toLowerCase() === "blocks.json") {
    for (const name of Object.keys(value))
      if (name.includes(":") && !name.startsWith("minecraft:")) ensure(symbols, "blockIds", name);
  }
  const entity = value?.["minecraft:entity"];
  if (entity) collectEntityDefinitions(entity, symbols);
  const blockIdentifier = value?.["minecraft:block"]?.description?.identifier;
  if (typeof blockIdentifier === "string" && !blockIdentifier.startsWith("minecraft:"))
    ensure(symbols, "blockIds", blockIdentifier);
  const itemIdentifier = value?.["minecraft:item"]?.description?.identifier;
  if (typeof itemIdentifier === "string" && !itemIdentifier.startsWith("minecraft:"))
    ensure(symbols, "itemIds", itemIdentifier);
  if (/^(?:terrain|item)_texture\.json$/i.test(source)) {
    for (const name of Object.keys(value?.texture_data ?? {}))
      if (!name.startsWith("minecraft:")) ensureAlias(symbols, name);
  }
  for (const [key, fn] of [
    ["animation_controllers", collectControllerDefinitions],
    ["render_controllers", collectRenderDefinitions]
  ])
    if (value?.[key]) fn(value[key], symbols);
  for (const name of Object.keys(value?.animations ?? {})) if (name.startsWith("animation.")) ensure(symbols, "refs", name);
  for (const geometry of value?.["minecraft:geometry"] ?? []) {
    if (typeof geometry.description?.identifier === "string") ensure(symbols, "refs", geometry.description.identifier);
    for (const bone of geometry.bones ?? []) if (typeof bone.name === "string") ensure(symbols, "bones", bone.name);
  }
  if (value?.sound_definitions)
    for (const name of Object.keys(value.sound_definitions)) if (!name.startsWith("minecraft:") && name.includes(":")) ensure(symbols, "refs", name);
  if (source.toLowerCase().endsWith("music_definitions.json"))
    for (const name of Object.keys(value)) if (!name.startsWith("minecraft:") && name.includes(":")) ensure(symbols, "refs", name);
  const culling = value?.["minecraft:block_culling_rules"];
  if (culling) {
    if (typeof culling.description?.identifier === "string") ensure(symbols, "refs", culling.description.identifier);
    for (const rule of culling.rules ?? []) if (typeof rule?.geometry_part?.bone === "string") ensure(symbols, "bones", rule.geometry_part.bone);
  }
  for (const name of Object.keys(value?.["minecraft:block"]?.description?.states ?? {}))
    if (!name.startsWith("minecraft:")) ensureAlias(symbols, name);
  const block = value?.["minecraft:block"];
  for (const components of [block?.components, ...(block?.permutations ?? []).map((permutation) => permutation.components)]) {
    for (const name of Object.keys(components ?? {}))
      if (!name.startsWith("minecraft:")) ensureAlias(symbols, name);
  }
  const particle = value?.particle_effect?.description?.identifier;
  if (typeof particle === "string" && !particle.startsWith("minecraft:")) ensure(symbols, "refs", particle);
}

export function createSymbols(map) {
  const symbols = map.__symbols ?? { aliases: {}, refs: {}, vars: {} };
  if (symbols.keyFormat !== SYMBOL_FORMAT) {
    symbols.aliases = {};
    symbols.refs = {};
    symbols.vars = {};
    symbols.states = {};
    symbols.bones = {};
    symbols.paths = {};
    symbols.blockIds = {};
    symbols.itemIds = {};
    symbols.tags = {};
    symbols.keyFormat = SYMBOL_FORMAT;
  }
  symbols.aliases ??= symbols.keys ?? {};
  const mappedAliases = new Set(Object.values(symbols.aliases));
  for (const key of Object.keys(symbols.aliases)) if (mappedAliases.has(key)) delete symbols.aliases[key];
  symbols.refs ??= {};
  symbols.vars ??= {};
  symbols.states ??= {};
  symbols.bones ??= {};
  symbols.paths ??= {};
  symbols.blockIds ??= {};
  symbols.itemIds ??= {};
  symbols.tags ??= {};
  delete symbols.keys;
  symbols.used = new Set(Object.values(symbols.aliases).concat(
    Object.values(symbols.refs),
    Object.values(symbols.vars),
    Object.values(symbols.blockIds),
    Object.values(symbols.itemIds),
    Object.values(symbols.tags)
  ));
  map.__symbols = symbols;
  return symbols;
}

export function applySymbolSettings(symbols, settings) {
  const obfuscateCategories = settings.obfuscate ?? {};
  if (!obfuscateCategories || typeof obfuscateCategories !== "object" || Array.isArray(obfuscateCategories))
    throw new TypeError("obfuscate must be an object of category booleans");
  const excludedSymbols = settings.exclude ?? {};
  if (!excludedSymbols || typeof excludedSymbols !== "object" || Array.isArray(excludedSymbols))
    throw new TypeError("exclude must be an object of category arrays");
  for (const [category, groups] of Object.entries(SYMBOL_GROUPS_BY_CATEGORY)) {
    const legacyCategory = category === "blockIds" ? "blocks" : "";
    const enabled = obfuscateCategories[category] ?? obfuscateCategories[legacyCategory] ?? true;
    if (typeof enabled !== "boolean") throw new TypeError(`obfuscate.${category} must be a boolean`);
    const excluded = excludedSymbols[category] ?? excludedSymbols[legacyCategory] ?? [];
    if (!Array.isArray(excluded) || excluded.some((value) => typeof value !== "string"))
      throw new TypeError(`exclude.${category} must be an array of strings`);
    if (enabled && excluded.length === 0) continue;
    for (const group of groups)
      for (const value of Object.keys(symbols[group]))
        if (!enabled || excluded.includes(value)) delete symbols[group][value];
  }
}

export function collectSymbols(source, symbols) {
  collectDefinitions(JSON.parse(stripComments(fs.readFileSync(source, "utf8"))), symbols, path.basename(source));
}

export function collectClientSymbols(source, symbols) {
  const value = JSON.parse(stripComments(fs.readFileSync(source, "utf8")));
  const description = value?.["minecraft:client_entity"]?.description;
  if (description) collectClientDefinitions(description, symbols);
}
