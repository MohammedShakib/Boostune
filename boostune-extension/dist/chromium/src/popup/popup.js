// ─────────────────────────────────────────────────────────────
//  Boostune — Popup Controller
//
//  Responsibilities:
//   • Query current tab and display its info
//   • Send messages to SW for all audio operations
//   • Render real-time state (volume, status, sessions)
//   • Display real playing tabs (tabs with audible:true)
//   • Handle all UI interactions with proper debouncing
// ─────────────────────────────────────────────────────────────

import { MSG, CAPTURE_STATE, VOLUME } from '../core/shared/constants.js';
import { clamp, isUnsupportedUrl, getDomain, truncate, debounce, formatVolume } from '../core/shared/utils.js';
import { getPrefs, updatePrefs } from '../core/storage/storage.js';
import { platformApi } from '../core/api.js';

// ── DOM refs ───────────────────────────────────────────────────

const $ = (id) => document.getElementById(id);

const onboardingEl     = $('onboarding');
const mainUiEl         = $('mainUi');
const powerToggleEl    = $('powerToggle');
const powerLabelEl     = $('powerLabel');
const settingsBtnEl    = $('settingsBtn');
const errorBannerEl    = $('errorBanner');
const errorMessageEl   = $('errorMessage');
const tabFaviconWrapEl = $('tabFaviconWrap');
const tabTitleEl       = $('tabTitle');
const tabDomainEl      = $('tabDomain');
const statusPillEl     = $('statusPill');
const currentTabCardEl = $('currentTabCard');
const volumeNumberEl   = $('volumeNumber');
const volumeSliderEl   = $('volumeSlider');
const volumeMidLabelEl = $('volumeMidLabel');
const volumeMaxLabelEl = $('volumeMaxLabel');
const volDownEl        = $('volDown');
const volUpEl          = $('volUp');
const safeBoostCardEl  = $('safeBoostCard');
const safeBoostToggleEl= $('safeBoostToggle');
const playingTabsListEl= $('playingTabsList');
const playingCountEl   = $('playingCount');
const headerLogoEl     = $('headerLogo');
const versionLabelEl   = $('versionLabel');
const footerSettingsEl = $('footerSettings');
const footerPrivacyEl  = $('footerPrivacy');
const onboardingDoneEl = $('onboardingDone');

// ── State ──────────────────────────────────────────────────────

let currentTabId   = null;
let currentSession = null; // SessionRecord from SW
let prefs          = {};
let _sliderDragging = false;
let _listeningForRuntimeMessages = false;

// ── Init ──────────────────────────────────────────────────────

async function init() {
  // Show version
  try {
    const manifest = platformApi.runtime.getManifest();
    versionLabelEl.textContent = `v${manifest.version}`;
  } catch (err) {
    console.warn('[Boostune] Could not read manifest version', err);
  }

  // Load preferences
  prefs = await getPrefs().catch((err) => {
    console.warn('[Boostune] Falling back to default preferences', err);
    return {};
  });
  applyVolumeLimit();
  renderState();

  // Older builds could persist this as false. Do not block the popup shell:
  // toolbar clicks must always show controls immediately.
  if (!prefs.onboardingCompleted) {
    prefs.onboardingCompleted = true;
    updatePrefs({ onboardingCompleted: true }).catch((err) => {
      console.warn('[Boostune] Could not mark onboarding complete', err);
    });
  }

  // Get current tab
  const [tab] = await platformApi.tabs.query({ active: true, currentWindow: true }).catch((err) => {
    console.warn('[Boostune] Could not query active tab', err);
    return [];
  });
  if (!tab) {
    renderUnavailableTab();
    showError("Boostune couldn't detect the current tab.");
    await safeRefreshPlayingTabs();
    startRuntimeListener();
    return;
  }

  currentTabId = tab.id;
  renderTabInfo(tab);

  // Check if page is unsupported
  if (isUnsupportedUrl(tab.url)) {
    showError("Boostune can't control audio on this browser page.");
    disableControls();
    await safeRefreshPlayingTabs();
    startRuntimeListener();
    return;
  }

  // Fetch current session state from SW
  try {
    const res = await sw(MSG.BOOST_GET_STATE, { tabId: currentTabId });
    if (res?.success && res.state) {
      currentSession = res.state;
    }
  } catch (err) {
    console.warn('[Boostune] Could not read current boost state', err);
  }

  renderState();
  await safeRefreshPlayingTabs();

  // Listen for real-time state changes from SW
  startRuntimeListener();
}

// ── Onboarding ────────────────────────────────────────────────

