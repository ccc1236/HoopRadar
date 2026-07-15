# HoopRadar logo

The HoopRadar mark is a top-down view of a 3-point arc with a ball at the apex, plus the hoop (donut ring) and backboard (line) at the bottom.

## Primary brand color

**Blue moon.** Deep blue with a subtle radial gradient `#4A6E84 -> #2D4A5B -> #1F3645`, brighter at top-center to suggest light from above.

This is what ships in the extension (`public/icons/icon-{16,32,48,128}.png`).

## Alternate colorways

Two other approved colorways for promotional / social / community use:

| Name | Source SVG | Gradient |
|---|---|---|
| Blue moon (primary) | `D-bluemoon-gradient.svg` | `#4A6E84 -> #1F3645` |
| Black | `D-black-gradient.svg` | `#2C2C33 -> #050507` |
| Mint | `D-mint-gradient.svg` | `#3CDED9 -> #08938F` |
| White | `D-white.svg` | flat white tile, black symbol |

PNG raster versions for all four colorways are in `png/` at sizes 16, 32, 48, 128.

## Regenerating

After editing any SVG:

```bash
npm run icons
```

Writes blue moon to `public/icons/`, and all three colorways to `docs/logo-samples/png/`. Uses [sharp](https://github.com/lovell/sharp) with `lanczos3` resampling.

## Flat color variants (no gradient)

For reference, also shipped in this folder:

| Name | Hex |
|---|---|
| Blue moon (flat) | `#2D4A5B` |
| Mint (flat) | `#0ABAB5` |
| Court hardwood | `#B07A3D` |
| Broadcast navy | `#1B3A6B` |
| Basketball orange | `#E85D04` |
| Electric blue | `#0EA5E9` |

Open `preview.html` in a browser to see all variants side by side.
