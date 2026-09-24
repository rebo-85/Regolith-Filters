import fs from "node:fs";
import path from "node:path";
import { createPacker } from "./packer.js";
import { createPathMapper } from "./path-utils.js";
import { createSymbols } from "./symbols.js";
import { setUnicodeEnabled } from "./transformer.js";
import { MAP_FORMAT } from "./constants.js";

const root = process.env.ROOT_DIR;
if (!root) throw new Error("ROOT_DIR environment variable is required");

const args = process.argv[2] ? JSON.parse(process.argv[2]) : {};
setUnicodeEnabled(args.unicode === true);

const mapDir = path.resolve(root, args.mapDir ?? "packs/data/obfuscate_pack");
const mapFile = path.join(mapDir, "map.json");
let map;
try {
  map = JSON.parse(fs.readFileSync(mapFile, "utf8"));
} catch {
  map = {};
}
if (map.__format !== MAP_FORMAT) {
  for (const key of Object.keys(map)) if (!key.startsWith("__")) delete map[key];
  delete map.__paths;
  map.__format = MAP_FORMAT;
}

const symbols = createSymbols(map);
const paths = createPathMapper({ flattenFolders: args.flattenFolders === true });
const flattened = createPacker({ root, args, map, symbols, paths }).run();

if (flattened) console.log("Folders flattened, but client might need a restart for all changes to take effect.");
