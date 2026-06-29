window.renderCategoryBreakdown = function(rawPageTexts) {
  const container = document.getElementById('categoryBreakdown');
  if (!container) return;
  
  const fullText = rawPageTexts.join('\n');
  const { accounts, transactions } = window.categoriseStatement(fullText);
  
  if (transactions.length === 0) {
    container.innerHTML = '<p style="color:#94A3B8;text-align:center">No transactions parsed.</p>';
    return;
  }
  
  let html = '';
  
  for (const account of accounts) {
    const { name, totalCredit, totalDebit, summary, mismatch } = account;
    
    // ── Raw parsed totals — NO scaling. What you see is exactly what was parsed. ──
    const parsedTotalOut = summary.reduce((s, c) => s + c.totalDebit, 0);
    const parsedTotalIn = summary.reduce((s, c) => s + c.totalCredit, 0);
    
    // ── Mismatch warning banner ───────────────────────────────────────────
    let warningHtml = '';
    if (mismatch && mismatch.hasMismatch) {
      const lines = [];
      if (mismatch.creditCountExpected != null && mismatch.creditCountExpected !== mismatch.creditCountParsed) {
        lines.push(`Expected ${mismatch.creditCountExpected} credit txns, found ${mismatch.creditCountParsed}`);
      }
      if (mismatch.debitCountExpected != null && mismatch.debitCountExpected !== mismatch.debitCountParsed) {
        lines.push(`Expected ${mismatch.debitCountExpected} debit txns, found ${mismatch.debitCountParsed}`);
      }
      if (mismatch.totalCreditExpected != null && Math.abs(mismatch.totalCreditExpected - mismatch.totalCreditParsed) > 0.01) {
        lines.push(`Credit total off by ₦${window.txFmt(Math.abs(mismatch.totalCreditExpected - mismatch.totalCreditParsed))}`);
      }
      if (mismatch.totalDebitExpected != null && Math.abs(mismatch.totalDebitExpected - mismatch.totalDebitParsed) > 0.01) {
        lines.push(`Debit total off by ₦${window.txFmt(Math.abs(mismatch.totalDebitExpected - mismatch.totalDebitParsed))}`);
      }
      warningHtml = `
        <div class="cb-warning">
          <span class="cb-warning-icon">⚠️</span>
          <div class="cb-warning-text">
            <strong>Some transactions may be missing or mis-parsed</strong>
            <ul>${lines.map(l => `<li>${l}</li>`).join('')}</ul>
          </div>
        </div>`;
    }
    
    // Use the document's printed total for the header display if available
    // (that's the trustworthy ground truth), but the category rows below
    // always show RAW parsed amounts, not scaled to match it.
    const grandDebit = totalDebit ?? parsedTotalOut;
    const grandCredit = totalCredit ?? parsedTotalIn;
    
    // ── NEW: natural-language summary paragraph ─────────────────────────
    const summaryText = window.generateAccountSummary ?
      window.generateAccountSummary({ name, totalCredit: grandCredit, totalDebit: grandDebit, summary }) :
      '';
    const summaryHtml = summaryText ?
      `<p class="cb-summary">${summaryText}</p>` :
      '';
    
    html += `
      <div class="cb-account">
        <div class="cb-header">
          <h3 class="cb-title">${name}</h3>
          <div class="cb-grand">
            <span class="cb-grand-item cb-debit">Total Out <strong>₦${window.txFmt(grandDebit)}</strong></span>
            <span class="cb-grand-item cb-credit">Total In <strong>₦${window.txFmt(grandCredit)}</strong></span>
          </div>
        </div>
        ${summaryHtml}
        ${warningHtml}
        <div class="cb-list">
    `;
    
    for (const cat of summary) {
      const catMeta = window.TX_CATEGORIES.find(c => c.name === cat.name) || { color: '#94A3B8' };
      const barPct = grandDebit > 0 ? Math.min((cat.totalDebit / grandDebit) * 100, 100) : 0;
      const safeKey = `${name}-${cat.name}`.replace(/[\s/]+/g, '-');
      const catDesc = window.getCategoryDescription ? window.getCategoryDescription(cat.name) : '';
      
      html += `
        <div class="cb-row" data-key="${safeKey}">
          <div class="cb-row-top">
            <span class="cb-dot" style="background:${catMeta.color}"></span>
            <span class="cb-name">${cat.name}</span>
            <span class="cb-count">${cat.count} txn${cat.count !== 1 ? 's' : ''}</span>
            ${cat.totalDebit  > 0 ? `<span class="cb-amount-out">−₦${window.txFmt(cat.totalDebit)}</span>`  : ''}
            ${cat.totalCredit > 0 ? `<span class="cb-amount-in">+₦${window.txFmt(cat.totalCredit)}</span>` : ''}
          </div>
          ${catDesc ? `<p class="cb-cat-desc">${catDesc}</p>` : ''}
          <div class="cb-bar-track">
            <div class="cb-bar-fill" style="width:${barPct.toFixed(1)}%;background:${catMeta.color}"></div>
          </div>
          <div class="cb-items" id="cb-items-${safeKey}">
            ${cat.items.map(tx => `
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
    
    html += `</div></div>`;
  }
  
  container.innerHTML = html;
  
  container.querySelectorAll('.cb-row').forEach(row => {
    row.addEventListener('click', () => {
      const key = row.dataset.key;
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

    .cb-account { margin-bottom: 28px; }
    .cb-account + .cb-account {
      border-top: 1px solid rgba(255,255,255,0.07);
      padding-top: 24px;
    }

    .cb-header { display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; flex-wrap:wrap; gap:8px; }
    .cb-title  { font-size:1rem; font-weight:700; color:#E2E8F0; margin:0; }
    .cb-grand  { display:flex; gap:12px; flex-wrap:wrap; }
    .cb-grand-item { font-size:0.75rem; color:#94A3B8; }
    .cb-grand-item strong { font-weight:700; }
    .cb-debit strong  { color:#EF4444; }
    .cb-credit strong { color:#22C55E; }

    .cb-summary {
      font-size: 0.85rem;
      color: #CBD5E1;
      line-height: 1.6;
      margin: 0 0 16px;
      padding: 10px 12px;
      background: rgba(255,255,255,0.03);
      border-radius: 8px;
      border-left: 3px solid #6366F1;
    }

    .cb-warning {
      display: flex;
      gap: 10px;
      align-items: flex-start;
      background: rgba(245, 158, 11, 0.1);
      border: 1px solid rgba(245, 158, 11, 0.35);
      border-radius: 10px;
      padding: 10px 12px;
      margin-bottom: 14px;
    }
    .cb-warning-icon { font-size: 1rem; flex-shrink: 0; }
    .cb-warning-text { font-size: 0.78rem; color: #FBBF24; }
    .cb-warning-text strong { display: block; margin-bottom: 4px; color: #FCD34D; }
    .cb-warning-text ul { margin: 0; padding-left: 16px; color: #FBBF24; }
    .cb-warning-text li { margin-bottom: 2px; }

    .cb-list { display:flex; flex-direction:column; gap:10px; }
    .cb-row { background:rgba(255,255,255,0.04); border-radius:10px; padding:10px 12px; cursor:pointer; transition:background 0.15s; }
    .cb-row:hover { background:rgba(255,255,255,0.08); }
    .cb-row-top { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
    .cb-dot  { width:10px; height:10px; border-radius:50%; flex-shrink:0; }
    .cb-name { font-size:0.85rem; font-weight:600; color:#E2E8F0; flex:1; }
    .cb-count { font-size:0.7rem; color:#64748B; }
    .cb-amount-out { font-size:0.82rem; font-weight:700; color:#EF4444; margin-left:auto; }
    .cb-amount-in  { font-size:0.82rem; font-weight:700; color:#22C55E; }

    .cb-cat-desc { font-size:0.72rem; color:#94A3B8; margin:4px 0 0; }

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