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
