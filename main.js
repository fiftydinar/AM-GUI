// Set terminal environment variables if missing (useful for AppImage)
if (!process.env.TERM) process.env.TERM = 'xterm-256color';
if (!process.env.COLORTERM) process.env.COLORTERM = 'truecolor';
// Add XDG_BIN_HOME to PATH if missing
const xdgBinHome = process.env.XDG_BIN_HOME || (process.env.HOME ? `${process.env.HOME}/.local/bin` : null);
if (xdgBinHome && !process.env.PATH.split(':').includes(xdgBinHome)) {
  process.env.PATH = `${process.env.PATH}:${xdgBinHome}`;
}

const { app, BrowserWindow, ipcMain, Menu, protocol, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { exec, spawn } = require('child_process');
const { registerCategoryHandlers } = require('./src/main/categories');
const { initTray, destroyTray, setTrayLocale } = require('./src/main/tray');
const { getContextMenuLabels, tErr, setLocale } = require('./src/main/trayI18n');
const { detectPackageManager, invalidatePackageManagerCache } = require('./src/main/packageManager');
const { createIconCacheManager } = require('./src/main/iconCache');
const { installAppManAuto } = require('./src/main/appManAuto');

const fsp = fs.promises;
const SANDBOX_DIR_KEYS = ['desktop', 'documents', 'downloads', 'games', 'music', 'pictures', 'videos'];
const SANDBOX_MARKER = 'aisap-am sandboxing script';

const iconCacheManager = createIconCacheManager(app);
registerCategoryHandlers(ipcMain);

// --- Single instance lock ---
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
  process.exit(0);
} else {
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    // Someone tried to launch a second instance, focus the existing window
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
      // Force to foreground temporarily
      mainWindow.setAlwaysOnTop(true);
      setTimeout(() => {
        if (mainWindow) mainWindow.setAlwaysOnTop(false);
      }, 100);
    }
  });
}

// --- GPU acceleration management (must be BEFORE app.whenReady) ---
// Check command-line arguments first
const hasDisableGpuFlag = process.argv.includes('--disable-gpu');

let disableGpuPref = false;
try {
  const prefPath = path.join(app.getPath('userData'), 'gpu-pref.json');
  console.log('[GPU DEBUG] Checking GPU pref file at:', prefPath);
  if (fs.existsSync(prefPath)) {
    const raw = fs.readFileSync(prefPath, 'utf8');
    console.log('[GPU DEBUG] File content:', raw);
    disableGpuPref = JSON.parse(raw).disableGpu === true;
    console.log('[GPU DEBUG] disableGpuPref parsed to:', disableGpuPref);
  } else {
    console.log('[GPU DEBUG] File does not exist');
  }
} catch(e){ 
  console.log('[GPU DEBUG] Error reading GPU pref:', e);
}

// Disable GPU if requested by CLI flag or preference
const shouldDisableGpu = hasDisableGpuFlag || disableGpuPref;
if (shouldDisableGpu && typeof app.disableHardwareAcceleration === 'function') {
  console.log('[GPU DEBUG] Calling app.disableHardwareAcceleration() - reason:', hasDisableGpuFlag ? 'CLI flag' : 'user preference');
  app.disableHardwareAcceleration();
} else {
  console.log('[GPU DEBUG] NOT calling app.disableHardwareAcceleration(), shouldDisable:', shouldDisableGpu, 'function exists:', typeof app.disableHardwareAcceleration === 'function');
  // Suppress benign VSync errors when GPU is enabled
  app.commandLine.appendSwitch('disable-gpu-vsync');
  app.commandLine.appendSwitch('disable-frame-rate-limit');
}

const errorLogPath = path.join(app.getPath('userData'), 'error.log');

function logGlobalError(err) {
  const msg = `[${new Date().toISOString()}] ${err && err.stack ? err.stack : err}`;
  try { fs.appendFileSync(errorLogPath, msg + '\n'); } catch(e) {}
  console.error(msg);
}

process.on('uncaughtException', logGlobalError);
process.on('unhandledRejection', logGlobalError);
// Check if app.setName or equivalent exists and replace with 'AM-GUI' if needed
if (app.setName) {
  app.setName('AM-GUI');
}

let mainWindow = null;
let currentLocale = 'en';
const activeInstalls = new Map();
const activeUpdates = new Map();
const passwordWaiters = new Map();

async function isExecutableFile(filePath) {
  if (!filePath) return false;
  try {
    const stats = await fsp.stat(filePath);
    if (!stats.isFile()) return false;
    await fsp.access(filePath, fs.constants.X_OK);
    return true;
  } catch (_) {
    return false;
  }
}

async function resolveCommandPath(binName) {
  if (!binName || typeof binName !== 'string') return null;
  const trimmed = binName.trim();
  if (!trimmed) return null;
  if (trimmed.includes(path.sep)) {
    if (await isExecutableFile(trimmed)) return trimmed;
  }
  const envPath = process.env.PATH || '';
  const pathEntries = envPath.split(path.delimiter).filter(Boolean);
  for (const entry of pathEntries) {
    const candidate = path.join(entry, trimmed);
    if (await isExecutableFile(candidate)) return candidate;
  }
  const homeDir = os.homedir();
  const candidates = new Set([
    path.join(homeDir, '.local/bin', trimmed),
    path.join(homeDir, 'bin', trimmed),
    path.join(homeDir, 'Applications', 'bin', trimmed),
    path.join(homeDir, 'Applications', trimmed, trimmed),
    path.join(homeDir, 'Applications', trimmed, `${trimmed}.sh`),
    path.join(homeDir, 'Applications', trimmed, `${trimmed}.AppImage`)
  ]);
  for (const candidate of candidates) {
    if (await isExecutableFile(candidate)) return candidate;
  }
  return null;
}

