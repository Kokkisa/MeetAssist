'use strict';

// ── DOM refs ──────────────────────────────────────────────────────────────────
const btnClose           = document.getElementById('btn-close');
const btnHide            = document.getElementById('btn-hide');
const btnMinimise        = document.getElementById('btn-minimise');
const btnMaximise        = document.getElementById('btn-maximise');
const btnAsk             = document.getElementById('btn-ask');
const btnClearTranscript = document.getElementById('btn-clear-transcript');
const btnSaveTranscript  = document.getElementById('btn-save-transcript');
const questionInput      = document.getElementById('question-input');
const selectedTextDisplay= document.getElementById('selected-text-display');
const transcriptBody     = document.getElementById('transcript-body');
const answerBody         = document.getElementById('answer-body');

const btnStartStop    = document.getElementById('btn-start-stop');
const btnSettings     = document.getElementById('btn-settings');
const settingsBar     = document.getElementById('settings-bar');
const inputApiKey     = document.getElementById('input-api-key');
const btnSaveSettings = document.getElementById('btn-save-settings');
const recIndicator    = document.getElementById('rec-indicator');
const recTimerEl      = document.getElementById('rec-timer');

// Block 3 — context bar Clear + answer Copy buttons
const btnClearContext = document.getElementById('btn-clear-context');
const btnCopyAnswer   = document.getElementById('btn-copy-answer');

// Block 6 — Clear-all-answers button in the answer-header-controls wrapper
const btnClearAnswers = document.getElementById('btn-clear-answers');

// Block 4 — settings: model selector, language input, chunk-size selector
const selectModel    = document.getElementById('select-model');
const inputLanguage  = document.getElementById('input-language');
const selectChunk    = document.getElementById('select-chunk');

// ── Recording state ───────────────────────────────────────────────────────────
let isRecording      = false;
let mediaStream      = null;
let mediaRecorder    = null;
let audioChunks      = [];
let chunkTimer       = null;
let recTimerInterval = null;
let recSeconds       = 0;
let transcriptLines  = [];   // full session transcript in memory

// Block 6 — Q&A history: each Ask appends an entry; Clear-answers wipes it
let qaHistory = []; // { question, context, answer, time }

// Block 6 — scroll lock helper. Returns true when the panel is scrolled within
// 60 px of the bottom; callers gate auto-scroll on this so user-initiated
// scroll-up isn't fought every time new content arrives.
function isNearBottom(el) {
  return el.scrollHeight - el.scrollTop - el.clientHeight < 60;
}

// ── Window controls ───────────────────────────────────────────────────────────
btnClose.addEventListener('click',    () => window.meetAPI.close());
btnHide.addEventListener('click',     () => window.meetAPI.hide());
btnMinimise.addEventListener('click', () => window.meetAPI.minimise());
btnMaximise.addEventListener('click', () => window.meetAPI.maximise());

// ── Settings ──────────────────────────────────────────────────────────────────
const STORAGE_KEY_APIKEY = 'meetassist_openai_key';
const STORAGE_KEY_MODEL  = 'meetassist_model'; // 'gpt-4o' or 'gpt-4o-mini' — Block 4 will expose a selector
// Block 4 — Whisper language code + chunk interval (ms)
const STORAGE_KEY_LANGUAGE = 'meetassist_language';
const STORAGE_KEY_CHUNK    = 'meetassist_chunk_ms';

function getApiKey() {
  return localStorage.getItem(STORAGE_KEY_APIKEY) || '';
}

// Archived 2026-05-20: Block 2/3 loadSettings only loaded the API key. Replaced
// by Block 4 version that also restores model, Whisper language, and chunk
// size. Kept per archive rule.
//
// function loadSettings() {
//   inputApiKey.value = getApiKey();
// }

function loadSettings() {
  inputApiKey.value   = getApiKey();
  selectModel.value   = localStorage.getItem(STORAGE_KEY_MODEL)    || 'gpt-4o-mini';
  inputLanguage.value = localStorage.getItem(STORAGE_KEY_LANGUAGE) || 'en';
  selectChunk.value   = localStorage.getItem(STORAGE_KEY_CHUNK)    || '5000';
}

// Archived 2026-05-20: Block 2/3 saveSettings only persisted the API key.
// Replaced by Block 4 version that also persists model, language, and chunk
// size. Kept per archive rule.
//
// function saveSettings() {
//   const key = inputApiKey.value.trim();
//   if (!key) return;
//   localStorage.setItem(STORAGE_KEY_APIKEY, key);
//   settingsBar.classList.add('hidden');
// }

