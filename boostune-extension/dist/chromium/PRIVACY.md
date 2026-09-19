# Boostune — Privacy Policy

**Last updated:** September 2026  
**Version:** 1.0.0

---

## Summary

Boostune processes tab audio **entirely within your browser** on your local device.  
It does not record, transmit, or store audio in any persistent form.  
It makes **zero network requests**.

---

## What Boostune Does

- **Captures tab audio** using either the browser's `chrome.tabCapture` API (Chromium) or an injected content script (Firefox) to obtain a real-time audio stream from the tab you choose to boost.
- **Processes audio locally** inside an extension Offscreen Document (Chromium) or directly on the page (Firefox). The audio passes through a Web Audio API pipeline (GainNode → optional DynamicsCompressorNode) and is output to your speakers or headphones.
- **Stores your preferences** (default volume, Safe Boost setting, remembered site volumes) in `chrome.storage.sync`. This data is scoped to your Chrome/Edge profile and may be synced across devices by the browser if you have profile sync enabled. No Boostune server is involved.
- **Reads tab metadata** (title, favicon URL, audible state) to populate the popup's playing-tabs list. This data is used only for display purposes and is never transmitted.

---

## What Boostune Does NOT Do

| Boostune does **NOT** | Details |
|---|---|
| Record audio | The captured audio stream is processed transiently and discarded. No audio data is written to disk or persistent memory. |
| Transmit audio | No audio data is sent to any server, API, or third party. |
| Collect analytics | There is no analytics or telemetry code in Boostune. |
| Use third-party scripts | All code runs locally. There are no third-party JavaScript libraries or CDN dependencies. |
| Store browsing history | Tab URLs and titles displayed in the popup are used only for display during that session and are not persisted beyond `chrome.storage.session` (which is cleared when the browser closes). |
| Inject content scripts | Boostune injects a lightweight content script in Firefox strictly for routing media elements through the local Web Audio API graph. No external scripts are ever injected, and Chromium builds do not use content scripts for audio routing. |
| Access microphone | Boostune captures tab audio only, not microphone input. |
| Require an account | Boostune works entirely without user accounts or authentication. |

---

## Permissions Used and Why

| Permission | Why it is required |
|---|---|
| `tabCapture` | To obtain a media stream ID for the selected tab's audio |
| `offscreen` | To run an AudioContext in a persistent background page separate from the popup |
| `storage` | To save your preferences and optional per-site volume settings |
| `tabs` | To read tab titles, favicons, and the `audible` flag for the Playing Tabs list |
| `activeTab` | To read the current tab's URL and title when the popup is opened |

| `scripting` (Firefox only) | To inject the necessary page-audio content script into the active tab for routing audio on demand. |

No host permissions (`<all_urls>` or site-specific) are requested on Chromium. Firefox requests `scripting` to manipulate the DOM audio context dynamically.

---

## Data Stored

| Data | Where | When cleared |
|---|---|---|
| User preferences (volume default, Safe Boost, max volume) | `chrome.storage.sync` | When user clears in Settings or uninstalls |
| Remembered site volumes | `chrome.storage.sync` | User can clear in Settings → Site Preferences |
| Active session state (tab IDs, capture status) | `chrome.storage.session` | Automatically cleared when the browser closes |

Tab IDs are session-identifiers provided by Chrome — they are ephemeral and **never stored in `chrome.storage.sync`**.

---

## Fonts

The popup and options page use system fonts only. Boostune does not load fonts, scripts, styles, or other assets from external servers.

---

## Contact

Boostune is an open-source browser extension. For questions or issues, refer to the project repository.

---

*Boostune is not affiliated with Google, Microsoft, or any browser vendor.*