async function isSandboxWrapper(execPath) {
  if (!execPath) return false;
  try {
    const handle = await fsp.open(execPath, 'r');
    const buffer = Buffer.alloc(4096);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    await handle.close();
    if (!bytesRead) return false;
    const snippet = buffer.slice(0, bytesRead).toString('utf8');
    return snippet.includes(SANDBOX_MARKER);
  } catch (_) {
    return false;
  }
}

async function detectAppImageFromPath(execPath) {
  if (!execPath) return null;
  try {
    const handle = await fsp.open(execPath, 'r');
    const buffer = Buffer.alloc(16);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    await handle.close();
    if (bytesRead < 12) return null;
    const isElf = buffer[0] === 0x7f && buffer[1] === 0x45 && buffer[2] === 0x4c && buffer[3] === 0x46;
    if (!isElf) return null;
    const hasAppImageMagic = buffer[8] === 0x41 && buffer[9] === 0x49 && buffer[10] === 0x02;
    return hasAppImageMagic;
  } catch (_) {
    return null;
  }
}

async function detectSandboxDependencies() {
  const [sasPath, aisapPath] = await Promise.all([
    resolveCommandPath('sas'),
    resolveCommandPath('aisap')
  ]);
  const result = { hasSas: !!sasPath, hasAisap: !!aisapPath };
  return result;
}

function getForbiddenSandboxPaths() {
  const homeDir = os.homedir();
  const dataDir = process.env.XDG_DATA_HOME || path.join(homeDir, '.local/share');
  const configDir = process.env.XDG_CONFIG_HOME || path.join(homeDir, '.config');
  const binDir = process.env.XDG_BIN_HOME || path.join(homeDir, '.local/bin');
  return new Set([
    path.resolve('/'),
    path.resolve('/home'),
    path.resolve(homeDir),
    path.resolve(dataDir),
    path.resolve(configDir),
    path.resolve(binDir)
  ]);
}

function normalizeCustomSandboxPath(input) {
  if (!input || typeof input !== 'string') return '';
  let candidate = input.trim();
  if (!candidate) return '';
  if (candidate.startsWith('~/')) {
    candidate = path.join(os.homedir(), candidate.slice(2));
  } else if (candidate === '~') {
    candidate = os.homedir();
  }
  return path.resolve(candidate);
}

async function validateCustomSandboxPath(input) {
  const normalized = normalizeCustomSandboxPath(input);
  if (!normalized) return { ok: true, value: '' };
  const forbidden = getForbiddenSandboxPaths();
  if (forbidden.has(path.normalize(normalized))) {
    return { ok: false, error: tErr('errForbiddenPath', 'forbidden-path') };
  }
  try {
    await fsp.stat(normalized);
  } catch (_) {
    return { ok: false, error: tErr('errMissingPath', 'missing-path') };
  }
  return { ok: true, value: normalized };
}

function buildSandboxAnswerScript(shouldConfigure, dirSelections, customPath) {
  if (!shouldConfigure) return 'n\n';
  const answers = ['y'];
  SANDBOX_DIR_KEYS.forEach((key) => {
    answers.push(dirSelections[key] ? 'y' : 'n');
  });
  if (customPath) {
    answers.push('y');
    answers.push(customPath);
  } else {
    answers.push('n');
  }
  return answers.map((ans) => `${ans ?? ''}\n`).join('');
}

