import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { crc32 } from "node:zlib";
import { makeTempDir, removeDir, runFilter, writeFile, writeJson } from "./helpers.js";

// Reads a zip through its central directory. The packager stores entries uncompressed (method 0).
function readZip(buf) {
  const end = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  assert.ok(end >= 0, "end of central directory");
  const count = buf.readUInt16LE(end + 10);
  let pos = buf.readUInt32LE(end + 16);
  const entries = new Map();
  for (let i = 0; i < count; i++) {
    assert.equal(buf.readUInt32LE(pos), 0x02014b50, "central header");
    const method = buf.readUInt16LE(pos + 10);
    const crc = buf.readUInt32LE(pos + 16);
    const size = buf.readUInt32LE(pos + 24);
    const nameLength = buf.readUInt16LE(pos + 28);
    const localOffset = buf.readUInt32LE(pos + 42);
    const name = buf.subarray(pos + 46, pos + 46 + nameLength).toString("utf8");
    assert.equal(method, 0, `${name} is stored`);
    assert.equal(buf.readUInt32LE(localOffset), 0x04034b50, "local header");
    const dataStart = localOffset + 30 + buf.readUInt16LE(localOffset + 26) + buf.readUInt16LE(localOffset + 28);
    const data = buf.subarray(dataStart, dataStart + size);
    assert.equal(crc32(data), crc, `${name} crc`);
    entries.set(name, data);
    pos += 46 + nameLength + buf.readUInt16LE(pos + 30) + buf.readUInt16LE(pos + 32);
  }
  return entries;
}

function setup({ bpVersion = [1, 2, 3], rpVersion = [1, 2, 3], config = { name: "Demo Pack" } } = {}) {
  const root = makeTempDir();
  writeJson(root, "config.json", config);
  const manifest = (version) => ({ format_version: 2, header: { name: "T", version } });
  writeJson(root, ".regolith/tmp/BP/manifest.json", manifest(bpVersion));
  writeJson(root, ".regolith/tmp/RP/manifest.json", manifest(rpVersion));
  writeFile(root, ".regolith/tmp/BP/entities/a.json", '{"a":1}');
  writeFile(root, ".regolith/tmp/RP/textures/b.txt", "texture");
  return root;
}

const run = (root, settings) => runFilter("packager", { cwd: root, env: { ROOT_DIR: root }, settings });

test("ROOT_DIR is required", () => {
  const result = runFilter("packager", { cwd: process.cwd() });
  assert.notEqual(result.status, 0);
  assert.match(result.output, /ROOT_DIR/);
});

test("writes one mcpack per pack and an mcaddon that contains both", (t) => {
  const root = setup();
  t.after(() => removeDir(root));
  const result = run(root);
  assert.equal(result.status, 0, result.output);
  const out = join(root, "build", "packages");
  assert.deepEqual(readdirSync(out).sort(), ["Demo Pack BP-1.2.3.mcpack", "Demo Pack RP-1.2.3.mcpack", "Demo Pack-1.2.3.mcaddon"]);

  const bp = readZip(readFileSync(join(out, "Demo Pack BP-1.2.3.mcpack")));
  assert.deepEqual([...bp.keys()].sort(), ["entities/a.json", "manifest.json"]);
  assert.equal(bp.get("entities/a.json").toString("utf8"), '{"a":1}');

  const addon = readZip(readFileSync(join(out, "Demo Pack-1.2.3.mcaddon")));
  assert.deepEqual([...addon.keys()].sort(), ["Demo Pack BP-1.2.3.mcpack", "Demo Pack RP-1.2.3.mcpack"]);
  assert.ok(addon.get("Demo Pack RP-1.2.3.mcpack").equals(readFileSync(join(out, "Demo Pack RP-1.2.3.mcpack"))));
});

test("settings name and outputDir override the defaults", (t) => {
  const root = setup();
  t.after(() => removeDir(root));
  const result = run(root, { name: "Other", outputDir: "dist/out" });
  assert.equal(result.status, 0, result.output);
  assert.ok(readdirSync(join(root, "dist", "out")).includes("Other-1.2.3.mcaddon"));
});

test("the name falls back to config.json, which may contain comments", (t) => {
  const root = setup();
  t.after(() => removeDir(root));
  writeFile(root, "config.json", '{\n  // project\n  "name": "Commented"\n}');
  assert.equal(run(root).status, 0);
  assert.ok(readdirSync(join(root, "build", "packages")).includes("Commented-1.2.3.mcaddon"));
});

test("accepts string versions and fails when BP and RP versions differ", (t) => {
  const ok = setup({ bpVersion: "2.0.1", rpVersion: "2.0.1" });
  const mismatch = setup({ bpVersion: [1, 2, 3], rpVersion: [1, 2, 4] });
  t.after(() => { removeDir(ok); removeDir(mismatch); });
  assert.equal(run(ok).status, 0);
  assert.ok(readdirSync(join(ok, "build", "packages")).includes("Demo Pack-2.0.1.mcaddon"));
  const result = run(mismatch);
  assert.notEqual(result.status, 0);
  assert.match(result.output, /do not match/);
});

test("an unsupported version fails", (t) => {
  const root = setup({ bpVersion: "1.0", rpVersion: "1.0" });
  t.after(() => removeDir(root));
  const result = run(root);
  assert.notEqual(result.status, 0);
  assert.match(result.output, /Unsupported pack version/);
});

test("fails when no staged pack exists", (t) => {
  const root = makeTempDir();
  t.after(() => removeDir(root));
  writeJson(root, "config.json", { name: "X" });
  const result = run(root);
  assert.notEqual(result.status, 0);
  assert.match(result.output, /No staged BP or RP packs/);
});
