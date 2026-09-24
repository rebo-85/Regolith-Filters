"use strict";
const fs = require("fs");
const path = require("path");
const {
  obfuscateJson,
  obfuscateJsonText,
  obfuscateLang,
  obfuscateTextureList,
  obfuscateTextureSet,
  collectSymbols,
  collectClientSymbols,
  createSymbols,
  makeKey,
  walk,
  readMap,
  writeMap,
  replaceScriptString,
  setUnicodeEnabled
} = require("./utils");

const root = process.env.ROOT_DIR;
if (!root) throw new Error("ROOT_DIR environment variable is required");
const args = process.argv[2] ? JSON.parse(process.argv[2]) : {};
setUnicodeEnabled(args.unicode === true);
const tmpDir = path.join(root, ".regolith", "tmp");
const mapDir = path.resolve(root, args.mapDir ?? "packs/data/obfuscate_pack");
const mapFile = path.join(mapDir, "map.json");
const map = readMap(mapFile);
if (map.__format !== "letters6-v5") {
  for (const key of Object.keys(map)) if (!key.startsWith("__")) delete map[key];
  delete map.__paths;
  map.__format = "letters6-v5";
}
const symbols = createSymbols(map);

function isFixedName(rel) {
  rel = rel.toLowerCase();
  return (
    rel === "manifest.json" ||
    rel === "blocks.json" ||
    rel === "textures/textures_list.json" ||
    rel === "textures/item_texture.json" ||
    rel === "textures/terrain_texture.json" ||
    rel === "texts/languages.json" ||
    rel === "sounds/sound_definitions.json" ||
    rel === "sounds/music_definitions.json" ||
    /\.texture_set\.json$/i.test(rel)
  );
}

function hashName(value, ext = "") {
  return `${makeKey(value)}${ext}`;
}

function isFixedDirectory(rel) {
  rel = rel.toLowerCase();
  return rel === "models" || rel === "models/blocks" || rel === "models/entity";
}

function registerDirectoryPaths(rel, packName, map, symbols) {
  const parts = rel.split("/");
  if (parts.length < 2) return;
  const mapped = [parts[0]];
  map.__dirs ??= {};
  for (let idx = 1; idx < parts.length - 1; idx++) {
    const sourceRel = parts.slice(0, idx + 1).join("/");
    const key = `${packName.toLowerCase()}/${sourceRel}`;
    const name = isFixedDirectory(sourceRel) ? parts[idx] : (map.__dirs[key] ?? hashName(key));
    if (isFixedDirectory(sourceRel)) delete map.__dirs[key];
    else map.__dirs[key] = name;
    mapped.push(name);
    symbols.paths[sourceRel] = mapped.join("/");
  }
}

function mappedParentFor(rel, symbols) {
  const parent = path.posix.dirname(rel);
  return symbols.paths[parent] ?? parent;
}

function targetRelFor(rel, packName, map, symbols) {
  const key = `${packName.toLowerCase()}/${rel}`;
  if (map[key]) {
    const targetRel = map[key].includes("/") ? map[key] : path.posix.join(mappedParentFor(rel, symbols), map[key]);
    symbols.paths[rel] = targetRel;
    return targetRel;
  }
  const ext = path.extname(rel).toLowerCase();
  let name = hashName(key, ext);
  const used = new Set(Object.values(map));
  let target = name;
  let suffix = 1;
  while (used.has(target) || used.has(path.posix.join(path.posix.dirname(rel), target))) target = hashName(`${key}:${suffix++}`, ext);
  map[key] = target;
  const targetRel = path.posix.join(mappedParentFor(rel, symbols), target);
  symbols.paths[rel] = targetRel;
  return targetRel;
}

function registerTexturePaths(pack, packName, map, symbols) {
  for (const source of walk(path.join(pack, "textures"))) {
    const rel = path.relative(pack, source).replace(/\\/g, "/");
    if (isFixedName(rel)) {
      delete map[`${packName.toLowerCase()}/${rel}`];
      delete symbols.paths[rel];
      delete symbols.paths[rel.slice(0, -path.posix.extname(rel).length)];
      delete map.__paths?.[`${packName.toLowerCase()}/${rel}`];
      continue;
    }
    const parts = rel.split("/");
    const mapped = [parts[0]];
    for (let idx = 1; idx < parts.length; idx++) {
      const segment = parts[idx];
      const isTextureSet = idx === parts.length - 1 && /\.texture_set\.json$/i.test(segment);
      const ext = idx === parts.length - 1 ? path.posix.extname(segment) : "";
      const key = `${packName.toLowerCase()}/textures/${parts.slice(1, idx + 1).join("/")}`;
      let mappedName = map.__paths?.[key] ?? hashName(key, ext);
      if (isTextureSet) {
        const textureName = segment.slice(0, -".texture_set.json".length);
        const textureKey = `${packName.toLowerCase()}/textures/${parts.slice(1, idx).join("/")}/${textureName}.png`;
        const mappedTexture = map.__paths?.[textureKey] ?? `${hashName(textureKey, ".png")}`;
        mappedName = `${mappedTexture.slice(0, -".png".length)}.texture_set.json`;
      }
      map.__paths ??= {};
      map.__paths[key] = mappedName;
      mapped.push(mappedName);
    }
    symbols.paths[rel] = mapped.join("/");
    const ext = path.posix.extname(rel);
    if (ext) symbols.paths[rel.slice(0, -ext.length)] = mapped.join("/").slice(0, -ext.length);
  }
}