function saveSettings() {
  const key = inputApiKey.value.trim();
  if (!key) return;
  localStorage.setItem(STORAGE_KEY_APIKEY,   key);
  localStorage.setItem(STORAGE_KEY_MODEL,    selectModel.value);
  localStorage.setItem(STORAGE_KEY_LANGUAGE, inputLanguage.value.trim() || 'en');
  localStorage.setItem(STORAGE_KEY_CHUNK,    selectChunk.value);
  settingsBar.classList.add('hidden');
}

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

// ── Recording timer ───────────────────────────────────────────────────────────
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

// ── Whisper transcription ─────────────────────────────────────────────────────
async function transcribeChunk(audioBlob) {
  const apiKey = getApiKey();
  if (!apiKey) {
    appendTranscriptLine('[No API key — add it in Settings ⚙]');
    return;
  }

  const formData = new FormData();
  formData.append('file', audioBlob, 'chunk.webm');
  formData.append('model', 'whisper-1');
  // Archived 2026-05-20: hardcoded 'en' → STORAGE_KEY_LANGUAGE lookup (Block 4)
  // formData.append('language', 'en');
  formData.append('language', localStorage.getItem(STORAGE_KEY_LANGUAGE) || 'en');

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

// ── Append transcript line ────────────────────────────────────────────────────
// Archived 2026-05-20: Block 2 version with no timestamp prefix. Replaced by
// Block 4 version that prepends HH:MM:SS in a non-selectable span so the
// timestamp text never pollutes context-bar selections. Kept per archive rule.
//
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

  // Auto-scroll only when the user is already near the bottom (Block 6 scroll
  // lock). Archived 2026-05-20: unconditional scroll → isNearBottom-guarded.
  // transcriptBody.scrollTop = transcriptBody.scrollHeight;
  if (isNearBottom(transcriptBody)) {
    transcriptBody.scrollTop = transcriptBody.scrollHeight;
  }
}

// ── Audio capture & chunking ──────────────────────────────────────────────────
async function startRecording() {
  if (isRecording) return;

  // LCA-pattern system audio capture: request both audio and a dummy 1x1
  // video track from chromeMediaSource:'desktop', then drop the video.
  // Electron 29 refuses audio-only desktop sources but accepts the pair.
  try {
    const sources = await window.meetAPI.getDesktopSources();
    if (!sources || sources.length === 0) throw new Error('No desktop sources');
    const src = sources[0];

    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: src.id
        }
      },
      video: {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: src.id,
          maxWidth: 1, maxHeight: 1, maxFrameRate: 1
        }
      }
    });

    // Discard video — only want audio
    mediaStream.getVideoTracks().forEach(t => t.stop());
    const audioTracks = mediaStream.getAudioTracks();
    if (audioTracks.length === 0) throw new Error('No audio track');
    mediaStream = new MediaStream(audioTracks);
  } catch (err) {
    appendTranscriptLine(`[Audio capture failed: ${err.message}]`);
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
      // Archived 2026-05-20: hardcoded 5000ms → STORAGE_KEY_CHUNK lookup (Block 4)
      // chunkTimer = setTimeout(flushChunk, 5000);
      chunkTimer = setTimeout(flushChunk, parseInt(localStorage.getItem(STORAGE_KEY_CHUNK) || '5000'));
    }
  }

  mediaRecorder.start();
  // Archived 2026-05-20: hardcoded 5000ms → STORAGE_KEY_CHUNK lookup (Block 4)
  // chunkTimer = setTimeout(flushChunk, 5000);
  chunkTimer = setTimeout(flushChunk, parseInt(localStorage.getItem(STORAGE_KEY_CHUNK) || '5000'));
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

// ── Wire Start/Stop button ────────────────────────────────────────────────────
btnStartStop.addEventListener('click', () => {
  if (isRecording) {
    stopRecording();
  } else {
    startRecording();
  }
});

// ── Ask button → GPT-4o-mini streaming pipeline (Block 3) ─────────────────────
btnAsk.addEventListener('click', handleAsk);
questionInput.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) handleAsk();
});

// Block 3 — system prompt + safety cap for the context payload.
const MAX_CONTEXT = 2000;
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

// ── Archived 2026-05-19: Block 1/2 placeholder handleAsk replaced by the real
// streaming pipeline below (Block 3). Kept here per archive rule.
//
// function handleAsk() {
//   const question = questionInput.value.trim();
//   if (!question) return;
//   // Block 1 placeholder — real AI call comes in Block 5
//   answerBody.innerHTML = `<p class="placeholder-text">AI answer coming in Block 5... (question: "${question}")</p>`;
//   questionInput.value = '';
// }

