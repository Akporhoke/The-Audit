// ── Elements ──────────────────────────────────────────────────────────────
const sub        = document.getElementById('sub');
const gScoreBCss = document.getElementById('G-scoreB');
const body       = document.querySelector('#body');
const cancelBtn  = document.getElementById('cancel-btn');
const returnHome = document.getElementById('return-home');
const popup      = document.getElementById('questionnaire');
const predictionBox = document.getElementById('prediction');

const numberDisplay = document.getElementById('numberDisplay');
const decreaseBtn   = document.getElementById('decreaseBtn');
const increaseBtn   = document.getElementById('increaseBtn');

// ── Hide both overlay and popup on page load ──────────────────────────────
gScoreBCss.style.display = 'none';
popup.style.display      = 'none';

// ── Number picker ─────────────────────────────────────────────────────────
let currentNumber = 0;
const min = 0;
const max = 10;

function updateDisplay() {
  numberDisplay.textContent = currentNumber;
}
updateDisplay();

decreaseBtn.addEventListener('click', () => {
  if (currentNumber > min) { currentNumber--; updateDisplay(); }
});
increaseBtn.addEventListener('click', () => {
  if (currentNumber < max) { currentNumber++; updateDisplay(); }
});

// ── Inject timer + skip into questionnaire popup ──────────────────────────
const popupBar = document.createElement('div');
popupBar.style.cssText = `
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
  padding-bottom: 10px;
  border-bottom: 1px solid rgba(0,0,0,0.08);
`;

const timerEl = document.createElement('span');
timerEl.style.cssText = `
  font-size: 0.78rem;
  font-weight: 700;
  color: #3B82F6;
  letter-spacing: 0.06em;
  text-transform: uppercase;
`;

const skipBtn = document.createElement('button');
skipBtn.textContent = 'Skip';
skipBtn.style.cssText = `
  background: none;
  border: 1px solid #CBD5E1;
  color: #64748B;
  font-size: 0.75rem;
  font-weight: 600;
  padding: 4px 14px;
  border-radius: 8px;
  cursor: pointer;
`;

popupBar.appendChild(timerEl);
popupBar.appendChild(skipBtn);
popup.prepend(popupBar);

// ── Make the static "START A QUESTIONNAIRE" text a clickable prompt ──────
// Replaces the placeholder text node already sitting in #questionnaire
// (from the HTML) without needing to edit index.html directly.
Array.from(popup.childNodes).forEach(node => {
  if (node.nodeType === Node.TEXT_NODE && node.textContent.includes('START A QUESTIONNAIRE')) {
    node.textContent = '';
  }
});

const quizPrompt = document.createElement('div');
quizPrompt.id = 'questionnairePrompt';
quizPrompt.textContent = '📊 Take the budget quiz?';
quizPrompt.style.cssText = `
  cursor: pointer;
  text-decoration: underline;
  font-size: inherit;
`;
popup.appendChild(quizPrompt);

// ── Close everything → back to main body, reveal prediction box ──────────
// NOTE: this is now the ONLY place that hides #G-scoreB and shows #body
// for the SAVE flow. (scorebox.js's old click listener on #return-home,
// which used to do this immediately on click, has been removed — it was
// firing in the same tick as this script and hiding the popup's parent
// before anyone could see it.)
let activeTick = null;

function closeAll() {
  clearInterval(activeTick);
  popup.style.display      = 'none';
  gScoreBCss.style.display = 'none';
  body.style.display       = 'block';

  if (predictionBox && currentNumber >= 0) {
    predictionBox.style.display = 'block';
    predictionBox.style.opacity = '1';
    predictionBox.innerHTML     = String(currentNumber);
  }
}

// ── Step 1: GUESS button → show overlay with only number picker ───────────
sub.addEventListener('click', () => {
  currentNumber = 0;
  updateDisplay();
  popup.style.display      = 'none';
  gScoreBCss.style.display = 'block';
  body.style.display       = 'none';
});

// ── Step 2: SAVE → show popup with 10s timer ─────────────────────────────
returnHome.addEventListener('click', () => {
  try {
    localStorage.setItem('userGuess', String(currentNumber));
  } catch (err) {
    // Storage might be blocked in this environment — never let that
    // block the popup from showing.
  }

  popup.style.display = 'block';

  let seconds = 10;
  timerEl.textContent = 'Closing in ' + seconds + 's';

  clearInterval(activeTick);
  activeTick = setInterval(() => {
    seconds--;
    timerEl.textContent = 'Closing in ' + seconds + 's';
    if (seconds <= 0) closeAll();
  }, 1000);
});

// ── Tap the prompt → launch the full 7-question quiz ──────────────────────
// Stops the auto-close timer (don't want closeAll() firing mid-quiz), hides
// this small popup, and opens the full quiz panel from budget.js. Once that
// panel is dismissed — whether by saving or by pressing its own ✕ — closeAll()
// runs to finish the original SAVE flow (hide overlay, show body, reveal
// the prediction box), exactly as if the 10s timer had completed normally.
quizPrompt.addEventListener('click', () => {
  clearInterval(activeTick);
  popup.style.display = 'none';

  if (typeof window.openBudgetQuiz === 'function') {
    // insightsOnly: no statement has necessarily been scanned yet at this
    // point in the guess-flow, so there's no real spending data to base a
    // "Suggested: ₦X" amount on. Show the qualitative advice only, in the
    // light/glowing variant, instead of budget rows that would all read ₦0.
    window.openBudgetQuiz(() => closeAll(), { insightsOnly: true });
  } else {
    // budget.js not loaded for some reason — fall back to normal close
    closeAll();
  }
});

// ── Skip → immediately go to body ────────────────────────────────────────
skipBtn.addEventListener('click', closeAll);

// ── ✕ cancel → close everything at any stage ─────────────────────────────
cancelBtn.addEventListener('click', closeAll);
