// ── Budget categories (keys must match getActuals() below) ────────────────
const BUDGET_CATS = [
  { key: 'airtime',   label: 'Airtime & Data',       icon: '📱' },
  { key: 'transfers', label: 'Transfers Out',         icon: '💸' },
  { key: 'savings',   label: 'Savings / Investment',  icon: '🏦' },
];

// ── localStorage helpers ──────────────────────────────────────────────────
function loadBudget() {
  try { return JSON.parse(localStorage.getItem('financialBudget') || '{}'); }
  catch { return {}; }
}

function saveBudget(data) {
  try { localStorage.setItem('financialBudget', JSON.stringify(data)); }
  catch { /* storage may be blocked in some environments — fail silently */ }
}

// ── Lock/unlock the main page scroll while any panel is open ─────────────
function lockBodyScroll()   { document.body.style.overflow = 'hidden'; }
function unlockBodyScroll() { document.body.style.overflow = ''; }

// ── Pick the primary (Wallet) account, not the combined cross-account total ──
function getPrimaryAccount() {
  const list = window.accountsBreakdown || [];
  if (list.length === 0) return null;
  return list.find(a => a.name === 'Wallet Account') || list[0];
}

function getActuals() {
  const acc = getPrimaryAccount();
  if (!acc) {
    const ca = window.categoryAmounts || {};
    return {
      airtime:   ca.airtimeAmount || 0,
      transfers: ca.transfersOut  || 0,
      savings:   ca.savings       || 0,
    };
  }
  return {
    airtime:   acc.airtimeAmount || 0,
    transfers: acc.transfersOut  || 0,
    savings:   acc.savings       || 0,
  };
}

// ── Open / close budget panel ─────────────────────────────────────────────
function openBudgetPanel() {
  const existing = document.getElementById('budgetPanel');
  if (existing) { existing.remove(); unlockBodyScroll(); return; }

  const budget  = loadBudget();
  const actuals = getActuals();

  const rows = BUDGET_CATS.map(({ key, label, icon }) => {
    const actual  = actuals[key] || 0;
    const limit   = budget[key] != null ? budget[key] : '';
    const limitNum = limit !== '' ? parseFloat(limit) : null;
    const isOver  = limitNum != null && limitNum > 0 && actual > limitNum;
    const pct     = (limitNum && limitNum > 0) ? Math.min((actual / limitNum) * 100, 100) : 0;
    const barColor = isOver ? '#EF4444' : pct > 75 ? '#F59E0B' : '#22C55E';

    return `
      <div class="bp-row ${isOver ? 'bp-over' : ''}">
        <div class="bp-row-top">
          <span class="bp-icon">${icon}</span>
          <span class="bp-label">${label}</span>
          ${isOver ? `<span class="bp-over-badge">Over!</span>` : ''}
        </div>
        <div class="bp-actual-line">
          Spent: <strong>₦${actual.toLocaleString('en-NG', { minimumFractionDigits: 2 })}</strong>
          ${limitNum != null ? `/ Limit: ₦${limitNum.toLocaleString('en-NG', { minimumFractionDigits: 2 })}` : ''}
        </div>
        ${limitNum != null ? `
          <div class="bp-bar-track">
            <div class="bp-bar-fill" style="width:${pct}%;background:${barColor}"></div>
          </div>` : ''}
        <div class="bp-input-wrap">
          <span class="bp-naira">₦</span>
          <input
            class="bp-input"
            type="number"
            min="0"
            data-key="${key}"
            placeholder="Set monthly limit"
            value="${limit}"
          />
        </div>
      </div>`;
  }).join('');

  const acc = getPrimaryAccount();
  const accountLabel = acc ? acc.name : 'Account';

  const panel = document.createElement('div');
  panel.id = 'budgetPanel';
  panel.innerHTML = `
    <div class="bp-header">
      <span>📊 ${accountLabel} Budget</span>
      <button class="bp-close" id="closeBudgetPanel">✕</button>
    </div>
    <div class="bp-body">${rows}</div>
    <div class="bp-footer">
      <button class="bp-save" id="saveBudgetBtn">Save Budget</button>
    </div>
  `;
  document.body.appendChild(panel);
  lockBodyScroll();

  document.getElementById('closeBudgetPanel').addEventListener('click', () => {
    panel.remove();
    unlockBodyScroll();
  });

  document.getElementById('saveBudgetBtn').addEventListener('click', () => {
    const inputs    = panel.querySelectorAll('.bp-input');
    const newBudget = {};
    inputs.forEach(inp => {
      const v = inp.value.trim();
      if (v !== '') newBudget[inp.dataset.key] = parseFloat(v);
    });
    saveBudget(newBudget);
    panel.remove();
    unlockBodyScroll();
    createBudgetFloat();
  });
}