function registerSoundPaths(pack, packName, map, symbols) {
  for (const source of walk(path.join(pack, "sounds"))) {
    const rel = path.relative(pack, source).replace(/\\/g, "/");
    if (/^sounds\/(?:sound|music)_definitions\.json$/i.test(rel)) continue;
    const parts = rel.split("/");
    const mapped = [parts[0]];
    for (let idx = 1; idx < parts.length; idx++) {
      const segment = parts[idx];
      const ext = idx === parts.length - 1 ? path.posix.extname(segment) : "";
      const key = `${packName.toLowerCase()}/sounds/${parts.slice(1, idx + 1).join("/")}`;
      const mappedName = map.__paths?.[key] ?? hashName(key, ext);
      map.__paths ??= {};
      map.__paths[key] = mappedName;
      mapped.push(mappedName);
    }
    const target = mapped.join("/");
    symbols.paths[rel] = target;
    const ext = path.posix.extname(rel);
    if (ext) symbols.paths[rel.slice(0, -ext.length)] = target.slice(0, -ext.length);
  }
}

function obfuscatePack(pack, packName, map, symbols) {
  const stage = path.join(tmpDir, `packs/data/obfuscate_pack/${packName}`);
  fs.rmSync(stage, { recursive: true, force: true });
  fs.mkdirSync(stage, { recursive: true });
  const files = walk(pack);
  for (const source of files) {
    const rel = path.relative(pack, source).replace(/\\/g, "/");
    registerDirectoryPaths(rel, packName, map, symbols);
  }
  for (const source of files) {
    const rel = path.relative(pack, source).replace(/\\/g, "/");
    if (/^loot_tables\//i.test(rel)) targetRelFor(rel, packName, map, symbols);
  }
  for (const source of files) {
    const rel = path.relative(pack, source).replace(/\\/g, "/");
    const key = `${packName.toLowerCase()}/${rel}`;
    const ext = path.extname(source).toLowerCase();
    let targetRel = rel;
    if (/^loot_tables\//i.test(rel)) targetRel = targetRelFor(rel, packName, map, symbols);
    if (/^textures\//i.test(rel) && rel !== "textures/textures_list.json") targetRel = symbols.paths[rel] ?? rel;
    if (/^sounds\//i.test(rel) && rel !== "sounds/sound_definitions.json") targetRel = symbols.paths[rel] ?? rel;
    if (ext === ".json" && !isFixedName(rel) && !/^loot_tables\//i.test(rel)) {
      let name = map[key];
      if (!name) {
        name = hashName(key, ext);
        const used = new Set(Object.values(map));
        let suffix = 1;
        while (used.has(name)) name = hashName(`${key}:${suffix++}`, ext);
        map[key] = name;
      }
      targetRel = path.posix.join(mappedParentFor(rel, symbols), name);
    }
    if (targetRel !== rel) symbols.paths[rel] = targetRel;
    const target = path.join(stage, targetRel);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    if (ext === ".json" && (!isFixedName(rel) || /^sounds\/(?:sound|music)_definitions\.json$/i.test(rel) || /\.texture_set\.json$/i.test(rel))) {
      try {
        if (/\.texture_set\.json$/i.test(rel)) {
          const textureRel = rel.replace(/\.texture_set\.json$/i, "");
          fs.writeFileSync(target, obfuscateTextureSet(source, symbols, textureRel), "utf8");
        } else {
          const context = /^sounds\/music_definitions\.json$/i.test(rel) ? "music_definitions" : "";
          fs.writeFileSync(target, obfuscateJson(source, symbols, context), "utf8");
        }
      } catch {
        fs.copyFileSync(source, target);
      }
    } else if (rel === "textures/textures_list.json") {
      fs.writeFileSync(target, obfuscateTextureList(source, symbols), "utf8");
    } else if (ext === ".json" && args.unicode === true) {
      fs.writeFileSync(target, obfuscateJsonText(source), "utf8");
    } else if (ext === ".lang") {
      fs.writeFileSync(target, obfuscateLang(source, symbols), "utf8");
    } else if (ext === ".js") {
      fs.writeFileSync(target, replaceScriptString(fs.readFileSync(source, "utf8"), symbols), "utf8");
    } else fs.copyFileSync(source, target);
  }
  fs.rmSync(pack, { recursive: true, force: true });
  fs.renameSync(stage, pack);
}

const clientSources = [];
for (const name of ["BP", "RP"]) {
  const pack = path.join(tmpDir, name);
  if (fs.existsSync(pack)) {
    for (const source of walk(pack)) {
      const rel = path.relative(pack, source).replace(/\\/g, "/");
      registerDirectoryPaths(rel, name, map, symbols);
    }
    registerTexturePaths(pack, name, map, symbols);
    registerSoundPaths(pack, name, map, symbols);
    for (const source of walk(pack)) {
      const rel = path.relative(pack, source).replace(/\\/g, "/");
      if (path.extname(source).toLowerCase() === ".json" && (!isFixedName(rel) || /^sounds\/(?:sound|music)_definitions\.json$/i.test(rel)))
        collectSymbols(source, symbols);
      if (path.extname(source).toLowerCase() === ".json" && !isFixedName(rel) && rel.includes("/entity/")) clientSources.push(source);
    }
  }
}
for (const source of clientSources) collectClientSymbols(source, symbols);
for (const name of ["BP", "RP"]) {
  const pack = path.join(tmpDir, name);
  if (fs.existsSync(pack)) obfuscatePack(pack, name, map, symbols);
}
delete symbols.used;
writeMap(map, mapDir, mapFile);
