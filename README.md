<div align="center">

<img src="boostune-extension/assets/mockups/boostune-hero-banner.png" alt="Boostune â€” Control volume for every browser tab" width="100%">

<br/>
<br/>

[![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-4285F4?style=for-the-badge&logo=google-chrome&logoColor=white)](https://github.com/MohammedShakib/Boostune)
[![Manifest V3](https://img.shields.io/badge/Manifest-V3-00D4FF?style=for-the-badge&logo=googlechrome&logoColor=white)](https://developer.chrome.com/docs/extensions/mv3/intro/)
[![Version](https://img.shields.io/badge/Version-1.0.0-0066FF?style=for-the-badge)](https://github.com/MohammedShakib/Boostune/releases)
[![License](https://img.shields.io/badge/License-MIT-blueviolet?style=for-the-badge)](#-license)
[![Privacy](https://img.shields.io/badge/Privacy-First-00D48A?style=for-the-badge&logo=shield&logoColor=white)](boostune-extension/PRIVACY.md)

<h3>
  ðŸ”Š Boost, balance, and control audio for individual browser tabs.<br/>
  From 0% silence to your configured maximum amplification — per tab, in real time.
</h3>

</div>

---

## âœ¨ Preview

<div align="center">

<img src="boostune-extension/assets/mockups/boostune-popup-mockup.png" alt="Boostune Popup UI" width="420px">

<br/><br/>

<img src="boostune-extension/assets/mockups/boostune-settings-mockup.png" alt="Boostune Settings Page" width="100%">

</div>

---

## ðŸš€ Features

| Feature | Description |
|:---:|:---|
| ðŸŽšï¸ **Per-Tab Volume** | Independently control each tab from **0% to your configured maximum** |
| ðŸ›¡ï¸ **Safe Boost** | Built-in limiter/compressor to reduce clipping at high volumes |
| âš¡ **Quick Presets** | One-click preset buttons up to the configured maximum |
| ðŸŽ¯ **Playing Tabs** | See all audio-producing tabs and their Boostune volumes at a glance |
| ðŸ’¾ **Remember Volume** | Automatically restore volume per website (opt-in) |
| âŒ¨ï¸ **Keyboard Shortcuts** | `Alt+â†‘` / `Alt+â†“` / `Alt+Shift+0` for hands-free control |
| ðŸ”’ **Privacy First** | Zero network requests Â· No audio recording Â· No analytics |
| ðŸŒ **Chrome & Edge** | Works on all Chromium-based browsers |

---

## ðŸ—ï¸ Architecture

Boostune uses a clean, layered architecture where **audio never runs in the popup**:

```
Popup UI  (ephemeral â€” closes anytime)
    â”‚  chrome.runtime messages
    â–¼
Service Worker  (coordinates lifecycle)
    â”‚  chrome.tabCapture.getMediaStreamId()
    â”‚  chrome.offscreen.createDocument()
    â–¼
Offscreen Document  (persistent audio host)
    â”‚  navigator.mediaDevices.getUserMedia()
    â–¼
AudioContext  (one per active tab)
    MediaStreamAudioSourceNode
    â†’ GainNode          (configured volume range)
    â†’ DynamicsCompressor  (Safe Boost limiter)
    â†’ AudioContext.destination
```

> **No echo guaranteed.** Chrome automatically mutes the browser's native tab audio when `tabCapture` is active â€” all sound routes exclusively through our AudioContext.

---

## ðŸ“¦ Installation

### Load Unpacked (Developer Mode)

1. Clone or download this repository
```bash
git clone https://github.com/MohammedShakib/Boostune.git
```

2. Open **Chrome** and navigate to:
```
chrome://extensions
```

3. Enable **Developer mode** (top-right toggle)

4. Click **Load unpacked**

5. Select the `boostune-extension/` folder *(the one containing `manifest.json`)*

6. Pin Boostune to your toolbar â€” and you're ready! ðŸŽ‰

> **Microsoft Edge:** Same steps at `edge://extensions`

---

## ðŸŽ® How to Use

```
1.  Open any tab playing audio (YouTube, Spotify, a video callâ€¦)
2.  Click the Boostune icon in your toolbar
3.  Hit the toggle â†’ status changes to Boosting â—
4.  Drag the slider or tap a preset to set your volume
5.  Each tab is fully independent â€” set them all differently
6.  Toggle off â†’ audio returns to normal, no echo, no leftover sessions
```

---

## âŒ¨ï¸ Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Alt` + `â†‘` | Increase volume by 10% |
| `Alt` + `â†“` | Decrease volume by 10% |
| `Alt` + `Shift` + `0` | Reset to 100% |

> Customise at `chrome://extensions/shortcuts`

---

## ðŸ” Permissions

| Permission | Why It's Needed |
|---|---|
| `tabCapture` | Capture per-tab audio stream IDs |
| `offscreen` | Host a persistent AudioContext outside the popup |
| `storage` | Save your preferences & remembered site volumes |
| `tabs` | Read tab titles, favicons, and audible state |
| `activeTab` | Access current tab when popup opens |

> No host permissions (`<all_urls>`) are requested.

---

## ðŸ“ Project Structure

```
boostune-extension/
â”œâ”€â”€ manifest.json                        â† MV3 manifest
â”œâ”€â”€ PRIVACY.md Â· TESTING.md
â”‚
â”œâ”€â”€ src/
â”‚   â”œâ”€â”€ background/
â”‚   â”‚   â””â”€â”€ service-worker.js            â† Session orchestration
â”‚   â”œâ”€â”€ offscreen/
â”‚   â”‚   â”œâ”€â”€ offscreen.html               â† AudioContext host
â”‚   â”‚   â””â”€â”€ offscreen.js                 â† Message router
â”‚   â”œâ”€â”€ audio/
â”‚   â”‚   â”œâ”€â”€ audio-engine.js              â† AudioSession class
â”‚   â”‚   â””â”€â”€ audio-session-manager.js     â† Per-tab session map
â”‚   â”œâ”€â”€ popup/
â”‚   â”‚   â”œâ”€â”€ popup.html / .css / .js      â† Extension popup
â”‚   â”œâ”€â”€ options/
â”‚   â”‚   â”œâ”€â”€ options.html / .css / .js    â† Settings page
â”‚   â”œâ”€â”€ storage/
â”‚   â”‚   â””â”€â”€ storage.js                   â† chrome.storage wrapper
â”‚   â””â”€â”€ shared/
â”‚       â”œâ”€â”€ constants.js                 â† MSG types, VOLUME config
â”‚       â””â”€â”€ utils.js                     â† Logger, helpers
â”‚
â””â”€â”€ assets/
    â”œâ”€â”€ brand/                           â† Logo, waveform, badge
    â”œâ”€â”€ icons/                           â† icon16/32/48/128.png + SVG
    â””â”€â”€ mockups/                         â† UI screenshots
```

---

## ðŸŽ¨ Brand & Design

<div align="center">

<img src="boostune-extension/assets/mockups/boostune-brand-board.png" alt="Boostune Brand Board" width="100%">

</div>

---

## âš ï¸ Known Limitations

| Limitation | Details |
|---|---|
| **DRM Content** | Netflix, Disney+ block `tabCapture` for encrypted streams â€” Boostune shows a graceful error |
| **Browser Pages** | `chrome://` and `edge://` pages cannot be captured by design |
| **SW Termination** | Chrome may idle-kill the service worker; sessions enter Error state and can be manually resumed |
| **One Capture Per Tab** | If another extension already captures the tab, Boostune will show a permission error |

---

## ðŸ”’ Privacy

Boostune is **100% local**. It makes **zero network requests**.

- âœ… Audio processed entirely in your browser
- âœ… Nothing recorded, uploaded, or stored persistently
- âœ… No analytics, no telemetry, no third-party libraries
- âœ… Chromium uses no website content scripts; Firefox injects a local media bridge only when boosting is activated

â†’ Read the full [Privacy Policy](boostune-extension/PRIVACY.md)

---

## ðŸ› ï¸ Development

No build step required â€” all files are plain ES modules.

```bash
# Edit source files, then reload the extension:
# chrome://extensions â†’ Boostune â†’ Refresh icon
```

**Debug logging** is enabled by default. All logs are prefixed `[Boostune]`.  
Set `DEBUG = false` in `src/shared/utils.js` before a production release.

---

## ðŸ—ºï¸ Roadmap (V2 Ideas)

- [ ] ðŸ“Š Live waveform / VU meter visualiser
- [ ] ðŸŽ›ï¸ Per-tab equaliser (bass, mid, treble)
- [ ] ðŸ·ï¸ Badge icon showing current volume %
- [ ] ðŸ”‡ Noise gate (auto-mute below threshold)
- [ ] ðŸŒ™ Light / dark theme toggle
- [ ] ðŸ“¤ Export / import site preferences
- [ ] ðŸ¦Š Firefox support (MV2 port)

---

## ðŸ“„ License

MIT Â© [Mohammed Shakib](https://github.com/MohammedShakib)

---

<div align="center">

<img src="boostune-extension/assets/brand/boostune-logo-horizontal.png" alt="Boostune" width="220px">

<br/>

**A Louder Web Awaits.** ðŸ”Š

<br/>

*Built with the Web Audio API Â· Manifest V3 Â· Chrome tabCapture*

</div>
