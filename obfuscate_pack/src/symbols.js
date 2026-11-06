import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { stripComments } from "./transformer.js";
import { CATEGORIES, CATEGORY_PARENTS, SYMBOL_FORMAT, SYMBOL_GROUPS } from "./constants.js";

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

// Every symbol records the categories it was found in (symbols.categories[group][value]).
// applySymbolSettings uses this to decide per symbol, so tables shared by several categories need no special handling.
function ensure(symbols, group, value, category) {
  if (!symbols[group][value]) symbols[group][value] = makeName(`${group}:${value}`, symbols.used);
  const list = ((symbols.categories[group] ??= {})[value] ??= []);
  if (!list.includes(category)) list.push(category);
  return symbols[group][value];
}

function ensureAlias(symbols, value, category) {
  return ensure(symbols, "aliases", value, category);
}

function collectScript(value, symbols) {
  if (Array.isArray(value)) return value.forEach((item) => collectScript(item, symbols));
  if (value && typeof value === "object") return Object.values(value).forEach((item) => collectScript(item, symbols));
  if (typeof value !== "string") return;
  for (const match of value.matchAll(/\bv\.([A-Za-z_][\w]*)/g)) ensure(symbols, "vars", match[1], "scriptVariables");
}

function collectCustomTags(value, symbols, key = "") {
  if (Array.isArray(value)) {
    if (key === "tags" || key === "family" || key.endsWith(":tags")) {
      for (const tag of value)
        if (typeof tag === "string" && tag.includes(":") && !tag.startsWith("minecraft:")) ensure(symbols, "tags", tag, "tags");
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
  if (typeof description.identifier === "string" && !description.identifier.startsWith("minecraft:"))
    ensure(symbols, "refs", description.identifier, "entityIds");
  const sections = { properties: "entityProperties", components: "entityComponents", component_groups: "componentGroups", events: "events" };
  for (const [section, category] of Object.entries(sections)) {
    const values = section === "properties" ? description.properties : entity[section];
    for (const key of Object.keys(values ?? {})) if (!key.startsWith("minecraft:")) ensureAlias(symbols, key, category);
  }
}

function collectClientDefinitions(description, symbols) {
  for (const section of ["materials", "textures", "geometry", "animations"]) {
    for (const [key, value] of Object.entries(description[section] ?? {})) {
      const backed = typeof value === "string" && (symbols.refs[value] || symbols.paths[value] || symbols.paths[value.replace(/\.png$/i, "")]);
      if (key !== "default" && backed) ensureAlias(symbols, key, section);
    }
  }
  collectScript(description.scripts, symbols);
}

function collectControllerDefinitions(controllers, symbols) {
  for (const [name, controller] of Object.entries(controllers ?? {})) {
    if (name.startsWith("controller.")) ensure(symbols, "refs", name, "animationControllers");
    for (const state of Object.keys(controller.states ?? {})) ensure(symbols, "states", state, "animationStates");
  }
}

const RENDER_REFERENCE_CATEGORIES = { texture: "textures", Geometry: "geometry", Material: "materials", Array: "renderArrays" };

function collectRenderDefinitions(controllers, symbols) {
  for (const [name, controller] of Object.entries(controllers ?? {})) {
    if (name.startsWith("controller.")) ensure(symbols, "refs", name, "renderControllers");
    for (const values of Object.values(controller.arrays ?? {}))
      for (const key of Object.keys(values ?? {})) ensureAlias(symbols, key.replace(/^array\./, ""), "renderArrays");
    for (const value of JSON.stringify(controller).matchAll(/(texture|Geometry|Material|Array)\.([A-Za-z_][\w.]*)/g))
      if (value[2] !== "default") ensureAlias(symbols, value[2], RENDER_REFERENCE_CATEGORIES[value[1]]);
  }
}

function collectDefinitions(value, symbols, source) {
  collectCustomTags(value, symbols);
  if (source.toLowerCase() === "blocks.json") {
    for (const name of Object.keys(value)) if (name.includes(":") && !name.startsWith("minecraft:")) ensure(symbols, "blockIds", name, "blockIds");
  }
  const entity = value?.["minecraft:entity"];
  if (entity) collectEntityDefinitions(entity, symbols);
  const blockIdentifier = value?.["minecraft:block"]?.description?.identifier;
  if (typeof blockIdentifier === "string" && !blockIdentifier.startsWith("minecraft:")) ensure(symbols, "blockIds", blockIdentifier, "blockIds");
  const itemIdentifier = value?.["minecraft:item"]?.description?.identifier;
  if (typeof itemIdentifier === "string" && !itemIdentifier.startsWith("minecraft:")) ensure(symbols, "itemIds", itemIdentifier, "itemIds");
  if (/^(?:terrain|item)_texture\.json$/i.test(source)) {
    for (const name of Object.keys(value?.texture_data ?? {})) if (!name.startsWith("minecraft:")) ensureAlias(symbols, name, "textures");
  }
  for (const [key, fn] of [
    ["animation_controllers", collectControllerDefinitions],
    ["render_controllers", collectRenderDefinitions]
  ])
    if (value?.[key]) fn(value[key], symbols);
  for (const name of Object.keys(value?.animations ?? {})) if (name.startsWith("animation.")) ensure(symbols, "refs", name, "animations");
  for (const geometry of value?.["minecraft:geometry"] ?? []) {
    if (typeof geometry.description?.identifier === "string") ensure(symbols, "refs", geometry.description.identifier, "geometry");
    for (const bone of geometry.bones ?? []) if (typeof bone.name === "string") ensure(symbols, "bones", bone.name.toLowerCase(), "bones");
  }
  if (value?.sound_definitions)
    for (const name of Object.keys(value.sound_definitions))
      if (!name.startsWith("minecraft:") && name.includes(":")) ensure(symbols, "refs", name, "sounds");
  if (source.toLowerCase().endsWith("music_definitions.json"))
    for (const name of Object.keys(value)) if (!name.startsWith("minecraft:") && name.includes(":")) ensure(symbols, "refs", name, "sounds");
  const culling = value?.["minecraft:block_culling_rules"];
  if (culling) {
    if (typeof culling.description?.identifier === "string") ensure(symbols, "refs", culling.description.identifier, "geometry");
    for (const rule of culling.rules ?? [])
      if (typeof rule?.geometry_part?.bone === "string") ensure(symbols, "bones", rule.geometry_part.bone.toLowerCase(), "bones");
  }
  for (const name of Object.keys(value?.["minecraft:block"]?.description?.states ?? {}))
    if (!name.startsWith("minecraft:")) ensureAlias(symbols, name, "blockStates");
  const block = value?.["minecraft:block"];
  for (const components of [block?.components, ...(block?.permutations ?? []).map((permutation) => permutation.components)]) {
    for (const name of Object.keys(components ?? {})) if (!name.startsWith("minecraft:")) ensureAlias(symbols, name, "blockComponents");
  }
  for (const name of Object.keys(value?.["minecraft:item"]?.components ?? {}))
    if (!name.startsWith("minecraft:")) ensureAlias(symbols, name, "itemComponents");
  const particle = value?.particle_effect?.description?.identifier;
  if (typeof particle === "string" && !particle.startsWith("minecraft:")) ensure(symbols, "refs", particle, "particles");
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
  symbols.categories = {}; // rebuilt on every run while collecting; never stored in the map
  delete symbols.keys;
  symbols.used = new Set(
    Object.values(symbols.aliases).concat(
      Object.values(symbols.refs),
      Object.values(symbols.vars),
      Object.values(symbols.blockIds),
      Object.values(symbols.itemIds),
      Object.values(symbols.tags)
    )
  );
  map.__symbols = symbols;
  return symbols;
}

function readSettings(settings, name, validate) {
  const value = settings[name] ?? {};
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${name} must be an object keyed by category`);
  for (const [category, entry] of Object.entries(value)) {
    if (!CATEGORIES.has(category)) throw new TypeError(`Unknown ${name} category "${category}". Valid categories: ${[...CATEGORIES].join(", ")}`);
    validate(category, entry);
  }
  return value;
}

export function applySymbolSettings(symbols, settings) {
  const enabledByCategory = readSettings(settings, "obfuscate", (category, entry) => {
    if (typeof entry !== "boolean") throw new TypeError(`obfuscate.${category} must be a boolean`);
  });
  const excludedByCategory = readSettings(settings, "exclude", (category, entry) => {
    if (!Array.isArray(entry) || entry.some((name) => typeof name !== "string"))
      throw new TypeError(`exclude.${category} must be an array of strings`);
  });

  // The most specific setting wins: a category's own `obfuscate` value, else its parent's, else true.
  // `exclude` lists add up: a category excludes its own names and those listed on its parent.
  const isEnabled = (category) => enabledByCategory[category] ?? enabledByCategory[CATEGORY_PARENTS[category]] ?? true;

  // Bone names are stored lowercase because Bedrock matches them case-insensitively.
  const isExcluded = (group, category, name) =>
    [category, CATEGORY_PARENTS[category]].some((key) =>
      excludedByCategory[key]?.some((excluded) => (group === "bones" ? excluded.toLowerCase() === name : excluded === name))
    );

  for (const group of SYMBOL_GROUPS) {
    for (const value of Object.keys(symbols[group])) {
      const categories = symbols.categories[group]?.[value];
      // Not found in any pack this run: a stale entry from an earlier build, so drop it from the map.
      if (!categories?.length) {
        delete symbols[group][value];
        continue;
      }
      // A name used in several categories is renamed everywhere or nowhere,
      // so one disabled or excluding category is enough to keep it readable.
      const keepReadable = categories.some((category) => !isEnabled(category) || isExcluded(group, category, value));
      if (keepReadable) delete symbols[group][value];
    }
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
