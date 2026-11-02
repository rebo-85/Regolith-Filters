const fs = require("fs");
const path = require("path");

const root = process.env.ROOT_DIR;
if (!root) throw new Error("ROOT_DIR environment variable is required");
const args = process.argv[2] ? JSON.parse(process.argv[2]) : {};
const tmpDir = path.join(root, ".regolith", "tmp");

// Options (all optional, passed as the JSON argument from Regolith):
//   excluded:            top-level folders to leave unarchived (default: none)
//   stubbed:             extensions stored as zero-length name-only entries and
//                        left loose on disk, like Mojang's .lang files (default: [".lang"])
//   minify:              minify JSON entries like Mojang does (default: true)
//   emptyParentArchives: write empty archives for folders that only contain
//                        subfolders, like Mojang's texts/ja_JP.brarchive (default: true)
//   archiveRootFiles:    also archive files at the pack root (default: false)
const excluded = new Set(args.excluded ?? []);
const stubbedExt = new Set((args.stubbed ?? [".lang"]).map((e) => e.toLowerCase()));
const minify = args.minify ?? true;
const emptyParentArchives = args.emptyParentArchives ?? true;
const archiveRootFiles = args.archiveRootFiles ?? false;

const rel = (base, file) => path.relative(base, file).replace(/\\/g, "/");

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

function stripComments(text) {
  return text.replace(/("(?:\\.|[^"\\])*"|\/\/[^\r\n]*|\/\*[\s\S]*?\*\/)/g, (match) => {
    return match.startsWith('"') ? match : match.replace(/[^\r\n]/g, " ");
  });
}

function validateManifest(pack) {
  const manifestPath = path.join(pack, "manifest.json");
  const manifest = JSON.parse(stripComments(fs.readFileSync(manifestPath, "utf8")));
  if (!manifest.header || !Object.prototype.hasOwnProperty.call(manifest.header, "pack_optimization_version")) {
    throw new Error(`${manifestPath} must define header.pack_optimization_version`);
  }
}

const isStub = (file) => stubbedExt.has(path.extname(file).toLowerCase());

function minifyJsonText(text) {
  const clean = stripComments(text.replace(/^\uFEFF/, ""));
  const out = clean.replace(/("(?:\\.|[^"\\])*")|,(?=\s*[}\]])|\s+/g, (m, str) => (str !== undefined ? str : ""));
  JSON.parse(out); // throws if the result isn't valid JSON
  return out;
}

function readEntry(file) {
  const raw = fs.readFileSync(file);
  if (!minify || path.extname(file).toLowerCase() !== ".json") return raw;
  try {
    return Buffer.from(minifyJsonText(raw.toString("utf8")), "utf8");
  } catch (err) {
    console.warn(`Warning: could not minify ${file} (${err.message}); storing it unchanged.`);
    return raw;
  }
}

// entries: [{ name: string, content: Buffer }]; zero-length entries are name-only stubs.
function writeArchive(entries, output) {
  if (entries.length > 0xffffffff) throw new Error("Too many archive entries");
  const sorted = entries
    .map((e) => ({ nameBuf: Buffer.from(e.name, "utf8"), content: e.content }))
    .sort((a, b) => Buffer.compare(a.nameBuf, b.nameBuf));

  const desc = [];
  let offset = 0;
  for (const { nameBuf, content } of sorted) {
    if (nameBuf.length > 247) throw new Error(`Archive entry name is too long: ${nameBuf.toString("utf8")}`);
    if (content.length > 0xffffffff || offset > 0xffffffff - content.length) throw new Error("Archive content is too large");
    // Mojang writes stubs with offset 0 and length 0.
    desc.push([nameBuf, content.length ? offset : 0, content.length]);
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
  for (const { content } of sorted) {
    content.copy(result, pos);
    pos += content.length;
  }
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, result);
}

function archivePack(pack) {
  const files = walk(pack).filter((file) => {
    const name = rel(pack, file);
    const top = name.split("/", 1)[0];
    if (!name.includes("/") && !archiveRootFiles) return false; // leave pack-root files loose
    return name !== "manifest.json" && name !== "pack_icon.png" && name !== "blocks.json" && !name.startsWith("__brarchive/") && !excluded.has(top);
  });
  if (files.length === 0) return;

  // One archive per folder, keyed by the folder's path relative to the pack root.
  const groups = new Map();
  for (const file of files) {
    const relDir = path.posix.dirname(rel(pack, file));
    const key = relDir === "." ? "" : relDir;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(file);
  }
  if (emptyParentArchives) {
    for (const key of [...groups.keys()]) {
      let parent = path.posix.dirname(key);
      while (key && parent !== "." && parent !== "") {
        if (!groups.has(parent)) groups.set(parent, []);
        parent = path.posix.dirname(parent);
      }
    }
  }

  const archiveRoot = path.join(pack, "__brarchive");
  fs.rmSync(archiveRoot, { recursive: true, force: true });
  const toDelete = [];
  for (const [relDir, group] of groups) {
    const archiveName = relDir || path.basename(pack);
    const entries = group.map((file) => {
      const stub = isStub(file);
      if (!stub) toDelete.push(file);
      return { name: path.basename(file), content: stub ? Buffer.alloc(0) : readEntry(file) };
    });
    writeArchive(entries, path.join(archiveRoot, `${archiveName}.brarchive`));
  }
  for (const file of toDelete) fs.rmSync(file);

  removeEmptyDirs(pack);
}

function main() {
  const packs = ["BP", "RP"].map((name) => path.join(tmpDir, name)).filter((pack) => fs.existsSync(pack));

  for (const pack of packs) validateManifest(pack);

  for (const pack of packs) archivePack(pack);

  console.log("Archiving finished successfully.");
}

main();
