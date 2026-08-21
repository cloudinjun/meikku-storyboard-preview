# Meikku UI Art v2 — World-Building Layer

This package extends `ui_art_v1`; it does not replace the functional icon, wallpaper, empty-state, loader, cursor, avatar, or app-icon assets already defined there.

## Why v2 exists

The v1 pack solved asset coverage but still presented most art inside rectangular specimens. Nintendo's official promotional pages show a different discipline: a page first establishes a world, scale relationship, or directional force, then places navigation and functional content against it. The supplied Animal Island UI repository reinforces the production lesson that scene edges, dividers, item families, cursors, footer art, textures, and fonts must be reusable assets rather than page-specific decoration.

Meikku translates those lessons into its own subject: a person, the verified SO-101, and clay meeting at one shared table. No Nintendo or Animal Island artwork is copied or redistributed.

## The ten-site study (2026-08-17)

Ten Nintendo-IP promotional surfaces were audited at the DOM level (image inventories and CSS background inventories), extending the original five-page composition study:

| # | Site | Reusable-asset lesson observed |
|---|------|-------------------------------|
| 01 | Super Mario Bros. Wonder | Layered hero (`hero-header-layer-1/2/3`), item family (`elephant-fruit`, `wonder-coin`, `badge-*`), a world-object divider (`rainbow-divider.svg`), four corner frames, `footer-decoration` |
| 02 | Animal Crossing: New Horizons | Material tiles (`pattern-dots`, `pattern-wood-grain`), scalloped `birthday-confetti-divider.svg`, `footer-illustration.svg` scene, `bubble-border.svg` speech frame, greenery edge props |
| 03 | Splatoon (Raiders) | Two-layer ambient patterns (`pattern-1-beige-layer-one/two`), scatter families (`sea-icon-2/3/4-a/b/c`), gadget item family, marquee sticker strips |
| 04 | Pikmin | Leaf/clover scatter props, five reusable edge `strip-*` assets, a pose × growth-stage character matrix (`lay/sit/fall × leaf/bud/flower`), paired `daisy-left/right` flanks, a character sitting on a button |
| 05 | Kirby | Signature motif as tile (`bg_starpattern-white.png`), splat blobs behind sections, action-pose sticker set |
| 06 | Mario Kart 8 Deluxe | Checkerboard and `tiretrack` tiles, oversized character backgrounds, uniform course-card grid |
| 07 | Metroid | Restrained dark system: one `char` + separate `char-shadow` layer, one `background-element`, vignette field |
| 08 | Pokémon Scarlet / Violet | `corner-top/bottom.svg` ornaments, `flourish`, `star-emblem.svg`, angled `divider-slice`, grey tile, starter sticker family |
| 09 | nintendo.com store (Zelda / Fire Emblem) | One franchise-character icon family reused as global navigation across every product page |
| 10 | Zelda: Tears of the Kingdom (JP) | Fully sliced asset naming (`bg_*`, `title_*`, `btn_*`, `ic_*`): every visual is a file, no baked screens |

Distilled rules Meikku adopts:

1. **One signature motif becomes a tile.** Kirby's star, MK8's checkerboard, ACNH's dots → Meikku's coil, thumbprint, hatch, and ray tiles.
2. **The world has an object family.** Power-ups, gadgets, and items are drawn once, in one style, and reused everywhere → the 25-piece Meikku world-object library.
3. **Dividers are world objects, not rules.** Rainbow, confetti, slice → coil wave, tool row, turn blocks, clay scallop.
4. **The footer is a scene.** `footer-illustration`, `footer-decoration` → `scene-footer-shared-table`, where a hand and the SO-101 gripper converge on one vessel.
5. **Edges get punctuation.** Greenery, daisies, strips, corner frames → paired tool flanks, shelf strip, corner brackets, corner flag.
6. **Speech is a first-class asset.** ACNH ships a bubble border → Meikku ships a conversation bubble family (spoken + dashed proposal).
7. **Everything is a sliced, named, reusable file.** The JP discipline (`btn_*`, `bg_*`, `ic_*`) → every v2 asset is a standalone SVG with a manifest entry.
8. **Each world frames its media in its own material.** Splatoon's media borders are ink; Animal Crossing's are leaf and wood → Meikku's container borders are pressed clay, coil, torn zine paper, and a pigment stroke, while functional rectangles stay untouched.

## Contents

