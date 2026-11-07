const { chromium } = require('playwright');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { setTimeout: delay } = require('node:timers/promises');

(async () => {
  const root = path.resolve(__dirname, '..');
  const source = process.argv.includes('--source');
  const packagedExecutable = process.platform === 'win32' ? path.join(root, 'dist', 'win-unpacked', 'PomoBuddies.exe')
    : process.platform === 'darwin' ? path.join(root, 'dist', process.arch === 'arm64' ? 'mac-arm64' : 'mac', 'PomoBuddies.app', 'Contents', 'MacOS', 'PomoBuddies')
    : path.join(root, 'dist', 'linux-unpacked', 'pomobuddies');
  const executable = source ? require('electron') : process.argv[2] || packagedExecutable;
  await fs.access(executable);
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'pomodoro-animations-'));
  const config = path.join(temp, 'config.json');
  const logFolder = path.join(temp, 'Logs');
  await fs.writeFile(config, JSON.stringify({ logFolder }));
  const server = net.createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  const env = { ...process.env, POMODORO_DATA_DIR: temp, POMODORO_CONFIG_PATH: config };
  delete env.ELECTRON_RUN_AS_NODE;
  // Launch normally: Playwright's Electron launcher disables native occlusion and backgrounding.
  const child = spawn(executable, [`--remote-debugging-port=${port}`, ...(source ? ['.'] : [])], { cwd: root, env, windowsHide: true });
  let browser, page;
  let nativeOutput = '';
  child.stderr.on('data', data => { nativeOutput = (nativeOutput + data).slice(-4000); });
  child.on('exit', (code, signal) => { nativeOutput += `\nNative process exited: code=${code}, signal=${signal}`; });
  child.stdout.resume();
  const errors = [];
  try {
    for (let i = 0; i < 100; i++) {
      try { if ((await fetch(`http://127.0.0.1:${port}/json/version`)).ok) break; }
      catch {}
      await delay(100);
    }
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`, { noDefaults: true });
    const context = browser.contexts()[0];
    page = context.pages()[0] || await context.waitForEvent('page');
    page.on('pageerror', error => errors.push(error.message));
    await page.waitForFunction(() => Boolean(document.body.dataset.state));
    await page.evaluate(() => window.pomodoro.setPosition(100, 100));
    assert.equal(await page.locator('#animation-mode').inputValue(), 'full');
    assert.equal(await page.locator('body').getAttribute('data-motion'), 'full');
    console.log('Native Windows/system reduced motion:', await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches));
    await page.evaluate(() => { document.querySelector('#completion-sound').muted = true; });
    assert.deepEqual(await page.evaluate(async () => {
      const smoke = new Image();
      smoke.src = new URL('assets/avatar-smoke.png', location.href).href;
      await smoke.decode();
      return [smoke.naturalWidth, smoke.naturalHeight];
    }), [132, 100], 'The packaged smoke texture must load');

    const openSettings = async () => {
      if (await page.locator('#settings-panel').isHidden()) await page.locator('#settings-toggle').click();
      await page.waitForFunction(() => innerHeight === 600);
    };
    const select = async avatar => {
      await openSettings();
      await page.locator('#dial-toggle').click();
      await page.locator(`.buddy-card[data-buddy="${avatar}"]`).click();
      await page.waitForFunction(() => !document.querySelector('.buddy').dataset.effect);
    };
    const observe = async (effect, trigger, motif) => {
      await page.evaluate(effect => {
        window.effectFrames = [];
        window.effectDone = false;
        let seen = false;
        const sample = () => {
          const buddy = document.querySelector('.buddy');
          if (buddy.dataset.effect === effect) {
            seen = true;
            const css = selector => getComputedStyle(buddy.querySelector(selector));
            window.effectFrames.push({ sprite: css('.sprite').transform, wing: css('.dragon-wing-left').transform,
              smoke: Number(css('.smoke-cloud').opacity), fire: Number(css('.dragon-fire').opacity) });
          } else if (seen) { window.effectDone = true; return; }
          requestAnimationFrame(sample);
        };
        requestAnimationFrame(sample);
      }, effect);
      await trigger();
      if (motif) {
        await page.waitForFunction(selector => Number(getComputedStyle(document.querySelector(selector)).opacity) > .5, motif, { timeout: 4000 });
      }
      await page.waitForFunction(() => window.effectDone, null, { timeout: 6000 });
      const frames = await page.evaluate(() => window.effectFrames);
      assert.ok(frames.length >= 8, `${effect} must advance through visible frames`);
      const movement = effect === 'dragon-end' ? 'wing' : 'sprite';
      assert.ok(new Set(frames.map(frame => frame[movement])).size >= 5, `${effect} must visibly move`);
      if (effect === 'transform') assert.ok(Math.max(...frames.map(frame => frame.smoke)) > .5);
      if (effect === 'dragon-end') assert.ok(Math.max(...frames.map(frame => frame.fire)) > .5);
      return frames.length;
    };
    const suspendEffect = async milliseconds => {
      await page.evaluate(() => {
        window.delayedAnimations = document.querySelector('.buddy').getAnimations({ subtree: true });
        window.delayedAnimations.forEach(animation => { animation.pause(); animation.currentTime = 0; });
      });
      await delay(milliseconds);
      assert.ok(await page.locator('.buddy').getAttribute('data-effect'), 'A delayed repaint must not discard an effect');
      await page.evaluate(() => window.delayedAnimations.forEach(animation => animation.play()));
    };

    await openSettings();
    await page.locator('#dial-toggle').click();
    await observe('transform', async () => {
      await page.evaluate(() => document.querySelector('.buddy-card[data-buddy="luna"]').click());
      await suspendEffect(1000);
    }, '.smoke-cloud');
    // On must keep the effects visible even when the OS requests reduced motion.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.locator('#dial-toggle').click();
    await page.locator('.buddy-card[data-buddy="luna"]').press('ArrowRight');
    await page.waitForFunction(() => !document.querySelector('.buddy').dataset.effect);
    await observe('transform', () => page.keyboard.press('Enter'), '.smoke-cloud');

    const motifs = { cat: '.session-hearts', dog: '.session-hearts', avocado: '.session-hearts', tomato: '.session-hearts',
      ben10: '.session-sparks', fourarms: '.session-ripple', harry: '.session-sparks', hedwig: '.owl-wings',
      pikachu: '.session-lightning', captain: '.session-shield', hulk: '.session-ripple', ironman: '.session-thrusters',
      luna: '.session-moon', niklaus: '.session-bats' };
    for (const [avatar, motif] of Object.entries(motifs)) {
      await select(avatar);
      const start = await observe('session-start', () => page.evaluate(async () => {
        render({ ...await window.pomodoro.getState(), status: 'running' });
      }));
      const end = await observe('session-end', () => page.evaluate(async () => {
        // Exercise completion rendering without waiting fourteen additional minutes.
        render({ ...await window.pomodoro.getState(), status: 'complete', remainingSeconds: 0, saved: true, id: crypto.randomUUID() });
      }), motif);
      await page.evaluate(async () => render(await window.pomodoro.getState()));
      console.log(`${avatar}: start ${start} frames, completion ${end} frames`);
    }

    await select('caraxes');
    await page.locator('#minutes').fill('1');
    await page.locator('#label').fill('normal launch animation check');
    await observe('dragon-start', async () => {
      await page.locator('#start').click();
      await page.waitForFunction(() => document.querySelector('.buddy').dataset.effect === 'dragon-start');
      await suspendEffect(2000);
      await openSettings();
      await page.locator('#pause').click();
      await page.locator('#start').click();
      assert.equal(await page.locator('.buddy').getAttribute('data-effect'), 'dragon-start', 'An interrupted start must not clear the resume animation');
    });
    await openSettings();
    await page.locator('#pause').click();
    await observe('dragon-start', () => page.locator('#start').click());
    console.log('Checking Caraxes completion with a real one-minute countdown…');
    await page.waitForFunction(() => /^00:0[1-3]$/.test(document.querySelector('#countdown').textContent), null, { timeout: 65000, polling: 100 });
    await observe('dragon-end', () => page.waitForFunction(() => document.body.dataset.state === 'complete'), '.dragon-fire');
    await page.waitForFunction(() => document.querySelector('#status').textContent.includes('Session saved'));
    const log = await fs.readFile(path.join(logFolder, 'Log.md'), 'utf8');
    assert.equal((log.match(/pomodoro-session:/g) || []).length, 1);
    assert.match(log, /normal launch animation check/);

    await openSettings();
    await page.locator('#animation-mode').selectOption('system');
    await page.waitForFunction(() => document.body.dataset.motion === 'reduced');
    await select('luna');
    await page.evaluate(async () => render({ ...await window.pomodoro.getState(), status: 'running' }));
    assert.equal(await page.locator('.buddy').getAttribute('data-effect'), null);
    assert.equal(await page.evaluate(() => document.getAnimations().length), 0);
    assert.deepEqual(await page.evaluate(() => [document.documentElement, document.body].map(element => getComputedStyle(element).backgroundColor)), ['rgba(0, 0, 0, 0)', 'rgba(0, 0, 0, 0)']);
    assert.equal(await page.locator('.session-effect').evaluateAll(effects => effects.every(effect => getComputedStyle(effect).opacity === '0')), true);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.waitForFunction(() => document.body.dataset.motion === 'full');
    await openSettings();
    await page.locator('#animation-mode').selectOption('reduced');
    await select('cat');
    assert.equal(await page.locator('.buddy').getAttribute('data-effect'), null);
    assert.equal(await page.evaluate(() => document.getAnimations().length), 0);
    assert.deepEqual(errors, []);
    console.log('PASS: native launch without browser preference overrides, visible smoke and all avatar start/end effects with system reduced motion, Caraxes countdown/resume/fire, logging, transparency, Follow system, and Off.');
    console.log('Isolated test data:', temp);
  } catch (error) {
    console.error(nativeOutput);
    throw error;
  } finally {
    if (page && !page.isClosed()) await page.evaluate(() => window.pomodoro.close()).catch(() => {});
    if (browser) await browser.close().catch(() => {});
    if (child.exitCode === null) {
      await Promise.race([new Promise(resolve => child.once('exit', resolve)), delay(3000)]);
      if (child.exitCode === null) child.kill();
    }
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
