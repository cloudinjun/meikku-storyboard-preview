# Meikku UI Art Asset Pack v1

This folder is the reusable visual layer for Meikku interfaces. It follows the current palette, official high-five logo, Bungee wordmark, Space Grotesk body type, and SO-101 image anchor.

## What the reference project taught us

The Animal Island UI repository prepares more than components: it bundles functional icons, large item/icon families, cursors, dividers, scene/footer art, backgrounds, app-shell assets, and fonts. Meikku uses that asset-system idea without copying its copyrighted art or visual style. The reference repository is CC BY-NC 4.0; no source artwork is redistributed here.

## Package contents

- `icons/svg/`: 42 semantic icons using `currentColor`, drawn in one grammar — 5-unit primary stroke, 3-unit secondary detail, round caps, zero-radius rects, at most one small solid accent per icon, no filled silhouettes.
- `icons/png_64/` and `icons/png_128/`: Unity and bitmap fallbacks.
- `patterns/`: six seamless brand surfaces.
- `dividers/`: four horizontal visual separators.
- `empty_states/`: waiting, proposal, memory, and offline illustrations.
- `loaders/`: two restrained animated SVGs with reduced-motion fallbacks.
- `cursors/`: two optional web-only cursors; do not replace native cursors on critical controls.
- `app_icons/`: 16–1024px exports using the official logo.
- `avatars/`: four 512px role/object avatars.
- `wallpapers/desktop/`: 2560×1440 branded and clean variants.
- `wallpapers/mobile/`: 1440×3200 branded and clean variants.
- `manifest.json`: machine-readable paths, dimensions, variants, and consumer routing.
- `meikku_ui_art_design_dna.json`: structural, stylistic, and effects rules.

## Consumption rules

Web should prefer SVG. Unity should use PNG 64/128 and static PNG wallpaper. Mobile shells may use app icons, avatars, and vertical wallpaper. Exhibition displays should prefer clean vector-derived fields behind live content.

The four pigments never permanently mean human, robot, success, warning, or failure. Declare meanings locally and repeat them with a label, shape, or pattern.

If Core: `shared-table` wallpaper is product vision and must not be presented as live system evidence.

If Demo: use clean pattern wallpapers behind current evidence, preserve claim labels, and keep the material workspace primary.

## Rebuild

Run `python tools/build_meikku_ui_art_pack.py` from the repository root. The script only writes this asset folder plus `MEIKKU_UI_ART_CATALOG.html`.
