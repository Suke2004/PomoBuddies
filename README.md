# PomoBuddies

PomoBuddies is an Electron Pomodoro timer that floats above your desktop as a pixel-art avatar. Its compact view is frameless and transparent, with a countdown on the character. Sessions and timer activity save to a local folder; Obsidian vault logging is optional.

The source and current Windows installer are version **1.1.2**. The prepared macOS and Linux packages are still **1.1.1**.

## Features

- Fifteen avatars: Cat, Puppy, Avocado, Tomato, Ben, Four Arms, Harry, Hedwig, Pikachu, Captain America, Hulk, Iron Man, Luna Lovegood, Niklaus, and Caraxes.
- An always-on-top, draggable character in a 280 × 340 transparent window. Settings expand it to 280 × 600.
- A circular avatar dial opened through an original watch-style button, with hover previews, keyboard navigation, smoke, and swirling transition effects.
- Start, pause, resume, reset, a duration from 1 to 240 whole minutes, quick presets, and an optional session label of up to 200 characters.
- Start/resume and completion animations for every avatar, plus a completion chime and a desktop notification where supported.
- Persistent avatar and animation preferences, saved timer state, automatic local logging, and optional Obsidian logging.

| Avatars | Animation |
| --- | --- |
| Cat and Puppy | Playful movement and completion hearts |
| Avocado and Tomato | Swaying, wiggling, and completion hearts |
| Ben | Watch charge and a hero celebration |
| Four Arms and Hulk | Flexing and a completion stomp |
| Harry | Wand movement and magical sparks |
| Hedwig | Flight and flapping wings |
| Pikachu | Hopping and lightning |
| Captain America | Hero movement and a shield flourish |
| Iron Man | Lift-off and thrusters |
| Luna Lovegood | Wand movement, moonlight, and sparks |
| Niklaus | A curious turn, glowing eyes, and a shadowy exit with bats |
| Caraxes | Lift-off and wingbeats; fire, embers, and a warm countdown glow on completion |

## Install a desktop package

