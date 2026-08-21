# D1 Product UI / UX Demonstration — Working Contract

## Purpose

This folder is the standalone D1 product demonstration. It has two jobs:

1. demonstrate the phone-chat product UI beside the shared material workspace;
2. demonstrate the intended UX sequence across recall, human correction, a changed proposal, material observation, memory replacement, and human choice.

It is not the marketing deck. The marketing narrative lives in:

`ui/meikku_storyboard_cybernetics_outline.html`

That deck loads this page lazily on its Product Experience slide.

## Default surface

- `index.html` carries `body.d1-demo-only`.
- The presentation controller selects only `.slide[data-d1-demo]`.
- The phone-chat + workspace replay is the only authored D1 presentation surface.
- Archived marketing-slide markup is excluded from navigation and hidden; do not treat it as current D1 content.
- The replay starts when the sole demo slide becomes active.
- `?startEvent=<event_id>` may prime earlier beats as static history and begin animation at a named event. Without that parameter, the standalone replay still starts from the beginning.
- Press `R` to reload and replay.

## Design DNA

- Use only Bungee + Space Grotesk.
- Paper / ink / clay remain dominant.
- Lime = robot proposal or shared active state.
- Amber = human turn or correction.
- Pink = uncertainty or supersession.
- Main containers stay square with hard black borders and block shadows.
- Keep the conversation and shared material workspace visible together.

## Evidence boundary

- `deck_evidence_data.js` is read-only canonical replay data.
- The surface is `SCRIPTED REPLAY / SIMULATED / NO HARDWARE`.
- It does not prove live sensing, physical clay change, or SO-101 execution.
- Public Demo language remains `talk between moves` unless a separate runtime-intervention gate passes.

## File roles

| File | Responsibility |
|---|---|
| `index.html` | Product chat + shared-workspace DOM; one active D1 demo slide |
| `styles.css` | Product UI styling and the fixed 1920×1080 host stage |
| `deck_evidence_page.js` | 14-beat replay and product interactions |
| `deck_evidence_data.js` | Read-only canonical replay data |
| `deck_presentation.js` | Fixed-stage scaling, activation event, and replay reload |

## QA

- The D1 surface must open directly without requiring the marketing deck.
- Chat, Memory, Control, clay morph, robot pose, and attention behaviors must remain available.
- No marketing story slide may become part of D1 navigation.
- Run JavaScript syntax checks, DOM duplicate-ID/nesting checks, design lint, and `git diff --check` after edits.
