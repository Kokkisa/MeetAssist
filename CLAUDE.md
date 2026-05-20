# CLAUDE.md — MeetAssist Block 2 (v0.2.0)

## Context

Block 1 is complete and pushed as v0.1.0.
The overlay window works. All 6 files exist and are correct.
Repo: https://github.com/Kokkisa/MeetAssist

Read ALL existing source files before touching anything.
Build Block 2 features on top of Block 1. Do NOT rewrite or restructure Block 1 code.

---

## Block 2 Goal

Capture system audio (what the user hears — Zoom/Meet output) continuously.
Chunk it every 5 seconds and send to OpenAI Whisper for transcription.
Append each transcribed chunk as a new line in the transcript panel.
Add a Start/Stop recording button to the header.

Block 2 is done when:
- User clicks Start → app begins capturing system audio
- Every ~5 seconds a new transcript line appears in the transcript panel
- User clicks Stop → capture ends, transcript stays on screen
- All data persists in memory during the session (no disk write yet — that is Block 6)
- Committed and pushed as v0.2.0

---

## Architecture

```
System Audio (WASAPI loopback)
    ↓
desktopCapturer (Electron main process)
    ↓ IPC (audio-chunk ArrayBuffer)
renderer process
    ↓
OpenAI Whisper API (audio/transcriptions)
    ↓
Append line to #transcript-body
```

All audio capture happens in the RENDERER process using the Web Audio API
via desktopCapturer — same proven pattern as LiveCallAssistant v0.1.0.
Do NOT use native modules. Do NOT use node-record-lpcm16 or any npm audio package.

---

## Step 1 — Add OpenAI API key setting (stored in localStorage)

MeetAssist needs the user's OpenAI API key for Whisper.
Store it in localStorage. Add a simple settings toggle to the header.

### Add to index.html — settings row below header:

```html
<!-- Settings bar — collapsible, hidden by default -->
<div id="settings-bar" class="hidden">
  <div class="settings-row">
    <label for="input-api-key">OpenAI API Key</label>
    <input type="password" id="input-api-key" placeholder="sk-..." autocomplete="off" />
    <button id="btn-save-settings">Save</button>
  </div>
</div>
```

Add a ⚙ settings button to the existing #win-controls in the header:
```html
<button class="ctrl-btn" id="btn-settings" title="Settings">⚙</button>
```
Place it BEFORE the minimise button.

### CSS for settings bar (add to styles.css):

```css
#settings-bar {
  background:   rgba(15, 15, 25, 0.95);
  border-top:   1px solid var(--border);
  padding:      8px 10px;
  flex-shrink:  0;
}
#settings-bar.hidden { display: none; }

.settings-row {
  display:     flex;
  align-items: center;
  gap:         8px;
}
.settings-row label {
  font-size:   11px;
  color:       var(--text-secondary);
  white-space: nowrap;
}
.settings-row input {
  flex:          1;
  background:    var(--bg-input);
  border:        1px solid var(--border);
  border-radius: var(--radius-sm);
  color:         var(--text-primary);
  font-size:     11px;
  padding:       4px 8px;
  outline:       none;
}
.settings-row input:focus { border-color: rgba(79,142,247,0.50); }
#btn-save-settings {
  background:    var(--bg-btn);
  border:        none;
  border-radius: var(--radius-sm);
  color:         #fff;
  font-size:     11px;
  padding:       4px 10px;
  cursor:        pointer;
}
#btn-save-settings:hover { background: var(--bg-btn-hover); }
```

---

## Step 2 — Add Start/Stop button to header

In index.html, add to #header between #app-name and #win-controls:

```html
<div id="record-controls">
  <div id="rec-indicator" class="hidden">
    <span class="rec-dot"></span>
    <span id="rec-timer">00:00</span>
  </div>
  <button id="btn-start-stop" class="start-btn">▶ Start</button>
</div>
```

### CSS (add to styles.css):

```css
#record-controls {
  display:     flex;
  align-items: center;
  gap:         8px;
  -webkit-app-region: no-drag;
}
.start-btn {
  background:    rgba(0, 200, 100, 0.20);
  border:        1px solid rgba(0, 200, 100, 0.40);
  border-radius: 12px;
  color:         #00c864;
  font-size:     11px;
  font-weight:   600;
  padding:       4px 12px;
  cursor:        pointer;
  transition:    all 0.15s;
}
.start-btn:hover  { background: rgba(0, 200, 100, 0.35); }
.start-btn.active {
  background: rgba(255, 60, 60, 0.20);
  border-color: rgba(255, 60, 60, 0.40);
  color: #ff4f4f;
}
#rec-indicator {
  display:     flex;
  align-items: center;
  gap:         5px;
}
#rec-indicator.hidden { display: none; }
.rec-dot {
  width:         7px;
  height:        7px;
  border-radius: 50%;
  background:    #ff4f4f;
  animation:     pulse 1.2s ease-in-out infinite;
}
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.3; }
}
#rec-timer {
  font-size:   10px;
  color:       var(--text-secondary);
  font-variant-numeric: tabular-nums;
}
```