// ── Create / refresh floating budget pill ─────────────────────────────────
function createBudgetFloat() {
  const existing = document.getElementById('budgetFloat');
  if (existing) existing.remove();

  const acc = getPrimaryAccount();

  const totalIn  = acc ? (acc.totalCredit || 0) : (window.financialTotals?.credit?.amount  || 0);
  const totalOut = acc ? (acc.totalDebit  || 0) : (window.financialTotals?.expense?.amount || 0);
  const overspent = totalOut >= totalIn;

  const budget    = loadBudget();
  const actuals   = getActuals();
  const anyCatOver = BUDGET_CATS.some(({ key }) => {
    const lim = budget[key];
    return lim != null && parseFloat(lim) > 0 && (actuals[key] || 0) > parseFloat(lim);
  });

  const isAlert = overspent || anyCatOver;

  const pill = document.createElement('div');
  pill.id        = 'budgetFloat';
  pill.className = `budget-float ${isAlert ? 'overspent' : 'healthy'}`;
  pill.innerHTML = isAlert
    ? `<span class="bf-icon">⚠️</span><span>You overspent! Tap to review</span>`
    : `<span class="bf-icon">💰</span><span>Set monthly budget</span>`;

  pill.addEventListener('click', openBudgetPanel);
  document.body.appendChild(pill);
}

// ── Category weight config ────────────────────────────────────────────────
// Maps the categories we can actually parse from bank statements (airtime,
// transfers, savings) to baseline weights. Higher weight = cut harder.
// Savings is intentionally excluded — it gets a GROWTH target instead of a
// reduction, since "spend less on savings" isn't a real win.
const CATEGORY_WEIGHTS_BASE = {
  airtime:   0.5,  // essential — protect connectivity, cut lightly
  transfers: 1.0,  // catches most discretionary spend (dining/shopping/
                    // transport all show up as "Transfer to X" in real
                    // statements), so this absorbs Q2's "core drain" bump
};

// ── The 7-question quiz ────────────────────────────────────────────────────
const QUIZ_QUESTIONS = [
  {
    id: 'cashFlow',
    block: 1,
    text: 'When you look at your account balance at the end of the month, how does it usually look?',
    options: [
      { emoji: '🟢', label: "It's exactly where I expected it to be.", risk: 'low' },
      { emoji: '🟡', label: 'Lower than I thought, but I have a bit left over.', risk: 'medium' },
      { emoji: '🔴', label: "I'm stressed out wondering where all my money went.", risk: 'high' },
    ],
  },
  {
    id: 'coreDrain',
    block: 2,
    text: 'Which of these areas do you feel hits your wallet the hardest right now?',
    options: [
      { emoji: '🍔', label: 'Restaurants, fast food, and ordering delivery', drain: 'transfers' },
      { emoji: '🛍️', label: 'Shopping, casual clothing, and new gadgets', drain: 'transfers' },
      { emoji: '🚗', label: 'Transport, fuel, or constant rideshares', drain: 'transfers' },
      { emoji: '📱', label: 'Airtime, heavy data bundles, and entertainment subscriptions', drain: 'airtime' },
    ],
  },
  {
    id: 'subscriptionLeak',
    block: 3,
    text: 'How often do you check or cancel your active digital subscriptions or automated bills?',
    options: [
      { emoji: '🟢', label: 'Regularly — I only pay for apps and services I actively use.', risk: 'low' },
      { emoji: '🟡', label: "Rarely — I probably have one or two I've forgotten about.", risk: 'medium' },
      { emoji: '🔴', label: 'Never — things just auto-renew in the background.', risk: 'high' },
    ],
  },
  {
    id: 'impulseTrigger',
    block: 4,
    text: 'What usually triggers your unplanned, impulse spending?',
    options: [
      { emoji: '😫', label: 'Stress or winding down after a long, exhausting day', trigger: 'stress' },
      { emoji: '⏳', label: 'Limited-time sales, promos, or targeted social media ads', trigger: 'promo' },
      { emoji: '👥', label: 'Hanging out with friends or social peer pressure', trigger: 'social' },
      { emoji: '🤷', label: 'Pure convenience (paying extra just to save time/effort)', trigger: 'convenience' },
    ],
  },
  {
    id: 'paymentFriction',
    block: 0,
    text: 'What is your primary method when paying for everyday expenses?',
    options: [
      { emoji: '💳', label: 'Credit cards / Buy Now Pay Later options', friction: 'low' },
      { emoji: '📱', label: 'Digital transfers, apps, debit cards, or crypto/USDT', friction: 'low' },
      { emoji: '💵', label: 'Physical cash', friction: 'high' },
    ],
  },
  {
    id: 'smallChange',
    block: 0,
    text: 'How often do you make small, casual purchases (snacks, casual drinks, quick airtime top-ups, convenience fees)?',
    options: [
      { emoji: '🟢', label: 'Seldom — I usually plan ahead.', risk: 'low' },
      { emoji: '🟡', label: "A few times a week when I'm out.", risk: 'medium' },
      { emoji: '🔴', label: "Almost daily — it's just part of my routine.", risk: 'high' },
    ],
  },
  {
    id: 'emergencyCheck',
    block: 4,
    text: 'If an unexpected emergency cost came up today, how would you cover it?',
    options: [
      { emoji: '🟢', label: 'I have a dedicated emergency fund completely ready.', risk: 'low' },
      { emoji: '🟡', label: 'I would have to cut back significantly on basic needs this month.', risk: 'medium' },
      { emoji: '🔴', label: 'I would need to borrow money from family or use debt.', risk: 'high' },
    ],
  },
];

