const { app, BrowserWindow, ipcMain, Notification } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { pathToFileURL } = require('node:url');
const { Pomodoro, appendSession, appendEvent } = require('./pomodoro-core');

// X11/XWayland supports the positioning and always-on-top APIs used by this widget.
if (process.platform === 'linux') app.commandLine.appendSwitch('ozone-platform', 'x11');
app.setName('Pomodoro Timer');
if (process.platform === 'win32') app.setAppUserModelId('local.pomodoro.timer');
if (process.env.POMODORO_DATA_DIR) app.setPath('userData', process.env.POMODORO_DATA_DIR);
const defaultLogFolder = path.join(app.getPath('userData'), 'Logs');
const configPath = process.env.POMODORO_CONFIG_PATH || path.join(app.isPackaged ? app.getPath('userData') : __dirname, 'config.json');
const statePath = path.join(app.getPath('userData'), 'session.json');
const clock = new Pomodoro();
let window;
let errorMessage = '';
let logging = false;
let savedPath = '';
let stateBlocked = false;

function persist() {
  if (stateBlocked) throw new Error('The previous timer state could not be backed up. Repair it before starting.');
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  const temp = `${statePath}.tmp`;
  const handle = fs.openSync(temp, 'w');
  try { fs.writeFileSync(handle, JSON.stringify(clock.state)); fs.fsyncSync(handle); }
  finally { fs.closeSync(handle); }
  fs.renameSync(temp, statePath);
}
function snapshot() {
  return { ...clock.snapshot(), logging, error: errorMessage, logPath: savedPath };
}
function publish() {
  if (window && !window.isDestroyed()) window.webContents.send('timer:state', snapshot());
}
async function saveCompletion() {
  if (logging || clock.state.status !== 'complete' || clock.state.saved) return;
  logging = true;
  errorMessage = '';
  publish();
  try {
    persist();
    savedPath = await appendSession(configPath, clock.state, defaultLogFolder);
    clock.state.saved = true;
    persist();
    recordEvent('completed', { sessionId: clock.state.id, minutes: clock.state.minutes, label: clock.state.label,
      activeMs: clock.state.activeMs, pauseCount: clock.state.pauseCount, resumeCount: clock.state.resumeCount });
  } catch (error) {
    errorMessage = `Session save failed: ${error.message}`;
    clock.state.saved = false;
  } finally { logging = false; publish(); }
}
let eventQueue = Promise.resolve();
function recordEvent(kind, info = {}) {
  if (!info.sessionId) return;
  const event = { ...info, kind, at: Date.now(),
    id: kind === 'completed' ? `${info.sessionId}-completed` : randomUUID() };
  // Serialize journal appends so rapid timer actions cannot skip or race each other.
  eventQueue = eventQueue.then(() => appendEvent(configPath, event, defaultLogFolder)).catch(() => {});
}
function tick() {
  if (clock.tick()) {
    if (Notification.isSupported()) {
      new Notification({ title: 'Pomodoro Timer',
        body: `${clock.state.label || 'Focus session'} · ${clock.state.minutes} minutes complete`,
        silent: true }).show();
    }
    saveCompletion();
  }
  publish();
}
function mutate(action) {
  tick();
  const before = { ...clock.state };
  try { action(); persist(); errorMessage = ''; }
  catch (error) { clock.state = before; errorMessage = error.message; }
  publish();
  return snapshot();
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if (window) { window.show(); window.focus(); } });
  app.whenReady().then(() => {
    if (!process.env.POMODORO_CONFIG_PATH) {
      fs.mkdirSync(defaultLogFolder, { recursive: true });
      if (app.isPackaged && !fs.existsSync(configPath)) {
        fs.writeFileSync(configPath, JSON.stringify({ logFolder: defaultLogFolder }, null, 2), { flag: 'wx' });
      }
    }
    try {
      if (fs.existsSync(statePath)) clock.restore(JSON.parse(fs.readFileSync(statePath, 'utf8')));
    } catch (error) {
      try {
        fs.renameSync(statePath, `${statePath}.unreadable-${Date.now()}`);
        errorMessage = 'Previous timer state was unreadable; a backup was kept.';
      } catch { stateBlocked = true; errorMessage = 'Previous timer state is unreadable and could not be backed up.'; }
    }
    window = new BrowserWindow({ width: 280, height: 340, title: 'Pomodoro Timer',
      alwaysOnTop: true, frame: false, transparent: true, resizable: false, maximizable: false,
      backgroundColor: '#00000000', show: false, icon: path.join(__dirname, 'assets', 'app-icon.png'),
      webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true,
        nodeIntegration: false, sandbox: true, backgroundThrottling: false } });
    if (process.platform !== 'darwin') window.setMenu(null);
    window.once('ready-to-show', () => window.setAlwaysOnTop(true, 'screen-saver'));
    window.once('ready-to-show', () => window.show());
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.on('will-navigate', event => event.preventDefault());
    const pageURL = pathToFileURL(path.join(__dirname, 'index.html')).href;
    const handle = (channel, action) => ipcMain.handle(channel, (event, ...args) => {
      if (event.sender !== window.webContents || event.senderFrame.url !== pageURL) {
        throw new Error('Untrusted timer request.');
      }
      return action(...args);
    });
    handle('timer:get', snapshot);
    handle('timer:start', (minutes, label) => mutate(() => {
      const resumed = clock.state.status === 'paused';
      clock.start(minutes, label);
      recordEvent(resumed ? 'resumed' : 'started', { sessionId: clock.state.id, minutes: clock.state.minutes, label: clock.state.label });
    }));
    handle('timer:pause', () => mutate(() => {
      if (clock.state.status === 'running') {
        recordEvent('paused', { sessionId: clock.state.id, minutes: clock.state.minutes, label: clock.state.label });
      }
      clock.pause();
    }));
    handle('timer:reset', () => mutate(() => {
      const sid = clock.state.id, minutes = clock.state.minutes, label = clock.state.label;
      const hadSession = clock.state.status !== 'idle';
      clock.reset();
      if (hadSession && sid) recordEvent('reset', { sessionId: sid, minutes, label });
    }));
    handle('timer:retry', async () => { await saveCompletion(); return snapshot(); });
    handle('window:close', () => window.close());
    handle('window:position', () => window.getPosition());
    handle('window:resize', height => {
      if (![340, 600].includes(height)) throw new Error('Invalid timer window size.');
      window.setResizable(true);
      window.setSize(280, height);
      window.setResizable(false);
      window.setAlwaysOnTop(true, 'screen-saver');
    });
    handle('window:move', (x, y) => {
      if (![x, y].every(value => Number.isInteger(value) && Math.abs(value) < 100000)) {
        throw new Error('Invalid window position.');
      }
      window.setPosition(x, y);
    });
    window.on('close', event => {
      if (clock.state.status !== 'running') return;
      const before = { ...clock.state };
      clock.pause();
      try { persist(); }
      catch (error) {
        event.preventDefault();
        clock.state = before;
        errorMessage = `Could not keep the timer state: ${error.message}`;
        publish();
      }
    });
    window.loadFile('index.html');
    setInterval(tick, 1000).unref();
    if (clock.state.status === 'complete' && !clock.state.saved) saveCompletion();
  }).catch(error => { console.error(error); app.quit(); });
  app.on('window-all-closed', () => app.quit());
}
