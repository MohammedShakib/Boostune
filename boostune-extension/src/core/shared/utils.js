// ─────────────────────────────────────────────────────────────
//  Boostune — Shared Utilities
// ─────────────────────────────────────────────────────────────

import { UNSUPPORTED_URL_PREFIXES, UNSUPPORTED_HOSTS } from './constants.js';

// Set true during development; set false before production release.
const DEBUG = true;

// ── Logger ─────────────────────────────────────────────────────

export const log = {
  info:  (...a) => DEBUG && console.log  ('[Boostune]', ...a),
  warn:  (...a) => DEBUG && console.warn ('[Boostune]', ...a),
  error: (...a) =>           console.error('[Boostune]', ...a),
  debug: (...a) => DEBUG && console.debug('[Boostune]', ...a),
};

// ── Math helpers ───────────────────────────────────────────────

/** Clamp a number between min and max (inclusive). */
export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/** Convert a 0-600 volume percentage to an AudioContext gain scalar. */
export function volumeToGain(volume) {
  return volume / 100;
}

/** Convert a gain scalar back to a 0-600 percentage integer. */
export function gainToVolume(gain) {
  return Math.round(gain * 100);
}

// ── URL helpers ────────────────────────────────────────────────

/** Extract the hostname from a URL string. Returns null on failure. */
export function getDomain(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

/**
 * Returns true when the URL belongs to a page where tabCapture is not
 * permitted (browser-internal pages, extension store, etc.).
 */
export function isUnsupportedUrl(url) {
  if (!url) return true;
  if (UNSUPPORTED_URL_PREFIXES.some((p) => url.startsWith(p))) return true;
  try {
    const host = new URL(url).hostname;
    if (UNSUPPORTED_HOSTS.some((h) => host.includes(h))) return true;
  } catch {
    return true;
  }
  return false;
}

// ── Formatting ─────────────────────────────────────────────────

export function formatVolume(volume) {
  return `${volume}%`;
}

export function truncate(str, max = 40) {
  return str && str.length > max ? str.slice(0, max - 1) + '…' : (str || '');
}

// ── Async helpers ──────────────────────────────────────────────

/** Classic debounce — waits until calls stop for `ms` milliseconds. */
export function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

/** Returns a promise that resolves after `ms` milliseconds. */
export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ── Error messaging ────────────────────────────────────────────

/**
 * Map internal browser / API errors to user-friendly strings.
 * Never expose cryptic DOMException messages to normal users.
 */
export function friendlyError(err) {
  const raw = (err?.message || String(err)).toLowerCase();
  if (raw.includes('tab') && raw.includes('not found'))
    return 'The tab is no longer available.';
  if (raw.includes('permission') || raw.includes('notallowed'))
    return 'Audio capture permission was denied.';
  if (raw.includes('notreadableerror'))
    return "Boostune can't read audio from this tab. Is another app capturing it?";
  if (raw.includes('aborterror'))
    return 'Audio capture was aborted.';
  if (raw.includes('stream') || raw.includes('ended'))
    return 'Boostune lost the audio session. Click Resume.';
  if (raw.includes('unsupported') || raw.includes('constraint'))
    return "This browser page doesn't support audio capture.";
  return 'An unexpected error occurred. Please try again.';
}
