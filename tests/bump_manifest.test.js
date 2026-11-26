import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { makeTempDir, removeDir, runFilter, writeFile, writeJson } from "./helpers.js";

const VERSION_PATH = "data/bump_manifest/version.json";

function setup({ formatVersion = 2, version } = {}) {
  const dir = makeTempDir();
  const manifest = (type) => ({
    format_version: formatVersion,
    header: { name: "Test", uuid: "00000000-0000-0000-0000-000000000001", version: [0, 0, 1] },
    modules: [
      { type, uuid: "00000000-0000-0000-0000-000000000002", version: [0, 0, 1] },
      { type: "script", language: "javascript", uuid: "00000000-0000-0000-0000-000000000003", entry: "scripts/main.js", version: "1.0.0-beta" }
    ],
    dependencies: [
      { uuid: "00000000-0000-0000-0000-000000000004", version: [9, 9, 9] },
      { module_name: "@minecraft/server", version: "1.0.0" }
    ]
  });
  writeJson(dir, "RP/manifest.json", manifest("resources"));
  writeJson(dir, "BP/manifest.json", manifest("data"));
  if (version !== undefined) writeFile(dir, VERSION_PATH, typeof version === "string" ? version : JSON.stringify({ version }));
  return dir;
}

const read = (dir, rel) => JSON.parse(readFileSync(join(dir, rel), "utf8"));

test("first run creates version.json as 1.0.0 and does not bump", (t) => {
  const dir = setup();
  t.after(() => removeDir(dir));
  const result = runFilter("bump_manifest", { cwd: dir });
  assert.equal(result.status, 0, result.output);
  assert.deepEqual(read(dir, VERSION_PATH), { version: [1, 0, 0] });
  assert.deepEqual(read(dir, "RP/manifest.json").header.version, [1, 0, 0]);
});

test("patch is the default bump", (t) => {
  const dir = setup({ version: [1, 2, 3] });
  t.after(() => removeDir(dir));
  const result = runFilter("bump_manifest", { cwd: dir });
  assert.equal(result.status, 0, result.output);
  assert.deepEqual(read(dir, VERSION_PATH).version, [1, 2, 4]);
});

test("minor and major bumps reset the lower parts", (t) => {
  const dir = setup({ version: [1, 2, 3] });
  t.after(() => removeDir(dir));
  assert.equal(runFilter("bump_manifest", { cwd: dir, env: { BUMP_MANIFEST_VERSION_BUMP: "minor" } }).status, 0);
  assert.deepEqual(read(dir, VERSION_PATH).version, [1, 3, 0]);
  assert.equal(runFilter("bump_manifest", { cwd: dir, env: { BUMP_MANIFEST_VERSION_BUMP: "major" } }).status, 0);
  assert.deepEqual(read(dir, VERSION_PATH).version, [2, 0, 0]);
});

test("format_version below 3 writes arrays, 3 and above writes strings", (t) => {
  const old = setup({ formatVersion: 2, version: [1, 0, 0] });
  const modern = setup({ formatVersion: 3, version: [1, 0, 0] });
  t.after(() => { removeDir(old); removeDir(modern); });
  assert.equal(runFilter("bump_manifest", { cwd: old }).status, 0);
  assert.equal(runFilter("bump_manifest", { cwd: modern }).status, 0);
  assert.deepEqual(read(old, "BP/manifest.json").header.version, [1, 0, 1]);
  assert.equal(read(modern, "BP/manifest.json").header.version, "1.0.1");
});

test("updates header, resources/data modules and uuid dependencies only", (t) => {
  const dir = setup({ formatVersion: 3, version: [1, 0, 0] });
  t.after(() => removeDir(dir));
  assert.equal(runFilter("bump_manifest", { cwd: dir }).status, 0);
  const bp = read(dir, "BP/manifest.json");
  assert.equal(bp.header.version, "1.0.1");
  assert.equal(bp.modules[0].version, "1.0.1");
  assert.equal(bp.modules[1].version, "1.0.0-beta");
  assert.equal(bp.dependencies[0].version, "1.0.1");
  assert.equal(bp.dependencies[1].version, "1.0.0");
});

test("an invalid bump type fails and leaves version.json unchanged", (t) => {
  const dir = setup({ version: [1, 0, 0] });
  t.after(() => removeDir(dir));
  const result = runFilter("bump_manifest", { cwd: dir, env: { BUMP_MANIFEST_VERSION_BUMP: "huge" } });
  assert.notEqual(result.status, 0);
  assert.deepEqual(read(dir, VERSION_PATH).version, [1, 0, 0]);
});

test("a malformed version.json fails", (t) => {
  for (const version of [[1, 2], [1, -1, 0], [1, "x", 0]]) {
    const dir = setup({ version });
    t.after(() => removeDir(dir));
    const result = runFilter("bump_manifest", { cwd: dir });
    assert.notEqual(result.status, 0, JSON.stringify(version));
  }
});
