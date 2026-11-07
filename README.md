# PomoBuddies

A floating, always-on-top pixel-art Pomodoro timer built with Electron. Twelve pixel buddies — cat, puppy, avocado, tomato, Ben, Four Arms, Harry, Hedwig, Pikachu, Captain America, Hulk, and Iron Man — keep you company while a belly countdown ticks toward the end of your focus block. When a session completes, it logs straight to your Obsidian vault.

## Features

- **Compact floating window** (280 × 340) — frameless, transparent, always-on-top, draggable by its character.
- **Belly countdown** — the character's circular belly fills as time elapses.
- **Buddy Arcade** — open the gear to expand the window (280 × 600) and:
  - pick a buddy from a live stage, previous/next arrows, or a scrolling character shelf (arrow-key navigable)
  - set a duration with a slider/stepper or quick presets
  - add a label for the session
  - Start / Pause / Reset, save status, and a Close-timer button
- **Obsidian logging** — completed sessions append to `Pomodoro/Log.md` in your vault.
- **State safety** — closing the timer mid-run pauses and preserves it; it reopens paused. Timer state is written atomically (temp file + `fsync` + rename), so a crash never corrupts it.
- **Duplicate-proof logs** — each session carries a unique ID; interrupted or failed saves are retained and retryable via the UI.
- **Respects your system** — `prefers-reduced-motion` is honored, and theme choice persists in `localStorage`.

## Quick start

```bash
cd D:\usr\pomodoro-hermes
npm install
npm start
```

## Configuration

Edit `config.json` and point `vaultPath` at an existing Obsidian vault:

```json
{
  "vaultPath": "G:\\My Drive\\Obsidian Sync"
}
```

The path is reread on every session save, so edits apply immediately.

## Logging behavior

- **Activity journal** — every started / paused / resumed / reset / completed event appends to `Pomodoro/<YYYY-MM-DD>.md` in your vault, one line per event with a local timestamp, label, and duration. Ideal for reviewing where your time went.
- Completed sessions also append to `Pomodoro/Log.md`.
- An empty label is logged as “Focus session.”
- Dates use your desktop's local timezone; completion timestamps are unambiguous ISO UTC values.
- Each event/session carries a unique ID — retrying a failed save never creates duplicates.
- Reset discards an *unfinished* session only; a completed session awaiting save is protected.

## Tests

```bash
# Unit tests — timer logic, validation, logging, dedupe
npm run test:pomodoro

# End-to-end — launches Electron and runs a real one-minute session
# against an isolated temporary vault, including restart checks
npm run test:pomodoro:e2e
```

Test runs use `POMODORO_CONFIG_PATH` and `POMODORO_DATA_DIR` so your real vault and timer state are never touched.

## Project structure

```
main.js              Electron main process: window, state persistence, IPC, logging
preload.js           Context-isolated bridge (no nodeIntegration)
index.html           UI markup
renderer.js          UI logic + Buddy Arcade
styles.css           Pixel-art theming
pomodoro-core.js     Framework-free timer logic + Obsidian log writer
config.json          Vault path setting
completion.wav       Session-complete sound
tests/               Unit + e2e suites
```

## Security

- `contextIsolation: true`, `sandbox: true`, no `nodeIntegration`.
- All IPC handlers validate the sender; window opens and navigation are denied.
- Window-resize and move IPC calls validate their payloads.

## License

[MIT](LICENSE) © 2026 lyricsofsongs96 — free to use, modify, and redistribute with attribution.
