import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { makeTempDir, removeDir, runFilter, writeFile, writeJson } from "./helpers.js";

const VERSION_PATH = "data/bump_manifest/version.json";
const manifest = { format_version: 2, header: { name: "T", version: [0, 0, 1] }, modules: [] };

function setup({ version = [1, 0, 0] } = {}) {
  const dir = makeTempDir();
  if (version) writeJson(dir, VERSION_PATH, { version });
  return dir;
}

test("a manifest that cannot be parsed fails the filter and names the file", (t) => {
  const dir = setup();
  t.after(() => removeDir(dir));
  writeJson(dir, "RP/manifest.json", manifest);
  writeFile(dir, "BP/manifest.json", "{ not json");
  const result = runFilter("bump_manifest", { cwd: dir });
  assert.notEqual(result.status, 0);
  assert.match(result.output, /BP\/manifest\.json/);
});

test("a manifest that cannot be read fails the filter", (t) => {
  const dir = setup();
  t.after(() => removeDir(dir));
  mkdirSync(join(dir, "BP", "manifest.json"), { recursive: true }); // a folder where the file should be
  const result = runFilter("bump_manifest", { cwd: dir });
  assert.notEqual(result.status, 0);
  assert.match(result.output, /BP\/manifest\.json/);
});

test("on failure nothing is written: not the good manifest, not version.json", (t) => {
  const dir = setup({ version: [1, 2, 3] });
  t.after(() => removeDir(dir));
  writeJson(dir, "RP/manifest.json", manifest);
  writeFile(dir, "BP/manifest.json", "{ not json");
  const before = readFileSync(join(dir, "RP/manifest.json"), "utf8");
  assert.notEqual(runFilter("bump_manifest", { cwd: dir }).status, 0);
  assert.equal(readFileSync(join(dir, "RP/manifest.json"), "utf8"), before);
  assert.deepEqual(JSON.parse(readFileSync(join(dir, VERSION_PATH), "utf8")).version, [1, 2, 3]);
});

test("on a first run that fails, version.json is not created", (t) => {
  const dir = setup({ version: null });
  t.after(() => removeDir(dir));
  writeFile(dir, "RP/manifest.json", "{ not json");
  assert.notEqual(runFilter("bump_manifest", { cwd: dir }).status, 0);
  assert.equal(existsSync(join(dir, VERSION_PATH)), false);
});

test("every broken manifest is reported, not only the first", (t) => {
  const dir = setup();
  t.after(() => removeDir(dir));
  writeFile(dir, "RP/manifest.json", "{ not json");
  writeFile(dir, "BP/manifest.json", "[1,");
  const result = runFilter("bump_manifest", { cwd: dir });
  assert.notEqual(result.status, 0);
  assert.match(result.output, /RP\/manifest\.json/);
  assert.match(result.output, /BP\/manifest\.json/);
});

test("manifests with comments and a BOM are accepted", (t) => {
  const dir = setup();
  t.after(() => removeDir(dir));
  writeFile(
    dir,
    "BP/manifest.json",
    '\uFEFF{\n  // pack manifest\n  "format_version": 2,\n  /* header */\n  "header": { "name": "has // inside", "version": [0, 0, 1] },\n  "modules": []\n}\n'
  );
  const result = runFilter("bump_manifest", { cwd: dir });
  assert.equal(result.status, 0, result.output);
  const written = JSON.parse(readFileSync(join(dir, "BP/manifest.json"), "utf8"));
  assert.deepEqual(written.header.version, [1, 0, 1]);
  assert.equal(written.header.name, "has // inside");
});

test("a project with only one pack still works", (t) => {
  const dir = setup();
  t.after(() => removeDir(dir));
  writeJson(dir, "BP/manifest.json", manifest);
  const result = runFilter("bump_manifest", { cwd: dir });
  assert.equal(result.status, 0, result.output);
  assert.deepEqual(JSON.parse(readFileSync(join(dir, VERSION_PATH), "utf8")).version, [1, 0, 1]);
});

test("version.json keeps its format: 4-space indent, no trailing newline on the first run, one on later runs", (t) => {
  const dir = setup({ version: null });
  t.after(() => removeDir(dir));
  writeJson(dir, "BP/manifest.json", manifest);
  assert.equal(runFilter("bump_manifest", { cwd: dir }).status, 0);
  assert.equal(readFileSync(join(dir, VERSION_PATH), "utf8"), '{\n    "version": [\n        1,\n        0,\n        0\n    ]\n}');
  assert.equal(runFilter("bump_manifest", { cwd: dir }).status, 0);
  assert.equal(readFileSync(join(dir, VERSION_PATH), "utf8"), '{\n    "version": [\n        1,\n        0,\n        1\n    ]\n}\n');
});
