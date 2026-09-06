"use strict";

const fs = require("fs");
const path = require("path");

const root = process.env.ROOT_DIR;
if (!root) throw new Error("ROOT_DIR environment variable is required");

const args = process.argv[2] ? JSON.parse(process.argv[2]) : {};
const tmpDir = path.join(root, ".regolith", "tmp");
const outputDir = path.resolve(root, args.outputDir ?? "build/packages");

function readProjectName() {
  const config = fs
    .readFileSync(path.join(root, "config.json"), "utf8")
    .replace(/("(?:\\.|[^"\\])*"|\/\/[^\r\n]*|\/\*[\s\S]*?\*\/)/g, (match) => (match.startsWith('"') ? match : match.replace(/[^\r\n]/g, " ")));
  return JSON.parse(config).name;
}

const baseName = args.name ?? readProjectName();

function walk(dir, files = []) {
  for (const name of fs.readdirSync(dir).sort()) {
    const file = path.join(dir, name);
    if (fs.statSync(file).isDirectory()) walk(file, files);
    else files.push(file);
  }
  return files;
}

function crc32(data) {
  let crc = 0xffffffff;
  for (const value of data) {
    crc ^= value;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date = new Date()) {
  return {
    date: ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2)
  };
}

function createZip(entries) {
  const local = [];
  const central = [];
  let offset = 0;
  const stamp = dosDateTime();

  for (const entry of entries) {
    const name = Buffer.from(entry.name.replace(/\\/g, "/"), "utf8");
    const data = Buffer.isBuffer(entry.data) ? entry.data : fs.readFileSync(entry.data);
    const crc = crc32(data);
    const header = Buffer.alloc(30 + name.length);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0x800, 6);
    header.writeUInt16LE(stamp.time, 10);
    header.writeUInt16LE(stamp.date, 12);
    header.writeUInt32LE(crc, 14);
    header.writeUInt32LE(data.length, 18);
    header.writeUInt32LE(data.length, 22);
    header.writeUInt16LE(name.length, 26);
    name.copy(header, 30);
    local.push(header, data);

    const record = Buffer.alloc(46 + name.length);
    record.writeUInt32LE(0x02014b50, 0);
    record.writeUInt16LE(20, 4);
    record.writeUInt16LE(20, 6);
    record.writeUInt16LE(0x800, 8);
    record.writeUInt16LE(stamp.time, 12);
    record.writeUInt16LE(stamp.date, 14);
    record.writeUInt32LE(crc, 16);
    record.writeUInt32LE(data.length, 20);
    record.writeUInt32LE(data.length, 24);
    record.writeUInt16LE(name.length, 28);
    record.writeUInt32LE(offset, 42);
    name.copy(record, 46);
    central.push(record);
    offset += header.length + data.length;
  }

  const centralData = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(central.length, 8);
  end.writeUInt16LE(central.length, 10);
  end.writeUInt32LE(centralData.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, centralData, end]);
}

function versionObject(value) {
  const parts = Array.isArray(value) ? value : typeof value === "string" && /^\d+(?:\.\d+){0,2}$/.test(value) ? value.split(".").map(Number) : null;
  if (!parts) return value;
  return {
    major: parts[0] ?? 0,
    minor: parts[1] ?? 0,
    patch: parts[2] ?? 0
  };
}

function readPackFile(file, rel) {
  if (rel !== "manifest.json") return fs.readFileSync(file);
  const manifest = JSON.parse(fs.readFileSync(file, "utf8"));
  manifest.header.version = versionObject(manifest.header.version);
  for (const module of manifest.modules ?? []) module.version = versionObject(module.version);
  for (const dependency of manifest.dependencies ?? []) {
    if (dependency.uuid) dependency.version = versionObject(dependency.version);
  }
  return Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

function packDirectory(dir) {
  return createZip(
    walk(dir).map((file) => ({
      name: path.relative(dir, file),
      data: readPackFile(file, path.relative(dir, file).replace(/\\/g, "/"))
    }))
  );
}

const packs = ["BP", "RP"].map((name) => ({ name, dir: path.join(tmpDir, name) })).filter(({ dir }) => fs.existsSync(dir));

if (packs.length === 0) throw new Error("No staged BP or RP packs were found.");

fs.rmSync(outputDir, { recursive: true, force: true });
fs.mkdirSync(outputDir, { recursive: true });

const packEntries = [];
for (const pack of packs) {
  const data = packDirectory(pack.dir);
  const fileName = `${baseName} ${pack.name}.mcpack`;
  fs.writeFileSync(path.join(outputDir, fileName), data);
  packEntries.push({ name: fileName, data });
}

const addonName = `${baseName}.mcaddon`;
fs.writeFileSync(path.join(outputDir, addonName), createZip(packEntries));
console.log(`[packager] Wrote ${packEntries.length} mcpack file(s) and ${addonName} to ${path.relative(root, outputDir)}`);
