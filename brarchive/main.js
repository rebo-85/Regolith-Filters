"use strict";
const fs = require("fs");
const path = require("path");

const root = process.env.ROOT_DIR;
if (!root) throw new Error("ROOT_DIR environment variable is required");
const args = process.argv[2] ? JSON.parse(process.argv[2]) : {};
const tmpDir = path.join(root, ".regolith", "tmp");
function walk(dir, files = []) {
  for (const name of fs.readdirSync(dir).sort()) {
    const file = path.join(dir, name);
    if (fs.statSync(file).isDirectory()) walk(file, files);
    else files.push(file);
  }
  return files;
}

function removeEmptyDirs(dir) {
  for (const name of fs.readdirSync(dir)) {
    const child = path.join(dir, name);
    if (fs.statSync(child).isDirectory() && name !== "__brarchive") removeEmptyDirs(child);
  }
  if (dir !== path.dirname(dir) && fs.readdirSync(dir).length === 0) fs.rmdirSync(dir);
}

function writeArchive(pack, output) {
  const files = walk(pack);
  if (files.length > 0xffffffff) throw new Error("Too many archive entries");
  const desc = [];
  const data = [];
  let offset = 0;
  for (const file of files) {
    const name = path.relative(pack, file).replace(/\\/g, "/");
    const nameBuf = Buffer.from(name, "utf8");
    if (nameBuf.length > 247) throw new Error(`Archive entry name is too long: ${name}`);
    const content = fs.readFileSync(file);
    if (content.length > 0xffffffff || offset > 0xffffffff - content.length) throw new Error("Archive content is too large");
    desc.push([nameBuf, offset, content.length]);
    data.push(content);
    offset += content.length;
  }

  const result = Buffer.alloc(16 + desc.length * 256 + offset);
  result.writeBigUInt64LE(0x267052a0b125277dn, 0);
  result.writeUInt32LE(desc.length, 8);
  result.writeUInt32LE(1, 12);
  let pos = 16;
  for (const [name, off, len] of desc) {
    result[pos] = name.length;
    name.copy(result, pos + 1);
    result.writeUInt32LE(off, pos + 248);
    result.writeUInt32LE(len, pos + 252);
    pos += 256;
  }
  for (const content of data) {
    content.copy(result, pos);
    pos += content.length;
  }
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, result);
}

function archivePack(pack) {
  const files = walk(pack).filter((file) => {
    const name = path.relative(pack, file).replace(/\\/g, "/");
    return name !== "manifest.json" && name !== "pack_icon.png" && !name.startsWith("__brarchive/");
  });
  if (files.length === 0) return;
  const groups = new Map();
  for (const file of files) {
    const dir = path.dirname(file);
    if (!groups.has(dir)) groups.set(dir, []);
    groups.get(dir).push(file);
  }

  const archiveRoot = path.join(pack, "__brarchive");
  fs.rmSync(archiveRoot, { recursive: true, force: true });
  for (const [dir, group] of groups) {
    const relDir = path.relative(pack, dir).replace(/\\/g, "/");
    const archiveName = relDir || path.basename(pack);
    const archive = path.join(archiveRoot, `${archiveName}.brarchive`);
    const tempDir = fs.mkdtempSync(path.join(root, ".brarchive-"));
    try {
      for (const file of group) {
        const rel = path.relative(dir, file);
        const dest = path.join(tempDir, rel);
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.copyFileSync(file, dest);
      }
      writeArchive(tempDir, archive);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    for (const file of group) fs.rmSync(file);
  }

  removeEmptyDirs(pack);
}

for (const name of ["BP", "RP"]) {
  const pack = path.join(tmpDir, name);
  if (!fs.existsSync(pack)) continue;
  archivePack(pack);
  console.log(`[brarchive] Archived ${name} into ${path.relative(root, path.join(pack, "__brarchive"))}`);
}