// ── Scoring: turns quiz answers into R (reduction factor) + weights ───────
function scoreQuiz(answers) {
  const baseRiskMap = { low: 0.05, medium: 0.10, high: 0.15 };
  let R = baseRiskMap[answers.cashFlow?.risk] ?? 0.10;

  // Q3 — forgotten subscriptions compound the need to cut
  if (answers.subscriptionLeak?.risk === 'medium') R += 0.02;
  if (answers.subscriptionLeak?.risk === 'high')   R += 0.05;

  // Q5 — digital/card spending is psychologically "invisible", cash is felt
  if (answers.paymentFriction?.friction === 'low')  R += 0.03;
  if (answers.paymentFriction?.friction === 'high') R -= 0.02;

  // Q6 — frequent small purchases mostly hit airtime/micro-spend specifically
  let airtimeExtra = 0;
  if (answers.smallChange?.risk === 'medium') { R += 0.02; airtimeExtra += 0.2; }
  if (answers.smallChange?.risk === 'high')   { R += 0.05; airtimeExtra += 0.4; }

  R = Math.min(Math.max(R, 0.03), 0.25);

  const weights = { ...CATEGORY_WEIGHTS_BASE };
  if (answers.coreDrain?.drain === 'airtime')   weights.airtime   += 0.4;
  if (answers.coreDrain?.drain === 'transfers') weights.transfers += 0.4;
  weights.airtime += airtimeExtra;

  // Q7 — savings gets a GROWTH target, framed around emergency-readiness
  let savingsBoostPct = 0;
  let savingsFraming  = 'Keep building steadily.';
  if (answers.emergencyCheck?.risk === 'medium') {
    savingsBoostPct = 0.10;
    savingsFraming  = "Let's grow your safety net a bit more.";
  } else if (answers.emergencyCheck?.risk === 'high') {
    savingsBoostPct = 0.20;
    savingsFraming  = "We're building your protection shield, not just restricting spending.";
  }

  return { R, weights, savingsBoostPct, savingsFraming, answers };
}

// ── Block 3 (quick win) + Block 4 (strategic shift) advice text ──────────
function getQuickWinAdvice(answers) {
  const risk = answers.subscriptionLeak?.risk;
  if (risk === 'high')   return "Quick win: review every auto-renewing subscription and bill. Even one forgotten ₦2,000 charge adds up to ₦24,000 a year.";
  if (risk === 'medium') return "Quick win: you probably have a forgotten subscription or two — check your bank app for recurring charges you don't recognize.";
  return "You're already on top of your subscriptions — nice.";
}

function getStrategicShiftAdvice(answers) {
  const trigger = answers.impulseTrigger?.trigger;
  if (trigger === 'stress')      return "Since stress drives your impulse spending, try a short walk or call before buying something while winding down.";
  if (trigger === 'promo')       return "Since flash sales get you, unsubscribe from retail emails/SMS and mute shopping ads where you can.";
  if (trigger === 'social')      return "Since social moments are your trigger, it's okay to suggest a free hangout sometimes — most friends won't mind.";
  if (trigger === 'convenience') return "Since convenience is your trigger, try planning just one thing a day ahead — small friction goes a long way.";
  return "";
}

// ── Suggestion engine ──────────────────────────────────────────────────────
// Uses the weighted formula directly: newTarget = amountSpent * (1 - R*weight)
// for airtime/transfers. Savings gets a separate GROWTH target instead.
// IMPORTANT: this only computes a SUGGESTION. The actual budget input stays
// editable and defaults to the user's own previous limit — the suggestion
// is shown as a tappable hint beside it, never auto-applied.
function computeSuggestions(scoring) {
  const actuals = getActuals();
  const budget  = loadBudget();
  const { weights, R, savingsBoostPct } = scoring;

  const results = {};

  ['airtime', 'transfers'].forEach(key => {
    const amountSpent = actuals[key] || 0;
    const weight = weights[key] ?? 1.0;
    const reductionFactor = Math.min(R * weight, 0.6); // never suggest cutting to near-zero
    const suggested = Math.max(Math.round(amountSpent * (1 - reductionFactor)), 0);
    const savingsAmt = amountSpent - suggested;

    results[key] = {
      amountSpent,
      suggested,
      savingsAmt,
      oldLimit: budget[key] != null ? parseFloat(budget[key]) : null,
    };
  });

  const savingsSpent = actuals.savings || 0;
  const suggestedSavings = Math.round(savingsSpent * (1 + savingsBoostPct));
  results.savings = {
    amountSpent: savingsSpent,
    suggested: suggestedSavings,
    savingsAmt: 0,
    oldLimit: budget.savings != null ? parseFloat(budget.savings) : null,
  };

  return results;
}

