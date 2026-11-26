import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { makeTempDir, removeDir, runFilter, writeFile, writeJson } from "./helpers.js";

const TMP = ".regolith/tmp";
const MAP_FORMAT = "letters6-v5"; // MAP_FORMAT in obfuscate_pack/src/constants.js; a change must be deliberate
const BASE = { unicode: false, strict: true };

function readTree(dir, base = dir, out = {}) {
  for (const name of readdirSync(dir).sort()) {
    const file = join(dir, name);
    if (statSync(file).isDirectory()) readTree(file, base, out);
    else out[file.slice(base.length + 1).replace(/\\/g, "/")] = readFileSync(file, "utf8");
  }
  return out;
}

// A small pack with one custom entity: server definition, client definition, geometry with reserved bones,
// a script that mentions the entity id and a language file.
function setup({ extraEntityComponents = {}, map } = {}) {
  const root = makeTempDir("obfuscate-");
  const manifest = (uuid) => ({ format_version: 2, header: { name: "T", uuid, version: [1, 0, 0] }, modules: [] });
  writeJson(root, `${TMP}/BP/manifest.json`, manifest("00000000-0000-0000-0000-000000000001"));
  writeJson(root, `${TMP}/RP/manifest.json`, manifest("00000000-0000-0000-0000-000000000002"));
  writeJson(root, `${TMP}/BP/entities/thing.json`, {
    format_version: "1.20.0",
    "minecraft:entity": {
      description: { identifier: "demo:thing", is_spawnable: true },
      components: { "demo:custom_comp": {}, "minecraft:health": { value: 5 }, ...extraEntityComponents },
      events: { "demo:wake": {} }
    }
  });
  writeJson(root, `${TMP}/RP/entity/thing.entity.json`, {
    format_version: "1.10.0",
    "minecraft:client_entity": { description: { identifier: "demo:thing", geometry: { default: "geometry.demo_thing" } } }
  });
  writeJson(root, `${TMP}/RP/models/entity/thing.geo.json`, {
    format_version: "1.12.0",
    "minecraft:geometry": [
      {
        description: { identifier: "geometry.demo_thing" },
        bones: [
          { name: "root" },
          { name: "rightItem", parent: "root" },
          { name: "leftItem", parent: "root" },
          { name: "rightArm", parent: "root" },
          { name: "leftArm", parent: "root" },
          { name: "my_special_bone", parent: "root" }
        ]
      }
    ]
  });
  writeFile(root, `${TMP}/BP/scripts/main.js`, 'const id = "demo:thing";\nconsole.log(id);\n');
  writeFile(root, `${TMP}/RP/texts/en_US.lang`, "entity.demo:thing.name=Thing\n");
  if (map) writeJson(root, "packs/data/obfuscate_pack/map.json", map);
  return root;
}

const run = (root, settings = BASE) => runFilter("obfuscate_pack", { cwd: root, env: { ROOT_DIR: root }, settings });
const readMap = (root, name = "map.json") => JSON.parse(readFileSync(join(root, "packs/data/obfuscate_pack", name), "utf8"));
const packs = (root) => readTree(join(root, TMP));

test("ROOT_DIR is required", () => {
  const result = runFilter("obfuscate_pack", { cwd: process.cwd() });
  assert.notEqual(result.status, 0);
  assert.match(result.output, /ROOT_DIR/);
});

test("renames an entity id consistently in pack JSON, scripts and language files", (t) => {
  const root = setup();
  t.after(() => removeDir(root));
  const result = run(root);
  assert.equal(result.status, 0, result.output);
  const map = readMap(root);
  const mapped = map.__symbols.refs["demo:thing"];
  assert.match(mapped, /^[a-z]{6}$/);

  const files = packs(root);
  const all = Object.values(files).join("\n");
  assert.equal(all.includes("demo:thing"), false, "the original id is gone everywhere");
  assert.equal(all.includes("custom_comp"), false, "custom component renamed");
  assert.ok(all.includes("minecraft:health"), "vanilla names are kept");
  const withId = Object.entries(files).filter(([, text]) => text.includes(`demo:${mapped}`)).map(([name]) => name);
  assert.equal(withId.length, 4, `id used by the server entity, client entity, script and lang file, got ${withId}`);
  assert.ok(withId.some((name) => name.endsWith("main.js")));
  assert.ok(withId.some((name) => name.endsWith(".lang")));
});

test("the map records its format and the file names it chose", (t) => {
  const root = setup();
  t.after(() => removeDir(root));
  assert.equal(run(root).status, 0);
  const map = readMap(root);
  assert.equal(map.__format, MAP_FORMAT);
  assert.match(map["bp/entities/thing.json"], /^[a-z]{6}\.json$/);
  assert.ok(existsSync(join(root, TMP, "BP/entities", map["bp/entities/thing.json"])));
});

test("bones that Bedrock looks up itself are never renamed, other bones are", (t) => {
  const root = setup();
  t.after(() => removeDir(root));
  assert.equal(run(root).status, 0);
  const geo = Object.entries(packs(root)).find(([name]) => name.startsWith("RP/models/entity/"))[1];
  for (const reserved of ["rightItem", "leftItem", "rightArm", "leftArm"]) assert.ok(geo.includes(`"${reserved}"`), reserved);
  assert.equal(geo.includes('"root"'), false);
  assert.equal(geo.includes("my_special_bone"), false);
  const bones = readMap(root).__symbols.bones;
  assert.deepEqual(Object.keys(bones).sort(), ["my_special_bone", "root"]);
});

