const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { Pomodoro, appendSession, logEntry, appendEvent, eventLine } = require('../pomodoro-core');

test('countdown uses its deadline, pauses, resumes, finishes once and resets', () => {
  let now = 100000;
  const timer = new Pomodoro(() => now);
  timer.start(1, 'film prep');
  const id = timer.state.id;
  timer.start(2, 'ignored while running');
  assert.equal(timer.state.id, id);
  now += 11250;
  assert.equal(timer.snapshot().remainingSeconds, 49);
  timer.pause();
  const paused = timer.remainingMs();
  now += 20000;
  assert.equal(timer.remainingMs(), paused);
  timer.start(240, 'does not overwrite the paused session');
  assert.equal(timer.state.minutes, 1);
  now += paused + 10000;
  assert.equal(timer.tick(), true);
  assert.equal(timer.tick(), false);
  assert.equal(timer.snapshot().remainingSeconds, 0);
  assert.throws(() => timer.reset(), /Save the completed/);
  assert.throws(() => timer.start(1, ''), /Save the completed/);
  timer.state.saved = true;
  timer.reset();
  assert.equal(timer.snapshot().remainingSeconds, 60);
  assert.equal(timer.state.status, 'idle');
});

test('input validation, empty labels and interrupted session restoration', () => {
  const timer = new Pomodoro(() => 1000);
  for (const minutes of [0, -1, 1.5, '1', Infinity, 241]) assert.throws(() => timer.start(minutes, ''));
  assert.throws(() => timer.start(1, '<'.repeat(201)));
  timer.start(1, '');
  const restored = new Pomodoro(() => 20000);
  restored.restore(timer.state);
  assert.equal(restored.state.status, 'paused');
  assert.equal(restored.snapshot().remainingSeconds, 41);
  assert.throws(() => restored.restore({ ...timer.state, remainingMs: -1 }));
  assert.match(logEntry({ id: randomUUID(), minutes: 1, label: '', completedAt: Date.now() }), /Focus session/);
});

test('log is created, appended, deduplicated, escaped, and config is read on each save', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'pomodoro-unit-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const config = path.join(root, 'config.json');
  await fs.writeFile(config, JSON.stringify({ vaultPath: root }));
  const session = { id: randomUUID(), minutes: 1, label: 'film prep\n## injected', completedAt: Date.now() };
  const log = await appendSession(config, session);
  const first = await fs.readFile(log, 'utf8');
  assert.match(first, /^# Pomodoro Log/);
  assert.match(first, /\*\*Planned:\*\* 1 minute/);
  assert.match(first, /\*\*Completed:\*\* \d{4}-\d\d-\d\dT/);
  assert.match(first, /\*\*Date:\*\* \d{4}-\d\d-\d\d/);
  assert.match(first, /\*\*Started:\*\* \d{4}-\d\d-\d\dT/);
  assert.match(first, /\*\*Wall time:\*\*/);
  assert.match(first, /\*\*Active focus:\*\*/);
  assert.match(first, /\*\*Paused:\*\* .* \(0 pauses, 0 resumes\)/);
  assert.match(first, /\*\*Focus efficiency:\*\* 100%/);
  assert.ok(!first.includes('\n## injected'));
  await appendSession(config, session);
  assert.equal(await fs.readFile(log, 'utf8'), first);
  await appendSession(config, { ...session, id: randomUUID(), label: 'study plan' });
  const second = await fs.readFile(log, 'utf8');
  assert.ok(second.startsWith(first));
  assert.equal((second.match(/pomodoro-session:/g) || []).length, 2);
  await fs.writeFile(config, JSON.stringify({ vaultPath: '' }));
  await assert.rejects(appendSession(config, { ...session, id: randomUUID() }), /vaultPath/);
  assert.equal(await fs.readFile(log, 'utf8'), second);
  await fs.writeFile(config, '{broken');
  await assert.rejects(appendSession(config, session));
  assert.equal(await fs.readFile(log, 'utf8'), second);
});

