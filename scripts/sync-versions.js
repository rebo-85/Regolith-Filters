import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const readmePath = join(root, "README.md");
const packages = ["brarchive", "packager", "obfuscate_pack"];
let readme = readFileSync(readmePath, "utf8");

for (const name of packages) {
  const packagePath = join(root, name, "package.json");
  const filterPath = join(root, name, "filter.json");
  const pkg = JSON.parse(readFileSync(packagePath, "utf8"));
  const filter = JSON.parse(readFileSync(filterPath, "utf8"));
  filter.version = pkg.version;
  writeFileSync(filterPath, `${JSON.stringify(filter, null, 2)}\n`);
  const filterPattern = new RegExp(`(  "${name}": \\{\\r?\\n    "url": "github\\.com/rebo-85/Regolith-Filters",\\r?\\n    "version": ")[^"]+(")`);
  readme = readme.replace(filterPattern, `$1${pkg.name}@${pkg.version}$2`);
  const descriptionPattern = new RegExp("^- `" + name + "`:.*$", "m");
  readme = readme.replace(descriptionPattern, `- \`${name}\`: ${filter.description}`);
  console.log(`${name}: ${pkg.version}`);
}

writeFileSync(readmePath, readme);