function runSandboxTask(sender, { pm, action, args, stdinScript, appName }) {
  return new Promise((resolve) => {
    const pty = require('node-pty');
    const id = `${action}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    const env = Object.assign({}, process.env, {
      TERM: 'xterm',
      COLS: '80',
      ROWS: '30',
      FORCE_COLOR: '1'
    });
    let child;
    try {
      child = pty.spawn(pm, args, {
        name: 'xterm-color',
        cols: 80,
        rows: 30,
        cwd: process.cwd(),
        env
      });
    } catch (err) {
      invalidatePackageManagerCache();
      return resolve({ ok: false, error: err?.message || tErr('errUnableStartSandbox', 'Unable to start sandbox command.'), id });
    }
    let settled = false;
    let output = '';
    const passwordRegex = /\[sudo\]|mot de passe.*:|password.*:/i;
    const send = (payload) => {
      if (!sender) return;
      try {
        sender.send('sandbox-progress', Object.assign({ id, action, appName }, payload));
      } catch (_) {}
    };
    const finish = (result) => {
      if (settled) return;
      settled = true;
      passwordWaiters.delete(id);
      resolve(result);
    };
    send({ kind: 'start' });
    passwordWaiters.set(id, (password) => {
      if (typeof password === 'string') {
        try { child.write(password + '\n'); }
        catch (_) {}
      } else {
        try { child.kill('SIGKILL'); }
        catch (_) {}
      }
    });
    child.onData((txt) => {
      output += txt;
      send({ kind: 'data', chunk: txt });
      if (passwordRegex.test(txt)) {
        try { sender?.send('password-prompt', { id }); }
        catch (_) {}
      }
    });
    child.onExit((evt) => {
      const code = typeof evt?.exitCode === 'number' ? evt.exitCode : evt?.code;
      const success = code === 0;
      send({ kind: 'done', code, success });
      finish({ ok: success, code, output, id });
    });
    child.on?.('error', (err) => {
      const message = err?.message || '';
      const code = err?.code || '';
      // node-pty may emit EIO when the PTY closes normally; treat it as benign.
      if (code === 'EIO' || /EIO/.test(message)) {
        send({ kind: 'debug', message: tErr('errSandboxPtyClosed', 'Sandbox PTY closed (EIO)') });
        return;
      }
      invalidatePackageManagerCache();
      send({ kind: 'error', message: message || tErr('errSandboxFailed', 'Sandbox command failed.') });
      finish({ ok: false, error: message || tErr('errSandboxFailed', 'Sandbox command failed.'), output, id });
    });
    if (stdinScript) {
      setTimeout(() => {
        try { child.write(stdinScript); }
        catch (_) {}
      }, 120);
    }
  });
}

// IPC to read/write GPU preference
ipcMain.handle('get-gpu-pref', async () => {
  try {
    const prefPath = path.join(app.getPath('userData'), 'gpu-pref.json');
    if (fs.existsSync(prefPath)) {
      const raw = fs.readFileSync(prefPath, 'utf8');
      return JSON.parse(raw).disableGpu === true;
    }
  } catch(_){ }
  return false;
});
ipcMain.handle('set-gpu-pref', async (_event, val) => {
  try {
    const prefPath = path.join(app.getPath('userData'), 'gpu-pref.json');
    fs.writeFileSync(prefPath, JSON.stringify({ disableGpu: !!val }));
    return { ok:true };
  } catch(e){ return { ok:false, error: e.message||String(e) }; }
});

// IPC to restart the application (used after GPU change)
ipcMain.handle('restart-app', async () => {
  app.relaunch();
  app.quit();
});

function createWindow () {
  // Simple desktop environment detection for light styling
  function detectDesktopEnv() {
    const env = process.env;
    const xdg = (env.XDG_CURRENT_DESKTOP || '').toLowerCase();
    const session = (env.DESKTOP_SESSION || '').toLowerCase();
    if (xdg.includes('gnome') || session.includes('gnome')) return 'gnome';
    if (xdg.includes('kde') || xdg.includes('plasma') || session.includes('plasma') || session.includes('kde')) return 'plasma';
    if (xdg.includes('xfce') || session.includes('xfce')) return 'xfce';
    if (xdg.includes('cinnamon') || session.includes('cinnamon')) return 'cinnamon';
    if (xdg.includes('unity') || session.includes('unity')) return 'unity';
    return 'generic';
  }
  const deTag = detectDesktopEnv();
  const sysLocale = process.env.LC_ALL || process.env.LC_MESSAGES || process.env.LANG || ((app.getLocale && typeof app.getLocale === 'function') ? app.getLocale() : 'en');
  // PNG icon
  const iconPath = path.join(__dirname, 'AM-GUI.png');
  const win = new BrowserWindow({
    width: 1100,
    height: 750,
    frame: false, // custom title bar
    title: 'AM-GUI',
    icon: iconPath,
    backgroundColor: '#f6f8fa',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      additionalArguments: [ `--de=${deTag}`, `--locale=${sysLocale}` ]
    }
  });

  // Remove the default menu bar (File, Edit, View, etc.)
  try { Menu.setApplicationMenu(null); } catch(_) {}
  // Hide the bar in case some platforms keep it
  win.setMenuBarVisibility(false);

  win.loadFile('index.html');
  // Force an empty title after display (custom header is shown)
  win.once('ready-to-show', () => {
  // Title is already set at creation, no need to modify
  });

  // Manual keyboard shortcut to open DevTools (menu removed)
  win.webContents.on('before-input-event', (event, input) => {
    if (input.control && input.shift && input.key && input.key.toLowerCase() === 'i') {
      win.webContents.openDevTools({ mode: 'detach' });
    }
  });

  // Menu contextuel (clic droit)
  win.webContents.on('context-menu', (event, params) => {
    const ctxLabels = getContextMenuLabels(currentLocale);
    const { selectionText, isEditable } = params;
    const hasSelection = selectionText && selectionText.trim().length > 0;
    const template = [];

    if (isEditable) {
      template.push(
        { role: 'undo', label: ctxLabels.undo },
        { role: 'redo', label: ctxLabels.redo },
        { type: 'separator' },
        { role: 'cut', label: ctxLabels.cut },
        { role: 'copy', label: ctxLabels.copy },
        { role: 'paste', label: ctxLabels.paste },
        { role: 'delete', label: ctxLabels.del },
        { type: 'separator' },
        { role: 'selectAll', label: ctxLabels.selectAll }
      );
    } else if (hasSelection) {
      template.push(
        { role: 'copy', label: ctxLabels.copy },
        { type: 'separator' },
        { role: 'selectAll', label: ctxLabels.selectAll }
      );
    } else {
      template.push({ role: 'selectAll', label: ctxLabels.selectAll });
    }

    template.push({ type: 'separator' }, { role: 'toggleDevTools', label: ctxLabels.toggleDevTools });
    const menu = Menu.buildFromTemplate(template);
    menu.popup({ window: win });
  });

  // Handle close: request confirmation if an installation is in progress
  win.on('close', (event) => {
    // Check if there is an active installation
    if (activeInstalls.size > 0) {
      event.preventDefault();
      // Send a message to the renderer to show the confirmation modal
      win.webContents.send('before-close');
    }
  });

  mainWindow = win;
  return win;
}

app.whenReady().then(() => {
  try { iconCacheManager.registerProtocol(protocol); } catch(e) { console.warn('appicon protocol failed:', e); }
  const win = createWindow();
  try { initTray(win); } catch(e) { console.warn('initTray failed:', e); }
});

app.on('before-quit', () => { try { destroyTray(); } catch(_) {} });

// IPC: full icon cache purge
ipcMain.handle('purge-icons-cache', async () => iconCacheManager.purgeCache());

// Ouvrir une URL dans le navigateur externe
ipcMain.handle('open-external', async (_event, url) => {
  try {
    // basic validation
    if (!url || typeof url !== 'string') return { ok: false, error: tErr('errInvalidUrl', 'invalid url') };
    // Autoriser seulement http/https
    if (!/^https?:\/\//i.test(url)) return { ok: false, error: tErr('errSchemeNotAllowed', 'scheme not allowed') };
    await shell.openExternal(url);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e && e.message ? e.message : String(e) };
  }
});


// Generic action: install / uninstall / update (simple)
ipcMain.handle('am-action', async (event, action, software) => {
  const pm = await detectPackageManager();
  if (!pm) return tErr('errNoPm', "No 'am' or 'appman' package manager found");

  if (action === '__update_all__') {
    return new Promise((resolve) => {
      const child = spawn(pm, ['-u']);
      let stdoutBuf = '';
      let stderrBuf = '';
      const killTimer = setTimeout(() => { try { child.kill('SIGTERM'); } catch(_){} }, 5*60*1000);
      child.stdout.on('data', d => { stdoutBuf += d.toString(); });
      child.stderr.on('data', d => { stderrBuf += d.toString(); });
      child.on('close', (code) => {
        clearTimeout(killTimer);
        if (code === 0) return resolve(stdoutBuf || '');
        resolve(stderrBuf || stdoutBuf || tErr('errProcessFinishedCode', 'Process finished with code {code}', { code }));
      });
      child.on('error', (err) => {
        clearTimeout(killTimer);
        invalidatePackageManagerCache();
        resolve(err.message || tErr('errUnknown', 'Unknown error'));
      });
    });
  }

  // For install/uninstall, use node-pty for password management
  let args;
  if (action === 'install') args = ['-i', software];
  else if (action === 'uninstall') args = ['-R', software];
  else return tErr('errUnknownAction', 'Unknown action: {action}', { action });

  return new Promise((resolve) => {
    try {
      const pty = require('node-pty');
      const env = Object.assign({}, process.env, {
        TERM: 'xterm',
        COLS: '80',
        ROWS: '30',
        FORCE_COLOR: '1',
      });
      const child = pty.spawn(pm, args, {
        name: 'xterm-color',
        cols: 80,
        rows: 30,
        cwd: process.cwd(),
        env
      });
      let output = '';
      let done = false;
      const id = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2,8);
      // Handle sudo password prompt
      passwordWaiters.set(id, (password) => {
        if (typeof password === 'string') {
          try { child.write(password + '\n'); } catch(_) {}
        } else {
          try { child.kill('SIGKILL'); } catch(_) {}
        }
      });
      child.onData((txt) => {
        output += txt;
        if (/\[sudo\]|mot de passe.*:|password.*:/i.test(txt)) {
          // Request the password from the renderer via IPC
          if (event.sender) event.sender.send('password-prompt', { id });
        }
      });
      child.onExit((evt) => {
        if (done) return;
        done = true;
        passwordWaiters.delete(id);
        resolve(output);
      });
      child.on?.('error', (err) => {
        if (done) return;
        done = true;
        passwordWaiters.delete(id);
        invalidatePackageManagerCache();
        resolve(err?.message || tErr('errUnknown', 'Unknown error'));
      });
    } catch (e) {
      invalidatePackageManagerCache();
      return resolve(e && e.message ? e.message : String(e));
    }
  });
});

// --- Streaming installation (Steps 1 & 2) ---
// Provides line-by-line tracking for package installation.
// Returns { id } immediately, then sends 'install-progress' events
// { id, kind:'start', name }
// { id, kind:'line', line }
// { id, kind:'done', code, success, duration, output }
// { id, kind:'error', message }
// Added: handle sudo password prompt
ipcMain.on('password-response', (event, payload) => {
  if (!payload || !payload.id) return;
  const waiter = passwordWaiters.get(payload.id);
  if (waiter) {
    waiter(payload.password);
    passwordWaiters.delete(payload.id);
  }
});
ipcMain.handle('install-start', async (event, name) => {
  console.log('IPC install-start reçu pour', name);
  const pm = await detectPackageManager();
  // Log le lancement du processus
  console.log('Process started:', pm, ['-i', name]);
  if (!pm) return { error: tErr('errNoPm', "No 'am' or 'appman' package manager found") };
  if (!name || typeof name !== 'string') return { error: tErr('errInvalidName', 'Invalid name') };
  const id = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2,8);
  let output = '';
  const startedAt = Date.now();
  let stdoutRemainder = '';
  let stderrRemainder = '';
  const pty = require('node-pty');
  const env = Object.assign({}, process.env, {
    TERM: 'xterm',
    COLS: '80',
    ROWS: '30',
    FORCE_COLOR: '1',
    // Add other variables if needed
  });
  let child;
  try {
    child = pty.spawn(pm, ['-i', name], {
      name: 'xterm-color',
      cols: 80,
      rows: 30,
      cwd: process.cwd(),
      env
    });
  } catch (err) {
    invalidatePackageManagerCache();
    return { error: err?.message || tErr('errUnableStartProcess', 'Unable to start the process.') };
  }
  activeInstalls.set(id, child);
  console.log('[ACTIVE-INSTALLS] Ajout process id:', id);
  const wc = event.sender;
  const send = (payload) => { try { wc.send('install-progress', Object.assign({ id }, payload)); } catch(_) {} };
  send({ kind:'start', name });
  const killTimer = setTimeout(() => { try { child.kill('SIGTERM'); } catch(_){} }, 10*60*1000); // 10 min safety
  function flushLines(chunk, isErr){
    // Log each chunk received from the process
    const txt = chunk.toString();
    output += txt;
    // Detect sudo password prompt
    if (/\[sudo\]|mot de passe.*:|password.*:/i.test(txt)) {
      // Request the password from the renderer via IPC
      wc.send('password-prompt', { id });
      // Wait for the response before sending the password to the process
      passwordWaiters.set(id, (password) => {
        if (typeof password === 'string') {
          try { child.write(password + '\n'); } catch(_) {}
        } else {
          // If cancelled, kill the process
          try { child.kill('SIGKILL'); } catch(_) {}
        }
      });
    }
    // Send raw chunk for faithful terminal display
    send({ kind: 'line', raw: txt, stream: isErr ? 'stderr' : 'stdout' });
    // Legacy line splitting for interactive prompts
    let buffer = (isErr ? stderrRemainder : stdoutRemainder) + txt;
    const lines = buffer.split(/\r?\n/);
    if (lines.length > 1) {
      // keep the last partial line
      if (isErr) stderrRemainder = lines.pop(); else stdoutRemainder = lines.pop();
      for (let idx = 0; idx < lines.length; idx++) {
        const line = lines[idx].trim();
        if (!line) continue;
        // Detect interactive choice prompt: a line ending with ':' or '?'
        // followed by numbered options (1. ... / 2. ...).
        // This is locale-agnostic — am/appman always uses numbered lists
        // regardless of language.
        if ((/[:?]\s*$/.test(line)) && !/\?\d+$/.test(line)) {
          // Heuristic: peek ahead to confirm the next non-empty line is a
          // numbered option; otherwise skip to avoid false positives.
          let hasNumberedOption = false;
          for (let peek = idx + 1; peek < Math.min(idx + 4, lines.length); peek++) {
            const pl = lines[peek]?.trim();
            if (!pl || /^[-=]+$/.test(pl)) continue;
            if (/^\s*\d+[\.|\)]/.test(pl)) { hasNumberedOption = true; break; }
            break;
          }
          if (!hasNumberedOption) continue;
          // Collect all numbered options in the following lines until end of buffer
          const options = [];
          for (let j = idx + 1; j < lines.length; j++) {
            let l = lines[j].trim();
            if (!l || /^[-=]+$/.test(l)) continue;
            if (l.includes('|')) {
              // Columns detected: unchanged logic
              const parts = l.split('|').map(p => p.trim());
              parts.forEach(part => {
                if (/^\s*\d+[\.|\)]/.test(part)) options.push(part);
              });
            } else {
              // No column: possibility to append the next line
              if (/^\s*\d+[\.|\)]/.test(l)) {
                let opt = l;
                // Check if the next line exists and doesn't start with a digit
                if (j + 1 < lines.length) {
                  let next = lines[j + 1].trim();
                  if (next && !/^\s*\d+[\.|\)]/.test(next) && !/^[-=]+$/.test(next)) {
                    opt += ' ' + next;
                    j++; // skip next line
                  }
                }
                options.push(opt);
              }
            }
          }
          // Sort options by ascending number
          options.sort((a, b) => {
            const na = parseInt(a.match(/\d+/)?.[0] || '0', 10);
            const nb = parseInt(b.match(/\d+/)?.[0] || '0', 10);
            return na - nb;
          });
          console.log('[CHOICE-PROMPT] prompt:', line, 'options:', options);
          send({ kind:'choice-prompt', options, prompt: line });
        }
      }
    } else {
      if (isErr) stderrRemainder = lines[0]; else stdoutRemainder = lines[0];
    }
  }
  // node-pty : toute la sortie arrive sur onData (stdout+stderr)
  child.onData((d) => flushLines(d, false));
  child.onExit((evt) => {
    clearTimeout(killTimer);
    // Log de sortie du process
    console.log('[PTY] Process finished for id:', id, 'code:', evt.exitCode, 'duration:', (Date.now() - startedAt), 'ms');
    // Emit any remaining partial lines
    if (stdoutRemainder && stdoutRemainder.trim()) send({ kind:'line', line: stdoutRemainder.trim(), stream:'stdout' });
    if (stderrRemainder && stderrRemainder.trim()) send({ kind:'line', line: stderrRemainder.trim(), stream:'stderr' });
    // Verify the process has finished before cleanup
    if (activeInstalls.has(id)) {
      activeInstalls.delete(id);
      console.log('[ACTIVE-INSTALLS] Removing process id:', id);
    } else {
      console.warn('[ACTIVE-INSTALLS] Attempt to remove already deleted process for id:’un process déjà supprimé pour id:', id);
    }
    const duration = Date.now() - startedAt;
    const code = evt.exitCode;
    const success = code === 0;
    send({ kind:'done', code, success, duration, output });
  });
  child.on?.('error', (err) => {
    clearTimeout(killTimer);
    invalidatePackageManagerCache();
    try { activeInstalls.delete(id); } catch(_){ }
    send({ kind:'error', message: err?.message || tErr('errProcessError', 'Process error') });
  });
  return { id };
});

// Force cancellation of an ongoing installation
ipcMain.handle('install-cancel', async (event, installId) => {
  if (!installId) return { ok:false, error:tErr('errMissingId', 'Missing ID') };
  const child = activeInstalls.get(installId);
  if (!child) return { ok:false, error:tErr('errProcessNotFound', 'Process not found') };
  try {
    // Immediate cancellation requested: SIGKILL (direct kill)
    // NOTE: No application cleanup in am/appman tool on partial transaction.
    child.kill('SIGKILL');
    // Emit an immediate 'cancelled' event (the close will follow when the process has actually exited)
    try { event.sender.send('install-progress', { id: installId, kind:'cancelled' }); } catch(_){ }
    return { ok:true };
  } catch(e){
    return { ok:false, error: e.message || tErr('errCancellationFailed', 'Cancellation failed') };
  }
});

ipcMain.handle('updates-start', async (event) => {
  const pm = await detectPackageManager();
  if (!pm) return { error: tErr('errNoPm', "No 'am' or 'appman' package manager found") };
  const id = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2,8);
  let child;
  let output = '';
  const pty = require('node-pty');
  const env = Object.assign({}, process.env, {
    TERM: 'xterm',
    COLS: '80',
    ROWS: '30',
    FORCE_COLOR: '1'
  });
  try {
    child = pty.spawn(pm, ['-u'], {
      name: 'xterm-color',
      cols: 80,
      rows: 30,
      cwd: process.cwd(),
      env
    });
  } catch (err) {
    invalidatePackageManagerCache();
    return { error: err?.message || tErr('errUnableStartUpdate', 'Unable to start the update.') };
  }
  activeUpdates.set(id, child);
  const wc = event.sender;
  const send = (payload) => {
    try { wc.send('updates-progress', Object.assign({ id }, payload)); }
    catch(_) {}
  };
  send({ kind: 'start' });
  const killTimer = setTimeout(() => { try { child.kill('SIGTERM'); } catch(_){} }, 10 * 60 * 1000);
  passwordWaiters.set(id, (password) => {
    if (typeof password === 'string') {
      try { child.write(password + '\n'); } catch(_) {}
    } else {
      try { child.kill('SIGKILL'); } catch(_) {}
    }
  });
  child.onData((txt) => {
    output += txt;
    send({ kind: 'data', chunk: txt });
    if (/\[sudo\]|mot de passe.*:|password.*:/i.test(txt)) {
      try { wc.send('password-prompt', { id }); }
      catch(_) {}
    }
  });
  const cleanup = () => {
    clearTimeout(killTimer);
    activeUpdates.delete(id);
    passwordWaiters.delete(id);
  };
  child.onExit((evt) => {
    cleanup();
    send({ kind: 'done', code: evt?.exitCode ?? evt?.code ?? null, signal: evt?.signal ?? null, success: (evt?.exitCode ?? evt?.code ?? 0) === 0, output });
  });
  child.on?.('error', (err) => {
    const message = err?.message || '';
    const code = err?.code || '';
    // node-pty may emit EIO when the PTY closes normally; treat it as benign.
    if (code === 'EIO' || /EIO/.test(message)) {
      return;
    }
    cleanup();
    invalidatePackageManagerCache();
    send({ kind: 'error', message: message || tErr('errUnknown', 'Unknown error'), output });
  });
  return { id };
});

ipcMain.handle('updates-cancel', async (_event, id) => {
  if (!id) return { ok: false, error: tErr('errMissingIdShort', 'missing-id') };
  const proc = activeUpdates.get(id);
  if (!proc) return { ok: false, error: tErr('errNotFound', 'not-found') };
  try { proc.kill('SIGTERM'); }
  catch(_) {}
  activeUpdates.delete(id);
  passwordWaiters.delete(id);
  return { ok: true };
});

ipcMain.handle('install-send-choice', async (_event, installId, choice) => {
  if (!installId)     return { ok:false, error: tErr('errMissingId', 'Missing ID') };
  const child = activeInstalls.get(installId);
  if (!child) return { ok:false, error: tErr('errProcessNotFound', 'Process not found') };
  const normalizedChoice = (() => {
    if (typeof choice === 'number' && Number.isFinite(choice)) return String(choice);
    if (typeof choice === 'string') return choice.trim();
    return '';
  })();
  if (!normalizedChoice) return { ok:false, error: tErr('errInvalidChoice', 'Invalid choice') };
  try {
    child.write(normalizedChoice + '\n');
    return { ok:true };
  } catch (err) {
    return { ok:false, error: err?.message || tErr('errFailedSendChoice', 'Failed to send choice') };
  }
});

ipcMain.handle('install-appman-auto', async () => {
  try {
    const result = await installAppManAuto();
    invalidatePackageManagerCache();
    return { ok: true, result };
  } catch (error) {
    return { ok: false, error: error?.message || tErr('errAppmanInstall', 'AppMan installation failed.') };
  }
});


// Detailed list: distinguish installed vs catalog
ipcMain.handle('list-apps-detailed', async () => {
  const pm = await detectPackageManager();
  if (!pm) {
    return { installed: [], all: [], pmFound: false, error: tErr('errNoPmPath', "No 'am' or 'appman' package manager detected in PATH.") };
  }
  // We call both `pm -l` (catalog) and `pm -f` (installed files list). Some pm implementations
  // (notably appman) print only a summary in `-l` and not the installed items — `-f` contains
  // the actual list of installed programs. Run both and merge results.
  const listCmd = `${pm} -l`;
  const installedCmd = `${pm} -f`;
  const execPromise = (cmd) => new Promise(res => {
    exec(cmd, (err, stdout) => res({ err, stdout: stdout || '' }));
  });
  return new Promise(async (resolve) => {
    try {
      const [listRes, instRes] = await Promise.all([execPromise(listCmd), execPromise(installedCmd)]);
      if ((listRes.err && listRes.err.code === 127) || (instRes.err && instRes.err.code === 127)) {
        invalidatePackageManagerCache();
      }
      if ((listRes.err || !listRes.stdout) && (instRes.err || !instRes.stdout)) {
        return resolve({ installed: [], all: [], pmFound: true, error: tErr('errListExecFailed', 'List command execution failed.') });
      }

      const catalogSet = new Set();
      const catalogDesc = new Map();
      const installedFromCatalog = new Set();
      const installedSet = new Set();
      const installedDesc = new Map();
  const diamondSet = new Set(); // apps that were listed with leading '◆' in catalog output

      // Parse catalog from -l output. Instead of relying on any fixed
      // language header, we simply treat the block of ◆ entries that appears
      // before the first blank line as the "installed" list. Once we hit a
      // blank line after having seen at least one ◆ entry, further ◆ lines
      // belong to the catalog proper. This handles translations and avoids
      // accidentally turning the summary text into an app name.
      try {
        const lines = (listRes.stdout || '').split('\n');
        let inCatalog = false;
        let seenAppEntry = false;
        // curEntry tracks the current ◆ entry so continuation lines can be
        // appended to its description (descriptions can span multiple lines).
        let curName = null;
        let curDesc = null;
        let curInCatalog = false;
        const flushEntry = () => {
          if (!curName) return;
          if (!curInCatalog) {
            installedFromCatalog.add(curName);
            if (curDesc) installedDesc.set(curName, curDesc);
          } else {
            catalogSet.add(curName);
            if (curDesc) catalogDesc.set(curName, curDesc);
          }
          diamondSet.add(curName);
          curName = null;
          curDesc = null;
        };

        for (const raw of lines) {
          const line = raw.trim();
          if (line === '') {
            // blank line: if we've already scanned at least one ◆ entry and
            // we're not yet in the catalog, switch to catalog mode. Subsequent
            // ◆ entries will then be catalog items.
            if (seenAppEntry && !inCatalog) {
              flushEntry();
              inCatalog = true;
            } else {
              flushEntry();
            }
            continue;
          }
          if (line.startsWith('\u25c6')) {
            flushEntry();
            const rest = line.slice(1).trim();
            const colonIdx = rest.indexOf(':');
            let left = rest;
            let desc = null;
            if (colonIdx !== -1) {
              left = rest.slice(0, colonIdx).trim();
              desc = rest.slice(colonIdx + 1).trim() || null;
            }
            const name = left.split(/\s+/)[0].trim();
            // Structural check: valid am/appman app names are alphanumeric
            // with dots, underscores, or hyphens. Skip anything that doesn't
            // match — this is locale-independent.
            if (!/^[A-Za-z0-9][A-Za-z0-9._+-]*$/.test(name)) continue;
            curName = name;
            curDesc = desc;
            curInCatalog = inCatalog;
            seenAppEntry = true;
          } else if (curName && curInCatalog) {
            // continuation line: append to current catalog entry description
            curDesc = curDesc ? curDesc + ' ' + line : line;
          }
        }
        flushEntry(); // flush the last entry
      } catch (e) {
        // ignore parse errors from catalog
      }

      // Parse installed list from -f output (appman -f prints installed programs)
      // Example -f lines (English):
      //   - APPNAME  | VERSION | TYPE     | SIZE
      //   - -------  | ------- | ----     | ----
      //   ◆ opencode | 1.17.7 ✓ | appimage | 161 MiB
      // Example -f lines (Serbian):
      //   - APLIKACIJA | VERZIJA  | TIP      | VELIČINA
      //   - -------    | -------  | ----     | ----
      //   ◆ opencode   | 1.17.7 ✓ | appimage | 161 MiB
      //
      // Strategy: detect the header line structurally (a line starting with
      // "- " that contains "|" separators), skip the separator row after it,
      // then only process diamond-prefixed data rows. This is completely
      // locale-independent.
      try {
        const lines = (instRes.stdout || '').split('\n');
        let headerParsed = false;
        for (const raw of lines) {
          let line = raw.trim();
          if (!line) continue;
          if (line.startsWith('-------')) continue;
          // Detect header structurally: starts with "- " and contains "|"
          if (!headerParsed && line.startsWith('- ') && line.includes('|')) {
            headerParsed = true;
            continue;
          }
          if (!headerParsed) continue; // skip everything before the header
          // Only process diamond-prefixed data rows
          if (line.startsWith('\u25c6')) line = line.slice(1).trim();
          else continue; // skip summary lines, footers, blank lines
          if (!line) continue;
          if (line.includes('|')) {
            const cols = line.split('|').map(s => s.trim()).filter(Boolean);
            const name = cols[0] ? cols[0].split(/\s+/)[0].trim() : null;
            // Version column is always the 3rd from the end (last two are TYPE and SIZE).
            // This handles both 4-col (APPNAME|VERSION|TYPE|SIZE) and
            // 5-col (APPNAME|DB|VERSION|TYPE|SIZE) formats from appman.
            const versionColIdx = Math.max(1, cols.length - 3);
            const version = (versionColIdx >= 0 && versionColIdx < cols.length) ? cols[versionColIdx] : null;
            if (name) {
              installedSet.add(name);
              if (version) installedDesc.set(name, version);
            }
          }
        }
      } catch (e) {
        // ignore parse errors from installed
      }

      // if -f output looks broken (empty or contains every catalog entry),
      // fall back on the subset gathered from the catalog parsing.
      if ((installedSet.size === 0 && installedFromCatalog.size > 0) ||
          (catalogSet.size > 0 && installedSet.size >= catalogSet.size)) {
        if (installedFromCatalog.size > 0 && installedFromCatalog.size < catalogSet.size) {
          installedSet.clear();
          for (const n of installedFromCatalog) installedSet.add(n);
        }
      }

      // Build bundle-child map: apps whose description says
      // "This script installs the full 'X' suite" are children of X.
      // When X is installed the child should be hidden from the catalog.
      const bundleChildOf = {};
      const suitePattern = /installs the full "([^"]+)" suite/i;
      for (const [name, desc] of catalogDesc) {
        const m = suitePattern.exec(desc);
        if (m) bundleChildOf[name] = m[1].toLowerCase();
      }

      const allSet = new Set([...catalogSet, ...installedSet]);
      const all = Array.from(allSet).map(name => ({
        name,
        installed: installedSet.has(name),
        hasDiamond: diamondSet.has(name),
        version: installedDesc.get(name) || null,
        desc: catalogDesc.get(name) || null
      }));
      const installed = Array.from(installedSet).map(name => ({
        name,
        installed: true,
        hasDiamond: diamondSet.has(name),
        version: installedDesc.get(name) || null,
        desc: catalogDesc.get(name) || null
      }));
      return resolve({ installed, all, pmFound: true, bundleChildOf });
    } catch (e) {
      return resolve({ installed: [], all: [], pmFound: true, error: tErr('errInternalParsing', 'Internal parsing error.') });
    }
  });
});

ipcMain.handle('sandbox-info', async (_event, appName) => {
  const deps = await detectSandboxDependencies();
  const pm = await detectPackageManager();
  const response = {
    ok: true,
    dependencies: deps,
    pmFound: !!pm
  };
  if (!pm) {
    response.error = tErr('errMissingPm', 'missing-pm');
    response.info = { installed: false, sandboxed: false };
    return response;
  }
  const normalizedName = typeof appName === 'string' ? appName.trim() : '';
  if (!normalizedName) {
    response.info = { installed: false, sandboxed: false };
    return response;
  }
  const execPath = await resolveCommandPath(normalizedName);
  const sandboxed = await isSandboxWrapper(execPath);
  // If the app is sandboxed, it must be an AppImage (only AppImages can be sandboxed)
  // Otherwise, detect via magic bytes
  let isAppImage = sandboxed ? true : await detectAppImageFromPath(execPath);
  const selfExecPath = process.env.APPIMAGE || process.execPath;
  const isSelfAppImage = execPath && selfExecPath && path.resolve(execPath) === path.resolve(selfExecPath);
  if (isSelfAppImage) isAppImage = true;
  response.info = {
    appName: normalizedName,
    installed: !!execPath,
    sandboxed,
    execPath: execPath || null,
    dependenciesReady: deps.hasSas || deps.hasAisap,
    isAppImage,
    selfSandboxProhibited: isSelfAppImage,
    sandboxForbiddenReason: isSelfAppImage ? 'self' : null
  };
  return response;
});

ipcMain.handle('sandbox-configure', async (event, payload = {}) => {
  const pm = await detectPackageManager();
  if (!pm) return { ok: false, error: tErr('errMissingPm', 'missing-pm') };
  const deps = await detectSandboxDependencies();
  if (!deps.hasSas && !deps.hasAisap) {
    return { ok: false, error: tErr('errMissingDependency', 'missing-dependency') };
  }
  const normalizedName = typeof payload.appName === 'string' ? payload.appName.trim() : '';
  if (!normalizedName) return { ok: false, error: tErr('errInvalidApp', 'invalid-app') };
  const shareDirsInput = typeof payload.shareDirs === 'object' && payload.shareDirs !== null ? payload.shareDirs : {};
  const dirSelections = {};
  SANDBOX_DIR_KEYS.forEach((key) => {
    dirSelections[key] = !!shareDirsInput[key];
  });
  const customCheck = await validateCustomSandboxPath(payload.customPath || '');
  if (!customCheck.ok) {
    return { ok: false, error: customCheck.error };
  }
  const hasDirSelection = SANDBOX_DIR_KEYS.some((key) => dirSelections[key]);
  const hasCustomPath = !!customCheck.value;
  let shouldConfigure;
  if (payload.configureDirs === true) shouldConfigure = true;
  else if (payload.configureDirs === false) shouldConfigure = false;
  else shouldConfigure = hasDirSelection || hasCustomPath;
  const stdinScript = buildSandboxAnswerScript(shouldConfigure, dirSelections, customCheck.value);
  const args = ['--sandbox', normalizedName];
  const result = await runSandboxTask(event.sender, {
    pm,
    action: 'configure',
    args,
    stdinScript,
    appName: normalizedName
  });
  if (!result.ok && !result.error) result.error = tErr('errSandboxConfigureFailed', 'sandbox-configure-failed');
  return result;
});

ipcMain.handle('sandbox-disable', async (event, payload = {}) => {
  const pm = await detectPackageManager();
  if (!pm) return { ok: false, error: tErr('errMissingPm', 'missing-pm') };
  const normalizedName = typeof payload.appName === 'string' ? payload.appName.trim() : '';
  if (!normalizedName) return { ok: false, error: tErr('errInvalidApp', 'invalid-app') };
  const args = ['--disable-sandbox', normalizedName];
  const result = await runSandboxTask(event.sender, {
    pm,
    action: 'disable',
    args,
    appName: normalizedName
  });
  if (!result.ok && !result.error) result.error = tErr('errSandboxDisableFailed', 'sandbox-disable-failed');
  return result;
});

// Window controls for frameless mode
ipcMain.handle('window-control', (event, action) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return;
  switch(action){
    case 'min': win.minimize(); break;
    case 'max': win.isMaximized() ? win.unmaximize() : win.maximize(); break;
    case 'close': win.close(); break;
  }
});

// Handler to close the window (called after confirmation)
ipcMain.handle('close-window', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) win.destroy(); // Force close without prompting
});

// Update tray and context menu language
ipcMain.handle('set-tray-locale', (_event, locale) => {
  setTrayLocale(locale);
  if (locale && locale !== 'auto') currentLocale = locale;
  setLocale(locale);
});



