const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

function validateInput(minutes, label) {
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 240) {
    throw new Error('Choose a whole duration between 1 and 240 minutes.');
  }
  if (typeof label !== 'string' || label.length > 200) {
    throw new Error('Keep the label under 200 characters.');
  }
  return label.replace(/[\r\n]+/g, ' ').trim();
}

class Pomodoro {
  constructor(now = Date.now) {
    this.now = now;
    this.state = { status: 'idle', minutes: 25, label: '', remainingMs: 25 * 60000,
      deadline: null, id: null, completedAt: null, saved: false,
      startedAt: null, segmentStartedAt: null, activeMs: 0, pauseCount: 0, resumeCount: 0 };
  }
  remainingMs() {
    return this.state.status === 'running'
      ? Math.max(0, this.state.deadline - this.now()) : this.state.remainingMs;
  }
  snapshot() {
    return { ...this.state, remainingSeconds: Math.ceil(this.remainingMs() / 1000) };
  }
  start(minutes, label) {
    if (this.state.status === 'running') return;
    if (this.state.status === 'complete' && !this.state.saved) {
      throw new Error('Save the completed session before starting another.');
    }
    const resumed = this.state.status === 'paused';
    if (!resumed) {
      label = validateInput(minutes, label);
      this.state = { status: 'idle', minutes, label, remainingMs: minutes * 60000,
        deadline: null, id: randomUUID(), completedAt: null, saved: false,
        startedAt: null, segmentStartedAt: null, activeMs: 0, pauseCount: 0, resumeCount: 0 };
    }
    if (resumed) this.state.resumeCount++;
    if (this.state.startedAt === null) this.state.startedAt = this.now();
    this.state.deadline = this.now() + this.state.remainingMs;
    this.state.segmentStartedAt = this.now();
    this.state.status = 'running';
  }
  pause() {
    if (this.state.status !== 'running') return;
    if (this.tick()) return;
    this.state.activeMs += this.now() - this.state.segmentStartedAt;
    this.state.segmentStartedAt = null;
    this.state.pauseCount++;
    this.state.remainingMs = this.remainingMs();
    this.state.deadline = null;
    this.state.status = 'paused';
  }
  reset() {
    if (this.state.status === 'complete' && !this.state.saved) {
      throw new Error('Save the completed session before resetting.');
    }
    Object.assign(this.state, { status: 'idle', remainingMs: this.state.minutes * 60000,
      deadline: null, id: null, completedAt: null, saved: false,
      startedAt: null, segmentStartedAt: null, activeMs: 0, pauseCount: 0, resumeCount: 0 });
  }
  tick() {
    if (this.state.status !== 'running' || this.remainingMs() > 0) return false;
    if (this.state.segmentStartedAt !== null) this.state.activeMs += this.now() - this.state.segmentStartedAt;
    Object.assign(this.state, { status: 'complete', remainingMs: 0, segmentStartedAt: null,
      completedAt: this.state.deadline, deadline: null });
    return true;
  }
  restore(state) {
    validateInput(state.minutes, state.label);
    if (!['idle', 'running', 'paused', 'complete'].includes(state.status)
      || !Number.isFinite(state.remainingMs) || state.remainingMs < 0
      || state.remainingMs > state.minutes * 60000 || typeof state.saved !== 'boolean'
      || (state.status !== 'idle' && !/^[\da-f-]{36}$/i.test(state.id || ''))
      || (state.status === 'running' && !Number.isFinite(state.deadline))
      || (state.status === 'complete' && !Number.isFinite(state.completedAt))) {
      throw new Error('Saved timer state is invalid.');
    }
    state.startedAt = state.startedAt ?? null;
    state.segmentStartedAt = state.segmentStartedAt ?? null;
    state.activeMs = Number.isFinite(state.activeMs) ? state.activeMs : 0;
    state.pauseCount = Number.isInteger(state.pauseCount) && state.pauseCount >= 0 ? state.pauseCount : 0;
    state.resumeCount = Number.isInteger(state.resumeCount) && state.resumeCount >= 0 ? state.resumeCount : 0;
    this.state = { ...state };
    if (state.status === 'running') {
      // A crashed/closed application must not silently finish a session.
      this.state.remainingMs = Math.max(1000, Math.min(state.remainingMs, state.deadline - this.now()));
      this.state.status = 'paused';
      this.state.deadline = null;
      this.state.segmentStartedAt = null;
    }
  }
}

function localDate(date) {
  return [date.getFullYear(), date.getMonth() + 1, date.getDate()]
    .map((value, index) => String(value).padStart(index ? 2 : 4, '0')).join('-');
}

function fmtDuration(ms) {
  const total = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(total / 60), seconds = total % 60;
  return seconds ? `${minutes}m ${seconds}s` : `${minutes}m`;
}

