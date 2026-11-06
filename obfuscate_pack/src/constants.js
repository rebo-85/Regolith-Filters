export const MAP_FORMAT = "letters6-v5";
export const SYMBOL_FORMAT = "letters6-v7";

export const FIXED_DIRECTORIES = new Set(["models", "models/blocks", "models/entity"]);

export const FIXED_FILES = new Set([
  "manifest.json",
  "blocks.json",
  "textures/textures_list.json",
  "textures/item_texture.json",
  "textures/terrain_texture.json",
  "textures/flipbook_textures.json",
  "texts/languages.json",
  "sounds/sound_definitions.json",
  "sounds/music_definitions.json"
]);

export const TEXTURE_SET_PATTERN = /\.texture_set\.json$/i;
export const SOUND_DEFINITION_PATTERN = /^sounds\/(?:sound|music)_definitions\.json$/i;
export const LOOT_TABLE_PATTERN = /^loot_tables\//i;
export const ENTITY_PATH_PATTERN = /\/entity\//i;

// Symbol categories, as used by the `obfuscate` and `exclude` settings.
// Parent categories group related leaf categories: a setting on a parent applies to every child,
// and a setting on a child overrides its parent. Leaves without a parent stand alone.
export const CATEGORY_PARENTS = {
  entityIds: "identifiers",
  blockIds: "identifiers",
  itemIds: "identifiers",
  entityComponents: "components",
  blockComponents: "components",
  itemComponents: "components",
  entityProperties: "properties",
  blockStates: "properties"
};

export const LEAF_CATEGORIES = [
  "entityIds",
  "blockIds",
  "itemIds",
  "tags",
  "entityComponents",
  "blockComponents",
  "itemComponents",
  "entityProperties",
  "blockStates",
  "componentGroups",
  "events",
  "geometry",
  "animations",
  "animationControllers",
  "renderControllers",
  "materials",
  "textures",
  "particles",
  "sounds",
  "animationStates",
  "bones",
  "renderArrays",
  "scriptVariables"
];

export const CATEGORIES = new Set([...LEAF_CATEGORIES, ...Object.values(CATEGORY_PARENTS)]);

// Every table in `symbols` that holds renamable names.
export const SYMBOL_GROUPS = ["refs", "aliases", "blockIds", "itemIds", "tags", "vars", "states", "bones"];
