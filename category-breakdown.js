window.renderCategoryBreakdown = function(rawPageTexts) {
  const container = document.getElementById('categoryBreakdown');
  if (!container) return;

  const fullText = rawPageTexts.join('\n');
  const { transactions, summary } = window.categoriseStatement(fullText);

  if (transactions.length === 0) {
    container.innerHTML = '<p style="color:#94A3B8;text-align:center">No transactions parsed.</p>';
    return;
  }

  // ── Ground truth totals from the PDF summary line (scanner.js) ──────────
  // These are the real totals from the statement header — always accurate.
  const trueTotalOut = window.financialTotals?.expense?.amount ?? null;
  const trueTotalIn  = window.financialTotals?.credit?.amount  ?? null;

  // ── Parsed totals from categorizer ───────────────────────────────────────
  const parsedTotalOut = summary.reduce((s, c) => s + c.totalDebit,  0);
  const parsedTotalIn  = summary.reduce((s, c) => s + c.totalCredit, 0);

  // ── Scale factor: stretch parsed category amounts to match true totals ───
  const scaleOut = (trueTotalOut && parsedTotalOut > 0) ? trueTotalOut / parsedTotalOut : 1;
  const scaleIn  = (trueTotalIn  && parsedTotalIn  > 0) ? trueTotalIn  / parsedTotalIn  : 1;

  // ── Use true totals for display if available, else parsed ────────────────
  const grandDebit  = trueTotalOut ?? parsedTotalOut;
  const grandCredit = trueTotalIn  ?? parsedTotalIn;

  let html = `
    <div class="cb-header">
      <h3 class="cb-title">Spending Breakdown</h3>
      <div class="cb-grand">
        <span class="cb-grand-item cb-debit">Total Out <strong>₦${window.txFmt(grandDebit)}</strong></span>
        <span class="cb-grand-item cb-credit">Total In <strong>₦${window.txFmt(grandCredit)}</strong></span>
      </div>
    </div>
    <div class="cb-list">
  `;

  for (const cat of summary) {
    const catMeta = window.TX_CATEGORIES.find(c => c.name === cat.name) || { color: '#94A3B8' };

    // Scale this category's amounts to match real totals
    const scaledDebit  = cat.totalDebit  * scaleOut;
    const scaledCredit = cat.totalCredit * scaleIn;

    const barPct = grandDebit > 0 ? Math.min((scaledDebit / grandDebit) * 100, 100) : 0;

    // Scale individual transaction amounts too
    const scaledItems = cat.items.map(tx => ({
      ...tx,
      debit:  tx.debit  * scaleOut,
      credit: tx.credit * scaleIn,
    }));

    html += `
      <div class="cb-row" data-category="${cat.name}">
        <div class="cb-row-top">
          <span class="cb-dot" style="background:${catMeta.color}"></span>
          <span class="cb-name">${cat.name}</span>
          <span class="cb-count">${cat.count} txn${cat.count !== 1 ? 's' : ''}</span>
          ${scaledDebit  > 0 ? `<span class="cb-amount-out">−₦${window.txFmt(scaledDebit)}</span>`  : ''}
          ${scaledCredit > 0 ? `<span class="cb-amount-in">+₦${window.txFmt(scaledCredit)}</span>` : ''}
        </div>
        <div class="cb-bar-track">
          <div class="cb-bar-fill" style="width:${barPct.toFixed(1)}%;background:${catMeta.color}"></div>
        </div>
        <div class="cb-items" id="cb-items-${cat.name.replace(/[\s/]+/g,'-')}">
          ${scaledItems.map(tx => `
            <div class="cb-item">
              <span class="cb-item-desc">${tx.description}</span>
              <span class="cb-item-nums">
                ${tx.debit  > 0 ? `<span class="cb-item-debit">−₦${window.txFmt(tx.debit)}</span>`  : ''}
                ${tx.credit > 0 ? `<span class="cb-item-credit">+₦${window.txFmt(tx.credit)}</span>` : ''}
              </span>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  html += `</div>`;
  container.innerHTML = html;

  container.querySelectorAll('.cb-row').forEach(row => {
    row.addEventListener('click', () => {
      const key   = row.dataset.category.replace(/[\s/]+/g, '-');
      const items = document.getElementById(`cb-items-${key}`);
      if (items) items.classList.toggle('cb-items-open');
    });
  });
};

// ── Inject styles once ────────────────────────────────────────────────────
(function injectCbStyles() {
  if (document.getElementById('cb-styles')) return;
  const style = document.createElement('style');
  style.id = 'cb-styles';
  style.textContent = `
    #categoryBreakdown { margin-top: 24px; font-family: inherit; }
    .cb-header { display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; flex-wrap:wrap; gap:8px; }
    .cb-title  { font-size:1rem; font-weight:700; color:#E2E8F0; margin:0; }
    .cb-grand  { display:flex; gap:12px; flex-wrap:wrap; }
    .cb-grand-item { font-size:0.75rem; color:#94A3B8; }
    .cb-grand-item strong { font-weight:700; }
    .cb-debit strong  { color:#EF4444; }
    .cb-credit strong { color:#22C55E; }
    .cb-list { display:flex; flex-direction:column; gap:10px; }
    .cb-row { background:rgba(255,255,255,0.04); border-radius:10px; padding:10px 12px; cursor:pointer; transition:background 0.15s; }
    .cb-row:hover { background:rgba(255,255,255,0.08); }
    .cb-row-top { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
    .cb-dot  { width:10px; height:10px; border-radius:50%; flex-shrink:0; }
    .cb-name { font-size:0.85rem; font-weight:600; color:#E2E8F0; flex:1; }
    .cb-count { font-size:0.7rem; color:#64748B; }
    .cb-amount-out { font-size:0.82rem; font-weight:700; color:#EF4444; margin-left:auto; }
    .cb-amount-in  { font-size:0.82rem; font-weight:700; color:#22C55E; }
    .cb-bar-track { height:4px; background:rgba(255,255,255,0.08); border-radius:2px; margin-top:8px; overflow:hidden; }
    .cb-bar-fill  { height:100%; border-radius:2px; transition:width 0.4s ease; }
    .cb-items { display:none; flex-direction:column; gap:4px; margin-top:8px; padding-top:8px; border-top:1px solid rgba(255,255,255,0.06); }
    .cb-items-open { display:flex; }
    .cb-item { display:flex; justify-content:space-between; align-items:flex-start; gap:8px; font-size:0.72rem; color:#94A3B8; padding:3px 0; }
    .cb-item-desc   { flex:1; word-break:break-word; }
    .cb-item-nums   { display:flex; gap:6px; flex-shrink:0; }
    .cb-item-debit  { color:#F87171; font-weight:600; }
    .cb-item-credit { color:#4ADE80; font-weight:600; }
  `;
  document.head.appendChild(style);
})();