test("the same input and an empty map give identical output and an identical map", (t) => {
  const one = setup();
  const two = setup();
  t.after(() => { removeDir(one); removeDir(two); });
  assert.equal(run(one).status, 0);
  assert.equal(run(two).status, 0);
  assert.deepEqual(packs(one), packs(two));
  assert.deepEqual(readMap(one), readMap(two));
});

test("building again from the map a build wrote gives the same output", (t) => {
  const first = setup();
  t.after(() => removeDir(first));
  assert.equal(run(first).status, 0);
  const map = readMap(first);
  const second = setup({ map });
  t.after(() => removeDir(second));
  assert.equal(run(second).status, 0);
  assert.deepEqual(packs(second), packs(first));
  assert.deepEqual(readMap(second), map);
});

test("a map in another format is reset, a map in the current format is kept", (t) => {
  const stale = setup({ map: { __format: "old-format", "bp/entities/thing.json": "zzzzzz.json" } });
  const current = setup({ map: { __format: MAP_FORMAT, "bp/entities/thing.json": "zzzzzz.json" } });
  t.after(() => { removeDir(stale); removeDir(current); });
  assert.equal(run(stale).status, 0);
  assert.equal(run(current).status, 0);
  assert.equal(existsSync(join(stale, TMP, "BP/entities/zzzzzz.json")), false, "old names are dropped");
  assert.equal(readMap(stale).__format, MAP_FORMAT);
  assert.ok(existsSync(join(current, TMP, "BP/entities/zzzzzz.json")), "current names are kept");
});

test("a profile writes its own map file and leaves map.json alone", (t) => {
  const root = setup();
  t.after(() => removeDir(root));
  assert.equal(run(root, { ...BASE, profile: "release" }).status, 0);
  assert.ok(existsSync(join(root, "packs/data/obfuscate_pack/release.map.json")));
  assert.equal(existsSync(join(root, "packs/data/obfuscate_pack/map.json")), false);
});

test("unicode false writes plain text, the default escapes it", (t) => {
  const plain = setup();
  const escaped = setup();
  t.after(() => { removeDir(plain); removeDir(escaped); });
  assert.equal(run(plain, { strict: true, unicode: false }).status, 0);
  assert.equal(run(escaped, { strict: true }).status, 0);
  const entity = (root) => Object.entries(packs(root)).find(([name]) => name.startsWith("BP/entities/"))[1];
  assert.equal(entity(plain).includes("\\u"), false);
  assert.ok(entity(escaped).includes("\\u"));
});

test("shuffleKeys is deterministic per seed, keeps the keys and leaves arrays alone", (t) => {
  const letters = Object.fromEntries("abcdefgh".split("").map((c) => [`demo:${c}`, {}]));
  const make = (seed) => {
    const root = setup({ extraEntityComponents: letters });
    t.after(() => removeDir(root));
    assert.equal(run(root, { ...BASE, shuffleKeys: true, shuffleSeed: seed }).status, 0, seed);
    return root;
  };
  const a1 = make("a");
  const a2 = make("a");
  const b = make("b");
  const plain = setup({ extraEntityComponents: letters });
  t.after(() => removeDir(plain));
  assert.equal(run(plain).status, 0);

  const entity = (root) => Object.entries(packs(root)).find(([name]) => name.startsWith("BP/entities/"))[1];
  assert.equal(entity(a1), entity(a2), "same seed, same order");
  assert.notEqual(entity(a1), entity(b), "another seed, another order");
  assert.notEqual(entity(a1), entity(plain), "shuffled differs from unshuffled");
  const keys = (text) => Object.keys(JSON.parse(text)["minecraft:entity"].components).sort();
  assert.deepEqual(keys(entity(a1)), keys(entity(plain)));

  const geo = (root) => JSON.parse(Object.entries(packs(root)).find(([name]) => name.startsWith("RP/models/entity/"))[1]);
  assert.deepEqual(geo(a1)["minecraft:geometry"][0].bones.map((bone) => bone.parent === undefined), [true, false, false, false, false, false]);
});

test("minify is on by default and can be turned off for the manifest", (t) => {
  const on = setup();
  const off = setup();
  t.after(() => { removeDir(on); removeDir(off); });
  assert.equal(run(on).status, 0);
  assert.equal(run(off, { ...BASE, minify: false }).status, 0);
  assert.equal(packs(on)["BP/manifest.json"].includes("\n"), false);
  assert.ok(packs(off)["BP/manifest.json"].includes("\n"));
});

test("invalid settings fail", (t) => {
  const root = setup();
  t.after(() => removeDir(root));
  for (const settings of [{ minify: "yes" }, { shuffleKeys: "yes" }, { shuffleSeed: 5 }, { scripts: {} }, { scripts: { include: [], config: "c.json" } }]) {
    assert.notEqual(run(root, { ...BASE, ...settings }).status, 0, JSON.stringify(settings));
  }
});

test("a JSON file that cannot be parsed fails the build", (t) => {
  const root = setup();
  t.after(() => removeDir(root));
  writeFile(root, `${TMP}/BP/entities/broken.json`, "{ not json");
  assert.notEqual(run(root).status, 0);
});