function showOnboarding() {
  onboardingEl.classList.remove('hidden');
  mainUiEl.classList.add('hidden');
}

onboardingDoneEl.addEventListener('click', async () => {
  await updatePrefs({ onboardingCompleted: true });
  prefs.onboardingCompleted = true;
  onboardingEl.classList.add('hidden');
  mainUiEl.classList.remove('hidden');
  init();
});

// ── Render helpers ────────────────────────────────────────────

function renderTabInfo(tab) {
  tabTitleEl.textContent  = truncate(tab.title || 'Untitled', 40);
  tabDomainEl.textContent = getDomain(tab.url) || tab.url || '—';

  // Favicon
  tabFaviconWrapEl.innerHTML = '';
  if (tab.favIconUrl) {
    const img = document.createElement('img');
    img.src     = tab.favIconUrl;
    img.alt     = '';
    img.className = 'tab-card__favicon';
    img.onerror = () => { img.replaceWith(defaultFavicon()); };
    tabFaviconWrapEl.className = 'tab-card__favicon';
    tabFaviconWrapEl.appendChild(img);
  } else {
    tabFaviconWrapEl.className = 'tab-card__favicon tab-card__favicon--placeholder';
    tabFaviconWrapEl.appendChild(defaultFavicon());
  }
}

function renderUnavailableTab() {
  tabTitleEl.textContent = 'Boostune is ready';
  tabDomainEl.textContent = 'Play audio to start boosting.';
  tabFaviconWrapEl.innerHTML = '';
  tabFaviconWrapEl.className = 'tab-card__favicon tab-card__favicon--placeholder';
  tabFaviconWrapEl.appendChild(defaultFavicon());
}

function defaultFavicon() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '16');
  svg.setAttribute('height', '16');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.innerHTML = '<circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>';
  return svg;
}

function renderState() {
  const state    = currentSession?.captureState || CAPTURE_STATE.IDLE;
  const volume   = currentSession?.volume       ?? 100;
  const enabled  = currentSession?.enabled      ?? false;
  const safeBoost= currentSession?.safeBoost    ?? prefs.safeBoost ?? true;

  // Power toggle
  const isActive = state === CAPTURE_STATE.ACTIVE;
  powerToggleEl.classList.toggle('active', isActive);
  powerToggleEl.setAttribute('aria-pressed', String(isActive));
  powerLabelEl.textContent = isActive ? 'Active' : (state === CAPTURE_STATE.STARTING ? 'Starting…' : 'Inactive');

  // Status pill
  renderStatusPill(state);

  // Current tab card highlight
  currentTabCardEl.classList.toggle('tab-card--active', isActive);

  // Volume display
  setVolumeUI(volume, false);

  // Safe boost
  safeBoostToggleEl.checked = safeBoost;
  safeBoostCardEl.classList.toggle('active', safeBoost);

  // Error banner
  if (state === CAPTURE_STATE.ERROR) {
    showError('Boostune lost the audio session. Click the toggle to resume.');
  } else {
    hideError();
  }
}

function getMaxVolume() {
  const max = Number(prefs.maxVolume);
  return clamp(Number.isFinite(max) ? max : VOLUME.MAX, VOLUME.MIN, VOLUME.MAX);
}

function clampToUserVolumeLimit(volume) {
  const parsed = Number(volume);
  return clamp(Number.isFinite(parsed) ? parsed : VOLUME.DEFAULT, VOLUME.MIN, getMaxVolume());
}

function applyVolumeLimit() {
  const max = getMaxVolume();
  const midpoint = Math.round(max / 2 / VOLUME.STEP) * VOLUME.STEP;

  volumeSliderEl.max = String(max);
  volumeSliderEl.setAttribute('aria-valuemax', String(max));
  if (volumeMidLabelEl) volumeMidLabelEl.textContent = `${midpoint}%`;
  if (volumeMaxLabelEl) volumeMaxLabelEl.textContent = `${max}%`;

  document.querySelectorAll('.preset-btn').forEach((btn) => {
    const presetVolume = parseInt(btn.dataset.vol, 10);
    btn.disabled = presetVolume > max;
    btn.hidden = presetVolume > max;
  });
}

function renderStatusPill(state) {
  const map = {
    [CAPTURE_STATE.IDLE]:     ['status-pill--idle',     'Idle'],
    [CAPTURE_STATE.STARTING]: ['status-pill--starting', 'Starting…'],
    [CAPTURE_STATE.ACTIVE]:   ['status-pill--boosting', 'Boosting'],
    [CAPTURE_STATE.STOPPING]: ['status-pill--idle',     'Stopping…'],
    [CAPTURE_STATE.ERROR]:    ['status-pill--error',    'Error — Click Resume'],
  };
  const [cls, label] = map[state] || ['status-pill--idle', 'Idle'];
  statusPillEl.className = `status-pill ${cls}`;
  statusPillEl.textContent = label;
}

