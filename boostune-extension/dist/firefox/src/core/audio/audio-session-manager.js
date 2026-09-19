// ─────────────────────────────────────────────────────────────
//  Boostune — AudioSessionManager
//
//  Singleton that manages all active AudioSession instances
//  inside the Offscreen Document.
//  Ensures only one capture session exists per tabId.
// ─────────────────────────────────────────────────────────────

import { AudioSession } from './audio-engine.js';
import { log } from '../shared/utils.js';

class AudioSessionManager {
  constructor() {
    /** @type {Map<number, AudioSession>} */
    this._sessions = new Map();
  }

  // ── Session lifecycle ──────────────────────────────────────

  /**
   * Start a new capture session for the given tab.
   * If a session already exists for this tab, it is stopped first.
   *
   * @param {number} tabId
   * @param {MediaStream} stream
   * @param {number} volume  - 0–600
   * @param {boolean} safeBoost
   * @returns {{ success: boolean, error?: string }}
   */
  async start(tabId, stream, volume, safeBoost) {
    if (this._sessions.has(tabId)) {
      log.warn(`SessionManager: existing session for tab ${tabId} — stopping it first`);
      await this.stop(tabId);
    }

    const session = new AudioSession(tabId, stream, volume, safeBoost);
    this._sessions.set(tabId, session);

    try {
      await session.start();
      return { success: true };
    } catch (err) {
      this._sessions.delete(tabId);
      log.error(`SessionManager: start failed for tab ${tabId}`, err);
      return { success: false, error: err.message };
    }
  }

  /**
   * Stop and clean up a session.
   * No-op if the tab has no active session.
   * @param {number} tabId
   */
  async stop(tabId) {
    const session = this._sessions.get(tabId);
    if (!session) return;
    this._sessions.delete(tabId); // remove before stop to prevent re-entry
    await session.stop();
  }

  // ── Parameter controls ────────────────────────────────────

  setVolume(tabId, volume) {
    this._sessions.get(tabId)?.setVolume(volume);
  }

  setSafeBoost(tabId, enabled) {
    this._sessions.get(tabId)?.setSafeBoost(enabled);
  }

  // ── Queries ───────────────────────────────────────────────

  has(tabId) {
    return this._sessions.has(tabId);
  }

  /** Return a plain-object snapshot of all active sessions. */
  getAll() {
    const result = {};
    this._sessions.forEach((session, tabId) => {
      result[tabId] = session.getState();
    });
    return result;
  }

  activeCount() {
    return this._sessions.size;
  }

  /** Stop all active sessions (called on offscreen document unload). */
  async stopAll() {
    const ids = [...this._sessions.keys()];
    await Promise.all(ids.map((id) => this.stop(id)));
    log.info('SessionManager: all sessions stopped');
  }
}

// Export a singleton — one manager per offscreen document lifetime.
export const sessionManager = new AudioSessionManager();
