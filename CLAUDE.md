# CLAUDE.md — MeetAssist Block 5 (v0.5.0)

## Context

Block 1 (v0.1.0) — Electron shell, overlay window, layout skeleton ✅
Block 2 (v0.2.0) — System audio capture, Whisper transcription, live transcript ✅
Block 3 (v0.3.0) — Text selection, context bar, AI answer streaming ✅
Block 4 (v0.4.0) — Timestamps, model selector, language setting, chunk size ✅
Repo: https://github.com/Kokkisa/MeetAssist
Current commit: bd58b1c

Read ALL existing source files before touching anything.
Build Block 5 features on top of Block 4. Do NOT rewrite or restructure anything.

## ARCHIVE RULE (mandatory)
Never delete working code. Comment it out with reason and date.
Always commit a WIP state before trying alternative approaches.

---

## Block 5 Goal

Wire up the existing Save button in the transcript header to export the
full transcript to a .txt file on disk, using Electron's native save dialog.

Block 5 is done when:
- User clicks Save → native Windows save dialog appears
- Default filename is auto-generated: MeetAssist_YYYY-MM-DD_HH-MM.txt
- File contains all transcript lines with timestamps
- Success/failure message shown briefly in the transcript header
- Committed and pushed as v0.5.0

---

## Architecture

```
renderer.js (Save button click)
    ↓ IPC invoke('save-transcript', { filename, content })
main.js (shows native dialog, writes file)
    ↓ returns { success, filePath, error }
renderer.js (shows success/error message)
```

---

## Step 1 — main.js changes

### Add fs and dialog to requires:

```javascript
const { app, BrowserWindow, globalShortcut, ipcMain, screen,
        dialog } = require('electron');
const fs = require('fs');
```

### Add IPC handler for save-transcript (add after existing IPC handlers):

```javascript
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
```

---

## Step 2 — preload.js changes

### Expose saveTranscript on meetAPI:

```javascript
saveTranscript: (filename, content) =>
  ipcRenderer.invoke('save-transcript', { filename, content }),
```

---

## Step 3 — renderer.js changes

### Replace the existing Save button placeholder handler:

Find the existing `btnSaveTranscript` handler (currently shows an alert 
"Save transcript — coming in Block 6"). Archive it and replace:

```javascript
// Archived 2026-05-20 — placeholder alert from Block 1
// btnSaveTranscript.addEventListener('click', () => {
//   alert('Save transcript — coming in Block 6');
// });

btnSaveTranscript.addEventListener('click', saveTranscriptToDisk);

async function saveTranscriptToDisk() {
  if (!transcriptLines || transcriptLines.length === 0) {
    showTranscriptStatus('Nothing to save yet.', 'warn');
    return;
  }

  // Build filename: MeetAssist_YYYY-MM-DD_HH-MM.txt
  const now      = new Date();
  const date     = now.toISOString().slice(0, 10);           // YYYY-MM-DD
  const time     = now.toTimeString().slice(0, 5).replace(':', '-'); // HH-MM
  const filename = `MeetAssist_${date}_${time}.txt`;

  // Build file content
  const header  = `MeetAssist Transcript\n`;
  const dateLine = `Date: ${now.toDateString()} ${now.toTimeString().slice(0,8)}\n`;
  const divider = `${'─'.repeat(50)}\n\n`;

  const lines = transcriptLines
    .map(entry => {
      const ts = entry.time instanceof Date
        ? entry.time.toTimeString().slice(0, 8)
        : '--:--:--';
      return `[${ts}] ${entry.text}`;
    })
    .join('\n');

  const content = header + dateLine + divider + lines + '\n';

  // Disable button while saving
  btnSaveTranscript.disabled = true;
  btnSaveTranscript.textContent = '...';

  try {
    const result = await window.meetAPI.saveTranscript(filename, content);

    if (result.canceled) {
      showTranscriptStatus('Save cancelled.', 'warn');
    } else if (result.success) {
      // Show just the filename, not the full path
      const saved = result.filePath.split(/[\\/]/).pop();
      showTranscriptStatus(`Saved: ${saved}`, 'success');
    } else {
      showTranscriptStatus(`Save failed: ${result.error}`, 'error');
    }
  } catch (err) {
    showTranscriptStatus(`Error: ${err.message}`, 'error');
  } finally {
    btnSaveTranscript.disabled = false;
    btnSaveTranscript.textContent = 'Save';
  }
}
```

### Add showTranscriptStatus helper:

```javascript
let statusTimer = null;

function showTranscriptStatus(message, type = 'success') {
  // Remove any existing status
  const existing = document.getElementById('transcript-status');
  if (existing) existing.remove();
  if (statusTimer) clearTimeout(statusTimer);

  const status = document.createElement('span');
  status.id          = 'transcript-status';
  status.className   = `transcript-status ${type}`;
  status.textContent = message;

  // Insert after the transcript-header div
  const header = document.getElementById('transcript-header');
  header.insertAdjacentElement('afterend', status);

  // Auto-remove after 3 seconds
  statusTimer = setTimeout(() => {
    status.remove();
    statusTimer = null;
  }, 3000);
}
```

---

## Step 4 — CSS additions (styles.css)

```css
/* Transcript status message */
.transcript-status {
  display:     block;
  font-size:   10px;
  padding:     3px 10px;
  flex-shrink: 0;
}
.transcript-status.success { color: #00c864; }
.transcript-status.warn    { color: #f0a500; }
.transcript-status.error   { color: #ff6b6b; }
```

---

## Files to modify

| File | Changes |
|---|---|
| main.js | Add dialog to electron require, add fs require, add ipcMain.handle('save-transcript') |
| preload.js | Expose saveTranscript on meetAPI |
| renderer.js | Archive placeholder Save handler, add saveTranscriptToDisk(), add showTranscriptStatus() |
| styles.css | Add .transcript-status styles |

DO NOT touch index.html — Save button already exists from Block 1.
DO NOT touch audio capture, transcription, or AI streaming code.
DO NOT touch any Block 1-4 features.

---

## Pre-ship checklist (do NOT do this now — only before final release)
- [ ] Re-enable setContentProtection(true) in main.js
- [ ] Comment out openDevTools in main.js

---

## Definition of done — Block 5

- [ ] Save button click → native Windows save dialog appears
- [ ] Default filename is MeetAssist_YYYY-MM-DD_HH-MM.txt
- [ ] Saved file contains header + date + all timestamped lines
- [ ] Success message shows saved filename briefly
- [ ] Cancelled dialog shows "Save cancelled" message
- [ ] Empty transcript shows "Nothing to save yet" message
- [ ] Save button disabled during save operation
- [ ] All 4 source files modified correctly
- [ ] Committed and pushed as v0.5.0

## What Block 6 will add
UI polish — better fonts, spacing, resize handle, stealth mode
re-enabled, DevTools closed, final pre-ship cleanup.
Then Block 7 builds the installer.