/** Update slider, number display, fill, and ARIA attributes. */
function setVolumeUI(volume, animate = true) {
  const v = clampToUserVolumeLimit(volume);

  if (!_sliderDragging) {
    volumeSliderEl.value = v;
  }

  volumeNumberEl.textContent = v;
  volumeNumberEl.setAttribute('aria-valuenow', v);

  // Update slider fill via CSS custom property
  const pct = getMaxVolume() === 0 ? 0 : (v / getMaxVolume()) * 100;
  volumeSliderEl.style.setProperty('--fill', `${pct}%`);

  // Highlight matching preset button
  document.querySelectorAll('.preset-btn').forEach((btn) => {
    const bv = parseInt(btn.dataset.vol, 10);
    btn.classList.toggle('preset-btn--active', bv === v);
  });
}

// ── Playing Tabs ──────────────────────────────────────────────

async function refreshPlayingTabs() {
  // Real audible tabs from Chrome
  const audibleTabs = await platformApi.tabs.query({ audible: true }).catch((err) => {
    console.warn('[Boostune] Could not query audible tabs', err);
    return [];
  });

  // Get all Boostune session states
  let allStates = {};
  try {
    const res = await sw(MSG.BOOST_GET_ALL_STATES, {});
    if (res?.success) allStates = res.states || {};
  } catch {}

  // Build the list: audible tabs + any Boostune-active tabs
  const tabSet = new Map();
  for (const t of audibleTabs) tabSet.set(t.id, t);

  // Also include Boostune-active tabs even if not currently audible
  const activeIds = Object.entries(allStates)
    .filter(([, s]) => s.captureState === CAPTURE_STATE.ACTIVE)
    .map(([id]) => parseInt(id, 10));

  for (const id of activeIds) {
    if (!tabSet.has(id)) {
      const t = await platformApi.tabs.get(id).catch(() => null);
      if (t) tabSet.set(id, t);
    }
  }

  const tabs = [...tabSet.values()];

  playingTabsListEl.innerHTML = '';

  if (tabs.length === 0) {
    playingTabsListEl.innerHTML = '<div class="empty-state">No tabs with audio detected.</div>';
    playingCountEl.textContent = '';
    return;
  }

  playingCountEl.textContent = `${tabs.length} tab${tabs.length !== 1 ? 's' : ''}`;

  for (const t of tabs) {
    const sessionState = allStates[t.id];
    const isBoostActive = sessionState?.captureState === CAPTURE_STATE.ACTIVE;
    const vol           = sessionState?.volume ?? 100;
    const isCurrent     = t.id === currentTabId;

    const row = document.createElement('div');
    row.className = `playing-tab-row${isCurrent ? ' playing-tab-row--current' : ''}`;
    row.role      = 'listitem';
    row.tabIndex  = 0;
    row.setAttribute('aria-label', `${t.title || 'Tab'} — ${isBoostActive ? vol + '%' : 'not boosted'}`);

    // Favicon
    const fav = document.createElement('img');
    fav.className = 'playing-tab-row__favicon';
    fav.alt = '';
    fav.src = t.favIconUrl || '';
    fav.onerror = () => { fav.style.visibility = 'hidden'; };

    // Info
    const info = document.createElement('div');
    info.className = 'playing-tab-row__info';
    info.innerHTML = `
      <div class="playing-tab-row__title">${escHtml(truncate(t.title || 'Untitled', 30))}</div>
      <div class="playing-tab-row__domain">${escHtml(getDomain(t.url) || '')}</div>
    `;

    // Right side
    const right = document.createElement('div');
    right.className = 'playing-tab-row__right';
    right.innerHTML = `
      <span class="playing-tab-vol${isBoostActive ? '' : ' playing-tab-vol--inactive'}">
        ${isBoostActive ? vol + '%' : '—'}
      </span>
      <span class="active-dot${isBoostActive ? '' : ' active-dot--off'}" aria-hidden="true"></span>
    `;

    row.append(fav, info, right);

    // Click: switch control to this tab
    row.addEventListener('click', () => selectTab(t.id));
    row.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectTab(t.id); }
    });

    playingTabsListEl.appendChild(row);
  }
}

