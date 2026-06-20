// ── Transaction Categories ────────────────────────────────────────────────
window.TX_CATEGORIES = [
  { name: 'Airtime & Data',        color: '#F97316', keywords: ['airtime', 'data sub', 'mtn', 'glo ', 'airtel', '9mobile'] },
  { name: 'Savings / Investment',  color: '#6366F1', keywords: ['auto-save', 'owealth', 'contribution', 'ppl,', 'savings', 'mpt|sav'] },
  { name: 'Transfers In',          color: '#22C55E', keywords: ['transfer from', 'trf from', 'cba_credit', 'inflow', 'received from'] },
  { name: 'Transfers Out',         color: '#EF4444', keywords: ['transfer to', 'trf to', 'trf|2mpt'] },
  { name: 'Withdrawals',           color: '#EC4899', keywords: ['withdrawal', 'cash out'] },
  { name: 'Interest',              color: '#14B8A6', keywords: ['interest_credit', 'interest'] },
  { name: 'Rewards / Cashback',    color: '#FBBF24', keywords: ['cb_csh_out', 'rewards cashout', 'cashback'] },
  { name: 'Fees & Charges',        color: '#A855F7', keywords: ['ussd_charge', 'ussd charge', 'sms alert', 'value added tax', 'kcas_sms', 'vat'] },
  { name: 'Other',                 color: '#94A3B8', keywords: [] },
];

// Reference codes like "MFDS...#/PERSON NAME:0801234567/#...CREDIT_0" are
// genuine person-to-person transfers, but never contain the word "transfer"
// — they only carry a generic MFDS code. Since the description alone can't
// tell us direction, we use the already-correctly-parsed debit/credit
// values (passed in here) to route these into Transfers In vs Transfers Out
// instead of letting them fall through to "Other".
window.txCategorise = function(description, debit, credit) {
  const lower = description.toLowerCase();
  for (const cat of window.TX_CATEGORIES) {
    if (cat.keywords.length === 0) continue;
    if (cat.keywords.some(kw => lower.includes(kw.toLowerCase()))) return cat.name;
  }
  if (lower.includes('mfds')) {
    return (credit || 0) > 0 ? 'Transfers In' : 'Transfers Out';
  }
  return 'Other';
};

// ── Find the nearest printed summary block before a given position ───────
// OPay-style: "Credit Count N Total Credit ₦X ... Debit Count N Total
// Debit ₦Y ... [Wallet|Savings] Account"
function findSummaryBefore(rawText, beforeIndex) {
  const sub = rawText.slice(0, beforeIndex);
  const re = /Credit\s+Count\s+(\d+)\s+Total\s+Credit\s+[^\d]*([\d,]+\.\d{2})[\s\S]{0,300}?Debit\s+Count\s+(\d+)\s+Total\s+Debit\s+[^\d]*([\d,]+\.\d{2})[\s\S]{0,200}?(Wallet|Savings|Current|Loan|Main)\s+Account/gi;
  let last = null;
  for (const m of sub.matchAll(re)) {
    last = {
      creditCount: parseInt(m[1], 10),
      totalCredit: parseFloat(m[2].replace(/,/g, '')),
      debitCount:  parseInt(m[3], 10),
      totalDebit:  parseFloat(m[4].replace(/,/g, '')),
      accountName: m[5] + ' Account',
    };
  }
  return last;
}

// ── Moniepoint-style summary: "Opening Balance X Total Debits Y
// Total Credits Z Closing Balance W" — no counts, no account-type label.
// Mismatch checking still works on totals even without transaction counts.
function findMoniepointSummary(rawText) {
  const re = /Opening\s+Balance\s+([\d,]+\.\d{2})[\s\S]{0,150}?Total\s+Debits?\s+([\d,]+\.\d{2})[\s\S]{0,150}?Total\s+Credits?\s+([\d,]+\.\d{2})[\s\S]{0,150}?Closing\s+Balance\s+([\d,]+\.\d{2})/i;
  const m = rawText.match(re);
  if (!m) return null;

  return {
    totalDebit:  parseFloat(m[2].replace(/,/g, '')),
    totalCredit: parseFloat(m[3].replace(/,/g, '')),
    accountName: 'Moniepoint Account',
  };
}

