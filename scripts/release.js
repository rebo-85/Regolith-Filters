import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const type = process.argv[2]?.trim().toLowerCase();
const allowed = ["patch", "minor", "major"];
const files = ["brarchive/filter.json", "obfuscate_pack/filter.json"];

if (!allowed.includes(type)) {
  console.error(`Invalid or missing release type. Use: ${allowed.join(", ")}`);
  process.exit(1);
}

function bump(ver) {
  const nums = ver.split(".").map(Number);
  const idx = { major: 0, minor: 1, patch: 2 }[type];
  nums[idx]++;
  for (let i = idx + 1; i < nums.length; i++) nums[i] = 0;
  return nums.join(".");
}

try {
  execFileSync("git", ["push", "--dry-run", "origin", "main", "--tags"], {
    cwd: root,
    stdio: "inherit"
  });

  const data = files.map((file) => ({
    file,
    path: join(root, file),
    cfg: JSON.parse(readFileSync(join(root, file), "utf8"))
  }));
  const versions = new Set(data.map(({ cfg }) => cfg.version));

  if (versions.size !== 1) throw new Error("Filter versions do not match.");

  const ver = bump(data[0].cfg.version);
  for (const { path, cfg } of data) {
    cfg.version = ver;
    writeFileSync(path, `${JSON.stringify(cfg, null, 2)}\n`);
  }

  execFileSync("git", ["add", ...files], { cwd: root, stdio: "inherit" });
  execFileSync("git", ["commit", "-m", `Release v${ver}`], { cwd: root, stdio: "inherit" });
  execFileSync("git", ["tag", `v${ver}`], { cwd: root, stdio: "inherit" });
  execFileSync("git", ["push", "origin", "main", "--tags"], { cwd: root, stdio: "inherit" });

  console.log(`Released v${ver}.`);
} catch (err) {
  console.error(`Release failed: ${err.message}`);
  process.exit(1);
}
