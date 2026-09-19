# Boostune — Testing Guide

Manual testing checklist for verifying that Boostune's audio pipeline and UI work correctly.

---

## Setup

1. Load `boostune-extension/` as an unpacked extension in Chrome
2. Confirm no manifest errors in `chrome://extensions`
3. Open the browser console for the service worker:
   - `chrome://extensions` → Boostune → **Service worker** → Inspect
4. Open the offscreen document console (when active):
   - Chrome DevTools → More tools → Background services

---

## Phase 1: Audio Pipeline Verification

### Basic capture test (YouTube)

- [ ] Open YouTube, play a video
- [ ] Open Boostune popup
- [ ] Click **Inactive** toggle → status changes to **Boosting**
- [ ] Video audio continues without echo or double-playback
- [ ] Set volume to **100%** → volume sounds approximately normal
- [ ] Set volume to **200%** → audio is noticeably louder
- [ ] Set volume to **50%** → audio is quieter
- [ ] Set volume to **0%** → audio is silent
- [ ] Click toggle → **Inactive** → audio returns to normal playback

### Safe Boost

- [ ] Set volume to **300%** with Safe Boost ON → reduced clipping vs OFF
- [ ] Toggle Safe Boost OFF → more raw amplification, possibly some clipping
- [ ] Toggle back ON → limiter re-engages without audio interruption

---

## Phase 2: Volume Controls

- [ ] Slider moves smoothly with no audio pops or clicks
- [ ] **−** button decreases by 10%
- [ ] **+** button increases by 10%
- [ ] Volume cannot exceed 600%
- [ ] Volume cannot go below 0%
- [ ] Preset buttons (50%, 100%, 150%, 200%, 300%, 400%, 600%) set correct value
- [ ] 100% preset highlights as the default/reset
- [ ] Active preset button is highlighted in blue
- [ ] Volume display updates in real-time during slider drag

---

## Phase 3: Per-Tab Independence

- [ ] Open Tab A (YouTube) → set to **180%**
- [ ] Open Tab B (Spotify or another audio site) → activate Boostune → set to **120%**
- [ ] Switch back to Tab A → confirm volume is still **180%**
- [ ] Adjust Tab B volume → Tab A is unaffected
- [ ] Playing Tabs list shows both tabs with correct volumes

---

## Phase 4: Session Lifecycle

### Tab close
- [ ] Activate Boostune on a tab → close the tab → no console errors
- [ ] Service worker session cleaned up (check SW console)

### Tab navigation
- [ ] Activate Boostune → navigate the tab to a new URL → Boostune stops gracefully
- [ ] No audio ghost / echo on the new page
- [ ] Status returns to Inactive in popup

### Tab refresh
- [ ] Activate Boostune → press Ctrl+R to reload → session handled cleanly
- [ ] Can re-activate on the refreshed tab

### Multiple rapid volume changes
- [ ] Drag slider quickly from 0% to 600% and back → no audio pops/clicks
- [ ] No JavaScript errors in SW or offscreen consoles

### Extension reload
- [ ] Activate Boostune → go to `chrome://extensions` → reload Boostune
- [ ] Popup shows Error state (expected — SW restart kills pipeline)
- [ ] Re-activating works correctly after reload

---

## Phase 5: Edge Cases

### Unsupported pages
- [ ] Open `chrome://settings` → Boostune shows "can't control audio on this page"
- [ ] Open `chrome://newtab` → same graceful error
- [ ] Controls are disabled on unsupported pages

### No audio
- [ ] Activate Boostune on a tab with no audio playing → works (no audio = silence boosted = silence)

### Popup close during active session
- [ ] Activate Boostune → close popup → re-open popup
- [ ] Session state is correctly shown (still Active/Boosting)
- [ ] Audio still boosted after popup close

---

## Phase 6: Settings

- [ ] Open Settings page → all sections load
- [ ] Change Default Volume → save → re-open popup → new default applied
- [ ] Enable Remember Volume → boost YouTube to 180% → close tab → re-open YouTube → 180% is auto-applied
- [ ] Site Preferences page shows saved domains → can delete individual entries
- [ ] Clear All site volumes → list is empty
- [ ] Privacy page information is accurate

---

## Phase 7: Keyboard Shortcuts

- [ ] Activate Boostune on a tab
- [ ] Press **Alt + ↑** → volume increases by 10%
- [ ] Press **Alt + ↓** → volume decreases by 10%
- [ ] Press **Alt + Shift + 0** → volume resets to 100%
- [ ] Shortcuts do nothing when Boostune is inactive on the current tab

---

## Volume Verification Matrix

| Volume | Expected Behaviour |
|---|---|
| 0%   | Silence |
| 50%  | Half of normal volume |
| 100% | Approximately normal (original) volume |
| 150% | Moderately louder |
| 200% | Noticeably louder |
| 300% | Loud; Safe Boost recommended |
| 400% | Very loud; possible clipping without Safe Boost |
| 600% | Maximum; high risk of clipping on low-quality sources |

---

## Test Sites

| Site | Notes |
|---|---|
| YouTube | Standard test; generally works well |
| Spotify Web | HTML5 audio; good test case |
| Vimeo | HTML5 video |
| Any HTML5 `<audio>` or `<video>` page | Should work |
| Netflix / Disney+ | DRM may block capture — expect graceful error |
| `chrome://settings` | Must show "unsupported page" error |

---

## Definition of Done

A build is considered passing when:

- [x] Real tab audio is captured (not fake)
- [x] 100% = approximately normal volume
- [x] 0% = silence
- [x] Up to 600% selectable
- [x] Safe Boost functional (compressor engaged/disengaged)
- [x] Multiple tabs have independent volume levels
- [x] No duplicate audio / echo
- [x] Disabling Boostune restores original playback
- [x] Tab close cleans up session
- [x] Navigation handled cleanly
- [x] Service worker restart handled (error state shown)
- [x] Settings persist correctly
- [x] Unsupported pages show proper messages
- [x] No manifest errors on load
- [x] No backend required
- [x] README complete
- [x] Privacy documentation included
