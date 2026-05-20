# CLAUDE.md — MeetAssist Block 3 (v0.3.0)

## Context

Block 1 (v0.1.0) — Electron shell, overlay window, layout skeleton ✅
Block 2 (v0.2.0) — System audio capture, Whisper transcription, live transcript ✅
Repo: https://github.com/Kokkisa/MeetAssist
Current commit: 40c6d4c

Read ALL existing source files before touching anything.
Build Block 3 features on top of Block 2. Do NOT rewrite or restructure anything.

## ARCHIVE RULE (mandatory)
Never delete working code. Comment it out with reason and date.
Always commit a WIP state before trying alternative approaches.

---

## Block 3 Goal

Three features, in order:

1. **Text selection → context bar** — when user selects any text in the
   transcript panel, it auto-populates the context display in the context bar

2. **Manual context editing** — user can edit the selected text in the
   context bar before asking, and can clear it

3. **AI answer on demand** — when user clicks Ask (or presses Enter),
   the selected context + question is sent to GPT-4o and the answer
   streams into the answer panel

Block 3 is done when:
- User selects transcript text → appears in context bar automatically
- User types a question → clicks Ask or presses Enter
- Answer streams word by word into the answer panel
- Multiple rounds work (ask again with new selection)
- Committed and pushed as v0.3.0

---

## Feature 1 — Text Selection → Context Bar

### How it works
The transcript panel (`#transcript-body`) contains `.transcript-line` paragraphs.
When the user selects text anywhere inside `#transcript-body` and releases
the mouse, capture the selected text and populate `#selected-text-display`.

### Current state of context bar in index.html
The Block 1/2 HTML already has:
- `#selected-text-display` — shows selected text (currently placeholder text)
- `#question-input` — user types their question
- `#btn-ask` — triggers the AI call

Block 2 renderer.js already has a basic mouseup handler for this.
READ the existing handler first — do NOT duplicate it. Extend or replace it cleanly.

### Improved selection handler (replace existing mouseup handler in renderer.js):

```javascript
// ── Text selection → context bar ─────────────────────────────────────────────
let lastSelectedText = '';

document.addEventListener('mouseup', () => {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed) return;

  const range = selection.getRangeAt(0);

  // Only capture selections inside transcript-body
  if (!transcriptBody.contains(range.commonAncestorContainer)) return;

  const selectedText = selection.toString().trim();
  if (!selectedText || selectedText === lastSelectedText) return;

  lastSelectedText = selectedText;
  setContextText(selectedText);
});

function setContextText(text) {
  selectedTextDisplay.textContent = text;
  selectedTextDisplay.classList.remove('empty-state');
  selectedTextDisplay.classList.add('has-content');
  // Focus question input so user can type immediately
  questionInput.focus();
}

function clearContext() {
  lastSelectedText = '';
  selectedTextDisplay.textContent = 'Select text from transcript → it appears here';
  selectedTextDisplay.classList.add('empty-state');
  selectedTextDisplay.classList.remove('has-content');
}
```

### Add a Clear button to context bar (index.html)

In the context bar section, add a small Clear button next to the panel label:

```html
<div class="context-bar-header">
  <div class="panel-label">💬 Context &amp; Question</div>
  <button class="small-btn" id="btn-clear-context">Clear</button>
</div>
```

Replace the existing lone `<div class="panel-label">` line in #context-bar with this.

### CSS for context-bar-header (add to styles.css):

```css
.context-bar-header {
  display:         flex;
  align-items:     center;
  justify-content: space-between;
  padding-right:   10px;
}
```

### Wire the clear button in renderer.js:

```javascript
const btnClearContext = document.getElementById('btn-clear-context');
btnClearContext.addEventListener('click', clearContext);
```

---

## Feature 2 — AI Answer Streaming

### Settings addition — store model preference

Add to localStorage keys:
```javascript
const STORAGE_KEY_MODEL = 'meetassist_model'; // 'gpt-4o' or 'gpt-4o-mini'
```