Find published downloads on the [Releases page](https://github.com/Suke2004/PomoBuddies/releases). Locally prepared packages can also be kept in the project directory and `dist/`; generated installers are ignored by Git.

| Platform | Prepared file | Version |
| --- | --- | --- |
| Windows x64 | `PomoBuddies-Setup-1.1.2.exe` | 1.1.2 |
| macOS Apple silicon | `PomoBuddies-1.1.1-mac-arm64.zip` | 1.1.1 |
| macOS Intel | `PomoBuddies-1.1.1-mac-x64.zip` | 1.1.1 |
| Linux x64, Debian/Ubuntu | `PomoBuddies-1.1.1-linux-amd64.deb` | 1.1.1 |
| Linux x64, other distributions | `PomoBuddies-1.1.1-linux-x86_64.AppImage` | 1.1.1 |

Desktop packages include Electron and do not require Node.js, npm, or Obsidian.

### Windows

Run `PomoBuddies-Setup-1.1.2.exe` and follow the setup wizard. The default installation is per user, under:

```text
%LOCALAPPDATA%\Programs\PomoBuddies
```

This normally resolves to `C:\Users\<your-user>\AppData\Local\Programs\PomoBuddies`. The wizard allows another installation directory and creates desktop and Start menu shortcuts.

The installer creates the default logging folder under `%APPDATA%\Pomodoro Timer\Logs`. Configuration and timer state live outside the installation directory and are reused during upgrades. Close the timer before upgrading, then launch it from its shortcut.

The installer is unsigned, so Windows may show a SmartScreen prompt.

### macOS

The prepared ZIPs target macOS 13 Ventura or newer. Use `arm64` for Apple silicon Macs and `x64` for Intel Macs. Extract the ZIP with Archive Utility and drag `PomoBuddies.app` into Applications.

These archives carry ad-hoc signatures and are not Apple notarized. If macOS blocks the first launch, use System Settings → Privacy & Security → Open Anyway for this app.

The existing 1.1.1 packages retain their system-controlled motion behavior. The 1.1.2 animation setting requires a new build. Native execution and rendering still need verification on a Mac.

### Linux

For Debian or Ubuntu, use APT to install the package and its desktop dependencies:

```bash
sudo apt install ./PomoBuddies-1.1.1-linux-amd64.deb
```

Launch PomoBuddies from the application menu. For other distributions, use the AppImage:

```bash
chmod +x PomoBuddies-1.1.1-linux-x86_64.AppImage
./PomoBuddies-1.1.1-linux-x86_64.AppImage
```

If FUSE is unavailable:

```bash
./PomoBuddies-1.1.1-linux-x86_64.AppImage --appimage-extract-and-run
```

The widget uses X11 or XWayland for window positioning and always-on-top behavior. Transparency requires a desktop compositor. Behavior can vary with the window manager.

The existing 1.1.1 packages retain their system-controlled motion behavior. The 1.1.2 animation setting requires a new build; native Linux rendering has not been verified for this Windows update.

## Use the timer

1. Drag the avatar to position it on your desktop.
2. Open the gear button to show settings.
3. Press the watch-style avatar button, hover to preview, then click an avatar or the center preview to select it.
4. Choose a duration and an optional label, then press Start. Settings close and the avatar reacts.
5. Open settings to pause, resume, reset, or close the timer.

In the avatar dial, arrow keys and the previous/next buttons cycle avatars. Home and End jump to the first and last avatar, Enter selects the focused button, and Escape closes the dial. Hovering previews an avatar without selecting it.

A completed session saves automatically. If the save fails, settings show the error and a Retry button. A completed session awaiting a successful save is protected from reset or replacement. Closing a running timer pauses and saves its state; reopening restores it paused.

### Animation settings and troubleshooting

Version 1.1.2 adds **Animations** in settings:

| Choice | Behavior |
| --- | --- |
| On, the default | Enables smoke, dial motion, and avatar effects even when the operating system requests reduced motion |
| Follow system | Uses the operating system's reduced-motion preference |
| Off | Disables animations and cancels active effects |

The choice persists across launches. The Windows animation issue occurred because the previous app followed `prefers-reduced-motion` unconditionally. Windows 1.1.2 defaults to On and also retains effects until their animations finish, so delayed repaints cannot remove them prematurely.

If effects are missing, confirm that the installed app is version 1.1.2 and set Animations to On. Choose an avatar to check smoke, then start a session to check its movement. Mac/Linux 1.1.1 packages do not include this new control.

## Data and logging

The data directory contains `config.json`, `session.json`, browser-stored preferences, and the default `Logs/` folder.

| Platform | Default data directory |
| --- | --- |
| Windows | `%APPDATA%\Pomodoro Timer` |
| macOS | `~/Library/Application Support/Pomodoro Timer` |
| Linux | `~/.config/Pomodoro Timer`, or `$XDG_CONFIG_HOME/Pomodoro Timer` |

Windows setup creates the default log folder during installation. The app creates its writable configuration and default folder on first launch when needed.

- `Log.md` is created after the first successful completion and records completed focus sessions.
- `YYYY-MM-DD.md` records started, paused, resumed, reset, and completed activity using the desktop's local date and time.
- Completion entries include the label, planned duration, start and completion timestamps, wall time, active focus time, paused time, pause/resume counts, and focus efficiency.
- Completion timestamps use ISO UTC values. An empty label is logged as “Focus session.”
- Session and event IDs allow repeated save attempts to avoid duplicate entries.

Timer state is saved through a temporary file, flushed, and renamed into place. If a saved state is unreadable, the app keeps a backup when possible and reports the problem. After an interrupted running session, it restores a paused timer.

### Configure a log destination

For an installed app, edit `config.json` in its data directory. For `npm start`, the configuration is the project's `config.json`.

The committed template uses the default local folder:

```json
{
  "logFolder": ""
}
```

To choose another local folder, use an absolute path. Missing local folders are created automatically:

```json
{
  "logFolder": "C:/Users/YourName/Documents/PomoBuddies Logs"
}
```

For an existing Obsidian vault:

```json
{
  "vaultPath": "C:/Users/YourName/Documents/Obsidian"
}
```

Obsidian entries are written under `Personal Tools/Pomodoro` inside that vault. `vaultPath` takes precedence when present and must point to an existing directory. Configuration is reread on each save.

Keep personal paths in the installed configuration or a separate file outside the repository. For development and isolated testing, `POMODORO_CONFIG_PATH` overrides the configuration file and `POMODORO_DATA_DIR` overrides the data directory.

## Run from source

Install a supported Node.js LTS release with npm, then:

```bash
git clone https://github.com/Suke2004/PomoBuddies.git
cd PomoBuddies
npm ci
npm start
```

In PowerShell, use `npm.cmd` if script execution policy prevents `npm.ps1` from running.

## Build desktop packages

Run `npm ci` before building. Use the matching operating system for each platform's native packaging tools.

| Host | Command | Output in `dist/` |
| --- | --- | --- |
| Windows | `npm run dist` | Windows x64 NSIS setup and `win-unpacked/` |
| macOS | `npm run dist:mac` | Intel and Apple silicon DMGs and ZIPs |
| Linux | `npm run dist:linux` | Linux x64 AppImage and Debian package |

Package names use the version in `package.json`; current source builds produce 1.1.2 files. DMG creation requires macOS. Signing and notarization credentials are not configured.

To keep an installer beside the source, copy the finished distributable from `dist/` into the project directory. Dependencies, generated packages, checksums, test output, local logs, and timer-state files are covered by `.gitignore`. The app's icons, smoke texture, and installer script are source assets and stay tracked.

## Tests

```bash
npm run test:pomodoro
npm run test:pomodoro:e2e
npm run test:pomodoro:packaged
npm run test:pomodoro:animations
```

The unit suite checks countdown behavior, input and configuration validation, recovery, logging, and deduplication. The Electron feature suite checks the dial, all avatars, keyboard/focus behavior, dragging, transparency, always-on-top, a real countdown, chime, pause/resume/reset, save retry, and persisted preferences. Build the app before running the packaged suite.

The animation suite launches normally and connects with `noDefaults: true` to preserve native system preferences. It checks visible smoke, frame progression for all fifteen avatars, delayed repaint recovery, real Caraxes completion, logging, and On / Follow system / Off.

To test the installed Windows executable directly in PowerShell:

```powershell
npm.cmd run test:pomodoro:animations -- "$env:LOCALAPPDATA\Programs\PomoBuddies\PomoBuddies.exe"
```

Tests use temporary data and logging folders. UI suites need a desktop session and include real one-minute countdowns. Run installer upgrades and tests sequentially: the Windows installer closes existing PomoBuddies processes.

The feature suites save screenshots under `output/playwright/source` and `output/playwright/packaged`; the native animation suite checks frames without screenshots.

Windows 1.1.2 passed all six unit tests, the packaged feature suite, and the native animation suite against the installed executable with Windows reduced motion enabled. macOS and Linux 1.1.2 packages have not been built or tested.

## Publish a release

For the current Windows update, create a GitHub release tagged `v1.1.2` from the pushed `main` commit, with a title such as **PomoBuddies 1.1.2 — Windows animation fix**.

Attach these files:

- `PomoBuddies-Setup-1.1.2.exe`
- `SHA256SUMS-1.1.2.txt`, containing the SHA-256 checksum of that installer

Suggested release notes: fifteen avatars, a circular selection dial with smoke transitions, start/resume/completion effects, the Windows reduced-motion fix with an explicit animation preference, and automatic local logging. State that the Windows installer is unsigned and that saved data is reused on upgrade.

Keep existing 1.1.1 macOS and Linux files with their 1.1.1 release. Attach 1.1.2 packages for those platforms only after building and verifying them. GitHub supplies source archives automatically; generated dependency folders, unpacked apps, test output, and backups are development files.

For future releases, update the version, build the intended platforms, run their tests, and generate checksums for exactly the uploaded files. Verify Windows hashes with `Get-FileHash -Algorithm SHA256`; macOS and Linux can use `shasum -a 256` and `sha256sum`.

## Project structure

```text
main.js              Electron window, IPC, timer persistence, and logging
preload.js           Context-isolated renderer bridge
index.html           Avatar SVGs and timer/settings markup
renderer.js          Timer UI, avatar dial, preferences, and effect triggers
styles.css           Pixel styling, transparent layout, and animations
pomodoro-core.js     Timer logic, input validation, and log writers
config.json          Portable default logging template
completion.wav       Completion chime
assets/              Icons, smoke texture, and Windows installer setup
package.json         Scripts, dependencies, version, and packaging settings
package-lock.json    Locked dependency versions
tests/               Unit, feature, and native animation suites
dist/                Generated packages and unpacked apps, ignored by Git
output/              Local verification output and backups, ignored by Git
```

## Security and license

The renderer uses context isolation and sandboxing with Node integration disabled. IPC handlers validate the sender and window-operation payloads. Navigation and new windows are blocked.

[MIT license](LICENSE).
