# CLAUDE.md — MeetAssist Block 6 (v0.6.0)

## Context

Block 1 (v0.1.0) — Electron shell, overlay window, layout skeleton ✅
Block 2 (v0.2.0) — System audio capture, Whisper transcription, live transcript ✅
Block 3 (v0.3.0) — Text selection, context bar, AI answer streaming ✅
Block 4 (v0.4.0) — Timestamps, model selector, language setting, chunk size ✅
Block 5 (v0.5.0) — Save transcript to disk with native dialog ✅
Repo: https://github.com/Kokkisa/MeetAssist
Current commit: 4603178

Read ALL existing source files before touching anything.
Build Block 6 features on top of Block 5. Do NOT rewrite or restructure anything.

## ARCHIVE RULE (mandatory)
Never delete working code. Comment it out with reason and date.
Always commit a WIP state before trying alternative approaches.

---

## Block 6 Goal

Four improvements before shipping v1.0.0:

1. **Q&A History** — append each Q&A pair to the answer panel instead of
   replacing. User can scroll back through all previous answers in the session.
2. **Scroll lock** — answer panel does NOT auto-scroll if user has manually
   scrolled up. Only auto-scrolls when user is already near the bottom.
3. **UI polish** — better spacing, cleaner fonts, resize handle, overall
   visual tightening.
4. **Pre-ship cleanup** — re-enable setContentProtection (stealth mode on),
   comment out openDevTools.

Block 6 is done when all 4 features work and the app is committed as v0.6.0.

---

## Feature 1 — Q&A History

### Current behaviour (Block 3/5)
`streamAnswer()` clears `answerBody.innerHTML` at the start of every call,
replacing the previous answer. Only one answer visible at a time.

### New behaviour
Each Q&A pair is appended as a new block at the BOTTOM of the answer panel.
Previous answers remain visible — user can scroll up to read them.
A faint divider separates each pair.
A "Clear answers" button wipes the full history.

### Changes to renderer.js

#### Add qaHistory array (alongside other state vars):
```javascript
let qaHistory = []; // { question, context, answer, time }
```

#### Add "Clear answers" button to answer panel header in index.html:
The existing answer header already has Copy button. Add Clear Answers next to it:

```html
<div class="answer-header">
  <div class="panel-label">🤖 Answer</div>
  <div class="answer-header-controls">
    <button class="small-btn" id="btn-clear-answers" title="Clear all answers">Clear</button>
    <button class="small-btn" id="btn-copy-answer"  title="Copy last answer">Copy</button>
  </div>
</div>
```

Archive the existing answer-header HTML with a comment above it:
```html
<!-- Archived 2026-05-20 — single Copy button, no Clear. Replaced by answer-header-controls -->
```

#### New DOM ref (add to renderer.js refs section):
```javascript
const btnClearAnswers = document.getElementById('btn-clear-answers');
```

#### Wire Clear answers button:
```javascript
btnClearAnswers.addEventListener('click', () => {
  qaHistory = [];
  answerBody.innerHTML = '<p class="placeholder-text">Your answer will appear here...</p>';
});
```

#### Update Copy button to copy LAST answer only:
Find existing btnCopyAnswer handler. Archive it. Replace with:
```javascript
// Archived 2026-05-20 — copied all answerBody text including history dividers
// btnCopyAnswer.addEventListener('click', () => { ... });

btnCopyAnswer.addEventListener('click', () => {
  if (qaHistory.length === 0) return;
  const lastAnswer = qaHistory[qaHistory.length - 1].answer;
  navigator.clipboard.writeText(lastAnswer);
  btnCopyAnswer.textContent = 'Copied!';
  setTimeout(() => btnCopyAnswer.textContent = 'Copy', 2000);
});
```

#### Refactor streamAnswer() to append instead of replace:

Find the existing `streamAnswer(messages)` function.
Archive the entire function with a block comment.
Replace with this new version:

```javascript
// Archived 2026-05-20 — replaced the answer panel on every call (no history)
// async function streamAnswer(messages) { ... }

async function streamAnswer(messages, questionText, contextText) {
  const apiKey = getApiKey();
  if (!apiKey) {
    showAnswerError('No API key — add it in Settings ⚙');
    return;
  }

  // Remove placeholder if present
  const placeholder = answerBody.querySelector('.placeholder-text');
  if (placeholder) placeholder.remove();

  // Create a new Q&A block and append it
  const qaBlock = document.createElement('div');
  qaBlock.className = 'qa-block';

  // Question header
  if (questionText || contextText) {
    const qHeader = document.createElement('div');
    qHeader.className = 'qa-question';
    qHeader.textContent = questionText
      ? `Q: ${questionText}`
      : 'Q: (summarize selected context)';
    qaBlock.appendChild(qHeader);
  }

  // Answer text element
  const answerEl = document.createElement('p');
  answerEl.className = 'answer-text';
  answerEl.textContent = 'thinking...';
  qaBlock.appendChild(answerEl);

  // Divider below this block
  const divider = document.createElement('div');
  divider.className = 'qa-divider';
  qaBlock.appendChild(divider);

  answerBody.appendChild(qaBlock);

  // Scroll to show new block
  answerBody.scrollTop = answerBody.scrollHeight;

  btnAsk.disabled = true;
  btnAsk.textContent = '...';

  let fullText = '';

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model:       localStorage.getItem(STORAGE_KEY_MODEL) || 'gpt-4o-mini',
        messages:    messages,
        max_tokens:  500,
        stream:      true,
        temperature: 0.3
      })
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      answerEl.textContent = `API error: ${err?.error?.message || response.status}`;
      answerEl.className = 'answer-error';
      return;
    }

    // Stream SSE response
    const reader  = response.body.getReader();
    const decoder = new TextDecoder();
    answerEl.textContent = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n').filter(l => l.startsWith('data: '));

      for (const line of lines) {
        const data = line.slice(6);
        if (data === '[DONE]') break;

        try {
          const parsed = JSON.parse(data);
          const delta  = parsed.choices?.[0]?.delta?.content || '';
          fullText += delta;
          answerEl.textContent = fullText;

          // Scroll lock — only auto-scroll if user is near the bottom
          if (isNearBottom(answerBody)) {
            answerBody.scrollTop = answerBody.scrollHeight;
          }
        } catch {
          // Skip malformed SSE chunks
        }
      }
    }

    // Save to history
    qaHistory.push({
      question: questionText || '',
      context:  contextText  || '',
      answer:   fullText,
      time:     new Date()
    });

  } catch (err) {
    answerEl.textContent = `Network error: ${err.message}`;
    answerEl.className = 'answer-error';
  } finally {
    btnAsk.disabled = false;
    btnAsk.textContent = 'Ask';
  }
}
```

