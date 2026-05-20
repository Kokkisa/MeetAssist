# CLAUDE.md — MeetAssist v0.1.0 (Block 1)

## What is MeetAssist

MeetAssist is a stealth desktop overlay app for Zoom / Google Meet users.
It continuously transcribes live meeting audio, displays a live scrolling
transcript, and lets the user select any portion of the transcript to ask
the AI a question about. The AI answer streams on screen only when the
user explicitly requests it.

This is a BRAND NEW repo — not related to LiveCallAssistant.
Do not copy LiveCallAssistant code. Build fresh from scratch.

Repo: https://github.com/Kokkisa/MeetAssist (empty, just initialized)

---

## Block 1 Goal

Stand up the Electron shell with a working overlay window.
Nothing else. No audio. No transcription. No AI.
Just the window, the layout skeleton, and the git foundation.

Block 1 is done when:
- `npm start` opens a transparent, always-on-top overlay window
- The window has the correct layout skeleton (3 panels — transcript, context, answer)
- The window is hidden from screen share (setContentProtection)
- The app can be quit cleanly
- Everything is committed and pushed to github.com/Kokkisa/MeetAssist

---

## Step 1 — Initialize the project

Run these commands in sequence:

```bash
# Create project folder
mkdir MeetAssist
cd MeetAssist

# Initialize npm
npm init -y

# Install Electron
npm install --save-dev electron

# Install electron-builder for packaging later
npm install --save-dev electron-builder
```

---

## Step 2 — Create package.json

Replace the auto-generated package.json with this exact content:

```json
{
  "name": "meetassist",
  "version": "0.1.0",
  "description": "Stealth meeting assistant — live transcript, selective AI answers",
  "main": "main.js",
  "scripts": {
    "start": "electron .",
    "build": "electron-builder"
  },
  "build": {
    "appId": "com.kokkisa.meetassist",
    "productName": "MeetAssist",
    "win": {
      "target": "nsis",
      "icon": "assets/icon.ico"
    },
    "nsis": {
      "oneClick": false,
      "allowToChangeInstallationDirectory": false
    },
    "files": [
      "main.js",
      "preload.js",
      "renderer.js",
      "index.html",
      "styles.css",
      "assets/**"
    ]
  },
  "devDependencies": {
    "electron": "^29.0.0",
    "electron-builder": "^24.0.0"
  }
}
```

---

## Step 3 — Create assets folder

```bash
mkdir assets
```

Create a placeholder icon file — a simple 1x1 pixel .ico is fine for Block 1.
If no icon is available, skip it and remove the "icon" line from package.json build config.
The app will use the default Electron icon — that is acceptable for Block 1.

---

## Step 4 — Create main.js

```javascript
// ─── CONFIGURABLE ─────────────────────────────────────────────────────────────
const TOGGLE_HOTKEY = 'CommandOrControl+Shift+M'; // Show/hide overlay
// ──────────────────────────────────────────────────────────────────────────────

const { app, BrowserWindow, globalShortcut, ipcMain, screen } = require('electron');
const path = require('path');

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
  mainWindow.setContentProtection(true);

  // Load the UI
  mainWindow.loadFile('index.html');

  // Open DevTools in dev — comment out before shipping
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

// Quit when all windows closed (Windows/Linux)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Clean up hotkeys on quit
app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});
```

---

## Step 5 — Create preload.js

```javascript
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('meetAPI', {
  // Window controls
  close:    () => ipcRenderer.send('win-close'),
  hide:     () => ipcRenderer.send('win-hide'),
  minimise: () => ipcRenderer.send('win-minimise'),
});
```

---

## Step 6 — Create index.html

