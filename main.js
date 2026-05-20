// ─── CONFIGURABLE ─────────────────────────────────────────────────────────────
const TOGGLE_HOTKEY = 'CommandOrControl+Shift+M'; // Show/hide overlay
// ──────────────────────────────────────────────────────────────────────────────

const { app, BrowserWindow, globalShortcut, ipcMain, screen, desktopCapturer, dialog } = require('electron');
const path = require('path');
const fs   = require('fs');

let mainWindow = null;

// Window dimensions
const WIN_WIDTH  = 420;
const WIN_HEIGHT = 640;

function createWindow() {
  const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize;

  mainWindow = new BrowserWindow({
    width:  WIN_WIDTH,
    height: WIN_HEIGHT,

    // Position — bottom-right corner, 20px margin
    x: sw - WIN_WIDTH  - 20,
    y: sh - WIN_HEIGHT - 20,

    // Overlay behaviour
    frame:           false,   // no title bar
    transparent:     true,    // transparent background
    alwaysOnTop:     true,    // stays above Zoom/Meet
    resizable:       true,    // user can resize
    skipTaskbar:     false,   // show in taskbar so user can find it
    hasShadow:       false,

    webPreferences: {
      preload:            path.join(__dirname, 'preload.js'),
      contextIsolation:   true,
      nodeIntegration:    false,
    }
  });

  // Hide from screen share — critical stealth feature
  // Block 6 — pre-ship cleanup: re-enabled (was commented out in Block 2 dev mode)
  mainWindow.setContentProtection(true);

  // Load the UI
  mainWindow.loadFile('index.html');

  // Open DevTools in dev — comment out before shipping
  // Block 6 — pre-ship cleanup: commented out (was uncommented in Block 2 dev mode)
  // mainWindow.webContents.openDevTools({ mode: 'detach' });

  mainWindow.on('closed', () => { mainWindow = null; });
}

app.whenReady().then(() => {
  createWindow();

  // Toggle overlay visibility with hotkey
  if (!globalShortcut.isRegistered(TOGGLE_HOTKEY)) {
    globalShortcut.register(TOGGLE_HOTKEY, () => {
      if (!mainWindow) return;
      if (mainWindow.isVisible()) {
        mainWindow.hide();
      } else {
        mainWindow.show();
        mainWindow.focus();
      }
    });
  }
});

// IPC — window controls from renderer
ipcMain.on('win-close',   () => { if (mainWindow) mainWindow.close(); });
ipcMain.on('win-hide',    () => { if (mainWindow) mainWindow.hide();  });
ipcMain.on('win-minimise',() => { if (mainWindow) mainWindow.minimize(); });

// IPC — desktop capturer screen-source list (LCA audio-capture pattern).
// Renderer picks sources[0] and feeds its id into getUserMedia.
ipcMain.handle('get-desktop-sources', async () => {
  const sources = await desktopCapturer.getSources({ types: ['screen'] });
  return sources.map(s => ({ id: s.id, name: s.name }));
});

// Block 5 — Save transcript to disk via native save dialog.
// Renderer hands us a default filename + already-formatted UTF-8 text body;
// we show the dialog (so the user picks the target folder) and write the
// file synchronously. Returns a {success, filePath} / {success:false,error}
// / {success:false, canceled:true} envelope the renderer can render.
ipcMain.handle('save-transcript', async (event, { filename, content }) => {
  try {
    const { filePath, canceled } = await dialog.showSaveDialog(mainWindow, {
      title:       'Save Transcript',
      defaultPath: filename,
      filters:     [
        { name: 'Text Files', extensions: ['txt'] },
        { name: 'All Files',  extensions: ['*']   }
      ]
    });

    if (canceled || !filePath) {
      return { success: false, canceled: true };
    }

    fs.writeFileSync(filePath, content, 'utf8');
    return { success: true, filePath };

  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Quit when all windows closed (Windows/Linux)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Clean up hotkeys on quit
app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});
