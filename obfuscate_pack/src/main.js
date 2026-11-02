import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { createPacker } from "./packer.js";
import { createPathMapper } from "./path-utils.js";
import { createSymbols } from "./symbols.js";
import { setUnicodeEnabled } from "./transformer.js";
import { MAP_FORMAT } from "./constants.js";

const root = process.env.ROOT_DIR;
if (!root) throw new Error("ROOT_DIR environment variable is required");

const args = process.argv[2] ? JSON.parse(process.argv[2]) : {};
setUnicodeEnabled(args.unicode !== false);

function globToRegExp(pattern) {
  const normalized = pattern.replace(/\\/g, "/");
  let expression = "^";
  for (let index = 0; index < normalized.length; index++) {
    const character = normalized[index];
    if (character === "*" && normalized[index + 1] === "*") {
      index++;
      if (normalized[index + 1] === "/") {
        expression += "(?:.*/)?";
        index++;
      } else {
        expression += ".*";
      }
    } else if (character === "*") {
      expression += "[^/]*";
    } else if (character === "?") {
      expression += "[^/]";
    } else {
      expression += character.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }
  }
  return new RegExp(`${expression}$`);
}

function createScriptObfuscation(settings) {
  if (settings === undefined) return null;
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
    throw new TypeError("scripts must be an object with include and config settings");
  }
  if (!Array.isArray(settings.include) || settings.include.length === 0 || settings.include.some((pattern) => typeof pattern !== "string" || !pattern.trim())) {
    throw new TypeError("scripts.include must be a non-empty array of glob patterns");
  }
  if (typeof settings.config !== "string" || !settings.config.trim()) {
    throw new TypeError("scripts.config must be a path to a JavaScript obfuscator config JSON file");
  }
  if (typeof settings.requirements !== "string" || !settings.requirements.trim()) {
    throw new TypeError("scripts.requirements must point to a directory with javascript-obfuscator installed");
  }

  const configPath = path.resolve(root, settings.config);
  const requirementsPath = path.resolve(root, settings.requirements);
  const options = JSON.parse(fs.readFileSync(configPath, "utf8"));
  if (!options || typeof options !== "object" || Array.isArray(options)) {
    throw new TypeError(`JavaScript obfuscator config must contain a JSON object: ${configPath}`);
  }
  const requireFromRequirements = createRequire(path.join(requirementsPath, "package.json"));
  let JavaScriptObfuscator;
  try {
    JavaScriptObfuscator = requireFromRequirements("javascript-obfuscator");
  } catch (error) {
    throw new Error(`Could not load javascript-obfuscator from ${requirementsPath}. Install it in that package directory.`, { cause: error });
  }
  const include = settings.include.map(globToRegExp);
  return {
    matches: (packPath) => include.some((pattern) => pattern.test(packPath.replace(/\\/g, "/"))),
    obfuscate: (source) => JavaScriptObfuscator.obfuscate(source, options).getObfuscatedCode()
  };
}

const scriptObfuscation = createScriptObfuscation(args.scripts);
const mapDir = path.resolve(root, args.mapDir ?? "packs/data/obfuscate_pack");
const mapFileName = args.mapFile ?? (args.profile ? `${args.profile}.map.json` : "map.json");
const mapFile = path.join(mapDir, mapFileName);

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
const paths = createPathMapper({
  flattenFolders: args.flattenFolders !== false,
  obfuscateFileNames: args.obfuscateFileNames !== false
});
const flattened = createPacker({ root, args, map, symbols, paths, mapFile, scriptObfuscation }).run();

if (flattened) console.log("Folders flattened, but client might need a restart for all changes to take effect.");