// ── Plan panel: 7-question quiz → results with side-by-side suggestions ──
let quizAnswers = {};
let quizIndex   = 0;

// ── Persist quiz answers so the SAME answers get reused everywhere ───────
// Once answered through ANY entry point (the standalone pill, or the popup
// launched from the SAVE flow), the quiz should not be asked again — the
// other entry point should just show the same saved results, with an
// explicit "Retake quiz" option if the person wants to redo it on purpose.
function saveQuizAnswers(answers) {
  try { localStorage.setItem('quizAnswers', JSON.stringify(answers)); }
  catch { /* storage may be blocked — fail silently */ }
}

function loadQuizAnswers() {
  try {
    const raw = localStorage.getItem('quizAnswers');
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

// onDone (optional): called once the panel actually closes, whether by
// pressing ✕ or by saving the budget. Lets other scripts (e.g. guess.js)
// chain their own logic after the quiz panel is dismissed.
//
// options.insightsOnly: when true, skips the budget category rows entirely
// and shows just the qualitative advice in a separate light/glowing panel.
// Used when the quiz is launched before any statement has been scanned —
// at that point getActuals() is all zeros, so "Suggested: ₦0" would be
// meaningless. The insights (core drain, quick win, etc.) are still valid
// since they come from quiz answers, not from spending data.
function openPlanPanel(onDone, options = {}) {
  const existing = document.getElementById('planPanel');
  if (existing) { existing.remove(); unlockBodyScroll(); return; }

  const panel = document.createElement('div');
  panel.id = 'planPanel';
  if (options.insightsOnly) panel.classList.add('plan-panel-insights');
  document.body.appendChild(panel);
  lockBodyScroll();

  const cached = loadQuizAnswers();
  if (cached) {
    quizAnswers = cached;
    if (options.insightsOnly) renderInsightsOnly(panel, onDone);
    else renderQuizResults(panel, onDone);
    return;
  }

  quizAnswers = {};
  quizIndex   = 0;
  renderQuizStep(panel, onDone, options);
}

function closePanelAndNotify(panel, onDone) {
  panel.remove();
  unlockBodyScroll();
  if (typeof onDone === 'function') onDone();
}

function renderQuizStep(panel, onDone, options = {}) {
  const q = QUIZ_QUESTIONS[quizIndex];

  const optionsHtml = q.options.map((opt, i) => `
    <button class="plan-quiz-opt" data-idx="${i}">
      <span class="plan-quiz-emoji">${opt.emoji}</span>
      <span class="plan-quiz-label">${opt.label}</span>
    </button>
  `).join('');

  panel.innerHTML = `
    <div class="bp-header">
      <span>🗓️ Plan Next Month — ${quizIndex + 1} of ${QUIZ_QUESTIONS.length}</span>
      <button class="bp-close" id="closePlanPanel">✕</button>
    </div>
    <div class="bp-body">
      <div class="plan-progress-track">
        <div class="plan-progress-fill" style="width:${((quizIndex) / QUIZ_QUESTIONS.length) * 100}%"></div>
      </div>
      <p class="plan-question">${q.text}</p>
      <div class="plan-quiz-opts">${optionsHtml}</div>
      <button class="plan-skip" id="skipQuiz">Skip quiz, just show me suggestions</button>
    </div>
  `;

  panel.querySelector('#closePlanPanel').addEventListener('click', () => closePanelAndNotify(panel, onDone));

  panel.querySelectorAll('.plan-quiz-opt').forEach(btn => {
    btn.addEventListener('click', () => {
      const opt = q.options[parseInt(btn.dataset.idx, 10)];
      quizAnswers[q.id] = opt;
      quizIndex++;
      if (quizIndex < QUIZ_QUESTIONS.length) {
        renderQuizStep(panel, onDone, options);
      } else if (options.insightsOnly) {
        renderInsightsOnly(panel, onDone);
      } else {
        renderQuizResults(panel, onDone);
      }
    });
  });

  panel.querySelector('#skipQuiz').addEventListener('click', () => {
    // Default to a medium-risk profile if they skip
    quizAnswers = {
      cashFlow: { risk: 'medium' },
      subscriptionLeak: { risk: 'medium' },
      paymentFriction: { friction: 'low' },
      smallChange: { risk: 'medium' },
      emergencyCheck: { risk: 'medium' },
    };
    if (options.insightsOnly) renderInsightsOnly(panel, onDone);
    else renderQuizResults(panel, onDone);
  });
}

// ── Insights-only results: no budget rows, just the qualitative advice ───
// Used when launched before any statement has been scanned, where actual
// spending amounts don't exist yet to base a suggestion on.
function renderInsightsOnly(panel, onDone) {
  saveQuizAnswers(quizAnswers);
  const scoring = scoreQuiz(quizAnswers);

  const coreDrainLabel = quizAnswers.coreDrain
    ? `${quizAnswers.coreDrain.emoji} ${quizAnswers.coreDrain.label}`
    : null;

  panel.innerHTML = `
    <div class="bp-header bp-header-light">
      <span>✨ Your Insights</span>
      <button class="bp-close bp-close-light" id="closePlanPanel">✕</button>
    </div>
    <div class="bp-body bp-body-light">
      ${coreDrainLabel ? `<p class="plan-block-light">Your biggest drain right now:<br><strong>${coreDrainLabel}</strong></p>` : ''}
      <p class="plan-block-light">${getQuickWinAdvice(quizAnswers)}</p>
      ${quizAnswers.impulseTrigger ? `<p class="plan-block-light">${getStrategicShiftAdvice(quizAnswers)}</p>` : ''}
      <p class="plan-block-light plan-block-savings-light">${scoring.savingsFraming}</p>
      <p class="plan-note-light">Once you upload a bank statement, we'll turn this into an actual budget with suggested amounts for each category.</p>
    </div>
    <div class="bp-footer">
      <button class="bp-save bp-save-light" id="doneInsights">Got it</button>
    </div>
  `;

  panel.querySelector('#closePlanPanel').addEventListener('click', () => closePanelAndNotify(panel, onDone));
  panel.querySelector('#doneInsights').addEventListener('click', () => closePanelAndNotify(panel, onDone));
}

function renderQuizResults(panel, onDone) {
  // Save immediately — covers normal completion, skip-path, and cached re-opens.
  saveQuizAnswers(quizAnswers);

  const scoring     = scoreQuiz(quizAnswers);
  const suggestions = computeSuggestions(scoring);

  const coreDrainLabel = quizAnswers.coreDrain
    ? `${quizAnswers.coreDrain.emoji} ${quizAnswers.coreDrain.label}`
    : null;

  const rows = BUDGET_CATS.map(({ key, label, icon }) => {
    const s = suggestions[key];
    const isSavings = key === 'savings';
    const chipText = isSavings
      ? `💡 Suggested target: ₦${s.suggested.toLocaleString('en-NG')} (grow your savings)`
      : `💡 Suggested: ₦${s.suggested.toLocaleString('en-NG')}${s.savingsAmt > 0 ? ` (save ₦${s.savingsAmt.toLocaleString('en-NG')})` : ''} — tap to use`;

    return `
      <div class="bp-row">
        <div class="bp-row-top">
          <span class="bp-icon">${icon}</span>
          <span class="bp-label">${label}</span>
        </div>
        <div class="bp-actual-line">Spent: <strong>₦${s.amountSpent.toLocaleString('en-NG', { minimumFractionDigits: 2 })}</strong></div>
        <button class="plan-suggest-chip" data-key="${key}" data-suggested="${s.suggested}">${chipText}</button>
        <div class="bp-input-wrap">
          <span class="bp-naira">₦</span>
          <input class="bp-input plan-input" type="number" min="0" data-key="${key}"
            placeholder="Set your own limit" value="${s.oldLimit ?? ''}" />
        </div>
      </div>`;
  }).join('');

  panel.innerHTML = `
    <div class="bp-header">
      <span>🗓️ Your Plan</span>
      <button class="bp-close" id="closePlanPanel">✕</button>
    </div>
    <div class="bp-body">
      ${coreDrainLabel ? `<p class="plan-block">Your biggest drain right now:<br><strong>${coreDrainLabel}</strong></p>` : ''}
      <p class="plan-block">${getQuickWinAdvice(quizAnswers)}</p>
      ${quizAnswers.impulseTrigger ? `<p class="plan-block">${getStrategicShiftAdvice(quizAnswers)}</p>` : ''}
      <p class="plan-block plan-block-savings">${scoring.savingsFraming}</p>
      ${rows}
      <button class="plan-skip" id="retakeQuiz">🔄 Retake quiz</button>
    </div>
    <div class="bp-footer">
      <button class="bp-save" id="applySuggestions">Save My Budget</button>
    </div>
  `;

  panel.querySelector('#closePlanPanel').addEventListener('click', () => closePanelAndNotify(panel, onDone));

  panel.querySelector('#retakeQuiz').addEventListener('click', () => {
    try { localStorage.removeItem('quizAnswers'); } catch { /* ignore */ }
    quizAnswers = {};
    quizIndex   = 0;
    renderQuizStep(panel, onDone);
  });

  panel.querySelectorAll('.plan-suggest-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const key = chip.dataset.key;
      const input = panel.querySelector(`.plan-input[data-key="${key}"]`);
      if (input) input.value = chip.dataset.suggested;
    });
  });

  panel.querySelector('#applySuggestions').addEventListener('click', () => {
    const inputs    = panel.querySelectorAll('.plan-input');
    const newBudget = {};
    inputs.forEach(inp => {
      const v = inp.value.trim();
      if (v !== '') newBudget[inp.dataset.key] = parseFloat(v);
    });
    saveBudget(newBudget);
    createBudgetFloat();
    closePanelAndNotify(panel, onDone);
  });
}