No UI for model selector in Block 3 — default to `gpt-4o-mini` for speed and cost.
User can change in Block 4 settings expansion.

### The ask flow

When user clicks Ask or presses Enter in `#question-input`:

1. Read context from `#selected-text-display` (if has-content class)
2. Read question from `#question-input`
3. Validate — at least one of context or question must be non-empty
4. Build messages array for GPT-4o
5. Stream response into `#answer-body`
6. Clear question input after submit
7. Keep context — user may want to ask follow-up on same selection

### System prompt for MeetAssist:

```javascript
const SYSTEM_PROMPT = `You are MeetAssist, a real-time meeting assistant.
The user is in a live meeting (Zoom, Google Meet, Teams, etc).
You are given a transcript excerpt from the meeting and a question about it.

Your job:
- Answer the question clearly and concisely based on the transcript context
- If no context is provided, answer the question from general knowledge
- Keep answers brief (2-4 sentences) unless the question requires more detail
- Use plain text — no markdown, no bullet points, no headers
- If asked to summarize, give a 3-5 sentence summary
- If asked for action items, list them as plain numbered items
- Never say "based on the transcript" — just answer directly

The user may be reading your answer while on a live call, so be fast and clear.`;
```

### buildMessages function:

```javascript
function buildMessages(contextText, question) {
  const hasContext = contextText &&
    !selectedTextDisplay.classList.contains('empty-state');

  let userContent = '';

  if (hasContext && question) {
    userContent = `Transcript excerpt:\n"${contextText}"\n\nQuestion: ${question}`;
  } else if (hasContext && !question) {
    userContent = `Transcript excerpt:\n"${contextText}"\n\nPlease summarize this.`;
  } else if (!hasContext && question) {
    userContent = question;
  } else {
    return null; // nothing to send
  }

  return [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user',   content: userContent }
  ];
}
```

### streamAnswer function (SSE streaming):

```javascript
async function streamAnswer(messages) {
  const apiKey = getApiKey();
  if (!apiKey) {
    showAnswerError('No API key — add it in Settings ⚙');
    return;
  }

  // Show loading state
  answerBody.innerHTML = '<p class="answer-streaming">thinking...</p>';
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
      showAnswerError(`API error: ${err?.error?.message || response.status}`);
      return;
    }

    // Stream SSE response
    const reader  = response.body.getReader();
    const decoder = new TextDecoder();
    answerBody.innerHTML = '';

    const answerEl = document.createElement('p');
    answerEl.className = 'answer-text';
    answerBody.appendChild(answerEl);

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n').filter(l => l.startsWith('data: '));

      for (const line of lines) {
        const data = line.slice(6); // remove 'data: '
        if (data === '[DONE]') break;

        try {
          const parsed = JSON.parse(data);
          const delta  = parsed.choices?.[0]?.delta?.content || '';
          fullText += delta;
          answerEl.textContent = fullText;
          // Auto-scroll answer panel
          answerBody.scrollTop = answerBody.scrollHeight;
        } catch {
          // Skip malformed SSE chunks
        }
      }
    }

  } catch (err) {
    showAnswerError(`Network error: ${err.message}`);
  } finally {
    btnAsk.disabled = false;
    btnAsk.textContent = 'Ask';
  }
}

function showAnswerError(msg) {
  answerBody.innerHTML = `<p class="answer-error">${msg}</p>`;
  btnAsk.disabled = false;
  btnAsk.textContent = 'Ask';
}
```

### handleAsk function (replace existing placeholder):

Find the existing `handleAsk()` function in renderer.js and replace it entirely:

```javascript
function handleAsk() {
  const contextText = selectedTextDisplay.textContent.trim();
  const question    = questionInput.value.trim();

  const messages = buildMessages(contextText, question);
  if (!messages) {
    // Flash the context bar to indicate nothing to send
    selectedTextDisplay.style.borderColor = 'rgba(255,80,80,0.6)';
    setTimeout(() => {
      selectedTextDisplay.style.borderColor = '';
    }, 800);
    return;
  }

  questionInput.value = '';
  streamAnswer(messages);
}
```

