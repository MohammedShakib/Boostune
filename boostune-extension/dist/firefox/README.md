# Boostune

Boost Every Tab! A powerful, per-tab volume booster and audio balancer browser extension.

Boostune allows you to amplify audio on any tab up to 600%. It features a built-in compressor (Safe Boost) to prevent distortion, independent volume control for every tab, and a beautiful UI.

## Features
- 🎚️ **Per-tab control:** Boost volume up to 600% on a per-tab basis without affecting others.
- 🛡️ **Safe Boost:** A built-in dynamics compressor automatically prevents clipping and audio distortion when boosting to high levels.
- 💾 **Remember Volumes:** Optionally remember volume settings on a per-site basis.
- ⌨️ **Shortcuts:** Control volume directly with keyboard shortcuts (`Alt+Up`, `Alt+Down`).
- 🌐 **Cross-Browser:** Supports Google Chrome, Microsoft Edge, Brave, and Mozilla Firefox!

## Build Instructions

Boostune utilizes a dual-architecture system to support both Chromium (using `chrome.tabCapture` + Offscreen Documents) and Firefox (using Content Scripts + Main World DOM manipulation) simultaneously.

### Requirements
- Node.js

### Building
To build the extension for your target browser:
```bash
npm install
npm run build
```
This will output to `dist/chromium/` and `dist/firefox/`.

You can also run platform-specific builds:
```bash
npm run build:chromium
npm run build:firefox
```

## Loading the Extension

### Chrome / Edge / Brave
1. Go to `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the `dist/chromium/` folder.

### Mozilla Firefox
1. Go to `about:debugging#/runtime/this-firefox`
2. Click "Load Temporary Add-on..."
3. Select the `dist/firefox/manifest.json` file.

## Architecture & Compatibility
For more information about how Boostune achieves cross-browser compatibility across strict MV3 environments, see [COMPATIBILITY.md](COMPATIBILITY.md).

## Privacy
Boostune respects your privacy. It processes all audio strictly locally, stores data only locally, and contains zero tracking or analytics. Read more in [PRIVACY.md](PRIVACY.md).