// ── Multi-account splitter ────────────────────────────────────────────────
window.splitAccountSections = function(rawText) {
  const headerRe = /Trans\.?\s*Time\s+Value\s+Date\s+Description/gi;
  const headers  = [...rawText.matchAll(headerRe)].map(m => m.index);

  if (headers.length === 0) {
    // Try OPay-style summary first, then Moniepoint-style as a second
    // attempt. Whichever matches gives us the ground-truth totals to
    // compare parsed transactions against.
    const opayMeta  = findSummaryBefore(rawText, rawText.length);
    const monieMeta = !opayMeta ? findMoniepointSummary(rawText) : null;
    const meta = opayMeta || monieMeta;

    return [{
      name:        meta?.accountName || 'Account',
      totalCredit: meta?.totalCredit ?? null,
      totalDebit:  meta?.totalDebit  ?? null,
      creditCount: meta?.creditCount ?? null, // Moniepoint prints no counts
      debitCount:  meta?.debitCount  ?? null,
      text:        rawText,
    }];
  }

  return headers.map((start, i) => {
    const end  = i + 1 < headers.length ? headers[i + 1] : rawText.length;
    const meta = findSummaryBefore(rawText, start);
    return {
      name:        meta?.accountName || `Account ${i + 1}`,
      totalCredit: meta?.totalCredit ?? null,
      totalDebit:  meta?.totalDebit  ?? null,
      creditCount: meta?.creditCount ?? null,
      debitCount:  meta?.debitCount  ?? null,
      text:        rawText.slice(start, end),
    };
  });
};

const MONTHS = '(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)';

// ── PRIMARY parser: match a COMPLETE row in one shot ──────────────────────
// Pattern: TransDate TransTime ValueDate Description Debit Credit Balance
// Channel — all captured together. Because the match requires the FULL
// row shape (including the trailing channel keyword as an anchor), it
// naturally skips over header text, summary blocks, and page-break noise
// without ever needing them stripped out first. There's nothing to
// accidentally merge or split across, since every match is self-contained
// and independently verified against the real row shape.
function parseOpayRows(rawText) {
  const rowRe = new RegExp(
    `(\\d{1,2}\\s+${MONTHS}\\s+\\d{4})\\s+` +   // trans date
    `(\\d{2}:\\d{2}:\\d{2})\\s+` +              // trans time
    `(\\d{1,2}\\s+${MONTHS}\\s+\\d{4})\\s+` +   // value date
    `(.+?)\\s+` +                               // description (lazy)
    `(--|[\\d,]+\\.\\d{2})\\s+` +                // debit
    `(--|[\\d,]+\\.\\d{2})\\s+` +                // credit
    `([\\d,]+\\.\\d{2})\\s+` +                   // balance after
    `(Mobile|Web|POS|USSD|Agent|Internet|Branch)\\b`, // channel
    'gi'
  );

  const transactions = [];
  for (const m of rawText.matchAll(rowRe)) {
    const desc = m[4].trim();
    if (!desc || desc.length < 3) continue;

    const debitRaw  = m[5];
    const creditRaw = m[6];

    let debit = 0, credit = 0;
    if (debitRaw === '--' && creditRaw === '--') {
      continue; // malformed row, skip
    } else if (debitRaw === '--') {
      credit = parseFloat(creditRaw.replace(/,/g, ''));
    } else if (creditRaw === '--') {
      debit = parseFloat(debitRaw.replace(/,/g, ''));
    } else {
      debit  = parseFloat(debitRaw.replace(/,/g, ''));
      credit = parseFloat(creditRaw.replace(/,/g, ''));
    }

    transactions.push({ description: desc, debit, credit, category: window.txCategorise(desc, debit, credit) });
  }
  return transactions;
}

