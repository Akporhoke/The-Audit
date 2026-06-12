pdfjsLib.GlobalWorkerOptions.workerSrc =
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

// ── Keywords grouped by category ──────────────────────────────────────────
const KEYWORDS = {
  income: ['income'],
  credit: ['credit'],
  expense: ['debit', 'outcome'],
};

// ── Stored results (exposed on window so category-breakdown.js can read) ──
window.financialTotals = { income: null, credit: null, expense: null };
let financialTotals = window.financialTotals;
let financialData   = { income: [], credit: [], expense: [] };

// ── Extract number ────────────────────────────────────────────────────────
function extractNumber(snippet, keyword) {
  const totalPattern = new RegExp('total\\s+' + keyword + 's?\\s+([\\d,]+\\.?\\d*)', 'i');
  const totalMatch = snippet.match(totalPattern);
  if (totalMatch) {
    const num = parseFloat(totalMatch[1].replace(/,/g, ''));
    if (!isNaN(num)) return num;
  }
  const directPattern = new RegExp(keyword + 's?\\s+([\\d,]+\\.\\d{2})', 'i');
  const directMatch = snippet.match(directPattern);
  if (directMatch) {
    const num = parseFloat(directMatch[1].replace(/,/g, ''));
    if (!isNaN(num)) return num;
  }
  const found = snippet.match(/\d{1,3}(?:,\d{3})*\.\d{2}/g);
  if (!found) return null;
  const numbers = found.map(n => parseFloat(n.replace(/,/g, ''))).filter(n => !isNaN(n));
  return numbers.length ? numbers[0] : null;
}