// ── Create / refresh floating plan pill (sits above the budget pill) ─────
function createPlanFloat() {
  const existing = document.getElementById('planFloat');
  if (existing) existing.remove();

  const pill = document.createElement('div');
  pill.id        = 'planFloat';
  pill.className = 'plan-float';
  pill.innerHTML = `<span class="bf-icon">🗓️</span><span>Plan next month's budget</span>`;

  pill.addEventListener('click', () => openPlanPanel());
  document.body.appendChild(pill);
}

// ── Expose so guess.js can launch the SAME quiz from the SAVE-flow popup ──
window.openBudgetQuiz = openPlanPanel;

// ── CSS ───────────────────────────────────────────────────────────────────
(function injectBudgetStyles() {
  if (document.getElementById('budget-styles')) return;
  const s = document.createElement('style');
  s.id = 'budget-styles';
  s.textContent = `
    .budget-float, .plan-float {
      position: fixed;
      right: 16px;
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 9px 16px;
      border-radius: 999px;
      font-size: 0.74rem;
      font-weight: 700;
      cursor: pointer;
      z-index: 1000;
      user-select: none;
      transition: transform 0.15s ease, box-shadow 0.15s ease;
    }
    .budget-float { bottom: 72px; }
    .plan-float   { bottom: 110px; }

    .budget-float:active, .plan-float:active { transform: scale(0.94); }

    .budget-float.healthy {
      background: linear-gradient(135deg, #0f172a, #1e293b, #0f172a, #172542, #0f172a);
      background-size: 500% 500%;
      color: #94a3b8;
      border: 1px solid #38bdf8;
      box-shadow: 0 8px 32px rgba(56, 189, 248, 0.6);
      animation: budgetFloat 12s ease infinite;
    }
    .budget-float.healthy:hover {
      box-shadow: 0 10px 40px rgba(56, 189, 248, 0.8);
      transform: scale(1.05);
    }

    .budget-float.overspent {
      background: #DC2626;
      color: #fff;
      box-shadow: 0 0 0 0 rgba(220, 38, 38, 0.7);
      animation: budgetPulse 1.5s ease-in-out infinite;
    }
    @keyframes budgetPulse {
      0%   { box-shadow: 0 0 0 0    rgba(220,38,38,0.7); }
      60%  { box-shadow: 0 0 0 16px rgba(220,38,38,0);   }
      100% { box-shadow: 0 0 0 0    rgba(220,38,38,0);   }
    }
    @keyframes budgetFloat {
      0%   { background-position: 0%   50%; }
      25%  { background-position: 50%  50%; }
      50%  { background-position: 100% 50%; }
      75%  { background-position: 50%  50%; }
      100% { background-position: 0%   50%; }
    }

    .plan-float {
      background: linear-gradient(135deg, #312e81, #4c1d95, #312e81);
      background-size: 300% 300%;
      color: #E0E7FF;
      border: 1px solid #818CF8;
      box-shadow: 0 8px 32px rgba(129, 140, 248, 0.5);
      animation: planFloat 10s ease infinite;
    }
    .plan-float:hover {
      box-shadow: 0 10px 40px rgba(129, 140, 248, 0.7);
      transform: scale(1.05);
    }
    @keyframes planFloat {
      0%   { background-position: 0%   50%; }
      50%  { background-position: 100% 50%; }
      100% { background-position: 0%   50%; }
    }

    #budgetPanel, #planPanel {
      position: fixed;
      top: 88px;
      right: 20px;
      width: min(360px, calc(100vw - 32px));
      background: #0F172A;
      border: 1px solid #1E293B;
      border-radius: 18px;
      box-shadow: 0 12px 40px rgba(0,0,0,0.55);
      z-index: 1001;
      overflow: hidden;
      animation: bpSlideUp 0.22s cubic-bezier(0.34,1.56,0.64,1);
    }
    @keyframes bpSlideUp {
      from { transform: translateY(24px); opacity: 0; }
      to   { transform: translateY(0);    opacity: 1; }
    }

    /* ── Brighter, coordinated gradient for the quiz panel specifically ──
       (does not affect .plan-panel-insights, which stays white/glowing) */
    #planPanel:not(.plan-panel-insights) {
      background: linear-gradient(135deg, #8B5CF6, #38BDF8, #2DD4BF) !important;
      background-size: 220% 220% !important;
      animation: bpSlideUp 0.22s cubic-bezier(0.34,1.56,0.64,1), planPanelShift 9s ease infinite !important;
    }
    @keyframes planPanelShift {
      0%   { background-position: 0%   50%; }
      50%  { background-position: 100% 50%; }
      100% { background-position: 0%   50%; }
    }
    #planPanel:not(.plan-panel-insights) .bp-header {
      background: rgba(15, 23, 42, 0.55) !important;
      backdrop-filter: blur(6px);
    }
    #planPanel:not(.plan-panel-insights) .plan-question {
      color: #FFFFFF !important;
      text-shadow: 0 1px 3px rgba(0,0,0,0.25);
    }
    #planPanel:not(.plan-panel-insights) .plan-quiz-opt {
      background: rgba(15, 23, 42, 0.62) !important;
      border-color: rgba(255,255,255,0.18) !important;
    }
    #planPanel:not(.plan-panel-insights) .plan-quiz-opt:hover,
    #planPanel:not(.plan-panel-insights) .plan-quiz-opt:active {
      background: rgba(15, 23, 42, 0.78) !important;
      border-color: rgba(255,255,255,0.4) !important;
    }
    #planPanel:not(.plan-panel-insights) .plan-progress-track {
      background: rgba(15, 23, 42, 0.4) !important;
    }
    #planPanel:not(.plan-panel-insights) .plan-skip {
      color: rgba(255,255,255,0.85) !important;
    }

    .bp-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 14px 18px;
      background: #000000;
      font-size: 0.95rem;
      font-weight: 700;
      color: #E2E8F0;
      letter-spacing: 0.01em;
    }
    .bp-close {
      background: none;
      border: none;
      color: #64748B;
      font-size: 1.1rem;
      cursor: pointer;
      line-height: 1;
      padding: 2px 4px;
      border-radius: 4px;
      transition: color 0.15s;
    }
    .bp-close:hover { color: #E2E8F0; }

    .bp-body {
      padding: 14px 16px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      max-height: 55vh;
      overflow-y: auto;
    }

    .bp-row {
      background: #1E293B;
      border-radius: 12px;
      padding: 11px 13px;
      border: 1px solid transparent;
      transition: border-color 0.2s;
    }
    .bp-row.bp-over { border-color: #EF4444; }

    .bp-row-top {
      display: flex;
      align-items: center;
      gap: 7px;
      margin-bottom: 4px;
    }
    .bp-icon { font-size: 1rem; }
    .bp-label {
      flex: 1;
      font-size: 0.82rem;
      font-weight: 600;
      color: #CBD5E1;
    }
    .bp-over-badge {
      font-size: 0.68rem;
      font-weight: 800;
      color: #EF4444;
      background: rgba(239,68,68,0.12);
      padding: 2px 7px;
      border-radius: 999px;
      letter-spacing: 0.04em;
    }

    .bp-actual-line {
      font-size: 0.75rem;
      color: #64748B;
      margin-bottom: 6px;
    }
    .bp-actual-line strong { color: #94A3B8; }

    .bp-bar-track {
      height: 4px;
      background: #334155;
      border-radius: 999px;
      overflow: hidden;
      margin-bottom: 8px;
    }
    .bp-bar-fill {
      height: 100%;
      border-radius: 999px;
      transition: width 0.4s ease;
    }

    .bp-input-wrap {
      display: flex;
      align-items: center;
      gap: 5px;
    }
    .bp-naira {
      color: #64748B;
      font-size: 0.85rem;
      font-weight: 600;
    }
    .bp-input {
      flex: 1;
      background: #0F172A;
      border: 1px solid #334155;
      border-radius: 8px;
      color: #E2E8F0;
      padding: 7px 10px;
      font-size: 0.88rem;
      outline: none;
      -moz-appearance: textfield;
      transition: border-color 0.15s;
    }
    .bp-input::-webkit-outer-spin-button,
    .bp-input::-webkit-inner-spin-button { -webkit-appearance: none; }
    .bp-input:focus { border-color: #3B82F6; }

    .bp-footer { padding: 0 16px 16px; }
    .bp-save {
      width: 100%;
      padding: 13px;
      background: #3B82F6;
      color: #fff;
      border: none;
      border-radius: 10px;
      font-size: 0.9rem;
      font-weight: 700;
      cursor: pointer;
      letter-spacing: 0.02em;
      transition: background 0.15s;
    }
    .bp-save:hover  { background: #2563EB; }
    .bp-save:active { background: #1D4ED8; }

    /* ── Plan panel specifics ── */
    .plan-question {
      font-size: 0.88rem;
      color: #E2E8F0;
      margin-bottom: 14px;
      line-height: 1.4;
    }
    .plan-emergency-btns {
      display: flex;
      gap: 10px;
    }
    .plan-btn {
      flex: 1;
      padding: 12px;
      border-radius: 10px;
      border: none;
      font-size: 0.88rem;
      font-weight: 700;
      cursor: pointer;
      transition: transform 0.15s;
    }
    .plan-btn:active { transform: scale(0.96); }
    .plan-btn-no  { background: #1E293B; color: #94A3B8; border: 1px solid #334155; }
    .plan-btn-yes { background: #F59E0B; color: #1E1B0E; }

    .plan-advice {
      font-size: 0.74rem;
      color: #94A3B8;
      margin-bottom: 8px;
      line-height: 1.4;
    }
    .plan-emergency-note {
      font-size: 0.76rem;
      color: #FBBF24;
      background: rgba(245, 158, 11, 0.1);
      border: 1px solid rgba(245, 158, 11, 0.3);
      border-radius: 8px;
      padding: 8px 10px;
      margin-bottom: 4px;
    }

    /* ── Quiz progress ── */
    .plan-progress-track {
      height: 4px;
      background: #1E293B;
      border-radius: 999px;
      overflow: hidden;
      margin-bottom: 16px;
    }
    .plan-progress-fill {
      height: 100%;
      background: linear-gradient(90deg, #818CF8, #C4B5FD);
      border-radius: 999px;
      transition: width 0.3s ease;
    }

    /* ── Quiz option buttons ── */
    .plan-quiz-opts {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-bottom: 16px;
    }
    .plan-quiz-opt {
      display: flex;
      align-items: center;
      gap: 10px;
      background: #1E293B;
      border: 1px solid #334155;
      border-radius: 12px;
      padding: 12px 14px;
      text-align: left;
      cursor: pointer;
      transition: border-color 0.15s, background 0.15s;
    }
    .plan-quiz-opt:hover, .plan-quiz-opt:active {
      border-color: #818CF8;
      background: #25304a;
    }
    .plan-quiz-emoji { font-size: 1.1rem; flex-shrink: 0; }
    .plan-quiz-label { font-size: 0.8rem; color: #CBD5E1; line-height: 1.35; }

    .plan-skip {
      display: block;
      width: 100%;
      text-align: center;
      background: none;
      border: none;
      color: #64748B;
      font-size: 0.74rem;
      text-decoration: underline;
      cursor: pointer;
      padding: 4px;
    }

    /* ── Results blocks ── */
    .plan-block {
      font-size: 0.78rem;
      color: #CBD5E1;
      line-height: 1.45;
      margin-bottom: 12px;
      padding-bottom: 12px;
      border-bottom: 1px solid rgba(255,255,255,0.06);
    }
    .plan-block strong { color: #E2E8F0; }
    .plan-block-savings {
      color: #A7F3D0;
      border-bottom: none;
      margin-bottom: 16px;
    }

    /* ── Suggestion chip ── */
    .plan-suggest-chip {
      display: block;
      width: 100%;
      text-align: left;
      background: rgba(129, 140, 248, 0.12);
      border: 1px solid rgba(129, 140, 248, 0.4);
      border-radius: 8px;
      padding: 7px 10px;
      font-size: 0.72rem;
      color: #C4B5FD;
      cursor: pointer;
      margin-bottom: 8px;
      transition: background 0.15s;
    }
    .plan-suggest-chip:hover, .plan-suggest-chip:active {
      background: rgba(129, 140, 248, 0.22);
    }

    /* ── Insights-only panel: white background, shimmering glow border ── */
    .plan-panel-insights {
      background: #FFFFFF !important;
      overflow: visible !important;
      box-shadow: 0 16px 48px rgba(0,0,0,0.22) !important;
    }
    .plan-panel-insights::before {
      content: '';
      position: absolute;
      inset: -3px;
      border-radius: 21px;
      background: linear-gradient(120deg, #FBBF24, #F472B6, #818CF8, #34D399, #FBBF24);
      background-size: 300% 300%;
      z-index: -1;
      filter: blur(3px);
      animation: shimmerBorder 5s linear infinite;
    }
    @keyframes shimmerBorder {
      0%   { background-position: 0%   50%; }
      100% { background-position: 300% 50%; }
    }

    .bp-header-light {
      background: #F8FAFC;
      color: #0F172A;
      border-radius: 18px 18px 0 0;
      border-bottom: 1px solid #E2E8F0;
    }
    .bp-close-light { color: #94A3B8; }
    .bp-close-light:hover { color: #0F172A; }

    .bp-body-light {
      background: #FFFFFF;
    }

    .plan-block-light {
      font-size: 0.82rem;
      color: #334155;
      line-height: 1.5;
      margin-bottom: 14px;
      padding-bottom: 14px;
      border-bottom: 1px solid #F1F5F9;
    }
    .plan-block-light strong { color: #0F172A; }
    .plan-block-savings-light {
      color: #047857;
      border-bottom: none;
    }
    .plan-note-light {
      font-size: 0.74rem;
      color: #94A3B8;
      line-height: 1.4;
      font-style: italic;
    }

    .bp-save-light {
      background: linear-gradient(90deg, #FBBF24, #F472B6, #818CF8);
      color: #1E1B0E;
    }
    .bp-save-light:hover { opacity: 0.92; }
  `;
  document.head.appendChild(s);
})();

// ── Expose so scanner.js can call both pills after a scan completes ──────
window.showBudgetFloat = function() {
  createBudgetFloat();
  createPlanFloat();
};
