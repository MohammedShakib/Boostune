// ─────────────────────────────────────────────────────────────
//  Boostune — Options Page Controller
// ─────────────────────────────────────────────────────────────

import { getPrefs, updatePrefs, getSiteVolumes, clearSiteVolume, clearAllSiteVolumes } from '../storage/storage.js';

const $ = (id) => document.getElementById(id);

// ── Navigation ────────────────────────────────────────────────

const navItems = document.querySelectorAll('.nav-item');
const pages    = document.querySelectorAll('.page');

navItems.forEach((item) => {
  item.addEventListener('click', () => navigateTo(item.dataset.page));
  item.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigateTo(item.dataset.page); }
  });
});

function navigateTo(pageId) {
  navItems.forEach((i) => i.classList.toggle('active', i.dataset.page === pageId));
  pages.forEach((p)    => p.classList.toggle('active', p.id === `page-${pageId}`));

  // Refresh sites list when visiting that page
  if (pageId === 'sites') renderSiteVolumes();
}

// ── Load prefs & bind controls ────────────────────────────────

let prefs = {};

async function init() {
  // Version label
  const manifest = chrome.runtime.getManifest();
  const ver = `v${manifest.version}`;
  if ($('sidebarVersion')) $('sidebarVersion').textContent = `Boostune ${ver}`;
  if ($('aboutVersion'))   $('aboutVersion').textContent   = ver;

  prefs = await getPrefs();

  // General
  $('defaultVolumeSelect').value = String(prefs.defaultVolume ?? 100);
  $('rememberVolumeToggle').checked = Boolean(prefs.rememberVolume);

  // Audio
  $('safeBoostDefaultToggle').checked = Boolean(prefs.safeBoost ?? true);
  $('maxVolumeSelect').value = String(prefs.maxVolume ?? 400);

  // Bind changes
  bindChange('defaultVolumeSelect',   'change', (v) => ({ defaultVolume: parseInt(v, 10) }));
  bindChange('rememberVolumeToggle',  'change', (_, el) => ({ rememberVolume: el.checked }));
  bindChange('safeBoostDefaultToggle','change', (_, el) => ({ safeBoost: el.checked }));
  bindChange('maxVolumeSelect',       'change', (v) => ({ maxVolume: parseInt(v, 10) }));

  // Clear all sites
  $('clearAllSitesBtn').addEventListener('click', async () => {
    await clearAllSiteVolumes();
    renderSiteVolumes();
    showToast('All saved site volumes cleared.');
  });

  await renderSiteVolumes();
}

function bindChange(id, event, mapper) {
  const el = $(id);
  if (!el) return;
  el.addEventListener(event, async () => {
    const updates = mapper(el.value, el);
    Object.assign(prefs, updates);
    await updatePrefs(updates);
    showToast('Saved.');
  });
}

// ── Site volumes ──────────────────────────────────────────────

async function renderSiteVolumes() {
  const container = $('siteVolumesList');
  if (!container) return;

  const vols = await getSiteVolumes();
  const entries = Object.entries(vols);

  if (entries.length === 0) {
    container.innerHTML = '<div class="empty-msg">No site volumes saved yet.</div>';
    return;
  }

  const table = document.createElement('table');
  table.className = 'site-volumes-table';
  table.innerHTML = `
    <thead>
      <tr>
        <th>Website</th>
        <th>Volume</th>
        <th></th>
      </tr>
    </thead>
    <tbody></tbody>
  `;

  const tbody = table.querySelector('tbody');
  for (const [domain, volume] of entries.sort()) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escHtml(domain)}</td>
      <td class="vol-cell">${volume}%</td>
      <td>
        <button class="delete-btn" aria-label="Remove ${escHtml(domain)}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
            <path d="M10 11v6M14 11v6"/>
            <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
          </svg>
        </button>
      </td>
    `;
    tr.querySelector('.delete-btn').addEventListener('click', async () => {
      await clearSiteVolume(domain);
      showToast(`Cleared volume for ${domain}`);
      renderSiteVolumes();
    });
    tbody.appendChild(tr);
  }

  container.innerHTML = '';
  container.appendChild(table);
}

// ── Toast ──────────────────────────────────────────────────────

let _toastTimer;
function showToast(msg, duration = 2000) {
  const el = $('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.add('hidden'), duration);
}

// ── Utility ───────────────────────────────────────────────────

function escHtml(str) {
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Boot ──────────────────────────────────────────────────────

init().catch((e) => console.error('[Boostune] options init failed', e));