function formatAmount(amount) {
  if (amount === null || amount === undefined) return null;
  return amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ── Category helper (available anywhere after scan) ───────────────────────
function getCategoryAmount(summary, name) {
  const cat = summary.find(c => c.name === name);
  if (!cat) return 0;
  const trueTotalOut   = window.financialTotals?.expense?.amount;
  const parsedTotalOut = summary.reduce((s, c) => s + c.totalDebit, 0);
  const scaleOut       = (trueTotalOut && parsedTotalOut > 0) ? trueTotalOut / parsedTotalOut : 1;
  return cat.totalDebit * scaleOut;
}

function getCategoryIncome(summary, name) {
  const cat = summary.find(c => c.name === name);
  if (!cat) return 0;
  const trueTotalIn   = window.financialTotals?.credit?.amount;
  const parsedTotalIn = summary.reduce((s, c) => s + c.totalCredit, 0);
  const scaleIn       = (trueTotalIn && parsedTotalIn > 0) ? trueTotalIn / parsedTotalIn : 1;
  return cat.totalCredit * scaleIn;
}

// ── Main scan function ────────────────────────────────────────────────────
async function searchPDF() {
  const file      = document.getElementById('pdfInput').files[0];
  const statusEl  = document.getElementById('status');
  const summaryEl = document.getElementById('summary');
  const resultsEl = document.getElementById('results');

  resultsEl.innerHTML = '';
  summaryEl.innerHTML = '';

  if (!file) return;

  document.getElementById('uploadLabel').textContent = `📄 ${file.name}`;
  statusEl.textContent = 'Scanning PDF...';
  statusEl.className   = 'status info';

  window.financialTotals = { income: null, credit: null, expense: null };
  financialTotals = window.financialTotals;
  financialData   = { income: [], credit: [], expense: [] };

  let rawPageTexts = [];

  try {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    for (let i = 1; i <= pdf.numPages; i++) {
      const page    = await pdf.getPage(i);
      const content = await page.getTextContent();
      const pageText  = content.items.map(item => item.str).join(' ');
      const lowerText = pageText.toLowerCase();

      rawPageTexts.push(pageText);

      for (const [category, keywords] of Object.entries(KEYWORDS)) {
        for (const keyword of keywords) {
          let idx = lowerText.indexOf(keyword);
          while (idx !== -1) {
            const start   = Math.max(0, idx - 150);
            const end     = Math.min(pageText.length, idx + keyword.length + 150);
            const snippet = pageText.slice(start, end).trim();
            const amount  = extractNumber(snippet, keyword);
            const match   = { keyword, page: i, snippet, amount };

            if (snippet.toLowerCase().includes('total')) {
              if (!financialTotals[category]) financialTotals[category] = match;
            } else {
              financialData[category].push(match);
            }
            idx = lowerText.indexOf(keyword, idx + 1);
          }
        }
      }
    }

    // ── Category breakdown + individual values ── all here where rawPageTexts is in scope
    renderCategoryBreakdown(rawPageTexts);

    const fullText       = rawPageTexts.join('\n');
    const { summary }    = window.categoriseStatement(fullText);

    const airtimeAmount  = getCategoryAmount(summary, 'Airtime & Data');
    const transfersOut   = getCategoryAmount(summary, 'Transfers Out');
    const transfersIn    = getCategoryIncome(summary, 'Transfers In');
    const savings        = getCategoryAmount(summary, 'Savings / Investment');
    const fees           = getCategoryAmount(summary, 'Fees & Charges');

    window.categoryAmounts = { airtimeAmount, transfersOut, transfersIn, savings, fees };

    // ── Financial score: G = B + Rs + Pa + Rt ────────────────────────────
    const totalIn  = financialTotals.credit?.amount;
    const totalOut = financialTotals.expense?.amount;

    if (totalIn != null && totalOut != null && totalIn > 0) {
      const O = totalOut;

      // Base score: savings rate × 10
      const B = ((totalIn - totalOut) / totalIn) * 10;

      // Ratios
      const S = savings     / O;  // savings/investment share of spend
      const A = airtimeAmount / O;  // airtime share of spend
      const T = transfersOut  / O;  // peer transfers share of spend

      // Rs: savings bonus
      const Rs = S > 0.30 ? 0.50 : S >= 0.15 ? 0.25 : 0;

      // Pa: airtime penalty
      const Pa = A > 0.60 ? -0.25 : 0;

      // Rt: peer transfer adjustment
      const Rt = T > 0.35 ? -0.10 : T < 0.15 ? 0.10 : 0;

      // Final grade, clamped 0–10
      const G = Math.min(10, Math.max(0, B + Rs + Pa + Rt));

      score.textContent = G.toFixed(1);

      console.log({ B, S, A, T, Rs, Pa, Rt, G });
      window.scoreBreakdown = { B, Rs, Pa, Rt, G };

      // Update circle color with new score
      const circle     = document.querySelector('#circle');
      const outcomeDeg = Math.min((totalOut / totalIn) * 180, 180);
      applyScoreColor(180 + outcomeDeg, circle);
    }

    // displayResults runs last so window.scoreBreakdown is already set
    displayResults(statusEl, summaryEl, resultsEl);

  } catch (err) {
    statusEl.textContent = 'Could not read this PDF. Make sure it is a valid file.';
    statusEl.className   = 'status error';
    console.error(err);
  }
}

// ── Highlight ─────────────────────────────────────────────────────────────
function highlight(snippet, keyword) {
  return snippet.replace(new RegExp(keyword, 'gi'), m => `<mark>${m}</mark>`);
}

// ── Display results ───────────────────────────────────────────────────────
function displayResults(statusEl, summaryEl, resultsEl) {
  const totalMatches =
    Object.values(financialData).reduce((s, a) => s + a.length, 0) +
    Object.values(financialTotals).filter(Boolean).length;

  if (totalMatches === 0) {
    statusEl.textContent = 'No financial keywords found in this PDF.';
    statusEl.className   = 'status error';
    return;
  }

  statusEl.textContent = 'Scan complete.';
  statusEl.className   = 'status success';

  const summaryCards = Object.entries(financialTotals)
    .filter(([, t]) => t && t.amount !== null)
    .map(([cat, t]) => `
      <div class="summary-card">
        <span class="summary-label">${cat}</span>
        <div class="summary-amount">${formatAmount(t.amount)}</div>
      </div>
    `).join('');

  if (summaryCards) {
    const sb = window.scoreBreakdown;
    const scoreRow = sb ? `
      <div class="score-breakdown-row">
        <span class="sb-item">Base <strong>${sb.B.toFixed(2)}</strong></span>
        <span class="sb-sep">+</span>
        <span class="sb-item">Savings bonus <strong class="${sb.Rs > 0 ? 'sb-pos' : 'sb-zero'}">${sb.Rs >= 0 ? '+' : ''}${sb.Rs.toFixed(2)}</strong></span>
        <span class="sb-sep">+</span>
        <span class="sb-item">Airtime penalty <strong class="${sb.Pa < 0 ? 'sb-neg' : 'sb-zero'}">${sb.Pa.toFixed(2)}</strong></span>
        <span class="sb-sep">+</span>
        <span class="sb-item">Transfer adjust <strong class="${sb.Rt > 0 ? 'sb-pos' : sb.Rt < 0 ? 'sb-neg' : 'sb-zero'}">${sb.Rt >= 0 ? '+' : ''}${sb.Rt.toFixed(2)}</strong></span>
        <span class="sb-arrow">→</span>
        <span class="sb-item sb-total">Score <strong>${sb.G.toFixed(1)}</strong></span>
      </div>` : '';
    summaryEl.innerHTML = `<div class="summary-row">${summaryCards}</div>`;

    // Inject score breakdown into the double-tap #breakdown section
    const sbContainer = document.getElementById('scoreBreakdownRow');
    if (sbContainer && scoreRow) sbContainer.innerHTML = scoreRow;
  }

  for (const category of Object.keys(KEYWORDS)) {
    const total  = financialTotals[category];
    const others = financialData[category];
    if (!total && others.length === 0) continue;

    const section = document.createElement('div');
    section.className = 'category-section';
    section.innerHTML = `<h2 class="category-title">${category}</h2>`;

    if (total) {
      const formatted = formatAmount(total.amount);
      section.innerHTML += `
        <div class="match-card total-card">
          <div class="card-header">
            <span class="page-label">Page ${total.page} · <em>${total.keyword}</em></span>
            <span class="total-badge">TOTAL</span>
          </div>
          ${formatted !== null
            ? `<div class="amount-display">${formatted}</div>`
            : `<p class="no-amount">No number detected near this line</p>`}
          <p class="snippet-text">...${highlight(total.snippet, total.keyword)}...</p>
        </div>`;
    } else {
      section.innerHTML += `<p class="no-total">No total line found for <strong>${category}</strong>.</p>`;
    }

    if (others.length > 0) {
      section.innerHTML += `<p class="sub-label">Other matches (${others.length})</p>`;
      others.forEach(({ keyword, page, snippet, amount }) => {
        const formatted = formatAmount(amount);
        section.innerHTML += `
          <div class="match-card">
            <div class="card-header">
              <span class="page-label">Page ${page} · <em>${keyword}</em></span>
            </div>
            ${formatted ? `<div class="amount-display small">${formatted}</div>` : ''}
            <p class="snippet-text">...${highlight(snippet, keyword)}...</p>
          </div>`;
      });
    }

    resultsEl.appendChild(section);
  }

  // Score already set in searchPDF — don't overwrite it here
}

// ── Score breakdown styles ───────────────────────────────────────────────
(function() {
  if (document.getElementById('sb-styles')) return;
  const s = document.createElement('style');
  s.id = 'sb-styles';
  s.textContent = `
    .score-breakdown-row {
      display: flex; align-items: center; flex-wrap: wrap;
      gap: 6px; margin-top: 10px; padding: 8px 12px;
      background: rgba(255,255,255,0.04); border-radius: 8px;
      font-size: 0.78rem; color: #94A3B8;
    }
    .sb-item { display: flex; align-items: center; gap: 4px; }
    .sb-item strong { font-size: 0.85rem; color: #E2E8F0; }
    .sb-pos  { color: #22C55E !important; }
    .sb-neg  { color: #EF4444 !important; }
    .sb-zero { color: #64748B !important; }
    .sb-sep  { color: #334155; }
    .sb-arrow { color: #475569; font-size: 1rem; }
    .sb-total strong { font-size: 1rem; color: #E0B840 !important; }
  `;
  document.head.appendChild(s);
})();

// ── Init ──────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const pdfInput = document.getElementById('pdfInput');
  if (pdfInput) pdfInput.addEventListener('change', searchPDF);
});

