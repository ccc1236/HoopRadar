// Package dist/ into the release zip uploaded to GitHub Releases.
//
// The zip filename carries the version (hoopradar-v0.2.1.zip) but the folder
// INSIDE it deliberately does not: it is always "hoopradar".
//
// Chrome derives an unpacked extension's ID from the absolute path of its
// folder. A version-stamped inner folder means every release unzips to a new
// path, which Chrome treats as a different extension: the old copy stays
// loaded alongside the new one, and the new one starts with empty storage,
// silently discarding the user's settings and cached Yahoo-to-NBA mapping.
// A stable folder name lets users unzip over the same location and keep both.
//
// Run: npm run package  (builds first, then packages)

import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");

const DIST_DIR = join(repoRoot, "dist");
const STAGING_DIR = join(repoRoot, ".package");
const PAYLOAD_NAME = "hoopradar";

if (!existsSync(DIST_DIR)) {
  console.error("dist/ not found. Run `npm run build` first.");
  process.exit(1);
}

const { version } = JSON.parse(readFileSync(join(repoRoot, "manifest.json"), "utf8"));
const zipPath = join(repoRoot, `hoopradar-v${version}.zip`);
const payloadDir = join(STAGING_DIR, PAYLOAD_NAME);

rmSync(STAGING_DIR, { recursive: true, force: true });
mkdirSync(payloadDir, { recursive: true });
cpSync(DIST_DIR, payloadDir, { recursive: true });
rmSync(zipPath, { force: true });

// No zip support in the Node stdlib, and the project has no runtime deps we
// want to grow, so shell out to whatever the platform already provides.
if (process.platform === "win32") {
  execFileSync(
    "powershell",
    [
      "-NoProfile",
      "-Command",
      `Compress-Archive -Path '${payloadDir}' -DestinationPath '${zipPath}'`,
    ],
    { stdio: "inherit" },
  );
} else {
  execFileSync("zip", ["-r", "-q", zipPath, PAYLOAD_NAME], {
    cwd: STAGING_DIR,
    stdio: "inherit",
  });
}

rmSync(STAGING_DIR, { recursive: true, force: true });

console.log(`packaged hoopradar-v${version}.zip (inner folder: ${PAYLOAD_NAME}/)`);
