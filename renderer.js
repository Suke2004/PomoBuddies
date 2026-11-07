const $ = id => document.getElementById(id);
const buddies = [
  { id: 'cat', name: 'Cat', series: 'Cozy crew' },
  { id: 'dog', name: 'Puppy', series: 'Cozy crew' },
  { id: 'avocado', name: 'Avocado', series: 'Cozy crew' },
  { id: 'tomato', name: 'Tomato', series: 'Cozy crew' },
  { id: 'ben10', name: 'Ben', series: 'Ben 10' },
  { id: 'fourarms', name: 'Four Arms', series: 'Ben 10' },
  { id: 'harry', name: 'Harry', series: 'Harry Potter' },
  { id: 'hedwig', name: 'Hedwig', series: 'Harry Potter' },
  { id: 'pikachu', name: 'Pikachu', series: 'Pokémon' },
  { id: 'captain', name: 'Captain America', series: 'Avengers' },
  { id: 'hulk', name: 'Hulk', series: 'Avengers' },
  { id: 'ironman', name: 'Iron Man', series: 'Avengers' },
  { id: 'luna', name: 'Luna Lovegood', series: 'Harry Potter' },
  { id: 'niklaus', name: 'Niklaus', series: 'The Originals' },
  { id: 'caraxes', name: 'Caraxes', series: 'House of the Dragon' }
];
const themes = buddies.map(buddy => buddy.id);
let state;
let pending = false;
let initialized = false;
let transportError = '';
let effectRun = 0;
const systemMotion = matchMedia('(prefers-reduced-motion: reduce)');
async function playEffect(effect) {
  const buddy = document.querySelector('.buddy');
  const run = ++effectRun;
  delete buddy.dataset.effect;
  if (document.body.dataset.motion === 'reduced') return;
  void buddy.offsetWidth;
  buddy.dataset.effect = effect;
  // A Windows repaint can delay the animation past a fixed timeout.
  await Promise.allSettled(buddy.getAnimations({ subtree: true }).map(animation => animation.finished));
  if (run === effectRun) delete buddy.dataset.effect;
}
function paintAvatar(svg, value) {
  svg.querySelectorAll('.character').forEach(character => {
    character.style.display = character.classList.contains(value) ? 'initial' : 'none';
  });
  svg.querySelector('.features').style.display = ['cat', 'dog', 'tomato'].includes(value) ? 'initial' : 'none';
}
for (const [index, buddy] of buddies.entries()) {
  const card = document.createElement('button');
  card.type = 'button';
  card.className = 'buddy-card';
  card.dataset.buddy = buddy.id;
  card.dataset.theme = buddy.id;
  const angle = (index / buddies.length * 2 * Math.PI) - Math.PI / 2;
  card.style.left = `${50 + 40 * Math.cos(angle)}%`;
  card.style.top = `${50 + 40 * Math.sin(angle)}%`;
  card.title = `${buddy.name} — ${buddy.series}`;
  card.setAttribute('aria-label', `${buddy.name}, ${buddy.series}`);
  const preview = document.querySelector('.sprite').cloneNode(true);
  preview.setAttribute('class', 'buddy-preview');
  paintAvatar(preview, buddy.id);
  card.prepend(preview);
  card.addEventListener('pointerenter', () => previewBuddy(buddy.id));
  card.addEventListener('focus', () => previewBuddy(buddy.id));
  card.addEventListener('click', () => selectBuddy(buddy.id));
  document.querySelector('.buddy-picker').append(card);
}
const stage = document.querySelector('.sprite').cloneNode(true);
stage.setAttribute('class', 'stage-avatar');
$('stage-preview').append(stage);

