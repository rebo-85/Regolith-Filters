import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const packages = [
  "brarchive",
  "packager",
  "obfuscate_pack"
];

for (const name of packages) {
  const packagePath = join(root, name, "package.json");
  const filterPath = join(root, name, "filter.json");
  const pkg = JSON.parse(readFileSync(packagePath, "utf8"));
  const filter = JSON.parse(readFileSync(filterPath, "utf8"));
  filter.version = pkg.version;
  writeFileSync(filterPath, `${JSON.stringify(filter, null, 2)}\n`);
  console.log(`${name}: ${pkg.version}`);
}
