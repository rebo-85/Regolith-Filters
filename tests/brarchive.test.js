import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { makeTempDir, removeDir, runFilter, writeFile, writeJson } from "./helpers.js";

const MAGIC = 0x267052a0b125277dn;

// Reads a .brarchive back into [{ name, offset, length, content }].
function readArchive(file) {
  const buf = readFileSync(file);
  assert.equal(buf.readBigUInt64LE(0), MAGIC, "magic");
  const count = buf.readUInt32LE(8);
  assert.equal(buf.readUInt32LE(12), 1, "version");
  const dataStart = 16 + count * 256;
  const entries = [];
  for (let i = 0; i < count; i++) {
    const pos = 16 + i * 256;
    const nameLength = buf[pos];
    const name = buf.subarray(pos + 1, pos + 1 + nameLength).toString("utf8");
    const offset = buf.readUInt32LE(pos + 248);
    const length = buf.readUInt32LE(pos + 252);
    entries.push({ name, offset, length, content: buf.subarray(dataStart + offset, dataStart + offset + length) });
  }
  return entries;
}

function setup(files = {}) {
  const root = makeTempDir();
  const tmp = ".regolith/tmp";
  writeJson(root, `${tmp}/BP/manifest.json`, { format_version: 2, header: { name: "T", version: [1, 0, 0], pack_optimization_version: 1 } });
  for (const [rel, content] of Object.entries(files)) writeFile(root, `${tmp}/BP/${rel}`, content);
  return { root, bp: join(root, tmp, "BP") };
}

test("ROOT_DIR is required", () => {
  const result = runFilter("brarchive", { cwd: process.cwd() });
  assert.notEqual(result.status, 0);
  assert.match(result.output, /ROOT_DIR/);
});

test("a manifest without header.pack_optimization_version is rejected", (t) => {
  const { root, bp } = setup({ "entities/a.json": "{}" });
  t.after(() => removeDir(root));
  writeJson(bp, "manifest.json", { format_version: 2, header: { name: "T", version: [1, 0, 0] } });
  const result = runFilter("brarchive", { cwd: root, env: { ROOT_DIR: root } });
  assert.notEqual(result.status, 0);
  assert.match(result.output, /pack_optimization_version/);
});

test("archives one folder, minifies JSON, removes the originals and keeps pack-root files loose", (t) => {
  const { root, bp } = setup({
    "entities/b.json": '{\n  // comment\n  "a": [1, 2,],\n  "b": "x y"\n}\n',
    "entities/a.json": "{}",
    "scripts/main.js": "export {};",
    "texts/en_US.lang": "k=v"
  });
  t.after(() => removeDir(root));
  writeFile(bp, "pack_icon.png", "png");
  const result = runFilter("brarchive", { cwd: root, env: { ROOT_DIR: root } });
  assert.equal(result.status, 0, result.output);

  const entities = readArchive(join(bp, "__brarchive", "entities.brarchive"));
  assert.deepEqual(entities.map((e) => e.name), ["a.json", "b.json"]);
  assert.equal(entities[1].content.toString("utf8"), '{"a":[1,2],"b":"x y"}');
  assert.equal(existsSync(join(bp, "entities")), false, "emptied folder is removed");

  const scripts = readArchive(join(bp, "__brarchive", "scripts.brarchive"));
  assert.equal(scripts[0].content.toString("utf8"), "export {};");

  const texts = readArchive(join(bp, "__brarchive", "texts.brarchive"));
  assert.equal(texts[0].name, "en_US.lang");
  assert.equal(texts[0].length, 0, ".lang is a name-only stub");
  assert.equal(readFileSync(join(bp, "texts", "en_US.lang"), "utf8"), "k=v", ".lang stays loose");

  assert.equal(existsSync(join(bp, "manifest.json")), true);
  assert.equal(existsSync(join(bp, "pack_icon.png")), true);
});

test("nested folders get their own archive plus an empty parent archive", (t) => {
  const { root, bp } = setup({ "a/b/c.json": "{}" });
  t.after(() => removeDir(root));
  const result = runFilter("brarchive", { cwd: root, env: { ROOT_DIR: root } });
  assert.equal(result.status, 0, result.output);
  assert.equal(readArchive(join(bp, "__brarchive", "a", "b.brarchive")).length, 1);
  assert.equal(readArchive(join(bp, "__brarchive", "a.brarchive")).length, 0);
});

test("settings: excluded folders stay untouched and minify can be turned off", (t) => {
  const { root, bp } = setup({ "keep/x.json": '{ "a": 1 }', "pack/y.json": '{ "a": 1 }' });
  t.after(() => removeDir(root));
  const result = runFilter("brarchive", { cwd: root, env: { ROOT_DIR: root }, settings: { excluded: ["keep"], minify: false } });
  assert.equal(result.status, 0, result.output);
  assert.equal(readFileSync(join(bp, "keep", "x.json"), "utf8"), '{ "a": 1 }');
  assert.equal(readArchive(join(bp, "__brarchive", "pack.brarchive"))[0].content.toString("utf8"), '{ "a": 1 }');
});

test("JSON that cannot be minified is stored unchanged with a warning", (t) => {
  const { root, bp } = setup({ "data/bad.json": "{ not json" });
  t.after(() => removeDir(root));
  const result = runFilter("brarchive", { cwd: root, env: { ROOT_DIR: root } });
  assert.equal(result.status, 0, result.output);
  assert.match(result.output, /could not minify/);
  assert.equal(readArchive(join(bp, "__brarchive", "data.brarchive"))[0].content.toString("utf8"), "{ not json");
});

test("entry names: 247 bytes are accepted, 248 bytes fail", (t) => {
  const ok = setup({ [`data/${"a".repeat(247)}`]: "x" });
  const tooLong = setup({ [`data/${"a".repeat(248)}`]: "x" });
  t.after(() => { removeDir(ok.root); removeDir(tooLong.root); });
  assert.equal(runFilter("brarchive", { cwd: ok.root, env: { ROOT_DIR: ok.root } }).status, 0);
  const result = runFilter("brarchive", { cwd: tooLong.root, env: { ROOT_DIR: tooLong.root } });
  assert.notEqual(result.status, 0);
  assert.match(result.output, /too long/);
});

test("the same input gives byte-identical archives", (t) => {
  const files = { "entities/a.json": '{ "a": 1 }', "entities/b.json": "{}", "scripts/main.js": "x" };
  const one = setup(files);
  const two = setup(files);
  t.after(() => { removeDir(one.root); removeDir(two.root); });
  runFilter("brarchive", { cwd: one.root, env: { ROOT_DIR: one.root } });
  runFilter("brarchive", { cwd: two.root, env: { ROOT_DIR: two.root } });
  for (const name of readdirSync(join(one.bp, "__brarchive"))) {
    assert.ok(readFileSync(join(one.bp, "__brarchive", name)).equals(readFileSync(join(two.bp, "__brarchive", name))), name);
  }
});
