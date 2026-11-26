"use strict";

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

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

function formatVersion(version) {
  const parts = typeof version === "string" && /^\d+\.\d+\.\d+$/.test(version)
    ? version.split(".").map(Number)
    : Array.isArray(version)
      ? version
      : version && typeof version === "object"
        ? [version.major, version.minor, version.patch]
        : null;

  if (!parts || parts.length !== 3 || !parts.every((part) => Number.isInteger(part) && part >= 0)) {
    throw new Error(`Unsupported pack version: ${JSON.stringify(version)}`);
  }

  return parts.join(".");
}

function walk(dir, files = []) {
  for (const name of fs.readdirSync(dir).sort()) {
    const file = path.join(dir, name);
    if (fs.statSync(file).isDirectory()) walk(file, files);
    else files.push(file);
  }
  return files;
}

// Fixed timestamp, so the same input gives the same bytes. SOURCE_DATE_EPOCH (seconds) overrides it.
// ZIP stores local time without a zone; UTC is used so the result does not depend on the machine.
function dosDateTime() {
  const epoch = process.env.SOURCE_DATE_EPOCH;
  if (epoch !== undefined && epoch !== "" && !/^\d+$/.test(epoch)) {
    throw new Error(`SOURCE_DATE_EPOCH must be a whole number of seconds, got: ${epoch}`);
  }
  const date = epoch ? new Date(Number(epoch) * 1000) : new Date(Date.UTC(1980, 0, 1, 0, 0, 0));
  const year = date.getUTCFullYear();
  if (year < 1980 || year > 2107) throw new Error(`SOURCE_DATE_EPOCH is outside the range ZIP can store (1980 to 2107): ${epoch}`);
  return {
    date: ((year - 1980) << 9) | ((date.getUTCMonth() + 1) << 5) | date.getUTCDate(),
    time: (date.getUTCHours() << 11) | (date.getUTCMinutes() << 5) | Math.floor(date.getUTCSeconds() / 2)
  };
}

// Deflate when it makes the entry smaller, store it otherwise (PNGs and nested zips do not shrink).
function compress(data) {
  if (data.length === 0) return { method: 0, bytes: data };
  const deflated = zlib.deflateRawSync(data, { level: 9 });
  return deflated.length < data.length ? { method: 8, bytes: deflated } : { method: 0, bytes: data };
}

function createZip(entries) {
  const local = [];
  const central = [];
  let offset = 0;
  const stamp = dosDateTime();

  for (const entry of entries) {
    const name = Buffer.from(entry.name.replace(/\\/g, "/"), "utf8");
    const data = Buffer.isBuffer(entry.data) ? entry.data : fs.readFileSync(entry.data);
    const crc = zlib.crc32(data);
    const { method, bytes } = compress(data);
    const header = Buffer.alloc(30 + name.length);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0x800, 6);
    header.writeUInt16LE(method, 8);
    header.writeUInt16LE(stamp.time, 10);
    header.writeUInt16LE(stamp.date, 12);
    header.writeUInt32LE(crc, 14);
    header.writeUInt32LE(bytes.length, 18);
    header.writeUInt32LE(data.length, 22);
    header.writeUInt16LE(name.length, 26);
    name.copy(header, 30);
    local.push(header, bytes);

    const record = Buffer.alloc(46 + name.length);
    record.writeUInt32LE(0x02014b50, 0);
    record.writeUInt16LE(20, 4);
    record.writeUInt16LE(20, 6);
    record.writeUInt16LE(0x800, 8);
    record.writeUInt16LE(method, 10);
    record.writeUInt16LE(stamp.time, 12);
    record.writeUInt16LE(stamp.date, 14);
    record.writeUInt32LE(crc, 16);
    record.writeUInt32LE(bytes.length, 20);
    record.writeUInt32LE(data.length, 24);
    record.writeUInt16LE(name.length, 28);
    record.writeUInt32LE(offset, 42);
    name.copy(record, 46);
    central.push(record);
    offset += header.length + bytes.length;
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

function readPackFile(file, rel) {
  return fs.readFileSync(file);
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

const versions = packs.map(({ name, dir }) => {
  const manifestPath = path.join(dir, "manifest.json");
  if (!fs.existsSync(manifestPath)) throw new Error(`Missing ${name} manifest: ${manifestPath}`);

  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  return { name, version: formatVersion(manifest.header?.version) };
});

const version = versions[0].version;
if (versions.some((pack) => pack.version !== version)) {
  throw new Error(`Staged pack versions do not match: ${versions.map(({ name, version: value }) => `${name} ${value}`).join(", ")}`);
}

fs.rmSync(outputDir, { recursive: true, force: true });
fs.mkdirSync(outputDir, { recursive: true });

const packEntries = [];
for (const pack of packs) {
  const data = packDirectory(pack.dir);
  const fileName = `${baseName} ${pack.name}-${version}.mcpack`;
  fs.writeFileSync(path.join(outputDir, fileName), data);
  packEntries.push({ name: fileName, data });
}

const addonName = `${baseName}-${version}.mcaddon`;
fs.writeFileSync(path.join(outputDir, addonName), createZip(packEntries));
console.log(`Wrote ${packEntries.length} mcpack file(s) and ${addonName} to ${path.relative(root, outputDir)}`);