---

## Step 3 — Audio capture in renderer.js

This is the core of Block 2. Add the following to renderer.js.

### 3A — New DOM refs (add after existing refs):

```javascript
const btnStartStop   = document.getElementById('btn-start-stop');
const btnSettings    = document.getElementById('btn-settings');
const settingsBar    = document.getElementById('settings-bar');
const inputApiKey    = document.getElementById('input-api-key');
const btnSaveSettings= document.getElementById('btn-save-settings');
const recIndicator   = document.getElementById('rec-indicator');
const recTimerEl     = document.getElementById('rec-timer');
```

### 3B — State variables (add after existing state):

```javascript
// Recording state
let isRecording      = false;
let mediaStream      = null;
let mediaRecorder    = null;
let audioChunks      = [];
let chunkTimer       = null;
let recTimerInterval = null;
let recSeconds       = 0;
let transcriptLines  = [];   // full session transcript in memory
```

### 3C — Settings (add after state variables):

```javascript
// Load saved API key on startup
const STORAGE_KEY_APIKEY = 'meetassist_openai_key';

function getApiKey() {
  return localStorage.getItem(STORAGE_KEY_APIKEY) || '';
}

function loadSettings() {
  inputApiKey.value = getApiKey();
}

function saveSettings() {
  const key = inputApiKey.value.trim();
  if (!key) return;
  localStorage.setItem(STORAGE_KEY_APIKEY, key);
  settingsBar.classList.add('hidden');
}

// Wire settings button
btnSettings.addEventListener('click', () => {
  settingsBar.classList.toggle('hidden');
  if (!settingsBar.classList.contains('hidden')) {
    inputApiKey.focus();
  }
});

btnSaveSettings.addEventListener('click', saveSettings);
inputApiKey.addEventListener('keydown', e => {
  if (e.key === 'Enter') saveSettings();
});

loadSettings();
```

### 3D — Recording timer:

```javascript
function startRecTimer() {
  recSeconds = 0;
  recTimerEl.textContent = '00:00';
  recTimerInterval = setInterval(() => {
    recSeconds++;
    const m = String(Math.floor(recSeconds / 60)).padStart(2, '0');
    const s = String(recSeconds % 60).padStart(2, '0');
    recTimerEl.textContent = `${m}:${s}`;
  }, 1000);
}

function stopRecTimer() {
  clearInterval(recTimerInterval);
  recTimerInterval = null;
}
```

### 3E — Whisper transcription call:

```javascript
async function transcribeChunk(audioBlob) {
  const apiKey = getApiKey();
  if (!apiKey) {
    appendTranscriptLine('[No API key — add it in Settings ⚙]');
    return;
  }

  const formData = new FormData();
  formData.append('file', audioBlob, 'chunk.webm');
  formData.append('model', 'whisper-1');
  formData.append('language', 'en');

  try {
    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method:  'POST',
      headers: { 'Authorization': `Bearer ${apiKey}` },
      body:    formData
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      appendTranscriptLine(`[Whisper error: ${err?.error?.message || response.status}]`);
      return;
    }

    const data = await response.json();
    const text = data.text?.trim();

    // Skip empty or noise-only chunks
    if (text && text.length > 1) {
      appendTranscriptLine(text);
    }

  } catch (err) {
    appendTranscriptLine(`[Network error: ${err.message}]`);
  }
}
```

### 3F — Append transcript line:

```javascript
function appendTranscriptLine(text) {
  // Remove placeholder if present
  const placeholder = transcriptBody.querySelector('.placeholder-text');
  if (placeholder) placeholder.remove();

  // Add to in-memory array
  transcriptLines.push({ text, time: new Date() });

  // Create DOM element
  const line = document.createElement('p');
  line.className = 'transcript-line';
  line.textContent = text;
  transcriptBody.appendChild(line);

  // Auto-scroll to bottom
  transcriptBody.scrollTop = transcriptBody.scrollHeight;
}
```

Add to styles.css:
```css
.transcript-line {
  padding:       2px 0;
  border-bottom: 1px solid rgba(255,255,255,0.04);
  margin-bottom: 3px;
  font-size:     12px;
  line-height:   1.6;
  color:         var(--text-primary);
  user-select:   text;   /* allow text selection for context bar */
}
```

### 3G — Audio capture and chunking:

