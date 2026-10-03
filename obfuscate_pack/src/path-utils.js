import fs from "node:fs";
import path from "node:path";
import { makeKey } from "./symbols.js";
import { FIXED_DIRECTORIES, FIXED_FILES, SOUND_DEFINITION_PATTERN, TEXTURE_SET_PATTERN } from "./constants.js";

export function createPathMapper({ flattenFolders }) {
  const isFixedName = (rel) => FIXED_FILES.has(rel.toLowerCase());
  const hashName = (value, ext = "") => `${makeKey(value)}${ext}`;
  const isFixedDirectory = (rel) => FIXED_DIRECTORIES.has(rel.toLowerCase());

  function fixedModelParent(rel) {
    const lower = rel.toLowerCase();
    for (const parent of ["models/blocks", "models/entity"]) if (lower === parent || lower.startsWith(`${parent}/`)) return parent;
    return "";
  }

  function flattenedParentFor(rel) {
    return fixedModelParent(rel) || rel.split("/")[0];
  }

  function registerDirectoryPaths(rel, packName, map, symbols) {
    const parts = rel.split("/");
    if (parts.length < 2) return;
    if (flattenFolders) {
      for (let idx = 1; idx < parts.length - 1; idx++) {
        const sourceRel = parts.slice(0, idx + 1).join("/");
        delete map.__dirs?.[`${packName.toLowerCase()}/${sourceRel}`];
        symbols.paths[sourceRel] = flattenedParentFor(sourceRel);
      }
      return;
    }
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
    return flattenFolders ? flattenedParentFor(parent) : (symbols.paths[parent] ?? parent);
  }

  function targetRelFor(rel, packName, map, symbols) {
    const key = `${packName.toLowerCase()}/${rel}`;
    if (map[key]) {
      const name = flattenFolders ? path.posix.basename(map[key]) : map[key];
      const targetRel = map[key].includes("/") && !flattenFolders ? map[key] : path.posix.join(mappedParentFor(rel, symbols), name);
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

  function registerAssetPaths(pack, packName, assetDir, map, symbols, skip, getName = (key, ext) => hashName(key, ext)) {
    const files = walk(path.join(pack, assetDir));
    for (const source of files) {
      const rel = path.relative(pack, source).replace(/\\/g, "/");
      if (skip(rel)) continue;
      const parts = rel.split("/");
      const mapped = [parts[0]];
      for (let idx = 1; idx < parts.length; idx++) {
        const segment = parts[idx];
        const ext = idx === parts.length - 1 ? path.posix.extname(segment) : "";
        const key = `${packName.toLowerCase()}/${assetDir}/${parts.slice(1, idx + 1).join("/")}`;
        const mappedName = map.__paths?.[key] ?? getName(key, ext, segment, parts, idx);
        map.__paths ??= {};
        map.__paths[key] = mappedName;
        mapped.push(mappedName);
      }
      const target = flattenFolders ? path.posix.join(parts[0], mapped[mapped.length - 1]) : mapped.join("/");
      symbols.paths[rel] = target;
      const ext = path.posix.extname(rel);
      if (ext) symbols.paths[rel.slice(0, -ext.length)] = target.slice(0, -ext.length);
    }
  }

  function registerTexturePaths(pack, packName, map, symbols) {
    const skip = (rel) => {
      if (!isFixedName(rel)) return false;
      delete map[`${packName.toLowerCase()}/${rel}`];
      delete symbols.paths[rel];
      delete symbols.paths[rel.slice(0, -path.posix.extname(rel).length)];
      delete map.__paths?.[`${packName.toLowerCase()}/${rel}`];
      return true;
    };
    registerAssetPaths(pack, packName, "textures", map, symbols, skip, (key, ext, segment, parts, idx) => {
      if (idx !== parts.length - 1 || !TEXTURE_SET_PATTERN.test(segment)) return hashName(key, ext);
      const textureName = segment.slice(0, -".texture_set.json".length);
      const textureKey = `${packName.toLowerCase()}/textures/${parts.slice(1, idx).join("/")}/${textureName}.png`;
      const mappedTexture = map.__paths?.[textureKey] ?? hashName(textureKey, ".png");
      return `${mappedTexture.slice(0, -".png".length)}.texture_set.json`;
    });
  }

  function registerSoundPaths(pack, packName, map, symbols) {
    registerAssetPaths(pack, packName, "sounds", map, symbols, (rel) => SOUND_DEFINITION_PATTERN.test(rel));
  }

  return {
    hashName,
    isFixedName,
    registerDirectoryPaths,
    registerTexturePaths,
    registerSoundPaths,
    targetRelFor,
    mappedParentFor
  };
}

function walk(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  for (const name of fs.readdirSync(dir)) {
    const file = path.join(dir, name);
    if (fs.statSync(file).isDirectory()) walk(file, files);
    else files.push(file);
  }
  return files;
}
