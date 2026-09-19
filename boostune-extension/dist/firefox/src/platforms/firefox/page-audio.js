// ─────────────────────────────────────────────────────────────
// Boostune — Firefox Page Audio Main World Script
// This script is injected into the webpage's main context to access
// HTMLMediaElements and route them through the Web Audio API.
// ─────────────────────────────────────────────────────────────

(function () {
  if (window.__BOOSTUNE_PAGE_AUDIO_INJECTED__) return;
  window.__BOOSTUNE_PAGE_AUDIO_INJECTED__ = true;

  console.log('[Boostune] Page audio script injected into main world.');

  const GAIN_RAMP_TIME = 0.015;

  let ctx = null;
  let globalGainNode = null;
  let globalCompressor = null;
  let activeNodes = new Map(); // mediaElement -> { source, gain, compressor }
  
  let currentVolume = 100;
  let currentSafeBoost = true;
  let isEnabled = false;

  function volumeToGain(vol) {
    if (vol <= 0) return 0;
    return vol / 100;
  }

  function initAudioContext() {
    if (ctx) return;
    ctx = new AudioContext();
  }

  function connectMediaElement(mediaEl) {
    if (activeNodes.has(mediaEl)) return; // Already connected

    // Ensure AudioContext is ready
    initAudioContext();

    try {
      // ⚠️ Cross-origin media might fail silently here or output silence.
      const source = ctx.createMediaElementSource(mediaEl);
      const gainNode = ctx.createGain();
      const compressor = ctx.createDynamicsCompressor();

      // Configure compressor for Safe Boost
      compressor.threshold.setValueAtTime(-3, ctx.currentTime);
      compressor.knee.setValueAtTime(0, ctx.currentTime);
      compressor.ratio.setValueAtTime(20, ctx.currentTime);
      compressor.attack.setValueAtTime(0.001, ctx.currentTime);
      compressor.release.setValueAtTime(0.15, ctx.currentTime);

      gainNode.gain.setValueAtTime(volumeToGain(currentVolume), ctx.currentTime);

      // Store nodes
      activeNodes.set(mediaEl, { source, gainNode, compressor });

      // Wire them up based on current state
      wireUp(mediaEl);
    } catch (e) {
      console.error('[Boostune] Failed to connect media element:', e);
    }
  }

  function wireUp(mediaEl) {
    const nodes = activeNodes.get(mediaEl);
    if (!nodes) return;

    const { source, gainNode, compressor } = nodes;

    // Disconnect safely first
    try { source.disconnect(); } catch {}
    try { gainNode.disconnect(); } catch {}
    try { compressor.disconnect(); } catch {}

    if (!isEnabled) {
      // If disabled, just pass through unmodified
      source.connect(ctx.destination);
      return;
    }

    if (currentSafeBoost) {
      source.connect(gainNode);
      gainNode.connect(compressor);
      compressor.connect(ctx.destination);
    } else {
      source.connect(gainNode);
      gainNode.connect(ctx.destination);
    }
  }

  function scanForMedia() {
    const elements = document.querySelectorAll('audio, video');
    elements.forEach(connectMediaElement);
  }

  function startBoost() {
    isEnabled = true;
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    scanForMedia();
    activeNodes.forEach((_, mediaEl) => wireUp(mediaEl));
  }

  function stopBoost() {
    isEnabled = false;
    activeNodes.forEach((_, mediaEl) => wireUp(mediaEl));
  }

  function setVolume(vol) {
    currentVolume = vol;
    if (!ctx) return;
    const gainVal = volumeToGain(vol);
    activeNodes.forEach(({ gainNode }) => {
      gainNode.gain.setTargetAtTime(gainVal, ctx.currentTime, GAIN_RAMP_TIME);
    });
  }

  function setSafeBoost(enabled) {
    currentSafeBoost = enabled;
    if (isEnabled) {
      activeNodes.forEach((_, mediaEl) => wireUp(mediaEl));
    }
  }

  // ── Mutation Observer for dynamic players ───────────────────
  const observer = new MutationObserver((mutations) => {
    if (!isEnabled) return;
    let foundNew = false;
    mutations.forEach(m => {
      m.addedNodes.forEach(node => {
        if (node.nodeName === 'AUDIO' || node.nodeName === 'VIDEO') {
          foundNew = true;
        } else if (node.querySelectorAll) {
          if (node.querySelectorAll('audio, video').length > 0) foundNew = true;
        }
      });
    });
    if (foundNew) scanForMedia();
  });

  observer.observe(document.body, { childList: true, subtree: true });

  // ── Listen to Content Script Messages ───────────────────────
  window.addEventListener('message', (event) => {
    // Only accept messages from the same window
    if (event.source !== window || !event.data || event.data.source !== 'BOOSTUNE_CONTENT_SCRIPT') {
      return;
    }

    const { type, payload } = event.data;

    switch (type) {
      case 'START':
        startBoost();
        break;
      case 'STOP':
        stopBoost();
        break;
      case 'SET_VOLUME':
        setVolume(payload.volume);
        break;
      case 'SET_SAFE_BOOST':
        setSafeBoost(payload.enabled);
        break;
    }
  });

  // Notify content script we are ready
  window.postMessage({ source: 'BOOSTUNE_PAGE_AUDIO', type: 'READY' }, '*');
})();