```javascript
async function startRecording() {
  if (isRecording) return;

  // Get system audio via desktopCapturer (loopback)
  // On Windows this captures all system audio output including Zoom/Meet
  try {
    // Request screen + audio — the audio track is the system loopback
    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        mandatory: {
          chromeMediaSource:   'desktop',
          chromeMediaSourceId: 'screen:0:0',  // default primary screen
        }
      },
      video: false
    });
  } catch (err) {
    appendTranscriptLine(`[Audio capture failed: ${err.message}]`);
    return;
  }

  // Check we got an audio track
  const audioTracks = mediaStream.getAudioTracks();
  if (!audioTracks.length) {
    appendTranscriptLine('[No audio track available — check Windows audio settings]');
    return;
  }

  isRecording = true;
  btnStartStop.textContent = '■ Stop';
  btnStartStop.classList.add('active');
  recIndicator.classList.remove('hidden');
  startRecTimer();

  // Use MediaRecorder to collect chunks
  mediaRecorder = new MediaRecorder(mediaStream, { mimeType: 'audio/webm;codecs=opus' });

  mediaRecorder.ondataavailable = e => {
    if (e.data && e.data.size > 0) audioChunks.push(e.data);
  };

  // Every 5 seconds: stop current recorder, transcribe, restart
  async function flushChunk() {
    if (!isRecording) return;

    mediaRecorder.stop();
    await new Promise(res => mediaRecorder.onstop = res);

    if (audioChunks.length) {
      const blob = new Blob(audioChunks, { type: 'audio/webm;codecs=opus' });
      audioChunks = [];
      transcribeChunk(blob); // fire and forget — don't await, keep recording
    }

    if (isRecording) {
      // Restart recorder on same stream
      mediaRecorder = new MediaRecorder(mediaStream, { mimeType: 'audio/webm;codecs=opus' });
      mediaRecorder.ondataavailable = e => {
        if (e.data && e.data.size > 0) audioChunks.push(e.data);
      };
      mediaRecorder.start();
      chunkTimer = setTimeout(flushChunk, 5000);
    }
  }

  mediaRecorder.start();
  chunkTimer = setTimeout(flushChunk, 5000);
}

function stopRecording() {
  if (!isRecording) return;
  isRecording = false;

  clearTimeout(chunkTimer);
  stopRecTimer();

  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
  }
  if (mediaStream) {
    mediaStream.getTracks().forEach(t => t.stop());
    mediaStream = null;
  }

  btnStartStop.textContent = '▶ Start';
  btnStartStop.classList.remove('active');
  recIndicator.classList.add('hidden');

  appendTranscriptLine('── Recording stopped ──');
}
```

### 3H — Wire Start/Stop button:

```javascript
btnStartStop.addEventListener('click', () => {
  if (isRecording) {
    stopRecording();
  } else {
    startRecording();
  }
});
```

### 3I — Update Clear transcript to also reset in-memory array:

Find the existing btnClearTranscript handler and replace it:
```javascript
btnClearTranscript.addEventListener('click', () => {
  transcriptLines = [];
  transcriptBody.innerHTML = '<p class="placeholder-text">Transcript cleared.</p>';
});
```

---

## Step 4 — Update CSP in index.html

The existing CSP blocks fetch() calls to OpenAI. Update the meta tag:

```html
<meta http-equiv="Content-Security-Policy"
      content="default-src 'self';
               script-src 'self';
               style-src 'self' 'unsafe-inline';
               connect-src https://api.openai.com;">
```

---

## Step 5 — Update main.js for audio permissions

Electron requires explicit permission for audio capture.
Add this to createWindow() AFTER mainWindow is created:

```javascript
// Grant audio/media permissions for system loopback capture
mainWindow.webContents.session.setPermissionRequestHandler(
  (webContents, permission, callback) => {
    const allowed = ['media', 'audioCapture', 'desktopCapture'];
    callback(allowed.includes(permission));
  }
);
```

---

## Edge cases to handle

| Scenario | Handling |
|---|---|
| No API key set | Show message in transcript: [No API key — add in Settings] |
| Whisper returns empty | Skip silently — don't append blank line |
| Audio chunk too short (<0.5s) | Skip transcription — Whisper returns noise |
| Network error | Append error line, keep recording |
| User clicks Stop mid-chunk | Flush last chunk before stopping |
| MediaRecorder mimeType not supported | Fallback to 'audio/webm' without codec spec |

---

## Definition of done — Block 2

- [ ] ⚙ settings button shows/hides settings bar
- [ ] API key saves to localStorage on Save or Enter
- [ ] ▶ Start button begins audio capture
- [ ] Recording indicator (pulsing red dot + timer) shows while recording
- [ ] Transcript lines appear every ~5 seconds from Whisper
- [ ] ■ Stop button ends capture cleanly
- [ ] Clear button resets both DOM and transcriptLines array
- [ ] No audio packages installed — uses Web Audio API only
- [ ] Committed and pushed as v0.2.0

## What Block 3 will add
Text selection from transcript → context bar (auto-populate selected text),
and manual context editing before asking the AI.