async function safeRefreshPlayingTabs() {
  try {
    await refreshPlayingTabs();
  } catch (err) {
    console.warn('[Boostune] Could not refresh playing tabs', err);
    playingTabsListEl.innerHTML = '<div class="empty-state">Boostune is ready. Play audio to start boosting.</div>';
    playingCountEl.textContent = '';
  }
}

async function selectTab(tabId) {
  if (tabId === currentTabId) return;

  // Focus the selected tab's window
  const tab = await platformApi.tabs.get(tabId).catch(() => null);
  if (!tab) return;

  currentTabId = tabId;
  renderTabInfo(tab);

  // Get its session state
  try {
    const res = await sw(MSG.BOOST_GET_STATE, { tabId });
    currentSession = res?.state || null;
  } catch {
    currentSession = null;
  }

  renderState();
  await refreshPlayingTabs();
}

// ── Power toggle (enable / disable) ──────────────────────────

powerToggleEl.addEventListener('click', async () => {
  if (!currentTabId) return;

  const state = currentSession?.captureState || CAPTURE_STATE.IDLE;

  if (state === CAPTURE_STATE.ACTIVE) {
    // Stop
    powerToggleEl.disabled = true;
    setStatus('stopping');
    try {
      const res = await sw(MSG.BOOST_STOP, { tabId: currentTabId });
      if (!res?.success) showError(res?.error || 'Failed to stop boost.');
    } catch (err) {
      showError(err.message || 'Failed to stop boost.');
    } finally {
      powerToggleEl.disabled = false;
    }
  } else {
    // Start
    powerToggleEl.disabled = true;
    setStatus('starting');
    try {
      const res = await sw(MSG.BOOST_START, { tabId: currentTabId });
      if (!res?.success) showError(res?.error || 'Failed to start boost.');
    } catch (err) {
      showError(err.message || 'Failed to start boost.');
    } finally {
      powerToggleEl.disabled = false;
    }
  }
});

function setStatus(state) {
  // Optimistic UI update while awaiting SW response
  if (!currentSession) currentSession = { captureState: state, volume: 100, safeBoost: true, enabled: false };
  currentSession.captureState = state;
  renderStatusPill(state);
  powerLabelEl.textContent = state === 'starting' ? 'Starting…' : 'Stopping…';
}

// ── Volume controls ───────────────────────────────────────────

const debouncedSetVol = debounce(async (vol) => {
  if (!currentTabId) return;
  const cappedVol = clampToUserVolumeLimit(vol);
  if (!currentSession) currentSession = { captureState: CAPTURE_STATE.IDLE, volume: cappedVol, safeBoost: true };
  currentSession.volume = cappedVol;
  await sw(MSG.BOOST_SET_VOLUME, { tabId: currentTabId, volume: cappedVol }).catch((err) => {
    console.warn('[Boostune] Could not set debounced volume', err);
  });
  await safeRefreshPlayingTabs();
}, 80);

volumeSliderEl.addEventListener('mousedown', () => { _sliderDragging = true; });
volumeSliderEl.addEventListener('touchstart', () => { _sliderDragging = true; }, { passive: true });

volumeSliderEl.addEventListener('input', () => {
  const v = clampToUserVolumeLimit(parseInt(volumeSliderEl.value, 10));
  setVolumeUI(v);
  debouncedSetVol(v);
});

volumeSliderEl.addEventListener('change', async () => {
  _sliderDragging = false;
  const v = clampToUserVolumeLimit(parseInt(volumeSliderEl.value, 10));
  setVolumeUI(v);
  await sw(MSG.BOOST_SET_VOLUME, { tabId: currentTabId, volume: v }).catch((err) => {
    showError(err.message || 'Failed to set volume.');
  });
  await safeRefreshPlayingTabs();
});

volDownEl.addEventListener('click', () => nudge(-VOLUME.STEP));
volUpEl.addEventListener('click',   () => nudge(+VOLUME.STEP));

async function nudge(delta) {
  if (!currentTabId) return;
  const current = currentSession?.volume ?? 100;
  const newVol  = clampToUserVolumeLimit(current + delta);
  setVolumeUI(newVol);
  if (!currentSession) currentSession = { volume: newVol, captureState: CAPTURE_STATE.IDLE, safeBoost: true };
  currentSession.volume = newVol;
  await sw(MSG.BOOST_SET_VOLUME, { tabId: currentTabId, volume: newVol }).catch((err) => {
    showError(err.message || 'Failed to set volume.');
  });
  await safeRefreshPlayingTabs();
}

