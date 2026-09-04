"use strict";
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const root = process.env.ROOT_DIR;
if (!root) throw new Error("ROOT_DIR environment variable is required");
const args = process.argv[2] ? JSON.parse(process.argv[2]) : {};
const tmpDir = path.join(root, ".regolith", "tmp");
const mapDir = path.resolve(root, args.mapDir ?? "packs/data/obfuscate_pack");
const mapFile = path.join(mapDir, "map.json");

function walk(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  for (const name of fs.readdirSync(dir)) {
    const file = path.join(dir, name);
    if (fs.statSync(file).isDirectory()) walk(file, files);
    else files.push(file);
  }
  return files;
}

function readMap() {
  try {
    return JSON.parse(fs.readFileSync(mapFile, "utf8"));
  } catch {
    return {};
  }
}

function writeMap(map) {
  fs.mkdirSync(mapDir, { recursive: true });
  fs.writeFileSync(mapFile, JSON.stringify(map, null, 2), "utf8");
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

function escapeString(value) {
  return [...value].map((char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`).join("");
}

function serialize(value) {
  if (value === null) return "null";
  if (typeof value === "string") return `"${escapeString(value)}"`;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return `[${value.map(serialize).join(",")}]`;
  if (typeof value === "object")
    return `{${Object.entries(value)
      .map(([key, item]) => `"${escapeString(key)}":${serialize(item)}`)
      .join(",")}}`;
  return "null";
}

function obfuscateJson(source) {
  return serialize(JSON.parse(stripComments(fs.readFileSync(source, "utf8"))));
}

function isFixedName(rel) {
  return (
    rel === "manifest.json" ||
    rel === "textures/textures_list.json" ||
    rel === "texts/languages.json" ||
    /\.texture_set\.json$/i.test(rel) ||
    /^loot_tables(?:\/|$)/i.test(rel)
  );
}

function obfuscatePack(pack, packName, map) {
  const stage = path.join(tmpDir, `packs/data/obfuscate_pack/${packName}`);
  fs.rmSync(stage, { recursive: true, force: true });
  fs.mkdirSync(stage, { recursive: true });
  for (const source of walk(pack)) {
    const rel = path.relative(pack, source).replace(/\\/g, "/");
    const key = `${packName.toLowerCase()}/${rel}`;
    const ext = path.extname(source).toLowerCase();
    let targetRel = rel;
    if (ext === ".json" && !isFixedName(rel)) {
      let name = map[key];
      if (!name) {
        const hash = crypto.createHash("sha1").update(key).digest("hex").slice(0, 12);
        name = `${hash}${ext}`;
        const used = new Set(Object.values(map));
        let suffix = 1;
        while (used.has(name)) name = `${hash}-${suffix++}${ext}`;
        map[key] = name;
      }
      targetRel = path.posix.join(path.posix.dirname(rel), name);
    }
    const target = path.join(stage, targetRel);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    if (ext === ".json" && !isFixedName(rel)) {
      try {
        fs.writeFileSync(target, obfuscateJson(source), "utf8");
      } catch {
        fs.copyFileSync(source, target);
      }
    } else fs.copyFileSync(source, target);
  }
  fs.rmSync(pack, { recursive: true, force: true });
  fs.renameSync(stage, pack);
}

const map = readMap();
for (const name of ["BP", "RP"]) {
  const pack = path.join(tmpDir, name);
  if (fs.existsSync(pack)) obfuscatePack(pack, name, map);
}
writeMap(map);