The layout has 4 sections stacked vertically:
1. Header bar — app name + window controls
2. Transcript panel — live scrolling text (empty for now, placeholder text)
3. Context bar — selected text + user question input
4. Answer panel — AI answer streams here

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy"
        content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>MeetAssist</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>

  <!-- ── HEADER ─────────────────────────────────────────── -->
  <div id="header">
    <div id="app-name">
      <span class="dot"></span>
      MeetAssist
    </div>
    <div id="win-controls">
      <button class="ctrl-btn" id="btn-minimise" title="Minimise">─</button>
      <button class="ctrl-btn" id="btn-hide"     title="Hide (Ctrl+Shift+M to show)">◱</button>
      <button class="ctrl-btn danger" id="btn-close" title="Close">✕</button>
    </div>
  </div>

  <!-- ── TRANSCRIPT PANEL ───────────────────────────────── -->
  <div id="transcript-panel">
    <div id="transcript-header">
      <span class="panel-label">📝 Live Transcript</span>
      <div id="transcript-controls">
        <button class="small-btn" id="btn-clear-transcript" title="Clear transcript">Clear</button>
        <button class="small-btn" id="btn-save-transcript"  title="Save transcript">Save</button>
      </div>
    </div>
    <div id="transcript-body">
      <p class="placeholder-text">Transcript will appear here once recording starts...</p>
    </div>
  </div>

  <!-- ── CONTEXT BAR ────────────────────────────────────── -->
  <div id="context-bar">
    <div class="panel-label">💬 Context &amp; Question</div>
    <div id="selected-text-display" class="empty-state">
      Select text from transcript → it appears here
    </div>
    <div id="question-row">
      <input
        type="text"
        id="question-input"
        placeholder="Type your question about the selected context..."
        autocomplete="off"
      />
      <button id="btn-ask">Ask</button>
    </div>
  </div>

  <!-- ── ANSWER PANEL ───────────────────────────────────── -->
  <div id="answer-panel">
    <div class="panel-label">🤖 Answer</div>
    <div id="answer-body">
      <p class="placeholder-text">Your answer will appear here...</p>
    </div>
  </div>

  <script src="renderer.js"></script>
</body>
</html>
```

---

## Step 7 — Create styles.css

```css
/* ── Reset & base ─────────────────────────────────────── */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  --bg-header:     rgba(15, 15, 25, 0.92);
  --bg-panel:      rgba(20, 20, 32, 0.88);
  --bg-context:    rgba(18, 18, 30, 0.90);
  --bg-input:      rgba(255, 255, 255, 0.07);
  --bg-btn:        rgba(79, 142, 247, 0.85);
  --bg-btn-hover:  rgba(79, 142, 247, 1.0);
  --border:        rgba(255, 255, 255, 0.08);
  --text-primary:  rgba(255, 255, 255, 0.92);
  --text-secondary:rgba(255, 255, 255, 0.50);
  --text-accent:   #4f8ef7;
  --cyan:          #00d4ff;
  --danger:        #ff4f4f;
  --radius:        8px;
  --radius-sm:     4px;
  --font:          -apple-system, 'Segoe UI', sans-serif;
}

html, body {
  width:      100%;
  height:     100%;
  background: transparent;
  font-family: var(--font);
  font-size:  13px;
  color:      var(--text-primary);
  overflow:   hidden;
  display:    flex;
  flex-direction: column;
  border-radius: var(--radius);
  /* Subtle border around whole app */
  outline: 1px solid rgba(255,255,255,0.10);
}

/* ── HEADER ───────────────────────────────────────────── */
#header {
  display:         flex;
  align-items:     center;
  justify-content: space-between;
  padding:         0 10px;
  height:          38px;
  background:      var(--bg-header);
  border-radius:   var(--radius) var(--radius) 0 0;
  -webkit-app-region: drag; /* drag window by header */
  flex-shrink: 0;
}

#app-name {
  display:     flex;
  align-items: center;
  gap:         7px;
  font-size:   13px;
  font-weight: 600;
  letter-spacing: 0.3px;
  color: var(--text-primary);
  -webkit-app-region: drag;
}

.dot {
  width:         8px;
  height:        8px;
  border-radius: 50%;
  background:    var(--cyan);
  box-shadow:    0 0 6px var(--cyan);
}

#win-controls {
  display: flex;
  gap:     4px;
  -webkit-app-region: no-drag;
}

