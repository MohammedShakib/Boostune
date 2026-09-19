// ─────────────────────────────────────────────────────────────
//  Boostune — AudioSession (core audio engine)
//
//  One instance per active tab capture.
//  Owns: AudioContext, MediaStreamAudioSourceNode, GainNode,
//        DynamicsCompressorNode (Safe Boost limiter).
//
//  Created inside the Offscreen Document — never in the popup
//  or service worker.
// ─────────────────────────────────────────────────────────────

import { GAIN_RAMP_TIME } from '../shared/constants.js';
import { log, volumeToGain } from '../shared/utils.js';

export class AudioSession {
  /**
   * @param {number} tabId
   * @param {MediaStream} stream - Already acquired via getUserMedia
   * @param {number} volume - 0–600
   * @param {boolean} safeBoost
   */
  constructor(tabId, stream, volume, safeBoost) {
    this.tabId      = tabId;
    this.stream     = stream;
    this.active     = false;

    this._volume    = volume;
    this._safeBoost = safeBoost;

    /** @type {AudioContext|null} */
    this._ctx        = null;
    /** @type {MediaStreamAudioSourceNode|null} */
    this._source     = null;
    /** @type {GainNode|null} */
    this._gainNode   = null;
    /** @type {DynamicsCompressorNode|null} */
    this._compressor = null;
  }

  // ── Lifecycle ─────────────────────────────────────────────

  /** Initialise the Web Audio pipeline and begin processing. */
  async start() {
    if (this.active) {
      log.warn(`AudioSession[${this.tabId}] already active — ignoring duplicate start`);
      return;
    }

    this._ctx = new AudioContext();

    // Chrome/Edge sometimes auto-suspends new contexts; resume explicitly.
    if (this._ctx.state === 'suspended') {
      await this._ctx.resume();
    }
    
    // Fallback: forcefully resume if still suspended (fixes some Edge quirks)
    this._resumeInterval = setInterval(() => {
      if (this._ctx && this._ctx.state === 'suspended') {
        this._ctx.resume().catch(() => {});
      }
    }, 1000);

    this._source   = this._ctx.createMediaStreamSource(this.stream);
    this._gainNode = this._ctx.createGain();

    // Set initial gain without ramp — silence until AudioContext is running
    this._gainNode.gain.setValueAtTime(
      volumeToGain(this._volume),
      this._ctx.currentTime,
    );

    // Wire the processing chain
    this._buildChain();

    // Detect stream ending (tab navigated, muted at OS level, etc.)
    this.stream.addEventListener('inactive', this._onStreamInactive.bind(this));

    this.active = true;
    log.info(`AudioSession[${this.tabId}] started — vol=${this._volume}%, safeBoost=${this._safeBoost}`);
  }

  /** Gracefully tear down all audio resources. */
  async stop() {
    if (!this.active) return;
    this.active = false;

    // Ramp gain to zero quickly to avoid click on disconnect
    if (this._gainNode && this._ctx) {
      this._gainNode.gain.setTargetAtTime(0, this._ctx.currentTime, 0.01);
      await _wait(80); // 80ms — enough for the ramp to reach ~0
    }

    this._disconnect();

    // Stop all tracks in the captured stream
    this.stream.getTracks().forEach((t) => { try { t.stop(); } catch {} });

    // Close the AudioContext to free system audio resources
    try { await this._ctx.close(); } catch {}

    if (this._resumeInterval) {
      clearInterval(this._resumeInterval);
      this._resumeInterval = null;
    }

    this._source     = null;
    this._gainNode   = null;
    this._compressor = null;
    this._ctx        = null;

    log.info(`AudioSession[${this.tabId}] stopped and cleaned up`);
  }

  // ── Volume / Safe Boost controls ──────────────────────────

  /**
   * Smoothly change the output gain.
   * Uses setTargetAtTime to eliminate clicks/pops during rapid changes.
   * @param {number} volume - 0–600
   */
  setVolume(volume) {
    if (!this.active || !this._gainNode || !this._ctx) return;
    this._volume = volume;

    if (this._ctx.state === 'suspended') {
      this._ctx.resume().catch(() => {});
    }

    this._gainNode.gain.setTargetAtTime(
      volumeToGain(volume),
      this._ctx.currentTime,
      GAIN_RAMP_TIME,
    );
    log.debug(`AudioSession[${this.tabId}] gain → ${volume}%`);
  }

  /**
   * Toggle the limiter/compressor stage.
   * Reconnects nodes to insert or remove the compressor without
   * interrupting the audio stream.
   * @param {boolean} enabled
   */
  setSafeBoost(enabled) {
    if (!this.active) return;
    this._safeBoost = enabled;
    this._buildChain();
    log.info(`AudioSession[${this.tabId}] safeBoost → ${enabled}`);
  }

  // ── Internal helpers ──────────────────────────────────────

  /**
   * Build or rebuild the audio node chain.
   * Safe to call while audio is playing — reconnects cleanly.
   *
   * Chain (Safe Boost ON):
   *   source → gainNode → compressor → destination
   *
   * Chain (Safe Boost OFF):
   *   source → gainNode → destination
   */
  _buildChain() {
    this._disconnect();

    if (this._safeBoost) {
      if (!this._compressor) {
        this._compressor = this._ctx.createDynamicsCompressor();
        // Limiter-style settings: very high ratio, fast attack, moderate release
        this._compressor.threshold.setValueAtTime(-3,    this._ctx.currentTime);
        this._compressor.knee.setValueAtTime(0,          this._ctx.currentTime);
        this._compressor.ratio.setValueAtTime(20,        this._ctx.currentTime);
        this._compressor.attack.setValueAtTime(0.001,    this._ctx.currentTime);
        this._compressor.release.setValueAtTime(0.15,    this._ctx.currentTime);
      }
      this._source.connect(this._gainNode);
      this._gainNode.connect(this._compressor);
      this._compressor.connect(this._ctx.destination);
    } else {
      this._source.connect(this._gainNode);
      this._gainNode.connect(this._ctx.destination);
    }
  }

  /** Disconnect all nodes without closing the context. */
  _disconnect() {
    const safe = (fn) => { try { fn(); } catch {} };
    safe(() => this._source.disconnect());
    safe(() => this._gainNode.disconnect());
    safe(() => this._compressor && this._compressor.disconnect());
  }

  /** Called when the MediaStream track ends unexpectedly. */
  _onStreamInactive() {
    if (!this.active) return;
    log.warn(`AudioSession[${this.tabId}] stream became inactive`);
    // Notify offscreen.js → SW → popup that the session ended
    chrome.runtime.sendMessage({
      type:  'OFFSCREEN_ERROR',
      tabId: this.tabId,
      error: 'Stream ended unexpectedly.',
    }).catch(() => {});
  }

  // ── State snapshot ────────────────────────────────────────

  getState() {
    return {
      tabId:     this.tabId,
      active:    this.active,
      volume:    this._volume,
      safeBoost: this._safeBoost,
    };
  }
}

// ── Internal utility ──────────────────────────────────────────

function _wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