test('activity journal appends daily entries, dedupes, and validates the vault', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'pomodoro-events-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const config = path.join(root, 'config.json');
  await fs.writeFile(config, JSON.stringify({ vaultPath: root }));
  const id = randomUUID();
  const at = new Date(2026, 10, 8, 0, 1).getTime();
  const journal = path.join(root, 'Personal Tools', 'Pomodoro', '2026-11-08.md');

  const started = await appendEvent(config, { kind: 'started', id, at, minutes: 25, label: 'study' });
  assert.equal(started, journal);
  const first = await fs.readFile(journal, 'utf8');
  assert.match(first, /^# Pomodoro Activity/);
  assert.match(first, /started: \*\*study\*\* \(25 mins\)/);
  assert.ok(first.includes(`pomodoro-event: ${id}`));

  // Dedupe: same event id is a no-op
  await appendEvent(config, { kind: 'started', id, at, minutes: 25, label: 'study' });
  assert.equal(await fs.readFile(journal, 'utf8'), first);

  // New event appends
  await appendEvent(config, { kind: 'paused', id: randomUUID(), at: at + 2000, minutes: 25, label: 'study' });
  const second = await fs.readFile(journal, 'utf8');
  assert.ok(second.startsWith(first));
  assert.equal((second.match(/pomodoro-event:/g) || []).length, 2);

  // Markdown escaping
  const escaped = eventLine({ kind: 'started', at: Date.now(), minutes: 1, label: 'a\n## b' });
  assert.ok(!escaped.includes('\n## b'));

  // Broken config / missing vault are rejected
  await fs.writeFile(config, JSON.stringify({ vaultPath: '' }));
  await assert.rejects(appendEvent(config, { kind: 'started', id: randomUUID(), at: Date.now() }), /vaultPath/);
  await assert.rejects(appendEvent(path.join(root, 'nope.json'), { kind: 'started', id: randomUUID(), at: Date.now() }));
});

test('local logging creates its default folder, supports overrides, and rejects invalid paths', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'pomodoro-local-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const config = path.join(root, 'config.json');
  const defaultFolder = path.join(root, 'user-data', 'Logs');
  const session = { id: randomUUID(), minutes: 1, label: 'local focus', completedAt: Date.now() };
  await fs.writeFile(config, JSON.stringify({ logFolder: '' }));
  const log = await appendSession(config, session, defaultFolder);
  assert.equal(log, path.join(defaultFolder, 'Log.md'));
  const first = await fs.readFile(log, 'utf8');
  await appendSession(config, session, defaultFolder);
  assert.equal(await fs.readFile(log, 'utf8'), first);
  const event = { kind: 'started', id: randomUUID(), at: Date.now(), minutes: 1, label: 'local focus' };
  const journal = await appendEvent(config, event, defaultFolder);
  assert.equal(path.dirname(journal), defaultFolder);
  assert.match(await fs.readFile(journal, 'utf8'), /local focus/);

  const override = path.join(root, 'custom-logs');
  await fs.writeFile(config, JSON.stringify({ logFolder: override }));
  assert.equal(await appendSession(config, session, defaultFolder), path.join(override, 'Log.md'));
  for (const logFolder of ['relative-folder', ' ', false, 42, null]) {
    await fs.writeFile(config, JSON.stringify({ logFolder }));
    await assert.rejects(appendSession(config, session, defaultFolder), /logFolder/);
    await assert.rejects(appendEvent(config, event, defaultFolder), /logFolder/);
  }
  assert.equal(await fs.readFile(log, 'utf8'), first);
});

test('tracks active focus, pauses and resumes across segments for the agent log', () => {
  let now = 0;
  const timer = new Pomodoro(() => now);
  timer.start(1, 'deep work');            // planned 60s
  now += 10000; timer.pause();            // segment 1: +10s
  assert.equal(timer.state.activeMs, 10000);
  assert.equal(timer.state.pauseCount, 1);
  now += 20000; timer.start(1, 'x');      // resume (paused -> running)
  assert.equal(timer.state.resumeCount, 1);
  now += 5000; timer.pause();             // segment 2: +5s
  assert.equal(timer.state.activeMs, 15000);
  assert.equal(timer.state.pauseCount, 2);
  now += 30000; timer.start(1, 'x');      // resume again
  assert.equal(timer.state.resumeCount, 2);
  now += 45000;                           // segment 3: +45s -> exactly 60s
  assert.equal(timer.tick(), true);
  assert.equal(timer.state.status, 'complete');
  assert.equal(timer.state.activeMs, 60000);
  assert.equal(timer.state.completedAt, 110000);
  assert.equal(timer.state.segmentStartedAt, null);
  const entry = logEntry(timer.state);
  assert.match(entry, /\*\*Active focus:\*\* 1m/);
  assert.match(entry, /\*\*Paused:\*\* .* \(2 pauses, 2 resumes\)/);
  assert.match(entry, /\*\*Focus efficiency:\*\* 100%/);
});
