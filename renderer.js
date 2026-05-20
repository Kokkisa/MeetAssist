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

const btnStartStop    = document.getElementById('btn-start-stop');
const btnSettings     = document.getElementById('btn-settings');
const settingsBar     = document.getElementById('settings-bar');
const inputApiKey     = document.getElementById('input-api-key');
const btnSaveSettings = document.getElementById('btn-save-settings');
const recIndicator    = document.getElementById('rec-indicator');
const recTimerEl      = document.getElementById('rec-timer');

// ── Recording state ───────────────────────────────────────────────────────────
let isRecording      = false;
let mediaStream      = null;
let mediaRecorder    = null;
let audioChunks      = [];
let chunkTimer       = null;
let recTimerInterval = null;
let recSeconds       = 0;
let transcriptLines  = [];   // full session transcript in memory

// ── Window controls ───────────────────────────────────────────────────────────
btnClose.addEventListener('click',    () => window.meetAPI.close());
btnHide.addEventListener('click',     () => window.meetAPI.hide());
btnMinimise.addEventListener('click', () => window.meetAPI.minimise());

// ── Settings ──────────────────────────────────────────────────────────────────
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

// ── Append transcript line ────────────────────────────────────────────────────
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

// ── Wire Start/Stop button ────────────────────────────────────────────────────
btnStartStop.addEventListener('click', () => {
  if (isRecording) {
    stopRecording();
  } else {
    startRecording();
  }
});

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
  transcriptLines = [];
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
