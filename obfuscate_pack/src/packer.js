import fs from "node:fs";
import path from "node:path";
import { ENTITY_PATH_PATTERN, LOOT_TABLE_PATTERN, MAP_FORMAT } from "./constants.js";
import { collectClientSymbols, collectSymbols } from "./symbols.js";
import { obfuscateJson, obfuscateJsonText, obfuscateLang, obfuscateTextureList, obfuscateTextureSet, replaceScriptString } from "./transformer.js";

function walk(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  for (const name of fs.readdirSync(dir)) {
    const file = path.join(dir, name);
    if (fs.statSync(file).isDirectory()) walk(file, files);
    else files.push(file);
  }
  return files;
}

function relativePath(pack, source) {
  return path.relative(pack, source).replace(/\\/g, "/");
}

function isJson(source) {
  return path.extname(source).toLowerCase() === ".json";
}

export function createPacker({ root, args, map, symbols, paths, mapFile }) {
  const tmpDir = path.join(root, ".regolith", "tmp");
  const mapDir = path.resolve(root, args.mapDir ?? "packs/data/obfuscate_pack");
  const mapFileName = args.mapFile ?? (args.profile ? `${args.profile}.map.json` : "map.json");
  const targetMapFile = mapFile ?? path.join(mapDir, mapFileName);

  function registerPack(pack, packName) {
    const files = walk(pack);
    for (const source of files) paths.registerDirectoryPaths(relativePath(pack, source), packName, map, symbols);
    for (const source of files) {
      const rel = relativePath(pack, source);
      if (LOOT_TABLE_PATTERN.test(rel)) paths.targetRelFor(rel, packName, map, symbols);
    }
  }

  function collectPackSymbols(pack, packName, clientSources) {
    registerPack(pack, packName);
    paths.registerTexturePaths(pack, packName, map, symbols);
    paths.registerSoundPaths(pack, packName, map, symbols);
    for (const source of walk(pack)) {
      const rel = relativePath(pack, source);
      if (isJson(source) && paths.shouldCollectSymbols(rel)) collectSymbols(source, symbols);
      if (isJson(source) && !paths.isFixedName(rel) && ENTITY_PATH_PATTERN.test(rel)) clientSources.push(source);
    }
  }

  function getTarget(pack, packName, source) {
    const rel = relativePath(pack, source);
    const key = `${packName.toLowerCase()}/${rel}`;
    const ext = path.extname(source).toLowerCase();
    let targetRel = rel;
    if (LOOT_TABLE_PATTERN.test(rel)) targetRel = paths.targetRelFor(rel, packName, map, symbols);
    if (/^textures\//i.test(rel) && rel !== "textures/textures_list.json") targetRel = symbols.paths[rel] ?? rel;
    if (/^sounds\//i.test(rel) && rel !== "sounds/sound_definitions.json") targetRel = symbols.paths[rel] ?? rel;
    if (/\.texture_set\.json$/i.test(rel)) {
      const textureSetTarget = symbols.paths[rel] ?? targetRel;
      if (textureSetTarget !== rel) targetRel = textureSetTarget;
      else {
        const pngRel = rel.replace(/\.texture_set\.json$/i, ".png");
        const mappedTexture = symbols.paths[pngRel] ?? path.posix.basename(pngRel);
        const baseName = path.posix.basename(mappedTexture, ".png");
        const name = `${baseName}.texture_set.json`;
        targetRel = path.posix.join(paths.mappedParentFor(rel, symbols), name);
      }
      symbols.paths[rel] = targetRel;
      map[key] = path.posix.basename(targetRel);
    } else if (ext === ".json" && !paths.isFixedName(rel) && !LOOT_TABLE_PATTERN.test(rel)) {
      let name = map[key];
      if (!name) {
        name = paths.hashName(key, ext);
        const used = new Set(Object.values(map));
        let suffix = 1;
        while (used.has(name)) name = paths.hashName(`${key}:${suffix++}`, ext);
        map[key] = name;
      }
      targetRel = path.posix.join(paths.mappedParentFor(rel, symbols), name);
    }
    if (targetRel !== rel) symbols.paths[rel] = targetRel;
    return { ext, rel, targetRel };
  }

  function transformFile(source, target, rel, ext) {
    if (ext === ".json" && paths.shouldTransformJson(rel)) {
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
    } else if (ext === ".json" && args.unicode === true && !paths.isFixedName(rel)) {
      fs.writeFileSync(target, obfuscateJsonText(source), "utf8");
    } else if (ext === ".lang") {
      fs.writeFileSync(target, obfuscateLang(source, symbols), "utf8");
    } else if (ext === ".js") {
      fs.writeFileSync(target, replaceScriptString(fs.readFileSync(source, "utf8"), symbols), "utf8");
    } else fs.copyFileSync(source, target);
  }

  function obfuscatePack(pack, packName) {
    const stage = path.join(tmpDir, `packs/data/obfuscate_pack/${packName}`);
    fs.rmSync(stage, { recursive: true, force: true });
    fs.mkdirSync(stage, { recursive: true });
    for (const source of walk(pack)) {
      const { ext, rel, targetRel } = getTarget(pack, packName, source);
      const target = path.join(stage, targetRel);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      transformFile(source, target, rel, ext);
    }
    fs.rmSync(pack, { recursive: true, force: true });
    fs.renameSync(stage, pack);
  }

  function run() {
    const clientSources = [];
    for (const name of ["BP", "RP"]) {
      const pack = path.join(tmpDir, name);
      if (fs.existsSync(pack)) collectPackSymbols(pack, name, clientSources);
    }
    for (const source of clientSources) collectClientSymbols(source, symbols);
    for (const name of ["BP", "RP"]) {
      const pack = path.join(tmpDir, name);
      if (fs.existsSync(pack)) obfuscatePack(pack, name);
    }
    delete symbols.used;
    fs.mkdirSync(mapDir, { recursive: true });

    fs.writeFileSync(targetMapFile, JSON.stringify(map, null, 2), "utf8");
    return args.flattenFolders === true;
  }

  return { run };
}
