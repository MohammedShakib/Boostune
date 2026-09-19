// ─────────────────────────────────────────────────────────────
//  Boostune — Offscreen Document
//
//  Message router for the audio pipeline.
//  All messages arrive from the Service Worker via
//  chrome.runtime.sendMessage / onMessage.
//
//  This module imports sessionManager (singleton) and delegates
//  every audio operation to it.
// ─────────────────────────────────────────────────────────────

import { MSG } from '../../../core/shared/constants.js';
import { log } from '../../../core/shared/utils.js';
import { sessionManager } from '../../../core/audio/audio-session-manager.js';

const OFFSCREEN_MESSAGE_TYPES = new Set([
  MSG.OFFSCREEN_START,
  MSG.OFFSCREEN_STOP,
  MSG.OFFSCREEN_SET_VOLUME,
  MSG.OFFSCREEN_SET_SAFE_BOOST,
  MSG.OFFSCREEN_GET_SESSIONS,
]);

// ── Message listener ──────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  // Only process messages directed at the offscreen document.
  // Runtime messages are broadcast to extension contexts; replying to popup
  // or options messages here can race the service worker's real response.
  if (!message || !OFFSCREEN_MESSAGE_TYPES.has(message.type)) return false;

  dispatch(message)
    .then(sendResponse)
    .catch((err) => {
      log.error('Offscreen dispatch error', err);
      sendResponse({ success: false, error: err.message });
    });

  return true; // keep channel open for async response
});

// ── Message dispatcher ────────────────────────────────────────

async function dispatch(message) {
  const { type, tabId } = message;

  switch (type) {
    // ── Start capture for a tab ───────────────────────────
    case MSG.OFFSCREEN_START:
      return await startCapture(tabId, message.streamId, message.volume, message.safeBoost);

    // ── Stop capture for a tab ────────────────────────────
    case MSG.OFFSCREEN_STOP:
      await sessionManager.stop(tabId);
      return { success: true };

    // ── Real-time volume change ───────────────────────────
    case MSG.OFFSCREEN_SET_VOLUME:
      sessionManager.setVolume(tabId, message.volume);
      return { success: true };

    // ── Toggle Safe Boost limiter ─────────────────────────
    case MSG.OFFSCREEN_SET_SAFE_BOOST:
      sessionManager.setSafeBoost(tabId, message.enabled);
      return { success: true };

    // ── Return snapshot of all active sessions ────────────
    case MSG.OFFSCREEN_GET_SESSIONS:
      return { success: true, sessions: sessionManager.getAll() };

    default:
      return { success: false, error: `Offscreen: unknown message type "${type}"` };
  }
}

// ── Tab capture start ─────────────────────────────────────────

/**
 * Acquire the tab audio stream using the stream ID provided by the SW
 * (which called chrome.tabCapture.getMediaStreamId), then hand it to
 * the session manager which creates an AudioSession.
 *
 * Chrome automatically mutes the tab's native output when captured —
 * routing all audio through our AudioContext eliminates echo.
 *
 * @param {number} tabId
 * @param {string} streamId - From chrome.tabCapture.getMediaStreamId
 * @param {number} volume   - 0-600
 * @param {boolean} safeBoost
 */
async function startCapture(tabId, streamId, volume, safeBoost) {
  if (!streamId) {
    const err = 'No stream ID provided to offscreen document.';
    log.error(err);
    return { success: false, error: err };
  }

  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        mandatory: {
          chromeMediaSource:   'tab',
          chromeMediaSourceId: streamId,
        },
      },
      video: false,
    });
  } catch (err) {
    log.error(`startCapture[${tabId}] getUserMedia failed`, err);
    // Notify the SW so it can update state and inform the popup
    chrome.runtime.sendMessage({
      type:  MSG.OFFSCREEN_ERROR,
      tabId,
      error: err.message,
    }).catch(() => {});
    return { success: false, error: err.message };
  }

  const result = await sessionManager.start(tabId, stream, volume, safeBoost);

  if (!result.success) {
    chrome.runtime.sendMessage({
      type:  MSG.OFFSCREEN_ERROR,
      tabId,
      error: result.error,
    }).catch(() => {});
  }

  return result;
}

// ── Cleanup on document unload ────────────────────────────────
// Called when the offscreen document is closed by the SW.

window.addEventListener('beforeunload', () => {
  sessionManager.stopAll().catch(() => {});
});

log.info('Boostune Offscreen Document ready');