// ── FALLBACK parser: date-split logic for non-OPay formats (e.g. Moniepoint) ──
function parseGenericRows(rawText) {
  const cleanText = rawText
    .replace(/Credit\s+Count\s+\d+\s+Total\s+Credit\s+[^\d]*([\d,]+\.\d{2})/gi, '')
    .replace(/Debit\s+Count\s+\d+\s+Total\s+Debit\s+[^\d]*([\d,]+\.\d{2})/gi,  '')
    .replace(/Closing\s+Balance\s+[^\d]*([\d,]+\.\d{2})/gi, '')
    .replace(/Opening\s+Balance\s+[^\d]*([\d,]+\.\d{2})/gi, '')
    .replace(/\bPeriod\s*:?\s*-?\s*\d{1,2}\s+\w+\s+\d{4}\s*-\s*\d{1,2}\s+\w+\s+\d{4}/gi, '')
    .replace(/\bPeriod\s*:\s*-?\s*/gi, '')
    .replace(/Account\s+Statement\s+Generated[^\n]*/gi, '')
    .replace(/Trans\.?\s*Time\s+Value\s+Date\s+Description[^\n]*/gi, '');

  const datePattern = new RegExp(
    `(\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\s*\\d{2}:\\s*\\d{2}|\\d{1,2}\\s+${MONTHS}\\s+\\d{4})`,
    'gi'
  );
  const parts = cleanText.split(datePattern).filter(s => s.trim());

  const transactions = [];

  for (let i = 0; i < parts.length - 1; i++) {
    if (!datePattern.test(parts[i])) continue;
    datePattern.lastIndex = 0;

    const nextContent = (parts[i + 1] || '').trim();
    if (/^\d{2}:\d{2}:\d{2}/.test(nextContent)) continue;

    const block = (parts[i] + ' ' + nextContent).trim();

    let desc = block
      .replace(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\s*/i, '')
      .replace(new RegExp(`^\\d{1,2}\\s+${MONTHS}\\s+\\d{4}\\s*`, 'i'), '')
      .replace(/(\s+(--|[\d,]+\.\d{2}))+\s*$/, '')
      .trim();

    if (/^(opening|closing|total|period|account|date|balance|debit|credit|channel|reference)/i.test(desc)) continue;
    if (!desc || desc.length < 3) continue;

    const numRe = /\d{1,3}(?:,\d{3})*\.\d{2}/g;
    const nums  = [...block.matchAll(numRe)].map(n => parseFloat(n[0].replace(/,/g, '')));

    let debit = 0, credit = 0;
    if (nums.length >= 3) {
      debit  = nums[nums.length - 3];
      credit = nums[nums.length - 2];
    } else if (nums.length === 2) {
      debit  = nums[0]; credit = nums[1];
    } else if (nums.length === 1) {
      const dl = desc.toLowerCase();
      if (dl.includes('transfer from') || dl.includes('interest') || dl.includes('inflow')) {
        credit = nums[0];
      } else {
        debit = nums[0];
      }
    } else continue;

    transactions.push({ description: desc, debit, credit, category: window.txCategorise(desc, debit, credit) });
  }

  datePattern.lastIndex = 0;
  return transactions;
}

