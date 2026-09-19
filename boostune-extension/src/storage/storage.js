// ─────────────────────────────────────────────────────────────
//  Boostune — Storage Layer
//  Wraps chrome.storage.sync (preferences) and
//  chrome.storage.session (ephemeral tab session state).
// ─────────────────────────────────────────────────────────────

import { DEFAULTS } from '../shared/constants.js';
import { log } from '../shared/utils.js';

// ── Storage keys ───────────────────────────────────────────────
const PREFS_KEY        = 'boostune_prefs';
const SITE_VOLUMES_KEY = 'boostune_site_volumes';
const SESSION_KEY      = 'boostune_sessions';

// ── Default preferences ────────────────────────────────────────
const DEFAULT_PREFS = {
  defaultVolume:       DEFAULTS.VOLUME,
  safeBoost:           DEFAULTS.SAFE_BOOST,
  rememberVolume:      DEFAULTS.REMEMBER_VOLUME,
  maxVolume:           DEFAULTS.MAX_VOLUME,
  theme:               DEFAULTS.THEME,
  onboardingCompleted: DEFAULTS.ONBOARDING_DONE,
};

// ── User Preferences (chrome.storage.sync) ────────────────────

/** Retrieve global user preferences, merged with defaults. */
export async function getPrefs() {
  try {
    const result = await chrome.storage.sync.get(PREFS_KEY);
    return { ...DEFAULT_PREFS, ...(result[PREFS_KEY] || {}) };
  } catch (e) {
    log.error('getPrefs failed', e);
    return { ...DEFAULT_PREFS };
  }
}

/** Overwrite stored preferences entirely. */
export async function savePrefs(prefs) {
  try {
    await chrome.storage.sync.set({ [PREFS_KEY]: prefs });
  } catch (e) {
    log.error('savePrefs failed', e);
  }
}

/** Merge partial updates into stored preferences. */
export async function updatePrefs(updates) {
  const current = await getPrefs();
  await savePrefs({ ...current, ...updates });
}

// ── Site Volume Memory (chrome.storage.sync) ──────────────────

/** Return the full domain→volume map. */
export async function getSiteVolumes() {
  try {
    const result = await chrome.storage.sync.get(SITE_VOLUMES_KEY);
    return result[SITE_VOLUMES_KEY] || {};
  } catch (e) {
    log.error('getSiteVolumes failed', e);
    return {};
  }
}

/** Set remembered volume for a specific domain. */
export async function setSiteVolume(domain, volume) {
  try {
    const map = await getSiteVolumes();
    map[domain] = volume;
    await chrome.storage.sync.set({ [SITE_VOLUMES_KEY]: map });
  } catch (e) {
    log.error('setSiteVolume failed', e);
  }
}

/** Remove remembered volume for a specific domain. */
export async function clearSiteVolume(domain) {
  try {
    const map = await getSiteVolumes();
    delete map[domain];
    await chrome.storage.sync.set({ [SITE_VOLUMES_KEY]: map });
  } catch (e) {
    log.error('clearSiteVolume failed', e);
  }
}

/** Remove all site volume memories. */
export async function clearAllSiteVolumes() {
  try {
    await chrome.storage.sync.remove(SITE_VOLUMES_KEY);
  } catch (e) {
    log.error('clearAllSiteVolumes failed', e);
  }
}

// ── Session State (chrome.storage.session) ────────────────────
//
// storage.session survives service-worker restarts within the same
// browser session, making it ideal for ephemeral tab state.
// Tab IDs are NEVER persisted to storage.sync — they are session-only.

/** Return all persisted session state records keyed by tabId. */
export async function getSessionStates() {
  try {
    const result = await chrome.storage.session.get(SESSION_KEY);
    return result[SESSION_KEY] || {};
  } catch {
    return {};
  }
}

/** Persist or update state for one tab. */
export async function setSessionState(tabId, state) {
  try {
    const all = await getSessionStates();
    all[String(tabId)] = state;
    await chrome.storage.session.set({ [SESSION_KEY]: all });
  } catch (e) {
    log.error('setSessionState failed', e);
  }
}

/** Remove persisted state for a tab (on cleanup). */
export async function removeSessionState(tabId) {
  try {
    const all = await getSessionStates();
    delete all[String(tabId)];
    await chrome.storage.session.set({ [SESSION_KEY]: all });
  } catch (e) {
    log.error('removeSessionState failed', e);
  }
}

/** Wipe all session state (e.g., on extension reset). */
export async function clearAllSessionStates() {
  try {
    await chrome.storage.session.remove(SESSION_KEY);
  } catch (e) {
    log.error('clearAllSessionStates failed', e);
  }
}