const budgetBreakdownCss = document.querySelector('#breakdown');
const circleWrap         = document.querySelector('#circle-wrap');
const score              = document.getElementById('saved');
const results            = document.querySelector('#results');
const categoryBreakdown  = document.querySelector('#categoryBreakdown');

// Double-tap the circle to open/close the full-screen breakdown overlay
circleWrap.addEventListener('dblclick', () => {
  const scoreV = score.textContent.trim();
  if (!scoreV || scoreV === '--' || scoreV === '') return;
  budgetBreakdownCss.classList.toggle('open');
  categoryBreakdown.classList.toggle('hidden');
  results.classList.toggle('hidden');
});

function applyScoreColor(greyStart, circle) {
  const text   = document.querySelector('#saved');
  const scoreV = parseFloat(text.textContent.trim());

  if (!text || isNaN(scoreV)) { text.style.color = 'white'; return; }

  if (scoreV >= 9) {
    text.style.color = '#E0B840';
    circle.style.background = `conic-gradient(#39FF14 0deg 180deg, #E0B840 180deg ${greyStart}deg, #C4BCB0 ${greyStart}deg 360deg)`;
  } else if (scoreV >= 6) {
    text.style.color = 'green';
    circle.style.background = `conic-gradient(#39FF14 0deg 180deg, #39FF14 180deg ${greyStart}deg, #C4BCB0 ${greyStart}deg 360deg)`;
  } else {
    text.style.color = 'red';
    circle.style.background = `conic-gradient(#39FF14 0deg 180deg, #FF0000 180deg ${greyStart}deg, #C4BCB0 ${greyStart}deg 360deg)`;
  }
}
