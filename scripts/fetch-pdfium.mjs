#!/usr/bin/env node
// Fetches the pre-built Pdfium dynamic library (DR-50c) into
// src-tauri/binaries/ so the cover renderer can bind it at runtime.
// Usage: node scripts/fetch-pdfium.mjs [--force]
// Prerequisite for building/running the app; documented in README.
import { mkdirSync, existsSync, readFileSync, copyFileSync, rmSync, readdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const targetDir = join(root, "src-tauri", "binaries");

const platforms = {
  "win32:x64": { asset: "pdfium-win-x64.tgz", lib: "pdfium.dll" },
  "win32:arm64": { asset: "pdfium-win-arm64.tgz", lib: "pdfium.dll" },
  "linux:x64": { asset: "pdfium-linux-x64.tgz", lib: "libpdfium.so" },
  "linux:arm64": { asset: "pdfium-linux-arm64.tgz", lib: "libpdfium.so" },
  "darwin:x64": { asset: "pdfium-mac-x64.tgz", lib: "libpdfium.dylib" },
  "darwin:arm64": { asset: "pdfium-mac-arm64.tgz", lib: "libpdfium.dylib" },
};

const platform = platforms[`${process.platform}:${process.arch}`];
if (!platform) {
  console.error(`no pre-built Pdfium mapping for ${process.platform}:${process.arch}`);
  process.exit(1);
}
const target = join(targetDir, platform.lib);

if (existsSync(target) && !process.argv.includes("--force")) {
  console.log(`${platform.lib} already present: ${target}`);
  process.exit(0);
}

const release = await (
  await fetch("https://api.github.com/repos/bblanchon/pdfium-binaries/releases/latest", {
    headers: { accept: "application/vnd.github+json" },
  })
).json();
const asset = release.assets.find((a) => a.name === platform.asset);
if (!asset) {
  console.error(`${platform.asset} not found in release ${release.tag_name}`);
  process.exit(1);
}

console.log(`fetching ${asset.name} from release ${release.tag_name} …`);
const bytes = Buffer.from(await (await fetch(asset.browser_download_url)).arrayBuffer());

const work = join(targetDir, ".fetch-tmp");
rmSync(work, { recursive: true, force: true });
mkdirSync(work, { recursive: true });
const archive = join(work, "pdfium.tgz");
writeFileSync(archive, bytes);
execFileSync("tar", ["-xzf", archive, "-C", work]); // bsdtar / GNU tar handle .tgz

const findFile = (dir, name) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      const found = findFile(path, name);
      if (found) return found;
    } else if (entry.name === name) {
      return path;
    }
  }
  return null;
};

const found = findFile(work, platform.lib);
if (!found) {
  console.error(`${platform.lib} not found inside the extracted archive`);
  process.exit(1);
}
copyFileSync(found, target);
rmSync(work, { recursive: true, force: true });
console.log(`installed ${target} (${readFileSync(target).byteLength} bytes, release ${release.tag_name})`);