### CSS additions for answer panel (add to styles.css):

```css
.answer-text {
  color:       var(--text-primary);
  font-size:   12px;
  line-height: 1.7;
  white-space: pre-wrap;
}

.answer-streaming {
  color:      var(--text-secondary);
  font-style: italic;
  font-size:  12px;
  animation:  pulse-opacity 1s ease-in-out infinite;
}

@keyframes pulse-opacity {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.4; }
}

.answer-error {
  color:     #ff6b6b;
  font-size: 12px;
}

/* Answer panel label row with copy button */
.answer-header {
  display:         flex;
  align-items:     center;
  justify-content: space-between;
  padding-right:   10px;
}
```

### Add Copy button to answer panel header (index.html):

Replace the existing lone `<div class="panel-label">🤖 Answer</div>` in #answer-panel:

```html
<div class="answer-header">
  <div class="panel-label">🤖 Answer</div>
  <button class="small-btn" id="btn-copy-answer" title="Copy answer">Copy</button>
</div>
```

Wire in renderer.js:
```javascript
const btnCopyAnswer = document.getElementById('btn-copy-answer');
btnCopyAnswer.addEventListener('click', () => {
  const text = answerBody.innerText.trim();
  if (!text || text === 'Your answer will appear here...') return;
  navigator.clipboard.writeText(text);
  btnCopyAnswer.textContent = 'Copied!';
  setTimeout(() => btnCopyAnswer.textContent = 'Copy', 2000);
});
```

---

## Edge cases to handle

| Scenario | Handling |
|---|---|
| User clicks Ask with no context and no question | Flash red border on context bar, do nothing |
| User clicks Ask with only context, no question | Auto-summarize the context |
| User clicks Ask with only question, no context | Answer from general knowledge |
| API key missing | Show error in answer panel |
| Network error mid-stream | Show error, re-enable Ask button |
| User clicks Ask while answer is streaming | Disabled until stream completes |
| Very long context (>2000 chars) | Truncate to first 2000 chars, append "..." |

Add truncation to buildMessages:
```javascript
const MAX_CONTEXT = 2000;
if (hasContext && contextText.length > MAX_CONTEXT) {
  contextText = contextText.slice(0, MAX_CONTEXT) + '...';
}
```

---

## Files to modify

| File | Changes |
|---|---|
| renderer.js | Replace mouseup handler, add setContextText/clearContext, add buildMessages, add streamAnswer, add showAnswerError, replace handleAsk, add btnClearContext + btnCopyAnswer refs and handlers, add SYSTEM_PROMPT and STORAGE_KEY_MODEL constants |
| index.html | Add context-bar-header div with Clear button, add answer-header div with Copy button, update CSP (already has connect-src api.openai.com from Block 2) |
| styles.css | Add .context-bar-header, .answer-text, .answer-streaming, .answer-error, .answer-header |

DO NOT create new files.
DO NOT touch main.js or preload.js — no changes needed.
DO NOT touch any audio capture or transcription code.

---

## Pre-ship checklist (do NOT do this now — only before final release)
- [ ] Re-enable setContentProtection(true) in main.js
- [ ] Comment out openDevTools in main.js

---

## Definition of done — Block 3

- [ ] Selecting text in transcript → populates context bar automatically
- [ ] Clear button resets context bar
- [ ] Ask with context + question → streams answer
- [ ] Ask with context only → auto-summarizes
- [ ] Ask with question only → answers from general knowledge
- [ ] Copy button copies answer to clipboard
- [ ] Ask button disabled during streaming
- [ ] Multiple rounds work without refresh
- [ ] No changes to audio/transcription code
- [ ] Committed and pushed as v0.3.0

## What Block 4 will add
Settings expansion (model selector, language, chunk size),
transcript timestamps, speaker labels placeholder,
and session save to disk.