// ── Moniepoint parser: anchor on the reference suffix, not the date ─────────
// Every Moniepoint row ends with a guaranteed "_CREDIT_N" or "_DEBIT_N"
// marker immediately followed by its debit, credit, and balance numbers.
// That marker is far more reliable than the date stamp: we've seen cases
// where pdf.js extracts a row's minute:second out of order, splitting it
// away from its own hour and landing it AFTER the description instead of
// right after the date. Anchoring on the suffix means a broken date can
// no longer cause two transactions' numbers to merge into one block.
function parseMoniepointRows(rawText) {
  const cleanText = rawText
    .replace(/Account\s+Statement\s+Account\s+Summary[\s\S]*?(?=\d{4}-\d{2}-\d{2}T)/i, '')
    .replace(/Opening\s+Balance\s+[\d,]+\.\d{2}/gi, '')
    .replace(/Total\s+Debits?\s+[\d,]+\.\d{2}/gi, '')
    .replace(/Total\s+Credits?\s+[\d,]+\.\d{2}/gi, '')
    .replace(/Closing\s+Balance\s+[\d,]+\.\d{2}/gi, '')
    .replace(/Date\s+Narration\s+Reference\s+Debit\s+Credit\s+Balance/gi, '');

  const endRe = /_(CREDIT|DEBIT)_\d+\s+(--|[\d,]+\.\d{2})\s+(--|[\d,]+\.\d{2})\s+([\d,]+\.\d{2})/gi;
  const matches = [...cleanText.matchAll(endRe)];

  const transactions = [];
  let cursor = 0;

  for (const m of matches) {
    const descText = cleanText.slice(cursor, m.index).trim();
    cursor = m.index + m[0].length;

    let desc = descText
      .replace(/^\d{4}-\d{2}-\d{2}T\d{2}:\s*\d{2}:\s*\d{2}\s*/i, '')
      .trim();

    if (!desc || desc.length < 3) continue;

    const debitRaw  = m[2];
    const creditRaw = m[3];
    const debit  = debitRaw  === '--' ? 0 : parseFloat(debitRaw.replace(/,/g, ''));
    const credit = creditRaw === '--' ? 0 : parseFloat(creditRaw.replace(/,/g, ''));

    transactions.push({ description: desc, debit, credit, category: window.txCategorise(desc, debit, credit) });
  }

  return transactions;
}

// ── Entry point for one account section ──────────────────────────────────────
window.txParseTransactions = function(rawText) {
  const opayRows = parseOpayRows(rawText);
  if (opayRows.length > 0) {
    return { transactions: opayRows };
  }

  const monieRows = parseMoniepointRows(rawText);
  if (monieRows.length > 0) {
    return { transactions: monieRows };
  }

  return { transactions: parseGenericRows(rawText) };
};

window.txSummarise = function(transactions) {
  const map = {};
  for (const tx of transactions) {
    if (!map[tx.category]) {
      map[tx.category] = { name: tx.category, totalDebit: 0, totalCredit: 0, count: 0, items: [] };
    }
    map[tx.category].totalDebit  += tx.debit;
    map[tx.category].totalCredit += tx.credit;
    map[tx.category].count++;
    map[tx.category].items.push(tx);
  }
  return Object.values(map).sort((a, b) => b.totalDebit - a.totalDebit);
};

window.txFmt = function(n) {
  return (n || 0).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

// ── Main entry point ────────────────────────────────────────────────────────
window.categoriseStatement = function(rawText) {
  const sections = window.splitAccountSections(rawText);

  const accounts = sections.map(sec => {
    const { transactions } = window.txParseTransactions(sec.text);
    const summary = window.txSummarise(transactions);

    const parsedCreditCount = transactions.filter(t => t.credit > 0).length;
    const parsedDebitCount  = transactions.filter(t => t.debit  > 0).length;
    const parsedTotalCredit = transactions.reduce((s, t) => s + t.credit, 0);
    const parsedTotalDebit  = transactions.reduce((s, t) => s + t.debit,  0);

    const mismatch = {
      creditCountExpected: sec.creditCount,
      creditCountParsed:   parsedCreditCount,
      debitCountExpected:  sec.debitCount,
      debitCountParsed:    parsedDebitCount,
      totalCreditExpected: sec.totalCredit,
      totalCreditParsed:   parsedTotalCredit,
      totalDebitExpected:  sec.totalDebit,
      totalDebitParsed:    parsedTotalDebit,
      hasMismatch:
        (sec.creditCount != null && sec.creditCount !== parsedCreditCount) ||
        (sec.debitCount  != null && sec.debitCount  !== parsedDebitCount)  ||
        (sec.totalCredit != null && Math.abs(sec.totalCredit - parsedTotalCredit) > 0.01) ||
        (sec.totalDebit  != null && Math.abs(sec.totalDebit  - parsedTotalDebit)  > 0.01),
    };

    return {
      name:        sec.name,
      totalCredit: sec.totalCredit,
      totalDebit:  sec.totalDebit,
      transactions,
      summary,
      mismatch,
    };
  });

  const transactions = accounts.flatMap(a => a.transactions);
  const summary      = window.txSummarise(transactions);
  return { accounts, transactions, summary };
};
