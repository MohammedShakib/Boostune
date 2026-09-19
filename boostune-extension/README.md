# Boostune

> **Boost Every Tab** — per-tab audio volume control for Chrome and Edge

Boostune is a Manifest V3 browser extension that lets you independently boost or attenuate the volume of individual browser tabs. Amplify quiet YouTube videos, boost low-volume meetings, or soften loud music — all without touching system volume.

---

## Features

| Feature | Details |
|---|---|
| **Per-tab volume control** | 0% – 600%, independent per tab |
| **Real-time slider** | Smooth debounced volume changes, no pops |
| **Safe Boost** | Limiter-style compressor to reduce clipping at high volumes |
| **Quick presets** | 50%, 100%, 150%, 200%, 300%, 400%, 600% |
| **Keyboard shortcuts** | Alt+↑ / Alt+↓ / Alt+Shift+0 |
| **Playing Tabs list** | Shows all tabs producing audio and their Boostune state |
| **Remember Volume** | Per-site volume memory (opt-in) |
| **Settings page** | Full settings with site volume management |
| **Privacy-first** | No network requests, no audio recording, no analytics |

---

## Architecture

```
Popup (UI — ephemeral)
   │
   │  chrome.runtime.sendMessage (typed MSG contract)
   ▼
Service Worker (background/service-worker.js)
   │  • Session lifecycle management
   │  • chrome.tabCapture.getMediaStreamId()
   │  • Offscreen document management
   │
   │  chrome.runtime.sendMessage
   ▼
Offscreen Document (src/offscreen/)
   │  • navigator.mediaDevices.getUserMedia (chromeMediaSource: 'tab')
   │  • One AudioSession per active tab
   ▼
AudioContext (per tab)
   MediaStreamAudioSourceNode
   → GainNode                    (volume 0–600%)
   → DynamicsCompressorNode      (Safe Boost: limiter mode)
   → AudioContext.destination    (speakers/headphones)
```

**Key design decisions:**
- Audio pipeline lives in the **Offscreen Document** — survives popup close
- **One AudioContext per active tab** — fully independent sessions
- Chrome's `tabCapture` automatically mutes the browser's native tab output, routing everything through our AudioContext. At 100% gain, volume is approximately identical to uncaptured — **no echo or double-playback**
- **Smooth gain ramps** via `gainNode.gain.setTargetAtTime()` — no clicks or pops on rapid slider movement
- Session state persisted to `chrome.storage.session` — survives service worker restarts

---

## How to Install Locally (Chrome)

1. Clone or download this repository
2. Open Chrome and navigate to: `chrome://extensions`
3. Enable **Developer mode** (toggle in the top right)
4. Click **Load unpacked**
5. Select the `boostune-extension/` folder (the one containing `manifest.json`)
6. Boostune will appear in your extensions list
7. Pin it to the toolbar for easy access

### Edge

Same steps, but navigate to: `edge://extensions`

---

## How to Test Boostune

1. Open a tab playing audio (e.g. YouTube, Spotify Web)
2. Click the Boostune icon in the toolbar
3. Click the **Inactive** toggle to activate Boostune for the current tab
4. Move the slider to adjust volume
5. Try Safe Boost ON/OFF at high volumes (200%+)
6. Open another tab and set a different volume — verify they are independent
7. Close the first tab — verify the session cleans up
8. Navigate the active tab to a new URL — Boostune stops cleanly

See `TESTING.md` for the full testing checklist.

---

## Permissions

| Permission | Reason |
|---|---|
| `tabCapture` | Obtain per-tab audio stream IDs |
| `offscreen` | Run the AudioContext in a persistent background document |
| `storage` | Save user preferences and remembered site volumes |
| `tabs` | Read tab titles, favicons, and audible state for the Playing Tabs list |
| `activeTab` | Access current tab details when the popup is opened |

No host permissions are required.

---

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Alt + ↑` | Increase volume by 10% |
| `Alt + ↓` | Decrease volume by 10% |
| `Alt + Shift + 0` | Reset to 100% |

Shortcuts only work when Boostune is active on the current tab.
To customise shortcuts: `chrome://extensions/shortcuts`

---

## Project Structure

```
boostune-extension/
├── manifest.json
├── README.md
├── PRIVACY.md
├── TESTING.md
│
├── src/
│   ├── background/
│   │   └── service-worker.js        # Session orchestration, tab lifecycle
│   ├── offscreen/
│   │   ├── offscreen.html           # Minimal shell for AudioContext host
│   │   └── offscreen.js             # Message router → sessionManager
│   ├── audio/
│   │   ├── audio-engine.js          # AudioSession class (per-tab pipeline)
│   │   └── audio-session-manager.js # Singleton map of active sessions
│   ├── popup/
│   │   ├── popup.html
│   │   ├── popup.css
│   │   └── popup.js                 # UI controller
│   ├── options/
│   │   ├── options.html
│   │   ├── options.css
│   │   └── options.js               # Settings controller
│   ├── storage/
│   │   └── storage.js               # chrome.storage abstraction layer
│   └── shared/
│       ├── constants.js             # MSG types, CAPTURE_STATE, VOLUME, DEFAULTS
│       └── utils.js                 # Logger, clamp, URL helpers, error mapping
│
└── assets/
    ├── brand/
    │   ├── boostune-logo-horizontal.png
    │   ├── boostune-mark.png
    │   ├── boostune-badge.png
    │   └── boostune-waveform.png
    │
    ├── icons/
    │   ├── icon.svg
    │   ├── icon16.png
    │   ├── icon32.png
    │   ├── icon48.png
    │   └── icon128.png
    │
    └── mockups/
        ├── boostune-popup-mockup.png
        ├── boostune-settings-mockup.png
        ├── boostune-hero-banner.png
        └── boostune-brand-board.png
```

---

## Known Browser Limitations

- **DRM-protected content** (Netflix, Disney+, Amazon Prime in some regions): The browser blocks `tabCapture` for DRM streams. Boostune shows a graceful error.
- **chrome:// / edge:// pages**: Browser-internal pages cannot be captured — Boostune shows an informative message.
- **Service Worker termination**: Chrome may terminate the service worker when idle. Boostune recovers session state from `chrome.storage.session` on next wake. Any active audio sessions will enter an error state and require manual re-activation.
- **Multiple extensions capturing the same tab**: Only one extension can capture a tab at a time. If another extension is already capturing, `tabCapture.getMediaStreamId` will fail with a permission error.

---

## Development

All source files are plain ES modules — no build step required.

```sh
# Edit source files, then reload the extension at chrome://extensions
# Press the refresh icon on the Boostune card
```

### Debug logging
Set `DEBUG = true` in `src/shared/utils.js` (it is true by default).
All Boostune logs are prefixed `[Boostune]`.

---

## Suggestions for V2

- Live audio visualiser (waveform/VU meter) in the popup
- Per-tab equaliser (bass boost, treble, mid)
- Stereo width control
- Hotkey to toggle Boostune on the active tab
- Browser action badge showing current volume percentage
- Import/export site preferences
- Dark/light theme toggle
- Cross-device preference sync via chrome.storage.sync (already scaffolded)
