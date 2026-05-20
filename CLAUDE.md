# CLAUDE.md — MeetAssist Block 4 (v0.4.0)

## Context

Block 1 (v0.1.0) — Electron shell, overlay window, layout skeleton ✅
Block 2 (v0.2.0) — System audio capture, Whisper transcription, live transcript ✅
Block 3 (v0.3.0) — Text selection, context bar, AI answer streaming ✅
Repo: https://github.com/Kokkisa/MeetAssist
Current commit: bd8c68a

Read ALL existing source files before touching anything.
Build Block 4 features on top of Block 3. Do NOT rewrite or restructure anything.

## ARCHIVE RULE (mandatory)
Never delete working code. Comment it out with reason and date.
Always commit a WIP state before trying alternative approaches.

---

## Block 4 Goal

Four improvements that make MeetAssist more useful in real meetings:

1. **Timestamps on transcript lines** — each line shows the time it was captured (HH:MM:SS)
2. **Model selector in settings** — user can switch between gpt-4o and gpt-4o-mini
3. **Language setting** — user can set Whisper transcription language (default: en)
4. **Chunk size control** — user can change transcription interval (3s / 5s / 10s)

Block 4 is done when:
- Every transcript line has a timestamp prefix
- Settings bar has model, language, and chunk size controls
- All settings persist in localStorage
- Committed and pushed as v0.4.0

---

## Feature 1 — Timestamps on Transcript Lines

### How it works
When `appendTranscriptLine(text)` is called in renderer.js, prepend a
timestamp showing the wall-clock time the line was captured.

### Update appendTranscriptLine in renderer.js

Find the existing `appendTranscriptLine(text)` function and update it.
Archive the original with a comment, then replace:

```javascript
// Archived 2026-05-20 — no timestamp version
// function appendTranscriptLine(text) {
//   const placeholder = transcriptBody.querySelector('.placeholder-text');
//   if (placeholder) placeholder.remove();
//   transcriptLines.push({ text, time: new Date() });
//   const line = document.createElement('p');
//   line.className = 'transcript-line';
//   line.textContent = text;
//   transcriptBody.appendChild(line);
//   transcriptBody.scrollTop = transcriptBody.scrollHeight;
// }

function appendTranscriptLine(text) {
  // Remove placeholder if present
  const placeholder = transcriptBody.querySelector('.placeholder-text');
  if (placeholder) placeholder.remove();

  const now = new Date();
  transcriptLines.push({ text, time: now });

  // Format timestamp HH:MM:SS
  const ts = now.toTimeString().slice(0, 8);

  const line = document.createElement('p');
  line.className = 'transcript-line';

  const tsSpan = document.createElement('span');
  tsSpan.className = 'transcript-ts';
  tsSpan.textContent = ts;

  const textSpan = document.createElement('span');
  textSpan.className = 'transcript-text';
  textSpan.textContent = ' ' + text;

  line.appendChild(tsSpan);
  line.appendChild(textSpan);
  transcriptBody.appendChild(line);

  // Auto-scroll to bottom
  transcriptBody.scrollTop = transcriptBody.scrollHeight;
}
```

### CSS for timestamp (add to styles.css):

```css
.transcript-ts {
  color:         var(--text-secondary);
  font-size:     10px;
  font-variant-numeric: tabular-nums;
  margin-right:  6px;
  flex-shrink:   0;
  user-select:   none; /* don't include timestamp in text selection */
}

.transcript-text {
  color:       var(--text-primary);
  font-size:   12px;
  line-height: 1.6;
}

/* Update transcript-line to use flex for ts + text alignment */
.transcript-line {
  display:       flex;
  align-items:   baseline;
  padding:       2px 0;
  border-bottom: 1px solid rgba(255,255,255,0.04);
  margin-bottom: 3px;
  user-select:   text;
}
```

Note: `.transcript-line` already exists in styles.css from Block 2.
Replace the existing `.transcript-line` rule with the updated version above.
Archive the old one with a comment.

---

## Feature 2 — Model Selector in Settings

### Add to settings-bar in index.html

The existing settings-bar has one row (API key).
Add two more rows below it — model selector and language input:

```html
<!-- Model selector row -->
<div class="settings-row">
  <label for="select-model">AI Model</label>
  <select id="select-model">
    <option value="gpt-4o-mini">gpt-4o-mini (fast)</option>
    <option value="gpt-4o">gpt-4o (best)</option>
  </select>
</div>

<!-- Language row -->
<div class="settings-row">
  <label for="input-language">Whisper Language</label>
  <input
    type="text"
    id="input-language"
    placeholder="en"
    maxlength="5"
    style="max-width: 60px;"
    autocomplete="off"
  />
  <span class="settings-hint">e.g. en, hi, te, fr</span>
</div>

<!-- Chunk size row -->
<div class="settings-row">
  <label for="select-chunk">Chunk Size</label>
  <select id="select-chunk">
    <option value="3000">3 seconds</option>
    <option value="5000" selected>5 seconds (default)</option>
    <option value="10000">10 seconds</option>
  </select>
</div>
```

