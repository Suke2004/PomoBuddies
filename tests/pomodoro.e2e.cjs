const { _electron: electron } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

(async () => {
  const root = path.resolve(__dirname, '..');
  const packaged = process.argv.includes('--packaged');
  const packagedExecutable = process.platform === 'win32' ? path.join(root, 'dist', 'win-unpacked', 'PomoBuddies.exe')
    : process.platform === 'darwin' ? path.join(root, 'dist', process.arch === 'arm64' ? 'mac-arm64' : 'mac', 'PomoBuddies.app', 'Contents', 'MacOS', 'PomoBuddies')
    : path.join(root, 'dist', 'linux-unpacked', 'pomobuddies');
  const output = path.join(root, 'output', 'playwright', packaged ? 'packaged' : 'source');
  await fs.mkdir(output, { recursive: true });
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'pomodoro-e2e-'));
  const userData = path.join(temp, 'user-data');
  const config = path.join(packaged ? userData : temp, 'config.json');
  const validConfig = packaged ? { logFolder: path.join(userData, 'Logs') } : { vaultPath: temp };
  await fs.mkdir(userData);
  if (!packaged) await fs.writeFile(config, JSON.stringify(validConfig));
  const env = { ...process.env, POMODORO_DATA_DIR: userData };
  if (packaged) delete env.POMODORO_CONFIG_PATH;
  else env.POMODORO_CONFIG_PATH = config;
  delete env.ELECTRON_RUN_AS_NODE;
  let app;
  let nativeOutput = '';
  const errors = [];
  const launch = async () => {
    app = await electron.launch({ args: packaged ? [] : ['.'], cwd: root, env,
      executablePath: packaged ? packagedExecutable : undefined });
    nativeOutput = '';
    app.process().stderr?.on('data', data => { nativeOutput = (nativeOutput + data.toString()).slice(-10000); });
    const page = await app.firstWindow();
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.waitForFunction(() => Boolean(window.pomodoro));
    await page.waitForFunction(() => Boolean(document.body.dataset.state));
    await app.evaluate(async ({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0];
      if (!window.isVisible()) await new Promise(resolve => window.once('show', resolve));
      window.setPosition(100, 100);
    });
    return page;
  };
  const openSettings = async page => {
    if (await page.locator('#settings-panel').isHidden()) await page.locator('#settings-toggle').click();
    try { await page.waitForFunction(() => window.innerHeight === 600, null, { timeout: 5000 }); }
    catch (error) {
      console.error('Window dimensions:', await app.evaluate(({ BrowserWindow }) => {
        const window = BrowserWindow.getAllWindows()[0];
        return { size: window.getSize(), content: window.getContentSize(), resizable: window.isResizable() };
      }));
      throw error;
    }
  };
  const settleAnimations = page => page.evaluate(async () => {
    await Promise.all(document.getAnimations().map(animation => animation.finished.catch(() => {})));
  });
  const openDial = async page => {
    await openSettings(page);
    if (!(await page.locator('#buddy-dial').evaluate(dial => dial.open))) await page.locator('#dial-toggle').click();
    await settleAnimations(page);
  };
  const selectBuddy = async (page, buddy) => {
    await openDial(page);
    await page.locator(`[data-buddy="${buddy}"].buddy-card`).click();
    await page.waitForFunction(buddy => document.body.dataset.theme === buddy, buddy);
  };
  try {
    let page = await launch();
    if (packaged) {
      assert.equal(await app.evaluate(({ app }) => app.isPackaged), true);
      assert.deepEqual(JSON.parse(await fs.readFile(config, 'utf8')), validConfig);
      assert.equal((await fs.stat(validConfig.logFolder)).isDirectory(), true);
      console.log('Packaged app created its writable default configuration and Logs folder on first launch.');
    }
    assert.equal(await app.evaluate(async ({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0];
      for (let i = 0; i < 30 && !window.isAlwaysOnTop(); i++) await new Promise(resolve => setTimeout(resolve, 100));
      return window.isAlwaysOnTop();
    }), true);
    assert.equal(await page.locator('#settings-panel').isHidden(), true);
    assert.deepEqual(await page.evaluate(() => [document.documentElement, document.body].map(element => getComputedStyle(element).backgroundColor)), ['rgba(0, 0, 0, 0)', 'rgba(0, 0, 0, 0)']);
    assert.equal(await page.locator('.smoke-cloud').evaluateAll(clouds => clouds.every(cloud => getComputedStyle(cloud).opacity === '0')), true);
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
    assert.equal(await page.locator('.buddy-card').count(), 15);
    assert.equal(await page.locator('#buddy-dial').isHidden(), true);
    await openDial(page);
    assert.equal(await page.locator('#buddy-dial').evaluate(dial => getComputedStyle(dial, '::backdrop').backgroundColor), 'rgba(0, 0, 0, 0)');
    const originalTheme = await page.locator('body').getAttribute('data-theme');
    await page.locator('.buddy-card[data-buddy="luna"]').hover();
    assert.equal(await page.locator('#buddy-name').textContent(), 'Luna Lovegood');
    assert.equal(await page.locator('body').getAttribute('data-theme'), originalTheme);
    assert.equal(await page.locator('.stage-avatar .character.luna').isVisible(), true);
    assert.ok(await page.locator('.buddy-card[data-buddy="luna"]').evaluate(el => getComputedStyle(el).boxShadow.includes('rgba')));
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => Boolean(document.activeElement.closest('#buddy-dial'))), true);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#buddy-dial').isHidden(), true);
    assert.equal(await page.locator('#settings-panel').isVisible(), true);
    assert.equal(await page.locator('#dial-toggle').evaluate(el => el === document.activeElement), true);
    await selectBuddy(page, 'caraxes');
    assert.equal(await page.locator('.buddy').getAttribute('data-effect'), 'transform');
    await page.waitForFunction(() => [...document.querySelectorAll('.smoke-cloud')].some(cloud => Number(getComputedStyle(cloud).opacity) > .4), null, { timeout: 1500 });
    await page.screenshot({ path: path.join(output, 'pomodoro-avatar-smoke.png') });
    await settleAnimations(page);
    await openDial(page);
    await page.locator('#next-buddy').click();
    assert.equal(await page.locator('#buddy-name').textContent(), 'Cat');
    await page.locator('#previous-buddy').click();
    assert.equal(await page.locator('#buddy-name').textContent(), 'Caraxes');
    await page.locator('.buddy-card[data-buddy="caraxes"]').press('ArrowLeft');
    assert.equal(await page.locator('#buddy-name').textContent(), 'Niklaus');
    await page.locator('.buddy-card[data-buddy="niklaus"]').press('Home');
    assert.equal(await page.locator('#buddy-name').textContent(), 'Cat');
    await page.locator('.buddy-card[data-buddy="cat"]').press('End');
    assert.equal(await page.locator('#buddy-name').textContent(), 'Caraxes');
    await page.locator('.buddy-card[data-buddy="caraxes"]').press('Enter');
    assert.equal(await page.locator('#buddy-dial').isHidden(), true);
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
    for (const character of ['cat', 'dog', 'avocado', 'tomato', 'ben10', 'fourarms', 'harry', 'hedwig', 'pikachu', 'captain', 'hulk', 'ironman', 'luna', 'niklaus', 'caraxes']) {
      await selectBuddy(page, character);
      assert.equal(await page.locator(`.buddy-card[data-buddy="${character}"]`).getAttribute('aria-pressed'), 'true');
      accents.add(await page.evaluate(() => getComputedStyle(document.body).getPropertyValue('--accent').trim()));
      assert.equal(await page.locator(`.sprite .character.${character}`).isVisible(), true);
      assert.equal(await page.locator('.sprite .character:visible').count(), 1);
      await settleAnimations(page);
      await page.locator('#dismiss-settings').click();
      await page.waitForFunction(() => window.innerHeight === 340);
      await page.screenshot({ path: path.join(output, `pomodoro-${character}.png`) });
      await openSettings(page);
    }
    assert.equal(accents.size, 15);
    await openDial(page);
    await page.locator('.buddy-card[data-buddy="luna"]').hover();
    await settleAnimations(page);
    await page.screenshot({ path: path.join(output, 'pomodoro-avatar-dial.png') });
    const cardBounds = await page.locator('.buddy-card').evaluateAll(cards => cards.map(card => {
      const box = card.getBoundingClientRect();
      return { left: box.left, right: box.right, top: box.top, bottom: box.bottom };
    }));
    assert.ok(cardBounds.every(box => box.left >= 0 && box.right <= 280 && box.top >= 0 && box.bottom <= 600));
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#animation-mode').inputValue(), 'full');
    await page.locator('#animation-mode').selectOption('system');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.waitForFunction(() => document.body.dataset.motion === 'reduced');
    await selectBuddy(page, 'niklaus');
    assert.equal(await page.locator('.buddy').getAttribute('data-effect'), null);
    await selectBuddy(page, 'caraxes');
    assert.equal(await page.evaluate(() => document.getAnimations().length), 0);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.waitForFunction(() => document.body.dataset.motion === 'full');
    await page.screenshot({ path: path.join(output, 'pomodoro-focus-kit.png') });
    assert.ok(await page.locator('#settings-panel').evaluate(el => el.getBoundingClientRect().top >= 0));
    assert.ok(await page.locator('#close').evaluate(el => el.getBoundingClientRect().bottom <= window.innerHeight));
    const heroAccent = await page.evaluate(() => getComputedStyle(document.body).getPropertyValue('--accent').trim());
    await page.locator('#minutes').fill('1');
    await page.locator('#label').fill('film prep');
    assert.equal(await page.locator('#minutes').inputValue(), '1');
    await page.locator('#start').click();
    assert.equal(await page.locator('.buddy').getAttribute('data-effect'), 'dragon-start');
    assert.equal(await page.locator('#settings-panel').isHidden(), true);
    assert.equal((await page.evaluate(() => window.pomodoro.getState())).minutes, 1);
    await page.waitForFunction(() => {
      const [minutes, seconds] = document.querySelector('#countdown').textContent.split(':').map(Number);
      const remaining = minutes * 60 + seconds;
      return remaining > 0 && remaining < 60;
    }, null, { timeout: 5000, polling: 100 });
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
    await page.waitForFunction(() => document.querySelector('.buddy').dataset.effect === 'dragon-end', null, { timeout: 3000 });
    await page.waitForFunction(() => Number(getComputedStyle(document.querySelector('.dragon-fire')).opacity) > .8, null, { timeout: 1500 });
    await page.screenshot({ path: path.join(output, 'pomodoro-caraxes-fire.png') });
    await page.waitForFunction(() => document.querySelector('#status').textContent.includes('Session saved'), null, { timeout: 10000 });
    const logPath = packaged ? path.join(validConfig.logFolder, 'Log.md') : path.join(temp, 'Personal Tools', 'Pomodoro', 'Log.md');
    const first = await fs.readFile(logPath, 'utf8');
    assert.match(first, /film prep/);
    assert.match(first, /\*\*Planned:\*\* 1 minute/);
    assert.match(first, /\*\*Date:\*\* \d{4}-\d\d-\d\d/);
    assert.match(first, /\*\*Completed:\*\* \d{4}-/);
    assert.equal((first.match(/pomodoro-session:/g) || []).length, 1);
    const journals = (await fs.readdir(path.dirname(logPath))).filter(name => /^\d{4}-\d\d-\d\d\.md$/.test(name));
    const activity = (await Promise.all(journals.map(name => fs.readFile(path.join(path.dirname(logPath), name), 'utf8')))).join('\n');
    for (const kind of ['started', 'paused', 'resumed', 'completed']) assert.match(activity, new RegExp(` · ${kind}:`));
    await page.waitForFunction(() => document.querySelector('#completion-sound').currentTime > 0, null, { timeout: 3000 });
    const sound = await page.locator('#completion-sound').evaluate(audio => ({ error: audio.error?.message, time: audio.currentTime }));
    assert.ok(!sound.error && sound.time > 0, JSON.stringify(sound));
    console.log('Completed session logged and chime played. Checking restart recovery…');
    await openSettings(page);
    await page.locator('#start').click();
    await new Promise(resolve => setTimeout(resolve, 1100));
    await openSettings(page);
    await Promise.all([page.waitForEvent('close'), page.locator('#close').click().catch(error => {
      if (!/Target.*closed/.test(error.message)) throw error;
    })]);
    // Disconnect the debugger so Electron can finish its normal shutdown.
    await app.close();
    app = null;
    page = await launch();
    await page.waitForFunction(() => document.querySelector('#mode').textContent === 'TAKE A BREATH');
    await openSettings(page);
    assert.equal(await page.locator('.buddy-card[data-buddy="caraxes"]').getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('#animation-mode').inputValue(), 'system');
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
    await fs.writeFile(config, JSON.stringify(validConfig));
    await page.locator('#retry').click();
    await page.waitForFunction(() => document.querySelector('#status').textContent.includes('Session saved'));
    const appended = await fs.readFile(logPath, 'utf8');
    assert.ok(appended.startsWith(first));
    assert.match(appended, /Focus session/);
    assert.equal((appended.match(/pomodoro-session:/g) || []).length, 2);
    await page.evaluate(() => window.pomodoro.retrySave());
    assert.equal(await fs.readFile(logPath, 'utf8'), appended);
    await page.screenshot({ path: path.join(output, 'pomodoro-timer.png') });
    assert.deepEqual(errors, []);
    await page.locator('#dismiss-settings').click();
    console.log('PASS: all 15 avatars, dial hover/keyboard selection, magical transitions, reduced motion, Caraxes start/end animations, dragging, always-on-top, countdown, pause/resume/reset, chime, append-only logging, retry, and restart/theme persistence.');
    console.log('Test vault:', temp);
  } catch (error) {
    console.error('Electron process:', { exitCode: app?.process().exitCode, nativeOutput });
    const page = app?.windows()[0];
    if (page && !page.isClosed()) {
      console.error('UI state:', await page.evaluate(() => ({ text: document.querySelector('#status').textContent,
        countdown: document.querySelector('#countdown').textContent, minutes: document.querySelector('#minutes').value,
        label: document.querySelector('#label').value, height: innerHeight,
        settingsHidden: document.querySelector('#settings-panel').hidden, dialOpen: document.querySelector('#buddy-dial').open })));
      console.error('Timer state:', await page.evaluate(() => window.pomodoro.getState()));
      await page.screenshot({ path: path.join(output, 'pomodoro-timer-debug.png') });
    }
    throw error;
  } finally {
    if (app) await app.close().catch(() => {});
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
