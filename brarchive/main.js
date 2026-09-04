"use strict";
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const root = process.env.ROOT_DIR;
if (!root) throw new Error("ROOT_DIR environment variable is required");
const args = process.argv[2] ? JSON.parse(process.argv[2]) : {};
const tmpDir = path.join(root, ".regolith", "tmp");
const archiveDir = path.resolve(root, args.archiveDir ?? "build");

function findTool() {
  if (args.tool) return path.resolve(root, args.tool);
  for (const candidate of ["brarchive.exe", "brarchive", "br-ar.exe", "br-ar"]) {
    const local = path.join(root, candidate);
    if (fs.existsSync(local)) return local;
  }
  return "brarchive";
}

function archivePack(tool, pack, output) {
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.rmSync(output, { force: true });
  const result = spawnSync(tool, ["-rc", output, path.basename(pack)], {
    cwd: path.dirname(pack),
    stdio: "inherit",
    windowsHide: true
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`brarchive failed with exit code ${result.status}`);
}

const tool = findTool();
const packs = [
  ["BP", args.bpArchive ?? "BP.brarchive"],
  ["RP", args.rpArchive ?? "RP.brarchive"]
];
for (const [name, archive] of packs) {
  const pack = path.join(tmpDir, name);
  if (!fs.existsSync(pack)) continue;
  archivePack(tool, pack, path.join(archiveDir, archive));
  console.log(`[brarchive] Created ${path.relative(root, path.join(archiveDir, archive))}`);
}
