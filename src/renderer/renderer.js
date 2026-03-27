// Lightbox ultra-légère pour images Markdown (initialisation après DOM prêt)
function initMarkdownLightbox() {
  const mdLightbox = document.getElementById('mdLightbox');
  const mdLightboxImg = document.getElementById('mdLightboxImg');
  const detailsLong = document.getElementById('detailsLong');
  if (mdLightbox && mdLightboxImg && detailsLong) {
    detailsLong.addEventListener('click', e => {
      const t = e.target;
      if (t && t.tagName === 'IMG') {
        mdLightboxImg.src = t.src;
        mdLightbox.style.display = 'flex';
      }
    });
    mdLightbox.addEventListener('click', () => {
      mdLightbox.style.display = 'none';
      mdLightboxImg.src = '';
    });
  }
}
const loadedIcons = new Set();
const scrollShell = document.querySelector('.scroll-shell');
const appConstants = window.constants || {};
const VISIBLE_COUNT = typeof appConstants.VISIBLE_COUNT === 'number' ? appConstants.VISIBLE_COUNT : 50;
const CATEGORY_ICON_MAP = appConstants.CATEGORY_ICON_MAP || {};
const appUtils = window.utils || {};
const appPreferences = window.preferences || {};
const AM_INSTALLER_COMMAND = 'wget -q https://raw.githubusercontent.com/ivan-hc/AM/main/AM-INSTALLER && chmod a+x ./AM-INSTALLER && ./AM-INSTALLER && rm ./AM-INSTALLER';
const PM_DOCS_URL = 'https://github.com/ivan-hc/AM#installation';
const getThemePref = typeof appPreferences.getThemePref === 'function'
  ? appPreferences.getThemePref
  : () => {
      try { return localStorage.getItem('themePref') || 'system'; }
      catch (_) { return 'system'; }
    };
const applyThemePreference = typeof appPreferences.applyThemePreference === 'function'
  ? appPreferences.applyThemePreference
  : () => {
      const pref = getThemePref();
      const root = document.documentElement;
      root.classList.remove('theme-light','theme-dark');
      if (pref === 'light') root.classList.add('theme-light');
      else if (pref === 'dark') root.classList.add('theme-dark');
    };
const loadOpenExternalPref = typeof appPreferences.loadOpenExternalPref === 'function'
  ? appPreferences.loadOpenExternalPref
  : () => {
      try { return localStorage.getItem('openExternalLinks') === '1'; }
      catch (_) { return false; }
    };
const saveOpenExternalPref = typeof appPreferences.saveOpenExternalPref === 'function'
  ? appPreferences.saveOpenExternalPref
  : (val) => {
      try { localStorage.setItem('openExternalLinks', val ? '1' : '0'); }
      catch (_) {}
    };
const getIconUrl = typeof appUtils.getIconUrl === 'function'
  ? appUtils.getIconUrl
  : (name) => `appicon://${name}.png`;
const debounce = typeof appUtils.debounce === 'function'
  ? appUtils.debounce
  : (fn, delay) => {
      let timer;
      return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), delay);
      };
    };

function getThemeVar(name, fallback) {
  try {
    const value = getComputedStyle(document.documentElement).getPropertyValue(name);
    return value && value.trim() ? value.trim() : fallback;
  } catch (_) {
    return fallback;
  }
}


function applyViewModeClass() {
  document.body.classList.remove('view-list','view-grid','view-icons','view-cards');
  if (state.viewMode === 'list') document.body.classList.add('view-list');
  else if (state.viewMode === 'icons') document.body.classList.add('view-icons');
  else if (state.viewMode === 'cards') document.body.classList.add('view-cards');
  else document.body.classList.add('view-grid');
  try { refreshAllSandboxBadges(); } catch (_) {}
}

let appListVirtual = [];
let currentEndVirtual = VISIBLE_COUNT;
let lastTileObserver = null;

let setAppListImpl = function(list) {
  appListVirtual = list;
  currentEndVirtual = VISIBLE_COUNT;
  if (scrollShell) scrollShell.scrollTop = 0;
  renderVirtualList();
};

function setAppList(list) {
  return setAppListImpl(list);
}