- `frame_breakers/` (4): clay orbit, proposal arc, shared-table ridge, tool swarm — the original composition layer.
- `objects/` (25): the world-object family — clay states, tools, station gear, ritual objects, memory objects.
- `frames/` (6): speech bubbles, dashed proposal bubble, taped notice, evidence frame with claim tab, corner brackets.
- `containers/` (8): world-material media frames — pressed clay, coil rope, torn zine paper, pigment stroke, token teeth, ray corners, workbench grid, taped corners. Splatoon frames media in ink; Meikku frames it in clay. Media windows only; controls and evidence stay rectangular. Rebuild deterministically with `python tools/build_meikku_ui_containers_v2.py`.
- `controls/` (14): toggle, checkbox, radio, slider, stepper, tabs, input, dropdown, tooltip, toast, pagination plates — the drawing law and mockup kit for interface controls; runtime surfaces implement native controls styled to match. State is geometry (solid vs outline, closed shadow, dashed), never color alone.
- `stamps/` (8): the five claim labels as rubber stamps, 1 TURN, KEPT, and the high-five seal.
- `banners/` (4): section plate, title ribbon, nav patch, corner flag.
- `buttons/` (4): plate art for default / hover / pressed / disabled.
- `dividers/` (4): coil wave, tool row, turn blocks, clay scallop.
- `patterns/` (4): coil lines, tool scatter, thumbprint, hatch zone — all seamless.
- `meters/` (2): turn meter and session coil — static art, never fake runtime data.
- `scene_edges/` (4): footer shared-table scene, shelf strip, paired left/right tool flanks.
- `previews/v2_contact_sheet.html`: browsable contact sheet for the whole layer.
- `meikku_nintendo_framebreak_design_dna.json`: complete Design DNA for the composition system.
- `manifest.json`: machine-readable paths, categories, and safety rules.

## Composition contract

Use at most one dominant scene, one crossing trajectory, and one background edge punctuation per viewport. Functional controls, claim labels, evidence captions, safety states, body copy, and cards remain hard-contained and readable. Art may cross a frame, but it must remain behind every information surface.

The layer contract is strict: decorative backgrounds, pseudo-elements, texture overlays, tape, stamps, or frame-breakers use the decorative layer (`0`); story content and cards use the information layer (`2`); functional labels and controls may use the control layer (`3`). Decorative assets never use information or control layer values, never attach to an information card in a way that can paint over its contents, and never depend on opacity alone to prevent competition.

Do not apply this v2 frame-breaking layer to the opening `#frame-01` hero or the closing `#after` / `#press-start` pair in `ui/meikku_world.html`. The opening keeps its original quiet composition. The closing pair uses contained cards, regular section padding, and its native repeated pattern; no oversized ridge, orbit, tool swarm, trajectory, rotation, or negative-margin title may cross their boundary. Use v2 decoration only in the middle narrative sections where the full asset silhouette remains visibly resolved.

Decorative layers stay quiet: ambient patterns and frame-breakers normally sit at `0.10–0.20` effective opacity or use `soft-light` blending. Foreground information—headings, body copy, controls, evidence, state labels, and the active human / robot / clay scene—keeps full contrast. Content is present immediately; do not add fade-in, parallax, path-draw, or scroll entrance effects.

Additional v2.1 rules:

- **Objects are punctuation, not wallpaper.** Use one to five objects per viewport at 48–160px; never repeat one object as an anonymous decorative pattern (that job belongs to the pattern tiles).
- **Stamps say only what is true.** A stamp is a claim label; never place `LIVE` art on a simulated surface. `stamp-one-turn` and `stamp-kept` follow the token and memory pages of the brand manual.
- **Bubbles carry conversation from either participant.** Left/right tails are layout choices, not human/robot assignments — no permanent pigment or side ownership.
- **Meters are art.** The filled states in `meters/` are illustrations for layout; runtime surfaces must bind real values before showing any meter.
- **Scene edges resolve.** The footer scene, shelf strip, and flanks must end inside the page with their silhouettes complete.

If Core: the scene may use the full person–SO-101–clay photographic world and richer depth cues, while decoration still remains behind information.

If Demo: keep the evidence window rectangular, use one lightweight frame-breaker around it, and retain visible `LIVE`, `SCRIPTED-LIVE`, `SIMULATED`, `RECORDED`, or `CORE` labels.
