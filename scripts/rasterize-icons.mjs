// Rasterize the HoopRadar logo SVGs to PNG at extension-icon sizes.
//
// - Primary: blue-moon gradient -> public/icons/icon-{16,32,48,128}.png
// - All colorways (blue moon, black, mint, white) -> docs/logo-samples/png/{name}-{size}.png
//
// Run: node scripts/rasterize-icons.mjs

import sharp from "sharp";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");

const SIZES = [16, 32, 48, 128];
const SAMPLES_DIR = join(repoRoot, "docs", "logo-samples");
const SAMPLES_PNG_DIR = join(SAMPLES_DIR, "png");
const ICONS_DIR = join(repoRoot, "public", "icons");

const COLORWAYS = [
  { name: "blue-moon", svg: "D-bluemoon-gradient.svg", primary: true },
  { name: "black", svg: "D-black-gradient.svg", primary: false },
  { name: "mint", svg: "D-mint-gradient.svg", primary: false },
  { name: "white", svg: "D-white.svg", primary: false },
];

async function rasterize(svgPath, outPath, size) {
  const svg = await readFile(svgPath);
  const buffer = await sharp(svg, { density: 384 })
    .resize(size, size, { kernel: "lanczos3" })
    .png({ compressionLevel: 9 })
    .toBuffer();
  await writeFile(outPath, buffer);
}

async function main() {
  await mkdir(SAMPLES_PNG_DIR, { recursive: true });
  await mkdir(ICONS_DIR, { recursive: true });

  for (const { name, svg, primary } of COLORWAYS) {
    const svgPath = join(SAMPLES_DIR, svg);
    for (const size of SIZES) {
      const samplePath = join(SAMPLES_PNG_DIR, `${name}-${size}.png`);
      await rasterize(svgPath, samplePath, size);
      console.log(`wrote ${samplePath}`);
    }
    if (primary) {
      for (const size of SIZES) {
        const iconPath = join(ICONS_DIR, `icon-${size}.png`);
        await rasterize(svgPath, iconPath, size);
        console.log(`wrote ${iconPath}`);
      }
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
