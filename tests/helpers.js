import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export function makeTempDir(prefix = "filters-test-") {
  return mkdtempSync(join(tmpdir(), prefix));
}

export function removeDir(dir) {
  rmSync(dir, { recursive: true, force: true });
}

export function writeFile(root, relPath, content) {
  const file = join(root, relPath);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
  return file;
}

export function writeJson(root, relPath, value) {
  return writeFile(root, relPath, JSON.stringify(value, null, 2));
}

// Runs a filter's src/main.js as Regolith does: a child process with a working directory,
// optionally ROOT_DIR, and the filter settings as one JSON argument.
export function runFilter(filter, { cwd, env = {}, settings } = {}) {
  const script = join(repoRoot, filter, "src", "main.js");
  const childEnv = { ...process.env, ...env };
  if (!("BUMP_MANIFEST_VERSION_BUMP" in env)) delete childEnv.BUMP_MANIFEST_VERSION_BUMP;
  const args = [script];
  if (settings !== undefined) args.push(JSON.stringify(settings));
  const result = spawnSync(process.execPath, args, { cwd, env: childEnv, encoding: "utf8" });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr, output: `${result.stdout}${result.stderr}` };
}