#### Update handleAsk() to pass question and context to streamAnswer:

Find the existing handleAsk() function. Archive it. Replace:

```javascript
// Archived 2026-05-20 — did not pass questionText/contextText to streamAnswer
// function handleAsk() { ... }

function handleAsk() {
  const contextText = selectedTextDisplay.classList.contains('has-content')
    ? selectedTextDisplay.textContent.trim()
    : '';
  const questionText = questionInput.value.trim();

  const messages = buildMessages(contextText, questionText);
  if (!messages) {
    selectedTextDisplay.style.borderColor = 'rgba(255,80,80,0.6)';
    setTimeout(() => { selectedTextDisplay.style.borderColor = ''; }, 800);
    return;
  }

  questionInput.value = '';
  streamAnswer(messages, questionText, contextText);
}
```

---

## Feature 2 — Scroll Lock

### Add isNearBottom helper to renderer.js:

```javascript
// Scroll lock helper — returns true if panel is scrolled near the bottom
function isNearBottom(el) {
  return el.scrollHeight - el.scrollTop - el.clientHeight < 60;
}
```

Place this function near the top of renderer.js, after state variables.

### Apply scroll lock to transcript panel too:

Find the existing `appendTranscriptLine()` function.
Find this line:
```javascript
transcriptBody.scrollTop = transcriptBody.scrollHeight;
```
Replace with:
```javascript
if (isNearBottom(transcriptBody)) {
  transcriptBody.scrollTop = transcriptBody.scrollHeight;
}
```

---

## Feature 3 — UI Polish

### CSS additions and updates (styles.css)

#### Q&A history block styles:
```css
/* ── Q&A HISTORY ──────────────────────────────────────── */
.qa-block {
  margin-bottom: 4px;
}

.qa-question {
  font-size:     10px;
  font-weight:   600;
  color:         var(--text-accent);
  padding:       6px 0 2px;
  line-height:   1.4;
  word-break:    break-word;
}

.qa-divider {
  height:        1px;
  background:    rgba(255,255,255,0.06);
  margin:        8px 0 4px;
}

/* ── ANSWER HEADER CONTROLS ───────────────────────────── */
.answer-header-controls {
  display: flex;
  gap:     4px;
}
```

#### General UI polish:
```css
/* ── UI POLISH ────────────────────────────────────────── */

/* Slightly tighter panel label */
.panel-label {
  font-size:   10px;
  font-weight: 700;
  letter-spacing: 1px;
}

/* Smoother scrollbars on all panels */
* {
  scrollbar-width: thin;
  scrollbar-color: rgba(255,255,255,0.15) transparent;
}

/* Resize handle — bottom-right corner */
body {
  resize:   both;
  overflow: hidden;
}

/* Selected text highlight in transcript */
::selection {
  background: rgba(79,142,247,0.35);
  color:      var(--text-primary);
}
```

---

## Feature 4 — Pre-ship Cleanup

### main.js — flip both dev-mode toggles:

#### Re-enable stealth mode:
Find the commented-out line:
```javascript
// mainWindow.setContentProtection(true);  // re-enable before shipping
```
Uncomment it:
```javascript
mainWindow.setContentProtection(true);
```

#### Close DevTools:
Find the uncommented line:
```javascript
mainWindow.webContents.openDevTools({ mode: 'detach' });
```
Comment it out:
```javascript
// mainWindow.webContents.openDevTools({ mode: 'detach' }); // dev only
```

---

## Files to modify

| File | Changes |
|---|---|
| main.js | Re-enable setContentProtection, comment out openDevTools |
| renderer.js | Add qaHistory state, add isNearBottom helper, add btnClearAnswers ref + handler, update btnCopyAnswer to copy last answer, archive + replace streamAnswer, archive + replace handleAsk, apply scroll lock to appendTranscriptLine |
| index.html | Update answer-header to include Clear + Copy in answer-header-controls div |
| styles.css | Add .qa-block, .qa-question, .qa-divider, .answer-header-controls, UI polish rules |

DO NOT touch preload.js — no changes needed.
DO NOT touch audio capture, Whisper, or save-to-disk code.

---

## Definition of done — Block 6

- [ ] Each Ask appends a new Q&A block — previous answers stay visible
- [ ] Q question header shows above each answer in accent color
- [ ] Clear answers button wipes all history
- [ ] Copy button copies only the LAST answer
- [ ] Answer panel does NOT auto-scroll when user has scrolled up
- [ ] Transcript panel does NOT auto-scroll when user has scrolled up
- [ ] Stealth mode on — overlay hidden from screen share
- [ ] DevTools closed on launch
- [ ] UI looks polished and clean
- [ ] Committed and pushed as v0.6.0

## What Block 7 will add
Build the installer (npm run build), test the .exe,
create desktop shortcut, ship v1.0.0.