function renderVirtualList() {
  if (!appsDiv) return;
  appsDiv.innerHTML = '';
  const useSkeleton = appListVirtual.length > 50;
  if (useSkeleton) {
    const viewClass = 'view-' + (state.viewMode || 'grid');
    const fragment = document.createDocumentFragment();
    for (let i = 0; i < appListVirtual.length; i++) {
      const skel = document.createElement('div');
      skel.className = 'app-tile-skeleton ' + viewClass;
      skel.dataset.index = i;
      fragment.appendChild(skel);
    }
    appsDiv.appendChild(fragment);
    if (window.skeletonObserver) window.skeletonObserver.disconnect();
    window.skeletonObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        if (entry.target.classList.contains('hydrated')) return;
        const idx = parseInt(entry.target.dataset.index, 10);
        if (Number.isNaN(idx)) return;
        const realTile = buildTile(appListVirtual[idx]);
        realTile.classList.add('hydrated');
        entry.target.replaceWith(realTile);
        try { window.skeletonObserver.observe(realTile); } catch (_) {}
      });
    }, { root: scrollShell, threshold: 0.1 });
    const tiles = appsDiv.querySelectorAll('.app-tile-skeleton');
    tiles.forEach(tile => window.skeletonObserver && window.skeletonObserver.observe(tile));
    return;
  }

  const end = Math.min(currentEndVirtual, appListVirtual.length);
  const fragment = document.createDocumentFragment();
  for (let i = 0; i < end; i++) {
    fragment.appendChild(buildTile(appListVirtual[i]));
  }
  appsDiv.appendChild(fragment);
  if (lastTileObserver) lastTileObserver.disconnect();
  if (end < appListVirtual.length) {
    const tiles = appsDiv.querySelectorAll('.app-tile');
    const toObserve = Array.from(tiles).slice(-3);
    if (toObserve.length) {
      try {
        lastTileObserver = new IntersectionObserver((entries) => {
          if (entries.some(e => e.isIntersecting)) {
            lastTileObserver.disconnect();
            currentEndVirtual = Math.min(currentEndVirtual + VISIBLE_COUNT, appListVirtual.length);
            renderVirtualList();
          }
        }, { root: scrollShell, threshold: 0.1 });
        toObserve.forEach(tile => lastTileObserver.observe(tile));
      } catch(_) {}
    }
  }
  // --- Spacer pour scroll cohérent ---
  let spacer = appsDiv.querySelector('.app-list-spacer');
  if (!spacer) {
    spacer = document.createElement('div');
    spacer.className = 'app-list-spacer';
    spacer.style.width = '100%';
    spacer.style.pointerEvents = 'none';
    appsDiv.appendChild(spacer);
  }
  // Calculer la hauteur moyenne d'une tuile (sur le lot affiché)
  let tileHeight = 120; // fallback par défaut
  const firstTile = appsDiv.querySelector('.app-tile');
  if (firstTile) {
    tileHeight = firstTile.offsetHeight || tileHeight;
  }
  const missing = appListVirtual.length - end;
  spacer.style.height = (missing > 0 ? (missing * tileHeight) : 0) + 'px';
  // --- Fin spacer ---
}


// --- Intégration du prompt mot de passe sudo ---
if (window.electronAPI && window.electronAPI.onPasswordPrompt) {
  window.electronAPI.onPasswordPrompt(async (data) => {
    if (!window.ui || !window.ui.passwordPrompt || typeof window.ui.passwordPrompt.promptPassword !== 'function') return;
    const password = await window.ui.passwordPrompt.promptPassword();
    window.electronAPI.sendPassword({ id: data && data.id, password });
  });
}

// --- New: AM-VERIFIED SHA256 comparison support for updates ---
// This block listens for updates streaming events and captures
// SHA256 from AM-VERIFIED files before and after an update run.
// It requires backend helpers to read the AM-VERIFIED content or
// to return the SHA directly.
// Backend helpers (recommended):
//  - window.electronAPI.getVerifiedSha(appName) => returns sha string or { sha256: '...' }
// Fallback helpers (if getVerifiedSha not present):
//  - window.electronAPI.readFile(path) => returns file content
//  - window.electronAPI.getEnv(name) => returns environment variable (HOME/XDG_CONFIG_HOME)
// If those are not available, the handler is a no-op and the existing
// log-parsing fallback remains in place.
let updatesVerifiedComparator = {
  pre: new Map(),
  post: new Map(),
  activeId: null,
  enabled: !!(window.electronAPI?.getVerifiedSha || window.electronAPI?.readFile)
};

function parseSha256FromVerified(text) {
  if (!text || typeof text !== 'string') return null;
  const m = text.match(/SHA256:\s*([a-f0-9]{64})/i);
  return m ? m[1].toLowerCase() : null;
}