// Block 3 — real Ask handler. Builds the messages array from the context bar
// (if has-content) + the question, then kicks off the streaming SSE call.
//
// Archived 2026-05-20: Block 3 version didn't pass questionText/contextText
// through to streamAnswer (Block 6 needs them for the Q&A history block
// rendered above each answer). Kept per archive rule.
//
// function handleAsk() {
//   const contextText = selectedTextDisplay.textContent.trim();
//   const question    = questionInput.value.trim();
//
//   const messages = buildMessages(contextText, question);
//   if (!messages) {
//     selectedTextDisplay.style.borderColor = 'rgba(255,80,80,0.6)';
//     setTimeout(() => {
//       selectedTextDisplay.style.borderColor = '';
//     }, 800);
//     return;
//   }
//
//   questionInput.value = '';
//   streamAnswer(messages);
// }

// Block 6 — handler now forwards questionText + contextText so streamAnswer
// can render a Q header above each appended answer block. Empty-context is
// gated via the has-content class so the placeholder text isn't sent as
// "context".
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

// Block 3 — message builder. Returns null when neither context nor question
// is provided. Truncates very long contexts to MAX_CONTEXT to keep token usage
// bounded.
function buildMessages(contextText, question) {
  const hasContext = contextText &&
    !selectedTextDisplay.classList.contains('empty-state');

  if (hasContext && contextText.length > MAX_CONTEXT) {
    contextText = contextText.slice(0, MAX_CONTEXT) + '...';
  }

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

// Block 3 — SSE streaming call to OpenAI chat completions. The model defaults
// to gpt-4o-mini (cheap + fast); Block 4 will add a selector that writes
// STORAGE_KEY_MODEL.
//
// Archived 2026-05-20: Block 3 version replaced the entire answer panel
// every call (innerHTML = ''), so there was no Q&A history and the last
// answer was the only thing visible. Block 6 appends a new qa-block per
// call, preserves history, and pushes to qaHistory. Kept per archive rule.
//
// async function streamAnswer(messages) {
//   const apiKey = getApiKey();
//   if (!apiKey) {
//     showAnswerError('No API key — add it in Settings ⚙');
//     return;
//   }
//
//   answerBody.innerHTML = '<p class="answer-streaming">thinking...</p>';
//   btnAsk.disabled = true;
//   btnAsk.textContent = '...';
//
//   let fullText = '';
//
//   try {
//     const response = await fetch('https://api.openai.com/v1/chat/completions', { ... });
//     if (!response.ok) {
//       const err = await response.json().catch(() => ({}));
//       showAnswerError(`API error: ${err?.error?.message || response.status}`);
//       return;
//     }
//     const reader  = response.body.getReader();
//     const decoder = new TextDecoder();
//     answerBody.innerHTML = '';
//     const answerEl = document.createElement('p');
//     answerEl.className = 'answer-text';
//     answerBody.appendChild(answerEl);
//     while (true) {
//       const { done, value } = await reader.read();
//       if (done) break;
//       const chunk = decoder.decode(value, { stream: true });
//       const lines = chunk.split('\n').filter(l => l.startsWith('data: '));
//       for (const line of lines) {
//         const data = line.slice(6);
//         if (data === '[DONE]') break;
//         try {
//           const parsed = JSON.parse(data);
//           const delta  = parsed.choices?.[0]?.delta?.content || '';
//           fullText += delta;
//           answerEl.textContent = fullText;
//           answerBody.scrollTop = answerBody.scrollHeight; // unconditional scroll
//         } catch {}
//       }
//     }
//   } catch (err) {
//     showAnswerError(`Network error: ${err.message}`);
//   } finally {
//     btnAsk.disabled = false;
//     btnAsk.textContent = 'Ask';
//   }
// }

// Block 6 — append-mode streaming with Q header and scroll lock. Each ask
// builds a fresh .qa-block (question line + answer paragraph + divider),
// appends it to #answer-body, streams into the answer paragraph, and pushes
// the final answer into qaHistory when done.
async function streamAnswer(messages, questionText, contextText) {
  const apiKey = getApiKey();
  if (!apiKey) {
    showAnswerError('No API key — add it in Settings ⚙');
    return;
  }

  // Remove placeholder if present (first ask of the session)
  const placeholder = answerBody.querySelector('.placeholder-text');
  if (placeholder) placeholder.remove();

  // Create a new Q&A block and append it
  const qaBlock = document.createElement('div');
  qaBlock.className = 'qa-block';

  // Question header (skipped if neither question nor context — shouldn't happen
  // since buildMessages returns null in that case, but defensive)
  if (questionText || contextText) {
    const qHeader = document.createElement('div');
    qHeader.className = 'qa-question';
    qHeader.textContent = questionText
      ? `Q: ${questionText}`
      : 'Q: (summarize selected context)';
    qaBlock.appendChild(qHeader);
  }

  // Answer text element (gets populated as the stream arrives)
  const answerEl = document.createElement('p');
  answerEl.className = 'answer-text';
  answerEl.textContent = 'thinking...';
  qaBlock.appendChild(answerEl);

  // Divider below this block — separates it from the next ask
  const divider = document.createElement('div');
  divider.className = 'qa-divider';
  qaBlock.appendChild(divider);

  answerBody.appendChild(qaBlock);

  // Always scroll to show the newly-appended block (initial reveal — the
  // scroll-lock check kicks in for subsequent token-by-token updates).
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

function showAnswerError(msg) {
  answerBody.innerHTML = `<p class="answer-error">${msg}</p>`;
  btnAsk.disabled = false;
  btnAsk.textContent = 'Ask';
}

// ── Clear transcript ───────────────────────────────────────────────────────────
btnClearTranscript.addEventListener('click', () => {
  transcriptLines = [];
  transcriptBody.innerHTML = '<p class="placeholder-text">Transcript cleared.</p>';
});

// ── Save transcript → .txt on disk (Block 5) ────────────────────────────────
// Archived 2026-05-20: Block 1 placeholder alert. Replaced by real disk save
// using window.meetAPI.saveTranscript (which round-trips to main and invokes
// dialog.showSaveDialog + fs.writeFileSync). Kept per archive rule.
//
// btnSaveTranscript.addEventListener('click', () => {
//   // Real save comes in Block 6
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
  const date     = now.toISOString().slice(0, 10);                    // YYYY-MM-DD
  const time     = now.toTimeString().slice(0, 5).replace(':', '-');  // HH-MM
  const filename = `MeetAssist_${date}_${time}.txt`;

  // Build file content — header + ISO-ish date + divider + timestamped lines
  const header   = `MeetAssist Transcript\n`;
  const dateLine = `Date: ${now.toDateString()} ${now.toTimeString().slice(0,8)}\n`;
  const divider  = `${'─'.repeat(50)}\n\n`;

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

// Block 5 — transient status banner inserted just below #transcript-header.
// Auto-removes after 3 s; replaces any previous status on the next call.
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

// ── Text selection → context bar (Block 3) ──────────────────────────────────
// Block 3 — improved handler: dedupes on lastSelectedText so the same drag-
// release doesn't repopulate, focuses the question input on capture, and
// routes through setContextText/clearContext helpers so the Clear button
// can share the reset path.
//
// ── Archived 2026-05-19: Block 1/2 mouseup handler. Kept here per archive rule.
//
// document.addEventListener('mouseup', () => {
//   const selection = window.getSelection();
//   if (!selection || selection.isCollapsed) return;
//
//   // Only capture selections inside the transcript body
//   const range = selection.getRangeAt(0);
//   if (!transcriptBody.contains(range.commonAncestorContainer)) return;
//
//   const selectedText = selection.toString().trim();
//   if (!selectedText) return;
//
//   selectedTextDisplay.textContent = selectedText;
//   selectedTextDisplay.classList.remove('empty-state');
//   selectedTextDisplay.classList.add('has-content');
// });

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

// ── Wire context Clear + answer Clear/Copy buttons (Block 3 + Block 6) ──────
btnClearContext.addEventListener('click', clearContext);

// Block 6 — Clear all Q&A history (wipes qaHistory + restores placeholder)
btnClearAnswers.addEventListener('click', () => {
  qaHistory = [];
  answerBody.innerHTML = '<p class="placeholder-text">Your answer will appear here...</p>';
});

// Archived 2026-05-20: Block 3 Copy handler grabbed ALL of answerBody.innerText,
// which under Block 6's append-mode includes every past answer + Q headers +
// divider whitespace. Replaced with a version that copies only the most recent
// answer from qaHistory. Kept per archive rule.
//
// btnCopyAnswer.addEventListener('click', () => {
//   const text = answerBody.innerText.trim();
//   if (!text || text === 'Your answer will appear here...') return;
//   navigator.clipboard.writeText(text);
//   btnCopyAnswer.textContent = 'Copied!';
//   setTimeout(() => btnCopyAnswer.textContent = 'Copy', 2000);
// });

// Block 6 — Copy LAST answer only (from qaHistory tail)
btnCopyAnswer.addEventListener('click', () => {
  if (qaHistory.length === 0) return;
  const lastAnswer = qaHistory[qaHistory.length - 1].answer;
  navigator.clipboard.writeText(lastAnswer);
  btnCopyAnswer.textContent = 'Copied!';
  setTimeout(() => btnCopyAnswer.textContent = 'Copy', 2000);
});