Place these rows AFTER the existing API key row, BEFORE the Save button.
The Save button already exists — do not add another one.

### CSS additions (add to styles.css):

```css
select {
  background:    var(--bg-input);
  border:        1px solid var(--border);
  border-radius: var(--radius-sm);
  color:         var(--text-primary);
  font-size:     11px;
  padding:       4px 8px;
  outline:       none;
  cursor:        pointer;
}
select:focus { border-color: rgba(79,142,247,0.50); }

.settings-hint {
  font-size:  10px;
  color:      var(--text-secondary);
  white-space: nowrap;
}
```

---

## Feature 3 — Wire New Settings in renderer.js

### New storage keys (add alongside existing STORAGE_KEY_APIKEY):

```javascript
const STORAGE_KEY_MODEL    = 'meetassist_model';    // already exists from Block 3
const STORAGE_KEY_LANGUAGE = 'meetassist_language';
const STORAGE_KEY_CHUNK    = 'meetassist_chunk_ms';
```

Note: STORAGE_KEY_MODEL already exists from Block 3 — do not duplicate it.

### New DOM refs (add after existing refs):

```javascript
const selectModel    = document.getElementById('select-model');
const inputLanguage  = document.getElementById('input-language');
const selectChunk    = document.getElementById('select-chunk');
```

### Update loadSettings() to load new values:

Find the existing loadSettings() function and extend it:

```javascript
function loadSettings() {
  inputApiKey.value      = getApiKey();
  selectModel.value      = localStorage.getItem(STORAGE_KEY_MODEL)    || 'gpt-4o-mini';
  inputLanguage.value    = localStorage.getItem(STORAGE_KEY_LANGUAGE)  || 'en';
  selectChunk.value      = localStorage.getItem(STORAGE_KEY_CHUNK)     || '5000';
}
```

### Update saveSettings() to save new values:

Find the existing saveSettings() function and extend it:

```javascript
function saveSettings() {
  const key = inputApiKey.value.trim();
  if (!key) return;
  localStorage.setItem(STORAGE_KEY_APIKEY,   key);
  localStorage.setItem(STORAGE_KEY_MODEL,    selectModel.value);
  localStorage.setItem(STORAGE_KEY_LANGUAGE, inputLanguage.value.trim() || 'en');
  localStorage.setItem(STORAGE_KEY_CHUNK,    selectChunk.value);
  settingsBar.classList.add('hidden');
}
```

### Update transcribeChunk() to use language setting:

Find the existing `transcribeChunk(audioBlob)` function.
Find the line: `formData.append('language', 'en');`
Replace it with:
```javascript
formData.append('language', localStorage.getItem(STORAGE_KEY_LANGUAGE) || 'en');
```

### Update chunk timer to use chunk size setting:

In `startRecording()`, find the line:
```javascript
chunkTimer = setTimeout(flushChunk, 5000);
```
There are TWO occurrences of this line (one initial, one inside flushChunk for restart).
Replace BOTH with:
```javascript
chunkTimer = setTimeout(flushChunk, parseInt(localStorage.getItem(STORAGE_KEY_CHUNK) || '5000'));
```

### Update streamAnswer() to use model setting:

The existing streamAnswer() already reads:
```javascript
model: localStorage.getItem(STORAGE_KEY_MODEL) || 'gpt-4o-mini',
```
This is already correct from Block 3 — no change needed here.

---

## Files to modify

| File | Changes |
|---|---|
| renderer.js | Update appendTranscriptLine (archive old), extend loadSettings + saveSettings, add 3 new DOM refs, add STORAGE_KEY_LANGUAGE + STORAGE_KEY_CHUNK, update transcribeChunk language, update both chunkTimer setTimeout calls |
| index.html | Add 3 new settings rows (model, language, chunk) inside settings-bar |
| styles.css | Add .transcript-ts, .transcript-text, update .transcript-line to flex, add select styles, .settings-hint |

DO NOT touch main.js or preload.js.
DO NOT touch audio capture, Whisper call structure, or AI streaming logic.
DO NOT touch Block 1/2/3 features — only extend them.

---

## Pre-ship checklist (do NOT do this now — only before final release)
- [ ] Re-enable setContentProtection(true) in main.js
- [ ] Comment out openDevTools in main.js

---

## Definition of done — Block 4

- [ ] Every new transcript line shows HH:MM:SS timestamp prefix
- [ ] Timestamp is not selectable (user-select: none) so it doesn't pollute context
- [ ] Settings bar has model, language, chunk size rows
- [ ] Saving settings persists all 4 values to localStorage
- [ ] Loading app restores all 4 saved values
- [ ] Whisper uses saved language setting
- [ ] Chunk timer uses saved chunk size
- [ ] AI answer uses saved model
- [ ] No changes to main.js or preload.js
- [ ] Committed and pushed as v0.4.0

## What Block 5 will add
Session save to disk — export full transcript as .txt file with timestamps,
triggered by the existing Save button in the transcript header.
