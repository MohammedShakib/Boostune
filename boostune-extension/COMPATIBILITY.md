# Browser Compatibility

Boostune is a cross-browser extension designed to run on Chromium-based browsers (Google Chrome, Microsoft Edge, Brave) and Mozilla Firefox. Due to differences in extension API implementations between browser engines, Boostune utilizes two distinct audio capture strategies under the hood.

## Supported Browsers

| Browser | Minimum Version | Status | Architecture Strategy |
|---------|-----------------|---------------|------------------------|
| Google Chrome | 116+ | ✅ Verified | Offscreen Document + `chrome.tabCapture` |
| Microsoft Edge | 116+ | ⏳ Not tested | Offscreen Document + `chrome.tabCapture` |
| Brave Browser | 116+ | ⏳ Not tested | Offscreen Document + `chrome.tabCapture` |
| Mozilla Firefox | 109+ | ✅ Verified | Content Script + Page Audio (Main World) |

## Architectural Strategies

### Chromium Strategy (Offscreen + tabCapture)
Chromium browsers support the `chrome.tabCapture` API, which provides a media stream of the entire tab's audio output. Since Manifest V3 service workers cannot process audio streams directly, Boostune spawns a hidden **Offscreen Document**. The offscreen document receives the tab's stream ID, creates an `AudioContext`, and applies the volume processing (GainNode + DynamicsCompressorNode). 
- **Advantage:** Captures *all* audio emitted by the tab, regardless of cross-origin CORS constraints or dynamically generated WebAudio graphs.
- **Limitation:** Cannot be used in Firefox.

### Firefox Strategy (Page Audio Adapter)
Mozilla Firefox does not support `tabCapture` without prompting the user with a screen-sharing UI. To provide a seamless experience, Boostune injects a content script directly into the page's DOM (Main World). This script scans the page for `<audio>` and `<video>` tags using `document.querySelectorAll()` and a `MutationObserver`. It then intercepts each media element, routes it through an `AudioContext`, applies the volume boost, and connects it to the speakers.
- **Advantage:** Runs natively in Firefox without intrusive permission prompts.
- **Limitation:** Cannot capture audio from third-party iframes or canvases due to strict cross-origin (CORS) security restrictions, unless the media source explicitly enables CORS.

## Cross-Browser Codebase
To support both architectures in a single repository, the codebase is split into:
- `src/core/`: Contains shared logic, UI controllers, options management, and storage wrappers.
- `src/platforms/chromium/`: Contains the Service Worker and Offscreen document for Chrome/Edge/Brave.
- `src/platforms/firefox/`: Contains the Event Page Background script and DOM injection scripts for Firefox.
