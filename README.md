# Pomodoro Timer

Run `npm install`, then `npm start` from `D:\usr\pomodoro-hermes`:

```powershell
Set-Location D:\usr\pomodoro-hermes
npm start
```

For Hermes: "Launch my existing Pomodoro Timer by running npm start in
D:\usr\pomodoro-hermes. Open the gear, set my requested duration and label, and
press Start. Keep an already running session, or resume a paused one. Use the
existing Obsidian configuration and keep the floating window open."

The UI is a small, draggable,
always-on-top Electron clock with twelve pixel-art buddies: cat, puppy, avocado,
tomato, Ben, Four Arms, Harry, Hedwig, Pikachu, Captain America, Hulk, and Iron Man.
The compact 280 × 340 window shows only the character, its belly
countdown, and a small gear button. Drag the character to move it. Open the gear
for the Buddy Arcade: a live character stage, previous/next arrows, a scrolling
character shelf, a duration slider and stepper, quick presets, label,
Start/Pause/Reset, save status, and Close timer. Arrow keys navigate the focused
character shelf. The window expands to 280 × 600 while the arcade is open and
returns to its small size when closed. Reduced motion is respected.
Starting a timer closes the settings. The circular fill shows elapsed time.

Change `vaultPath` in `config.json` to an existing Obsidian vault. Completed sessions
append to `Pomodoro/Log.md`; the config is reread for each save. An empty label is
logged as “Focus session.” Dates use the desktop's local timezone and completion
timestamps are unambiguous ISO UTC values.

Closing a running timer pauses and preserves it. It reopens paused. Interrupted
or failed log saves are retained locally and can be retried; a session identifier
prevents duplicate entries. Reset discards an unfinished session, not a completed
session awaiting save. Theme selection persists in localStorage.

`npm run test:pomodoro` checks timer and logging behavior.
`npm run test:pomodoro:e2e` launches Electron and runs a real one-minute session
against an isolated temporary vault, including restart checks. Test runs use
`POMODORO_CONFIG_PATH` and `POMODORO_DATA_DIR` to leave the real vault and timer state untouched.
