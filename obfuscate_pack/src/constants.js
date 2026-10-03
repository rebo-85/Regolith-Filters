export const MAP_FORMAT = "letters6-v5";
export const SYMBOL_FORMAT = "letters6-v5";

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