// Preset buttons
document.querySelectorAll('.preset-btn').forEach((btn) => {
  btn.addEventListener('click', async () => {
    const v = clampToUserVolumeLimit(parseInt(btn.dataset.vol, 10));
    setVolumeUI(v);
    if (!currentSession) currentSession = { volume: v, captureState: CAPTURE_STATE.IDLE, safeBoost: true };
    currentSession.volume = v;
    await sw(MSG.BOOST_SET_VOLUME, { tabId: currentTabId, volume: v }).catch((err) => {
      showError(err.message || 'Failed to set volume.');
    });
    await safeRefreshPlayingTabs();
  });
});

// ── Safe Boost ────────────────────────────────────────────────

safeBoostToggleEl.addEventListener('change', async (e) => {
  const enabled = e.target.checked;
  safeBoostCardEl.classList.toggle('active', enabled);
  if (!currentSession) currentSession = { volume: 100, captureState: CAPTURE_STATE.IDLE, safeBoost: enabled };
  currentSession.safeBoost = enabled;
  if (currentTabId) {
    await sw(MSG.BOOST_TOGGLE_SAFE_BOOST, { tabId: currentTabId, enabled }).catch((err) => {
      showError(err.message || 'Failed to update Safe Boost.');
    });
  }
});

// Clicking the card also toggles
safeBoostCardEl.addEventListener('click', (e) => {
  if (e.target === safeBoostToggleEl || e.target.closest('label')) return;
  safeBoostToggleEl.checked = !safeBoostToggleEl.checked;
  safeBoostToggleEl.dispatchEvent(new Event('change'));
});
safeBoostCardEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    safeBoostToggleEl.checked = !safeBoostToggleEl.checked;
    safeBoostToggleEl.dispatchEvent(new Event('change'));
  }
});

// ── Settings / navigation ─────────────────────────────────────

function openSettings() {
  platformApi.runtime.openOptionsPage();
}

function openPrivacy() {
  platformApi.tabs.create({ url: platformApi.runtime.getURL('PRIVACY.md') });
}

settingsBtnEl.addEventListener('click', openSettings);
footerSettingsEl.addEventListener('click', openSettings);
footerSettingsEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    openSettings();
  }
});

footerPrivacyEl.addEventListener('click', openPrivacy);
footerPrivacyEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    openPrivacy();
  }
});

// ── Incoming messages from SW ─────────────────────────────────

function onSWMessage(message) {
  if (!message?.type) return;

  if (message.type === MSG.BOOST_STATE_CHANGED && message.tabId === currentTabId) {
    currentSession = message.state;
    renderState();
    safeRefreshPlayingTabs();
    return;
  }

  if (message.type === MSG.BOOST_ERROR && message.tabId === currentTabId) {
    showError(message.error || 'An audio error occurred.');
    if (currentSession) {
      currentSession.captureState = CAPTURE_STATE.ERROR;
      currentSession.enabled = false;
    }
    renderState();
    return;
  }

  // State changed for a different tab — refresh the playing list
  if (message.type === MSG.BOOST_STATE_CHANGED) {
    safeRefreshPlayingTabs();
  }
}

function startRuntimeListener() {
  if (_listeningForRuntimeMessages) return;
  platformApi.runtime.onMessage.addListener(onSWMessage);
  _listeningForRuntimeMessages = true;
}

// ── Error display ─────────────────────────────────────────────

function showError(msg) {
  errorBannerEl.classList.remove('hidden');
  errorBannerEl.classList.add('error');
  errorMessageEl.textContent = msg;
}

function hideError() {
  errorBannerEl.classList.add('hidden');
}

function disableControls() {
  volumeSliderEl.disabled   = true;
  volUpEl.disabled          = true;
  volDownEl.disabled        = true;
  safeBoostToggleEl.disabled= true;
  powerToggleEl.disabled    = true;
  document.querySelectorAll('.preset-btn').forEach((b) => { b.disabled = true; });
}

// ── SW message helper ─────────────────────────────────────────

function sw(type, payload = {}) {
  return platformApi.runtime.sendMessage({ type, ...payload });
}

// ── Utility ───────────────────────────────────────────────────

function escHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Periodic refresh of playing tabs list ─────────────────────
// Poll every 3s to detect new audible tabs without event-driven hooks.
setInterval(safeRefreshPlayingTabs, 3000);

// ── Boot ──────────────────────────────────────────────────────
init().catch((e) => {
  console.error('[Boostune] popup init failed', e);
  window.__boostuneInitError = e?.message || String(e);
  showError('Boostune failed to initialise. Please reload.');
});
