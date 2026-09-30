import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function git(args, options = {}) {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    ...options
  }).trim();
}

function readJson(path) {
  return JSON.parse(readFileSync(join(root, path), "utf8"));
}

function block(message) {
  console.error(`Release blocked: ${message}`);
  process.exit(1);
}

try {
  if (git(["status", "--porcelain", "--untracked-files=all"])) block("the working tree is not clean. Commit and push the version changes first.");

  git(["fetch", "--tags", "origin", "+refs/heads/main:refs/remotes/origin/main"]);

  const head = git(["rev-parse", "HEAD"]);
  const remoteHead = git(["rev-parse", "refs/remotes/origin/main"]);
  if (head !== remoteHead) block("this checkout is not exactly at origin/main. Pull or sync main, then retry.");

  for (const directory of ["bump_manifest", "brarchive", "obfuscate_pack", "packager"]) {
    const pkg = readJson(`${directory}/package.json`);
    const filter = readJson(`${directory}/filter.json`);
    if (filter.version !== pkg.version)
      block(`${directory}/filter.json is ${filter.version}, but package.json is ${pkg.version}. Run the version task and commit its changes.`);

    const tag = `${pkg.name}@${pkg.version}`;
    if (!git(["tag", "--list", tag])) continue;

    let taggedPackage;
    try {
      taggedPackage = JSON.parse(git(["show", `${tag}:${directory}/package.json`]));
    } catch {
      block(`tag ${tag} exists but its package metadata cannot be read.`);
    }
    if (taggedPackage.version !== pkg.version)
      block(`tag ${tag} contains version ${taggedPackage.version}. Do not reuse it; release the corrected contents under a new version.`);
  }

  console.log(`Release preflight passed for ${head}.`);
} catch (error) {
  console.error(`Release preflight failed: ${error.message}`);
  process.exit(1);
}