.ctrl-btn {
  background:    rgba(255,255,255,0.08);
  border:        none;
  border-radius: var(--radius-sm);
  color:         var(--text-secondary);
  font-size:     11px;
  width:         22px;
  height:        22px;
  cursor:        pointer;
  display:       flex;
  align-items:   center;
  justify-content: center;
  transition:    all 0.15s;
}
.ctrl-btn:hover        { background: rgba(255,255,255,0.15); color: var(--text-primary); }
.ctrl-btn.danger:hover { background: var(--danger); color: #fff; }

/* ── PANELS ───────────────────────────────────────────── */
.panel-label {
  font-size:   11px;
  font-weight: 600;
  color:       var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.8px;
  padding:     8px 10px 4px;
}

/* ── TRANSCRIPT PANEL ─────────────────────────────────── */
#transcript-panel {
  flex:       2;          /* takes most vertical space */
  display:    flex;
  flex-direction: column;
  background: var(--bg-panel);
  border-top: 1px solid var(--border);
  min-height: 0;
  overflow:   hidden;
}

#transcript-header {
  display:         flex;
  align-items:     center;
  justify-content: space-between;
  padding-right:   10px;
  flex-shrink:     0;
}

#transcript-controls {
  display: flex;
  gap: 4px;
}

.small-btn {
  background:    rgba(255,255,255,0.07);
  border:        1px solid rgba(255,255,255,0.10);
  border-radius: var(--radius-sm);
  color:         var(--text-secondary);
  font-size:     10px;
  padding:       2px 8px;
  cursor:        pointer;
  transition:    all 0.15s;
}
.small-btn:hover { background: rgba(255,255,255,0.14); color: var(--text-primary); }

#transcript-body {
  flex:       1;
  overflow-y: auto;
  padding:    6px 10px 10px;
  line-height: 1.6;
  font-size:  12px;
  color:      var(--text-primary);
  scroll-behavior: smooth;
}

#transcript-body::-webkit-scrollbar       { width: 4px; }
#transcript-body::-webkit-scrollbar-track { background: transparent; }
#transcript-body::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 2px; }

/* ── CONTEXT BAR ──────────────────────────────────────── */
#context-bar {
  background:  var(--bg-context);
  border-top:  1px solid var(--border);
  flex-shrink: 0;
  padding-bottom: 8px;
}

#selected-text-display {
  margin:        0 10px 6px;
  padding:       6px 8px;
  background:    rgba(79,142,247,0.08);
  border:        1px solid rgba(79,142,247,0.20);
  border-radius: var(--radius-sm);
  font-size:     11px;
  color:         var(--text-secondary);
  min-height:    32px;
  max-height:    72px;
  overflow-y:    auto;
  line-height:   1.5;
}

#selected-text-display.has-content {
  color: var(--text-primary);
  border-color: rgba(79,142,247,0.40);
}

.empty-state { color: var(--text-secondary); font-style: italic; }

#question-row {
  display: flex;
  gap:     6px;
  padding: 0 10px;
}

#question-input {
  flex:          1;
  background:    var(--bg-input);
  border:        1px solid var(--border);
  border-radius: var(--radius-sm);
  color:         var(--text-primary);
  font-size:     12px;
  padding:       6px 10px;
  outline:       none;
  transition:    border-color 0.15s;
}
#question-input:focus  { border-color: rgba(79,142,247,0.50); }
#question-input::placeholder { color: var(--text-secondary); }

#btn-ask {
  background:    var(--bg-btn);
  border:        none;
  border-radius: var(--radius-sm);
  color:         #fff;
  font-size:     12px;
  font-weight:   600;
  padding:       6px 14px;
  cursor:        pointer;
  transition:    background 0.15s;
  white-space:   nowrap;
}
#btn-ask:hover { background: var(--bg-btn-hover); }

/* ── ANSWER PANEL ─────────────────────────────────────── */
#answer-panel {
  flex:       1;
  display:    flex;
  flex-direction: column;
  background: var(--bg-panel);
  border-top: 1px solid var(--border);
  border-radius: 0 0 var(--radius) var(--radius);
  min-height: 0;
  overflow:   hidden;
}

#answer-body {
  flex:       1;
  overflow-y: auto;
  padding:    6px 10px 10px;
  font-size:  12px;
  line-height: 1.6;
}

#answer-body::-webkit-scrollbar       { width: 4px; }
#answer-body::-webkit-scrollbar-track { background: transparent; }
#answer-body::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 2px; }