function logEntry(session) {
  const label = validateInput(session.minutes, session.label) || 'Focus session';
  const date = new Date(session.completedAt);
  if (!/^[\da-f-]{36}$/i.test(session.id || '') || !Number.isFinite(date.getTime())) {
    throw new Error('Completed session is invalid.');
  }
  const plannedMs = session.minutes * 60000;
  const activeMs = Number.isFinite(session.activeMs) ? session.activeMs : plannedMs;
  const started = session.startedAt ? new Date(session.startedAt) : date;
  const wallMs = Math.max(0, date.getTime() - started.getTime());
  const pausedMs = Math.max(0, wallMs - activeMs);
  const pauses = session.pauseCount || 0, resumes = session.resumeCount || 0;
  const efficiency = plannedMs > 0 ? Math.round(100 * activeMs / plannedMs) : 100;
  const escaped = label.replace(/[\\`*_{}\[\]<>]/g, '\\$&');
  return `\n## ${localDate(date)} · ${date.toLocaleTimeString('en-GB')}\n\n`
    + `- **Date:** ${localDate(date)}\n- **Label:** ${escaped}\n`
    + `- **Planned:** ${session.minutes} minute${session.minutes === 1 ? '' : 's'}\n`
    + `- **Started:** ${started.toISOString()}\n`
    + `- **Completed:** ${date.toISOString()}\n`
    + `- **Wall time:** ${fmtDuration(wallMs)} (start to completion)\n`
    + `- **Active focus:** ${fmtDuration(activeMs)}\n`
    + `- **Paused:** ${fmtDuration(pausedMs)} (${pauses} pause${pauses === 1 ? '' : 's'}, ${resumes} resume${resumes === 1 ? '' : 's'})\n`
    + `- **Focus efficiency:** ${efficiency}% of planned time\n`
    + `<!-- pomodoro-session: ${session.id} -->\n`;
}

async function loggingFolder(configPath, defaultFolder) {
  const config = JSON.parse(await fs.readFile(configPath, 'utf8'));
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    throw new Error('Logging configuration must be an object.');
  }
  if (Object.hasOwn(config, 'vaultPath')) {
    if (typeof config.vaultPath !== 'string' || !config.vaultPath.trim() || !path.isAbsolute(config.vaultPath)) {
      throw new Error('Set vaultPath in config.json to your Obsidian vault folder.');
    }
    const vault = path.resolve(config.vaultPath);
    if (!(await fs.stat(vault)).isDirectory()) throw new Error('The configured vault is not a folder.');
    return path.join(vault, 'Personal Tools', 'Pomodoro');
  }
  const folder = config.logFolder === '' || config.logFolder === undefined ? defaultFolder : config.logFolder;
  if (typeof folder !== 'string' || !folder.trim() || !path.isAbsolute(folder)) {
    throw new Error('Set logFolder in config.json to an absolute folder path.');
  }
  return path.resolve(folder);
}

async function appendSession(configPath, session, defaultFolder) {
  const folder = await loggingFolder(configPath, defaultFolder);
  const entry = logEntry(session);
  const logPath = path.join(folder, 'Log.md');
  await fs.mkdir(folder, { recursive: true });
  let existing = '';
  try { existing = await fs.readFile(logPath, 'utf8'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (!existing.includes(`<!-- pomodoro-session: ${session.id} -->`)) {
    const handle = await fs.open(logPath, 'a');
    try {
      await handle.writeFile((existing.length ? '' : '# Pomodoro Log\n') + entry, 'utf8');
      await handle.sync();
    } finally { await handle.close(); }
  }
  return logPath;
}

function eventLine(event) {
  const date = new Date(event.at);
  const label = validateInput(event.minutes || 1, event.label) || 'Focus session';
  const escaped = label.replace(/[\\`*_{}\[\]<>]/g, '\\$&');
  const time = date.toLocaleTimeString('en-GB');
  const minute = `${event.minutes || 1} min${(event.minutes || 1) === 1 ? '' : 's'}`;
  const head = `- ${date.toLocaleDateString('en-GB')} ${time} · ${event.kind}`;
  if (event.kind === 'started') return `${head}: **${escaped}** (${minute})`;
  if (event.kind === 'completed') {
    const active = Number.isFinite(event.activeMs) ? ` · ${fmtDuration(event.activeMs)} active` : '';
    return `${head}: **${escaped}** (${minute}${active})`;
  }
  if (event.kind === 'paused' || event.kind === 'resumed' || event.kind === 'reset') return `${head}: **${escaped}**`;
  return head;
}

async function appendEvent(configPath, event, defaultFolder) {
  const folder = await loggingFolder(configPath, defaultFolder);
  const id = event.id || randomUUID();
  const marker = `<!-- pomodoro-event: ${id} -->`;
  const file = path.join(folder, `${localDate(new Date(event.at))}.md`);
  await fs.mkdir(folder, { recursive: true });
  let existing = '';
  try { existing = await fs.readFile(file, 'utf8'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (existing.includes(marker)) return file;
  const handle = await fs.open(file, 'a');
  try {
    await handle.writeFile((existing.length ? '' : '# Pomodoro Activity\n\n') + eventLine(event) + ' ' + marker + '\n', 'utf8');
    await handle.sync();
  } finally { await handle.close(); }
  return file;
}

module.exports = { Pomodoro, validateInput, appendSession, logEntry, localDate, appendEvent, eventLine };
