const { _electron: electron } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

(async () => {
  const root = path.resolve(__dirname, '..');
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'pomodoro-e2e-'));
  const config = path.join(temp, 'config.json');
  const userData = path.join(temp, 'user-data');
  await fs.mkdir(userData);
  await fs.writeFile(config, JSON.stringify({ vaultPath: temp }));
  const env = { ...process.env, POMODORO_CONFIG_PATH: config, POMODORO_DATA_DIR: userData };
  delete env.ELECTRON_RUN_AS_NODE;
  let app;
  const errors = [];
  const launch = async () => {
    app = await electron.launch({ args: ['.'], cwd: root, env });
    const page = await app.firstWindow();
    page.on('pageerror', error => errors.push(error.message));
    await page.waitForFunction(() => Boolean(window.pomodoro));
    await page.waitForFunction(() => Boolean(document.body.dataset.state));
    await app.evaluate(async ({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0];
      if (!window.isVisible()) await new Promise(resolve => window.once('show', resolve));
      window.setPosition(10000, 10000);
    });
    return page;
  };
  const openSettings = async page => {
    if (await page.locator('#settings-panel').isHidden()) await page.locator('#settings-toggle').click();
    await page.waitForFunction(() => window.innerHeight === 600);
  };
  try {
    let page = await launch();
    assert.equal(await app.evaluate(async ({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0];
      for (let i = 0; i < 30 && !window.isAlwaysOnTop(); i++) await new Promise(resolve => setTimeout(resolve, 100));
      return window.isAlwaysOnTop();
    }), true);
    assert.equal(await page.locator('#settings-panel').isHidden(), true);
    assert.deepEqual(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getSize()), [280, 340]);
    for (const selector of ['.sprite']) {
      const before = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getPosition());
      const box = await page.locator(selector).boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + 90);
      await page.mouse.down();
      await new Promise(resolve => setTimeout(resolve, 100));
      await page.mouse.move(box.x + box.width / 2 + 20, box.y + 100, { steps: 5 });
      await page.mouse.up();
      const after = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getPosition());
      assert.notDeepEqual(after, before, `Dragging ${selector} must move the window`);
    }
    assert.equal(await page.locator('#start').evaluate(el => getComputedStyle(el).webkitAppRegion), 'no-drag');
    assert.equal(await page.evaluate(() => typeof window.require), 'undefined');
    await openSettings(page);
    assert.equal(await page.locator('.buddy-card').count(), 12);
    await page.locator('[data-buddy="ironman"]').click();
    await page.locator('#next-buddy').click();
    assert.equal(await page.locator('#buddy-name').textContent(), 'Cat');
    await page.locator('#previous-buddy').click();
    assert.equal(await page.locator('#buddy-name').textContent(), 'Iron Man');
    await page.locator('[data-buddy="ironman"]').press('ArrowLeft');
    assert.equal(await page.locator('#buddy-name').textContent(), 'Hulk');
    await page.locator('#duration-slider').focus();
    await page.locator('#duration-slider').press('Home');
    await page.locator('#duration-slider').press('ArrowRight');
    assert.equal(await page.locator('#minutes').inputValue(), '2');
    await page.locator('[data-minutes="5"]').click();
    assert.equal(await page.locator('#minutes').inputValue(), '5');
    await page.locator('#more-time').click();
    assert.equal(await page.locator('#minutes').inputValue(), '10');
    await page.locator('#less-time').click();
    assert.equal(await page.locator('#minutes').inputValue(), '5');
    await page.locator('[data-minutes="25"]').click();
    assert.equal(await page.locator('#minutes').inputValue(), '25');
    const accents = new Set();
    for (const character of ['cat', 'dog', 'avocado', 'tomato', 'ben10', 'fourarms', 'harry', 'hedwig', 'pikachu', 'captain', 'hulk', 'ironman']) {
      await page.locator(`[data-buddy="${character}"]`).click();
      assert.equal(await page.locator(`[data-buddy="${character}"]`).getAttribute('aria-pressed'), 'true');
      accents.add(await page.evaluate(() => getComputedStyle(document.body).getPropertyValue('--accent').trim()));
      assert.equal(await page.locator(`.sprite .character.${character}`).isVisible(), true);
      await page.locator('#dismiss-settings').click();
      await page.waitForFunction(() => window.innerHeight === 340);
      await page.screenshot({ path: path.join(root, 'output', `pomodoro-${character}.png`) });
      await openSettings(page);
    }
    assert.equal(accents.size, 12);
    await page.locator('[data-buddy="ironman"]').click();
    await page.evaluate(async () => { await Promise.all(document.getAnimations().map(animation => animation.finished.catch(() => {}))); });
    await page.screenshot({ path: path.join(root, 'output', 'pomodoro-focus-kit.png') });
    assert.ok(await page.locator('#settings-panel').evaluate(el => el.getBoundingClientRect().top >= 0));
    assert.ok(await page.locator('#close').evaluate(el => el.getBoundingClientRect().bottom <= window.innerHeight));
    const heroAccent = await page.evaluate(() => getComputedStyle(document.body).getPropertyValue('--accent').trim());
    await page.locator('#minutes').fill('1');
    await page.locator('#label').fill('film prep');
    assert.equal(await page.locator('#minutes').inputValue(), '1');
    await page.locator('#start').click();
    assert.equal(await page.locator('#settings-panel').isHidden(), true);
    assert.equal((await page.evaluate(() => window.pomodoro.getState())).minutes, 1);
    await page.waitForFunction(() => document.querySelector('#countdown').textContent === '00:59', null, { timeout: 5000 });
    await openSettings(page);
    assert.equal(await page.locator('#duration-slider').isDisabled(), true);
    await page.locator('#pause').click();
    await page.waitForFunction(() => document.body.dataset.state === 'paused', null, { timeout: 3000 });
    const paused = await page.locator('#countdown').textContent();
    await new Promise(resolve => setTimeout(resolve, 1300));
    assert.equal(await page.locator('#countdown').textContent(), paused);
    await page.locator('#start').click();
    const resumed = await page.evaluate(() => window.pomodoro.getState());
    assert.equal(resumed.status, 'running');
    assert.equal(resumed.minutes, 1);
    console.log('Running the real one-minute countdown…');
    await page.waitForFunction(() => document.querySelector('#countdown').textContent === '00:00', null, { timeout: 65000 });
    await page.waitForFunction(() => document.querySelector('#status').textContent.includes('Saved to Obsidian'), null, { timeout: 10000 });
    const logPath = path.join(temp, 'Pomodoro', 'Log.md');
    const first = await fs.readFile(logPath, 'utf8');
    assert.match(first, /film prep/);
    assert.match(first, /\*\*Duration:\*\* 1 minute/);
    assert.match(first, /\*\*Date:\*\* \d{4}-\d\d-\d\d/);
    assert.match(first, /\*\*Completed:\*\* \d{4}-/);
    assert.equal((first.match(/pomodoro-session:/g) || []).length, 1);
    await page.waitForFunction(() => document.querySelector('#completion-sound').currentTime > 0, null, { timeout: 3000 });
    const sound = await page.locator('#completion-sound').evaluate(audio => ({ error: audio.error?.message, time: audio.currentTime }));
    assert.ok(!sound.error && sound.time > 0, JSON.stringify(sound));
    console.log('Completed session logged and chime played. Checking restart recovery…');
    await openSettings(page);
    await page.locator('#start').click();
    await new Promise(resolve => setTimeout(resolve, 1100));
    await openSettings(page);
    await Promise.all([app.waitForEvent('close'), page.locator('#close').click().catch(error => {
      if (!/Target.*closed/.test(error.message)) throw error;
    })]);
    app = null;
    page = await launch();
    await page.waitForFunction(() => document.querySelector('#mode').textContent === 'TAKE A BREATH');
    await openSettings(page);
    assert.equal(await page.locator('[data-buddy="ironman"]').getAttribute('aria-pressed'), 'true');
    assert.equal(await page.evaluate(() => getComputedStyle(document.body).getPropertyValue('--accent').trim()), heroAccent);
    const restored = await page.evaluate(() => window.pomodoro.getState());
    assert.equal(restored.status, 'paused');
    assert.ok(restored.remainingSeconds > 0 && restored.remainingSeconds < 60);
    await page.locator('#reset').click();
    await page.waitForFunction(() => document.querySelector('#mode').textContent === 'READY TO FOCUS');
    assert.equal(await fs.readFile(logPath, 'utf8'), first);

    // Seed a finished journal record to test recovery/retry without another minute wait.
    await app.close(); app = null;
    await fs.writeFile(config, JSON.stringify({ vaultPath: '' }));
    await fs.writeFile(path.join(userData, 'session.json'), JSON.stringify({ status: 'complete', minutes: 1,
      label: '', remainingMs: 0, deadline: null, id: randomUUID(), completedAt: Date.now(), saved: false }));
    page = await launch();
    await openSettings(page);
    await page.waitForFunction(() => !document.querySelector('#retry').hidden);
    assert.equal(await page.locator('#start').isDisabled(), true);
    await fs.writeFile(config, JSON.stringify({ vaultPath: temp }));
    await page.locator('#retry').click();
    await page.waitForFunction(() => document.querySelector('#status').textContent.includes('Saved to Obsidian'));
    const appended = await fs.readFile(logPath, 'utf8');
    assert.ok(appended.startsWith(first));
    assert.match(appended, /Focus session/);
    assert.equal((appended.match(/pomodoro-session:/g) || []).length, 2);
    await page.evaluate(() => window.pomodoro.retrySave());
    assert.equal(await fs.readFile(logPath, 'utf8'), appended);
    await page.screenshot({ path: path.join(root, 'output', 'pomodoro-timer.png') });
    assert.deepEqual(errors, []);
    await page.locator('#dismiss-settings').click();
    console.log('PASS: compact avatar-only view, gear settings, dragging, always-on-top window, countdown, pause/resume/reset, chime playback, append-only logging, failed-save retry, and restart/theme persistence.');
    console.log('Test vault:', temp);
  } catch (error) {
    const page = app?.windows()[0];
    if (page && !page.isClosed()) {
      console.error('UI state:', await page.evaluate(() => ({ text: document.querySelector('#status').textContent,
        countdown: document.querySelector('#countdown').textContent, minutes: document.querySelector('#minutes').value,
        label: document.querySelector('#label').value })));
      console.error('Timer state:', await page.evaluate(() => window.pomodoro.getState()));
      await page.screenshot({ path: path.join(root, 'output', 'pomodoro-timer-debug.png') });
    }
    throw error;
  } finally {
    if (app) await app.close().catch(() => {});
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