/* ── PLACEHOLDER TEXT ─────────────────────────────────── */
.placeholder-text {
  color:      var(--text-secondary);
  font-style: italic;
  font-size:  11px;
  padding:    4px 0;
}
```

---

## Step 8 — Create renderer.js

Block 1 renderer is minimal — just wire up window controls and the Ask button placeholder.

```javascript
'use strict';

// ── DOM refs ──────────────────────────────────────────────────────────────────
const btnClose           = document.getElementById('btn-close');
const btnHide            = document.getElementById('btn-hide');
const btnMinimise        = document.getElementById('btn-minimise');
const btnAsk             = document.getElementById('btn-ask');
const btnClearTranscript = document.getElementById('btn-clear-transcript');
const btnSaveTranscript  = document.getElementById('btn-save-transcript');
const questionInput      = document.getElementById('question-input');
const selectedTextDisplay= document.getElementById('selected-text-display');
const transcriptBody     = document.getElementById('transcript-body');
const answerBody         = document.getElementById('answer-body');

// ── Window controls ───────────────────────────────────────────────────────────
btnClose.addEventListener('click',    () => window.meetAPI.close());
btnHide.addEventListener('click',     () => window.meetAPI.hide());
btnMinimise.addEventListener('click', () => window.meetAPI.minimise());

// ── Ask button (placeholder for Block 2+) ─────────────────────────────────────
btnAsk.addEventListener('click', handleAsk);
questionInput.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) handleAsk();
});

function handleAsk() {
  const question = questionInput.value.trim();
  if (!question) return;
  // Block 1 placeholder — real AI call comes in Block 5
  answerBody.innerHTML = `<p class="placeholder-text">AI answer coming in Block 5... (question: "${question}")</p>`;
  questionInput.value = '';
}

// ── Clear transcript ───────────────────────────────────────────────────────────
btnClearTranscript.addEventListener('click', () => {
  transcriptBody.innerHTML = '<p class="placeholder-text">Transcript cleared.</p>';
});

// ── Save transcript (placeholder) ─────────────────────────────────────────────
btnSaveTranscript.addEventListener('click', () => {
  // Real save comes in Block 6
  alert('Save transcript — coming in Block 6');
});

// ── Text selection → context bar ─────────────────────────────────────────────
// When user selects text anywhere in the transcript, show it in the context bar
document.addEventListener('mouseup', () => {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed) return;

  // Only capture selections inside the transcript body
  const range = selection.getRangeAt(0);
  if (!transcriptBody.contains(range.commonAncestorContainer)) return;

  const selectedText = selection.toString().trim();
  if (!selectedText) return;

  selectedTextDisplay.textContent = selectedText;
  selectedTextDisplay.classList.remove('empty-state');
  selectedTextDisplay.classList.add('has-content');
});
```

---

## Step 9 — Initialize git and push to GitHub

```bash
# Initialize git
git init

# Add remote
git remote add origin https://github.com/Kokkisa/MeetAssist.git

# Create .gitignore
echo "node_modules/" > .gitignore
echo "dist/" >> .gitignore
echo ".claude/" >> .gitignore
echo "*.log" >> .gitignore

# Stage everything
git add .

# First commit
git commit -m "feat: v0.1.0 Block 1 - Electron shell, overlay window, layout skeleton"

# Set branch and push
git branch -M main
git push -u origin main

# Tag it
git tag v0.1.0
git push origin v0.1.0
```

---

## Definition of done — Block 1

- [ ] `npm start` opens the overlay window
- [ ] Window is transparent, always on top, no frame
- [ ] Header shows "MeetAssist" with cyan dot
- [ ] Three panels visible: transcript, context bar, answer
- [ ] Close / Hide / Minimise buttons work
- [ ] `Ctrl+Shift+M` toggles overlay visibility
- [ ] Selecting text in transcript area shows it in context bar
- [ ] Ask button shows placeholder response in answer panel
- [ ] `setContentProtection(true)` is set
- [ ] Committed and pushed to github.com/Kokkisa/MeetAssist as v0.1.0

## What Block 2 will add
System audio capture via WASAPI loopback + continuous Whisper transcription
feeding live text into the transcript panel.

## Files to create (all new — no existing files)
main.js, preload.js, renderer.js, index.html, styles.css, package.json, .gitignore