function stored(key, value) {
  try {
    if (value === undefined) return localStorage.getItem(key);
    localStorage.setItem(key, value);
  } catch { /* The timer still works when browser storage is unavailable. */ }
}
function applyMotion() {
  const choice = $('animation-mode').value;
  document.body.dataset.motion = choice === 'system' ? (systemMotion.matches ? 'reduced' : 'full') : choice;
  if (document.body.dataset.motion === 'reduced') {
    ++effectRun;
    delete document.querySelector('.buddy').dataset.effect;
    document.getAnimations().forEach(animation => animation.cancel());
  }
}
const savedMotion = stored('pomodoro-motion');
$('animation-mode').value = ['full', 'system', 'reduced'].includes(savedMotion) ? savedMotion : 'full';
$('animation-mode').addEventListener('change', () => {
  stored('pomodoro-motion', $('animation-mode').value);
  applyMotion();
});
systemMotion.addEventListener('change', applyMotion);
applyMotion();
function previewBuddy(value) {
  const buddy = buddies.find(buddy => buddy.id === value);
  paintAvatar(stage, value);
  $('confirm-buddy').dataset.theme = value;
  $('confirm-buddy').dataset.buddy = value;
  $('confirm-buddy').setAttribute('aria-label', `Select ${buddy.name}`);
  $('buddy-name').textContent = buddy.name;
  $('buddy-series').textContent = buddy.series;
  if ($('buddy-dial').open && document.body.dataset.motion !== 'reduced') {
    stage.getAnimations().forEach(animation => animation.cancel());
    stage.animate([{ opacity: .2, transform: 'translateY(4px)', filter: 'brightness(2)' },
      { opacity: 1, transform: 'translateY(0)', filter: 'brightness(1)' }], { duration: 220, easing: 'ease-out' });
  }
}
function theme(value, animate = true) {
  value = { orange: 'tomato', blue: 'dog' }[value] || value;
  if (!themes.includes(value)) value = 'avocado';
  const changed = document.body.dataset.theme !== value;
  document.body.dataset.theme = value;
  paintAvatar(document.querySelector('.sprite'), value);
  previewBuddy(value);
  const buddy = buddies.find(buddy => buddy.id === value);
  $('selected-buddy-name').textContent = buddy.name;
  $('dial-toggle').setAttribute('aria-label', `Open avatar dial, current buddy: ${buddy.name}`);
  document.querySelectorAll('.buddy-card').forEach(card => {
    const selected = card.dataset.buddy === value;
    card.setAttribute('aria-pressed', String(selected));
    card.tabIndex = selected ? 0 : -1;
  });
  stored('pomodoro-theme', value);
  if (changed && animate) playEffect('transform');
}
function selectBuddy(value) {
  showDial(false);
  theme(value, false);
  playEffect('transform');
}
function showDial(open) {
  const dial = $('buddy-dial');
  $('dial-toggle').setAttribute('aria-expanded', String(open));
  if (open && !dial.open) {
    previewBuddy(document.body.dataset.theme);
    dial.showModal();
    document.querySelector('.buddy-card[aria-pressed="true"]').focus();
  } else if (!open && dial.open) {
    dial.close();
    $('dial-toggle').focus();
  }
}
function cycleBuddy(direction) {
  theme(themes[(themes.indexOf(document.body.dataset.theme) + direction + themes.length) % themes.length]);
}
$('previous-buddy').addEventListener('click', () => cycleBuddy(-1));
$('next-buddy').addEventListener('click', () => cycleBuddy(1));
$('dial-toggle').addEventListener('click', () => showDial(true));
$('dismiss-dial').addEventListener('click', () => showDial(false));
$('confirm-buddy').addEventListener('click', () => selectBuddy($('confirm-buddy').dataset.buddy));
$('buddy-dial').addEventListener('cancel', event => { event.preventDefault(); showDial(false); });
$('buddy-dial').addEventListener('click', event => { if (event.target === $('buddy-dial')) showDial(false); });
document.querySelector('.orbital-dial').addEventListener('pointerleave', () => previewBuddy(document.body.dataset.theme));
document.querySelector('.buddy-picker').addEventListener('keydown', event => {
  if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();
  if (event.key === 'Home' || event.key === 'End') theme(themes[event.key === 'Home' ? 0 : themes.length - 1]);
  else cycleBuddy(['ArrowRight', 'ArrowDown'].includes(event.key) ? 1 : -1);
  document.querySelector('.buddy-card[aria-pressed="true"]').focus();
});
theme(stored('pomodoro-theme'), false);

function showSettings(open) {
  if (!open) showDial(false);
  $('settings-panel').hidden = !open;
  $('settings-toggle').setAttribute('aria-expanded', String(open));
  window.pomodoro.resize(open ? 600 : 340).catch(() => {});
}
$('settings-toggle').addEventListener('click', () => showSettings($('settings-panel').hidden));
$('dismiss-settings').addEventListener('click', () => { showSettings(false); $('settings-toggle').focus(); });
document.addEventListener('keydown', event => {
  if (event.key !== 'Escape') return;
  event.preventDefault();
  if ($('buddy-dial').open) showDial(false);
  else { showSettings(false); $('settings-toggle').focus(); }
});

