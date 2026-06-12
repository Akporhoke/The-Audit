// ── Transaction Categories ────────────────────────────────────────────────
window.TX_CATEGORIES = [
  { name: 'Airtime & Data', color: '#F97316', keywords: ['airtime', 'data sub', 'mtn', 'glo ', 'airtel', '9mobile'] },
  { name: 'Transfers In', color: '#22C55E', keywords: ['transfer from', 'trf from', 'cba_credit', 'inflow'] },
  { name: 'Transfers Out', color: '#EF4444', keywords: ['transfer to', 'trf to', 'trf|2mpt'] },
  { name: 'Savings / Investment', color: '#6366F1', keywords: ['auto-save', 'owealth', 'contribution', 'ppl,', 'savings'] },
  { name: 'Withdrawals', color: '#EC4899', keywords: ['withdrawal', 'cash out'] },
  { name: 'Interest', color: '#14B8A6', keywords: ['interest_credit', 'interest'] },
  { name: 'Other', color: '#94A3B8', keywords: [] },
];

window.txCategorise = function(description) {
  const lower = description.toLowerCase();
  for (const cat of window.TX_CATEGORIES) {
    if (cat.keywords.length === 0) continue;
    if (cat.keywords.some(kw => lower.includes(kw.toLowerCase()))) return cat.name;
  }
  return 'Other';
};

// ── Parse PDF.js space-joined text ───────────────────────────────────────
// PDF.js joins all tokens with spaces into one long string.
// Strategy: split on datetime stamps (YYYY-MM-DDTHH:MM:SS) or date patterns
// to find transaction boundaries, then extract description + amounts.
window.txParseTransactions = function(rawText) {
  const transactions = [];
  
  // ── DEBUG: log first 500 chars so we can see the raw format ──
  console.log('[categorizer] rawText sample:', rawText.slice(0, 500));
  
  const datePattern = /(\d{4}-\d{2}-\d{2}T\d{2}:\s*\d{2}:\s*\d{2}|\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{4})/gi;
  
  const parts = rawText.split(datePattern).filter(s => s.trim());
  console.log('[categorizer] parts count after split:', parts.length);
  console.log('[categorizer] first 3 parts:', parts.slice(0, 3));
  
  // parts alternate: [date, content, date, content, ...]
  for (let i = 0; i < parts.length - 1; i++) {
    // Check if this part looks like a date stamp
    if (!datePattern.test(parts[i])) continue;
    datePattern.lastIndex = 0; // reset after .test()
    
    const block = (parts[i] + ' ' + (parts[i + 1] || '')).trim();
    
    // Extract all decimal numbers from block
    const numRe = /\d{1,3}(?:,\d{3})*\.\d{2}/g;
    const nums = [...block.matchAll(numRe)].map(m => parseFloat(m[0].replace(/,/g, '')));
    
    if (nums.length < 1) continue;
    
    // Description: strip leading date/time and trailing numbers
    let desc = block
      .replace(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\s*/i, '')
      .replace(/^\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{4}\s*/i, '')
      .replace(/(\s+\d{1,3}(?:,\d{3})*\.\d{2})+\s*$/, '')
      .trim();
    
    // Skip header/summary lines
    if (/^(opening|closing|total|period|account|wallet|date|trans|balance|debit|credit|channel|reference)/i.test(desc)) continue;
    if (!desc || desc.length < 3) continue;
    
    // Determine debit vs credit
    // Common pattern: [debit_amount, credit_amount, balance] OR just [amount, balance]
    let debit = 0,
      credit = 0;
    const blockLower = block.toLowerCase();
    
    // Moniepoint format: last 3 numbers are always [debit, credit, balance]
    // 0.00 in debit position = credit transaction, 0.00 in credit position = debit transaction
    if (nums.length >= 3) {
      debit = nums[nums.length - 3];
      credit = nums[nums.length - 2];
      // if both non-zero, trust the values; 0.00 means that column is empty
    } else if (nums.length === 2) {
      const looksLikeCredit =
        blockLower.includes('transfer from') || blockLower.includes('credit') ||
        blockLower.includes('interest') || blockLower.includes('inflow');
      if (looksLikeCredit) credit = nums[0];
      else debit = nums[0];
    } else if (nums.length === 1) {
      const looksLikeCredit =
        blockLower.includes('transfer from') || blockLower.includes('credit') || blockLower.includes('interest');
      if (looksLikeCredit) credit = nums[0];
      else debit = nums[0];
    }
    
    transactions.push({ description: desc, debit, credit, category: window.txCategorise(desc) });
  }
  
  // Reset regex state
  datePattern.lastIndex = 0;
  return transactions;
};

window.txSummarise = function(transactions) {
  const map = {};
  for (const tx of transactions) {
    if (!map[tx.category]) map[tx.category] = { name: tx.category, totalDebit: 0, totalCredit: 0, count: 0, items: [] };
    map[tx.category].totalDebit += tx.debit;
    map[tx.category].totalCredit += tx.credit;
    map[tx.category].count++;
    map[tx.category].items.push(tx);
  }
  return Object.values(map).sort((a, b) => b.totalDebit - a.totalDebit);
};

window.txFmt = function(n) {
  return n.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

window.categoriseStatement = function(rawText) {
  const transactions = window.txParseTransactions(rawText);
  const summary = window.txSummarise(transactions);
  return { transactions, summary };
};