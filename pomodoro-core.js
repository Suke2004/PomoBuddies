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
      deadline: null, id: null, completedAt: null, saved: false };
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
    if (this.state.status !== 'paused') {
      label = validateInput(minutes, label);
      this.state = { status: 'idle', minutes, label, remainingMs: minutes * 60000,
        deadline: null, id: randomUUID(), completedAt: null, saved: false };
    }
    this.state.deadline = this.now() + this.state.remainingMs;
    this.state.status = 'running';
  }
  pause() {
    if (this.state.status !== 'running') return;
    if (this.tick()) return;
    this.state.remainingMs = this.remainingMs();
    this.state.deadline = null;
    this.state.status = 'paused';
  }
  reset() {
    if (this.state.status === 'complete' && !this.state.saved) {
      throw new Error('Save the completed session before resetting.');
    }
    Object.assign(this.state, { status: 'idle', remainingMs: this.state.minutes * 60000,
      deadline: null, id: null, completedAt: null, saved: false });
  }
  tick() {
    if (this.state.status !== 'running' || this.remainingMs() > 0) return false;
    Object.assign(this.state, { status: 'complete', remainingMs: 0,
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
    this.state = { ...state };
    if (state.status === 'running') {
      // A crashed/closed application must not silently finish a session.
      this.state.remainingMs = Math.max(1000, Math.min(state.remainingMs, state.deadline - this.now()));
      this.state.status = 'paused';
      this.state.deadline = null;
    }
  }
}

function localDate(date) {
  return [date.getFullYear(), date.getMonth() + 1, date.getDate()]
    .map((value, index) => String(value).padStart(index ? 2 : 4, '0')).join('-');
}

function logEntry(session) {
  const label = validateInput(session.minutes, session.label) || 'Focus session';
  const date = new Date(session.completedAt);
  if (!/^[\da-f-]{36}$/i.test(session.id || '') || !Number.isFinite(date.getTime())) {
    throw new Error('Completed session is invalid.');
  }
  const escaped = label.replace(/[\\`*_{}\[\]<>]/g, '\\$&');
  return `\n## ${localDate(date)} · ${date.toLocaleTimeString('en-GB')}\n\n`
    + `- **Date:** ${localDate(date)}\n- **Label:** ${escaped}\n`
    + `- **Duration:** ${session.minutes} minute${session.minutes === 1 ? '' : 's'}\n`
    + `- **Completed:** ${date.toISOString()}\n`
    + `<!-- pomodoro-session: ${session.id} -->\n`;
}

async function appendSession(configPath, session) {
  const config = JSON.parse(await fs.readFile(configPath, 'utf8'));
  if (typeof config.vaultPath !== 'string' || !config.vaultPath.trim() || !path.isAbsolute(config.vaultPath)) {
    throw new Error('Set vaultPath in config.json to your Obsidian vault folder.');
  }
  const vault = path.resolve(config.vaultPath);
  if (!(await fs.stat(vault)).isDirectory()) throw new Error('The configured vault is not a folder.');
  const entry = logEntry(session);
  const folder = path.join(vault, 'Pomodoro');
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
  if (event.kind === 'started' || event.kind === 'completed') return `${head}: **${escaped}** (${minute})`;
  if (event.kind === 'paused' || event.kind === 'resumed' || event.kind === 'reset') return `${head}: **${escaped}**`;
  return head;
}

async function appendEvent(configPath, event) {
  const config = JSON.parse(await fs.readFile(configPath, 'utf8'));
  if (typeof config.vaultPath !== 'string' || !config.vaultPath.trim() || !path.isAbsolute(config.vaultPath)) {
    throw new Error('Set vaultPath in config.json to your Obsidian vault folder.');
  }
  const vault = path.resolve(config.vaultPath);
  if (!(await fs.stat(vault)).isDirectory()) throw new Error('The configured vault is not a folder.');
  const id = event.id || randomUUID();
  const marker = `<!-- pomodoro-event: ${id} -->`;
  const folder = path.join(vault, 'Pomodoro');
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