function render(next) {
  if (next.status === 'running' && state?.status !== 'running') {
    showSettings(false);
    playEffect(document.body.dataset.theme === 'caraxes' ? 'dragon-start' : 'session-start');
  }
  state = next;
  const active = state.status === 'running' || state.status === 'paused';
  const unsaved = state.status === 'complete' && !state.saved;
  if (!initialized || active) {
    $('minutes').value = state.minutes;
    $('label').value = state.label;
  }
  const preview = Number($('minutes').value);
  const remaining = state.status === 'idle' && Number.isInteger(preview) && preview >= 1 && preview <= 240
    ? preview * 60 : state.remainingSeconds;
  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  $('countdown').textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  $('mode').textContent = { idle: 'READY TO FOCUS', running: 'FOCUS IN PROGRESS', paused: 'TAKE A BREATH', complete: 'SESSION COMPLETE' }[state.status];
  $('current-label').textContent = state.label || (active ? 'Focus session' : 'One thing at a time.');
  $('current-label').title = $('current-label').textContent;
  $('progress').max = state.minutes * 60;
  $('progress').value = state.status === 'idle' ? 0 : state.minutes * 60 - state.remainingSeconds;
  $('countdown').style.fontSize = remaining >= 6000 ? '26px' : '';
  $('countdown').closest('.display').style.setProperty('--elapsed', `${100 * $('progress').value / $('progress').max}%`);
  document.body.dataset.state = state.status;
  $('start').textContent = state.status === 'paused' ? 'Resume' : state.status === 'complete' ? 'Start again' : 'Start';
  $('start').disabled = pending || state.status === 'running' || unsaved;
  $('pause').disabled = pending || state.status !== 'running';
  $('reset').disabled = pending || unsaved;
  $('minutes').disabled = active || pending || unsaved;
  $('label').disabled = active || pending || unsaved;
  $('duration-slider').disabled = $('minutes').disabled;
  $('duration-slider').value = Number.isInteger(preview) && preview >= 1 && preview <= 240 ? preview : 25;
  $('duration-slider').style.setProperty('--fill', `${100 * ($('duration-slider').value - 1) / 239}%`);
  document.querySelector('.duration-stepper').style.setProperty('--dial-angle', `${Number($('duration-slider').value) * 1.5}deg`);
  document.querySelectorAll('.presets button, .duration-stepper button').forEach(button => {
    button.disabled = $('minutes').disabled;
    if (button.dataset.minutes) button.setAttribute('aria-pressed', String(Number(button.dataset.minutes) === preview));
  });
  initialized = true;
  $('retry').hidden = !unsaved || !state.error;
  $('retry').disabled = pending || state.logging;
  $('status').classList.toggle('error', Boolean(state.error || transportError));
  $('status').textContent = state.error || transportError || (state.logging ? 'Saving your session…'
    : state.status === 'complete' ? 'Well done. Session saved.'
    : state.status === 'paused' ? 'Paused. Resume when you’re ready.'
    : state.status === 'running' ? 'You’ve got this. Keep going.' : 'Sessions save to your log folder.');
  $('status').title = state.logPath || '';
  $('settings-toggle').dataset.error = String(Boolean(state.error || transportError));
  $('settings-toggle').title = state.error || transportError || 'Timer settings';
  if (state.status === 'complete' && stored('pomodoro-sounded-session') !== state.id) {
    stored('pomodoro-sounded-session', state.id);
    const audio = $('completion-sound');
    audio.currentTime = 0;
    audio.play().catch(() => {});
    playEffect(document.body.dataset.theme === 'caraxes' ? 'dragon-end' : 'session-end');
    if (document.body.dataset.motion !== 'reduced') {
      $('countdown').animate([{ transform: 'translateY(0)' }, { transform: 'translateY(-3px)' },
        { transform: 'translateY(0)' }], { duration: 420, easing: 'ease-in-out' });
    }
  }
}
async function action(callback) {
  if (pending) return;
  transportError = '';
  pending = true;
  if (state) render(state);
  try { render(await callback()); }
  catch (error) { transportError = error.message; }
  finally { pending = false; if (state) render(state); }
}
$('timer-form').addEventListener('submit', event => {
  event.preventDefault();
  if ($('timer-form').reportValidity()) action(() => window.pomodoro.start(Number($('minutes').value), $('label').value));
});
$('pause').addEventListener('click', () => action(() => window.pomodoro.pause()));
$('reset').addEventListener('click', () => action(() => window.pomodoro.reset()));
$('minutes').addEventListener('input', () => { if (state?.status === 'idle') render(state); });
function setMinutes(value) {
  if ($('minutes').disabled) return;
  $('minutes').value = Math.max(1, Math.min(240, value));
  render(state);
}
$('less-time').addEventListener('click', () => setMinutes((Number($('minutes').value) || 25) - 5));
$('more-time').addEventListener('click', () => setMinutes((Number($('minutes').value) || 25) + 5));
$('duration-slider').addEventListener('input', event => setMinutes(Number(event.target.value)));
document.querySelectorAll('[data-minutes]').forEach(button => button.addEventListener('click', () => setMinutes(Number(button.dataset.minutes))));
$('retry').addEventListener('click', () => action(() => window.pomodoro.retrySave()));
$('close').addEventListener('click', () => window.pomodoro.close());
// Use pointer movement because native drag regions can fail on transparent Windows windows.
for (const handle of document.querySelectorAll('.sprite')) {
  let drag;
  handle.addEventListener('pointerdown', async event => {
    if (event.button !== 0) return;
    handle.setPointerCapture(event.pointerId);
    const current = { screenX: event.screenX, screenY: event.screenY };
    drag = current;
    try { current.position = await window.pomodoro.getPosition(); }
    catch { drag = null; }
  });
  handle.addEventListener('pointermove', event => {
    if (!drag?.position) return;
    window.pomodoro.setPosition(Math.round(drag.position[0] + event.screenX - drag.screenX),
      Math.round(drag.position[1] + event.screenY - drag.screenY)).catch(() => {});
  });
  handle.addEventListener('lostpointercapture', () => { drag = null; });
}
window.pomodoro.onState(render);
window.pomodoro.getState().then(render).catch(error => { $('status').textContent = `Could not load timer: ${error.message}`; });