async function readVerifiedShaForApp(appName) {
  if (!appName) return null;
  try {
    // Preferred: dedicated helper
    if (typeof window.electronAPI?.getVerifiedSha === 'function') {
      const r = await window.electronAPI.getVerifiedSha(appName);
      if (!r) return null;
      if (typeof r === 'string') {
        const v = r.trim().toLowerCase();
        if (/^[a-f0-9]{64}$/.test(v)) return v;
      }
      if (r && r.sha256) {
        const v2 = String(r.sha256).trim().toLowerCase();
        if (/^[a-f0-9]{64}$/.test(v2)) return v2;
      }
    }

    // Fallback: try reading likely files if readFile is exposed
    if (typeof window.electronAPI?.readFile === 'function') {
      const tryPaths = [
        `/opt/${appName}/AM-VERIFIED`
      ];
      // If renderer can ask for XDG_CONFIG_HOME / HOME via getEnv, include appman path
      if (typeof window.electronAPI?.getEnv === 'function') {
        try {
          const xdg = await window.electronAPI.getEnv('XDG_CONFIG_HOME');
          if (xdg) {
            tryPaths.push(`${xdg.replace(/\/$/, '')}/appman/appman-config/${appName}/AM-VERIFIED`);
          } else {
            const home = await window.electronAPI.getEnv('HOME');
            if (home) tryPaths.push(`${home.replace(/\/$/, '')}/.config/appman/appman-config/${appName}/AM-VERIFIED`);
          }
        } catch (_) {}
      } else {
        // Optionally the backend can set window.__userXdgConfig or window.__userHomePath for the renderer to use.
        if (typeof window.__userXdgConfig === 'string' && window.__userXdgConfig) {
          tryPaths.push(`${window.__userXdgConfig.replace(/\/$/, '')}/appman/appman-config/${appName}/AM-VERIFIED`);
        } else if (typeof window.__userHomePath === 'string' && window.__userHomePath) {
          tryPaths.push(`${window.__userHomePath.replace(/\/$/, '')}/.config/appman/appman-config/${appName}/AM-VERIFIED`);
        }
      }
      for (const p of tryPaths) {
        try {
          const content = await window.electronAPI.readFile(p);
          const sha = parseSha256FromVerified(content || '');
          if (sha) return sha;
        } catch (_) {
          // ignore
        }
      }
    }
  } catch (_) {}
  return null;
}

async function capturePreUpdateVerified(id) {
  if (!updatesVerifiedComparator.enabled) return;
  updatesVerifiedComparator.activeId = id || null;
  updatesVerifiedComparator.pre.clear();
  // Use the list of installed apps known to the renderer
  const installedList = Array.from(state.installed || []);
  for (const nameLower of installedList) {
    try {
      const name = String(nameLower);
      const sha = await readVerifiedShaForApp(name);
      if (sha) updatesVerifiedComparator.pre.set(String(name).toLowerCase(), sha);
    } catch (_) {}
  }
}

async function capturePostUpdateAndApply(id) {
  if (!updatesVerifiedComparator.enabled) return;
  if (updatesVerifiedComparator.activeId && id && updatesVerifiedComparator.activeId !== id) return;
  updatesVerifiedComparator.post.clear();
  const installedList = Array.from(state.installed || []);
  for (const nameLower of installedList) {
    try {
      const name = String(nameLower);
      const sha = await readVerifiedShaForApp(name);
      if (sha) updatesVerifiedComparator.post.set(String(name).toLowerCase(), sha);
    } catch (_) {}
  }
  // Compare and produce changed set
  const changed = new Set();
  const allNames = new Set([...updatesVerifiedComparator.pre.keys(), ...updatesVerifiedComparator.post.keys()]);
  for (const nm of allNames) {
    const before = updatesVerifiedComparator.pre.get(nm) || null;
    const after = updatesVerifiedComparator.post.get(nm) || null;
    // Consider an app updated if SHA existed before and after and they differ,
    // or if before existed and after changed, or if after exists but before missing.
    if (before !== after) {
      // Only mark as changed when there's a meaningful after SHA (installed/valid)
      if (after) changed.add(nm);
    }
  }

  // Apply results to UI. This will refine whatever the log parsing displayed.
  try {
    if (changed.size > 0) {
      if (updateFinalMessage) updateFinalMessage.textContent = t('updates.updatedApps');
      if (updatedAppsIcons) {
        updatedAppsIcons.innerHTML = '';
        changed.forEach(nameLower => {
          const appObj = state.allApps.find(a => String(a.name).toLowerCase() === String(nameLower).toLowerCase());
          const displayName = appObj ? appObj.name : nameLower;
          const displayVersion = (appObj && appObj.version) ? appObj.version : '';
          const wrapper = document.createElement('div'); wrapper.className = 'updated-item';
          const img = document.createElement('img');
          img.src = getIconUrl(displayName);
          img.alt = displayName;
          img.onerror = () => { img.src = 'https://raw.githubusercontent.com/Portable-Linux-Apps/Portable-Linux-Apps.github.io/main/icons/blank.png'; };
          const meta = document.createElement('div'); meta.className = 'updated-meta';
          const title = document.createElement('div'); title.className = 'updated-name'; title.textContent = displayName;
          const ver = document.createElement('div'); ver.className = 'updated-version'; ver.textContent = displayVersion ? String(displayVersion) : '';
          if (!displayVersion) ver.hidden = true;
          meta.appendChild(title);
          meta.appendChild(ver);
          wrapper.appendChild(img);
          wrapper.appendChild(meta);
          updatedAppsIcons.appendChild(wrapper);
        });
      }
    } else {
      // If nothing changed according to SHA comparison, show the none-updated message
      if (updateFinalMessage) updateFinalMessage.textContent = t('updates.none');
      if (updatedAppsIcons) updatedAppsIcons.innerHTML = '';
    }
    if (updateResult) updateResult.style.display = 'block';
    // Trigger a refresh to ensure versions in list are consistent
    setTimeout(() => { loadApps().then(applySearch); }, 400);
  } catch (err) {
    console.error('applyVerifiedComparison failed', err);
  } finally {
    updatesVerifiedComparator.activeId = null;
  }
}

