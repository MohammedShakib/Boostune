// ─────────────────────────────────────────────────────────────
//  Boostune — Shared Constants
//  Single source of truth for message types, defaults, limits.
// ─────────────────────────────────────────────────────────────

/** All inter-component message types. Never use raw strings. */
export const MSG = Object.freeze({
  // ── Popup / Options → Service Worker ──────────────────────
  BOOST_START:              'BOOST_START',
  BOOST_STOP:               'BOOST_STOP',
  BOOST_SET_VOLUME:         'BOOST_SET_VOLUME',
  BOOST_TOGGLE_SAFE_BOOST:  'BOOST_TOGGLE_SAFE_BOOST',
  BOOST_GET_STATE:          'BOOST_GET_STATE',
  BOOST_GET_ALL_STATES:     'BOOST_GET_ALL_STATES',

  // ── Service Worker → Popup / Options ──────────────────────
  BOOST_STATE_CHANGED:      'BOOST_STATE_CHANGED',
  BOOST_ERROR:              'BOOST_ERROR',

  // ── Service Worker → Offscreen Document ───────────────────
  OFFSCREEN_START:          'OFFSCREEN_START',
  OFFSCREEN_STOP:           'OFFSCREEN_STOP',
  OFFSCREEN_SET_VOLUME:     'OFFSCREEN_SET_VOLUME',
  OFFSCREEN_SET_SAFE_BOOST: 'OFFSCREEN_SET_SAFE_BOOST',
  OFFSCREEN_GET_SESSIONS:   'OFFSCREEN_GET_SESSIONS',

  // ── Offscreen Document → Service Worker ───────────────────
  OFFSCREEN_ERROR:          'OFFSCREEN_ERROR',
  OFFSCREEN_STOPPED:        'OFFSCREEN_STOPPED',
  OFFSCREEN_SESSIONS:       'OFFSCREEN_SESSIONS',
});

/** Capture lifecycle states for a tab session. */
export const CAPTURE_STATE = Object.freeze({
  IDLE:     'idle',
  STARTING: 'starting',
  ACTIVE:   'active',
  STOPPING: 'stopping',
  ERROR:    'error',
});

/** Default user preferences (storage defaults). */
export const DEFAULTS = Object.freeze({
  VOLUME:           100,
  SAFE_BOOST:       true,
  REMEMBER_VOLUME:  false,
  MAX_VOLUME:       400,
  THEME:            'dark',
  ONBOARDING_DONE:  false,
});

/** Volume range configuration. */
export const VOLUME = Object.freeze({
  MIN:     0,
  MAX:     600,
  STEP:    10,
  DEFAULT: 100,
  PRESETS: [50, 100, 150, 200, 300, 400, 600],
});

/**
 * Gain ramp time constant in seconds.
 * Used with setTargetAtTime() to prevent clicks/pops on volume changes.
 * ~15 ms — imperceptibly short but eliminates digital distortion.
 */
export const GAIN_RAMP_TIME = 0.015;

// ── Offscreen document configuration ──────────────────────────
export const OFFSCREEN_URL           = 'src/offscreen/offscreen.html';
export const OFFSCREEN_REASON        = 'USER_MEDIA';
export const OFFSCREEN_JUSTIFICATION = 'Boostune requires an offscreen document to capture and ' +
  'process per-tab audio via Web Audio API. This document runs the AudioContext pipeline ' +
  'independently of the popup so audio continues when the popup is closed.';

/** URL prefixes / hosts where tab capture is not possible. */
export const UNSUPPORTED_URL_PREFIXES = [
  'chrome://',
  'chrome-extension://',
  'edge://',
  'about:',
  'data:',
  'javascript:',
  'chrome-search://',
  'chrome-devtools://',
];

export const UNSUPPORTED_HOSTS = [
  'chromewebstore.google.com',
  'addons.mozilla.org',
];