// Subscribe to updates progress events (safe: multiple listeners supported)
if (window.electronAPI?.onUpdatesProgress) {
  window.electronAPI.onUpdatesProgress(async (msg) => {
    try {
      if (!msg || !msg.kind) return;
      if (msg.kind === 'start') {
        // capture pre-update AM-VERIFIED SHA256
        await capturePreUpdateVerified(msg.id);
      } else if (msg.kind === 'done' || msg.kind === 'error') {
        // Wait a bit for the backend to finish writing files, then capture post-update and refine UI
        setTimeout(() => {
          capturePostUpdateAndApply(msg.id).catch(e => console.error('post-verify failed', e));
        }, 600);
      }
    } catch (e) {
      console.error('verified comparator handler error', e);
    }
  });
}
// --- End of AM-VERIFIED SHA256 comparison support ---


// ...existing code...

function createInstalledSection(sectionKey) {
  const section = document.createElement('div');
  section.className = 'installed-section';
  const title = document.createElement('h4');
  title.textContent = t(sectionKey === 'sandboxed' ? 'installed.section.sandboxed' : 'installed.section.others');
  section.appendChild(title);
  return section;
}

function buildTile(item){
  if (item && item.__section) {
    return createInstalledSection(item.__section);
  }
  const { name, installed, desc } = typeof item === 'string' ? { name: item, installed: false, desc: null } : item;
  const label = name.charAt(0).toUpperCase() + name.slice(1);
  const version = item?.version ? String(item.version) : null;
  let shortDesc = desc || (installed ? 'Déjà présente localement.' : 'Disponible pour installation.');
  if (shortDesc.length > 110) shortDesc = shortDesc.slice(0,107).trim() + '…';
  let actionsHTML = '';
  if (state.viewMode === 'list') {
    if (!installed) {
      let btnLabel = 'Installer';
      let actionAttr = 'install';
      let disabledAttr = '';
      if (activeInstallSession.id && !activeInstallSession.done && activeInstallSession.name === name){
        btnLabel = 'Installation… ✕';
        actionAttr = 'cancel-install';
      } else {
        const pos = getQueuePosition(name);
        if (pos !== -1) { btnLabel = 'En file (#'+pos+') ✕'; actionAttr='remove-queue'; }
      }
      actionsHTML = `<div class="actions"><button class="inline-action install" data-action="${actionAttr}" data-app="${name}"${disabledAttr}>${btnLabel}</button></div>`;
    } else {
      actionsHTML = `<div class="actions">`;
      actionsHTML += `<button class="inline-action uninstall" data-action="uninstall" data-app="${name}">${t('details.uninstall')}</button>`;
      actionsHTML += `</div>`;
    }
  }

  let stateBadge = '';
  if (state.viewMode !== 'list' && !installed) {
    if (activeInstallSession.id && !activeInstallSession.done && activeInstallSession.name === name) {
      stateBadge = ' <span class="install-state-badge installing" data-state="installing">Installation…<button class="queue-remove-badge inline-action" data-action="cancel-install" data-app="'+[...]
    } else {
      const pos = getQueuePosition(name);
      if (pos !== -1) stateBadge = ' <span class="install-state-badge queued" data-state="queued">En file (#'+pos+')<button class="queue-remove-badge inline-action" data-action="remove-queue" dat[...]
    }
  }
  const tile = document.createElement('div');
  tile.className = 'app-tile';
  tile.setAttribute('data-app', name);
  const isSandboxedTile = installed && isAppSandboxed(name);
  const badgeSymbol = isSandboxedTile ? '🔒' : '✓';
  const badgeHTML = installed
    ? `<span class="installed-badge" aria-label="Installée" title="Installée" style="position:absolute;top:2px;right:2px;">${badgeSymbol}</span>`
    : '';
  tile.innerHTML = `
    <div class="tile-icon" style="position:relative;display:inline-block;">
      <img data-src="${getIconUrl(name)}" alt="${label}" loading="lazy" decoding="async"${state.viewMode==='icons' ? ' class="icon-mode"' : ''} onerror="this.onerror=null; this.src='https://raw.g[...]
      ${badgeHTML}
    </div>
    <div class="tile-text">
      <div class="tile-name">${label}${version? ` <span class\"tile-version\">${version}</span>`: ''}${stateBadge}</div>
      <div class="tile-short">${shortDesc}</div>
    </div>
    ${actionsHTML ? actionsHTML : ''}`;

  applySandboxBadgeToIcon(tile.querySelector('.tile-icon'), isAppSandboxed(name));

  const img = tile.querySelector('img');
  if (img) {
    const iconUrl = img.getAttribute('data-src');
    if (iconUrl && loadedIcons.has(iconUrl)) {
      img.src = iconUrl;
      img.removeAttribute('data-src');
    } else if (iconUrl) {
      img.classList.add('img-loading');
      img.addEventListener('load', () => {
        img.classList.remove('img-loading');
        loadedIcons.add(iconUrl);
      }, { once:true });
      img.addEventListener('error', () => { img.classList.remove('img-loading'); }, { once:true });
      if (iconObserver) iconObserver.observe(img); else { img.src = iconUrl; img.removeAttribute('data-src'); }
      if (buildTile._count === undefined) buildTile._count = 0;
      if (buildTile._count < 48) {
        try { img.setAttribute('fetchpriority','high'); } catch(_){ }
      }
      buildTile._count++;
    }
  }
  tile.tabIndex = 0; // navigation clavier
  tile.addEventListener('click', (ev) => {
    if (ev.target.closest('.inline-action')) return; // ne pas ouvrir si clic sur bouton d'action
    showDetails(name);
  });
  tile.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter' || ev.key === ' ') {
      if (ev.target.closest('.inline-action')) return;
      ev.preventDefault();
      showDetails(name);
    }
  });
  return tile;
}
// ...existing code...

// Active/désactive les animations globales selon l'état
function setAnimationsActive(active) {
  document.body.classList.toggle('animations-active', !!active);
}

// Désactiver les animations au démarrage
setAnimationsActive(false);

// Animations globales
// ...existing code...


function initXtermLog() {
  if (!xtermLogDiv) xtermLogDiv = document.getElementById('xtermLog');
  if (!xtermLogDiv) return;
  if (!xterm) {
    try {
      const { Terminal } = require('@xterm/xterm');
      const { FitAddon } = require('@xterm/addon-fit');
      xterm = new Terminal({
        fontSize: 13,
        fontFamily: 'monospace',
        theme: { background: '#181c20' },
        convertEol: true,
        scrollback: 2000,
        disableStdin: true,
        cursorBlink: false
      });
      xtermFit = new FitAddon();
      xterm.loadAddon(xtermFit);
      xterm.open(xtermLogDiv);
      window.addEventListener('resize', ()=>xtermFit.fit());
      xtermFit.fit();
    } catch (_err) {
      xterm = null;
      xtermFit = null;
      if (xtermLogDiv) xtermLogDiv.style.display = 'none';
      if (installStreamLog) installStreamLog.style.display = '';
      return;
    }
  } else {
    xterm.clear();
    xtermFit && xtermFit.fit();
  }
  xtermLogDiv.style.display = '';
  if (installStreamLog) installStreamLog.style.display = 'none';
}
// --- xterm.js pour affichage terminal natif ---
let xterm = null;
let xtermFit = null;
let xtermLogDiv = null;
// Contrôles fenêtre
document.addEventListener('click', (e) => {
  const b = e.target.closest('.win-btn');
  if (!b) return;
  const act = b.getAttribute('data-action');
  if (!act) return;
  try { window.electronAPI.windowControl(act); } catch(_) {}
});

[...]