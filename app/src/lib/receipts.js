var NOT_FOUND_DAYS = 30;     // skip a store for an item this long after "not found"
var RECEIPT_FRESH_DAYS = 14; // price checks won't overwrite a receipt price newer than this

/* ======================= pure helpers (no Google services) ======================= */

var RECEIPT_SKIP_ = /\b(sub\s*total|subtotal|total|tax|balance|change|cash|visa|mastercard|amex|debit|credit|card|tender|payment|approved|auth|ref\s*#|account|acct|items?\s+sold|savings\s+summary|you\s+saved|rewards?|points|thank|member|bottle\s+dep|crv)\b/i;
var STOP_ = { fresh: 1, the: 1, and: 1, small: 1, large: 1, each: 1, pack: 1, cup: 1, dry: 1, half: 1, gallon: 1, can: 1, cans: 1, bag: 1, jar: 1, pint: 1, bunch: 1, or: 1 };

function money_(s) { return Math.round(parseFloat(String(s).replace(/[$,\s]/g, '')) * 100) / 100; }

/**
 * Turn OCR text into receipt lines: [{text, price}] plus total/date.
 * Handles prices on the same line, discount lines (applied to the item above),
 * and receipts where OCR puts all names first and all prices after.
 */
function parseReceiptText(raw) {
  var lines = String(raw || '').split(/\r?\n/).map(function (l) { return l.replace(/\s+/g, ' ').trim(); }).filter(String);
  var priceAtEnd = /(-?\$?\s?\d{1,4}[.,]\d{2})\s*(-)?\s*(?:[A-Z]{1,2}|\*|[A-Z]\s?[A-Z])?\s*$/;
  var onlyPrice = /^-?\$?\s?\d{1,4}[.,]\d{2}\s*-?\s*(?:[A-Z]{1,2}|\*)?$/;
  var out = [], total = null, date = null, names = [], prices = [];

  lines.forEach(function (l) {
    var dm = l.match(/\b(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})\b/);
    if (dm && !date) { var y = dm[3].length === 2 ? '20' + dm[3] : dm[3]; date = y + '-' + ('0' + dm[1]).slice(-2) + '-' + ('0' + dm[2]).slice(-2); }
    var m = l.match(priceAtEnd);
    var hasLetters = /[A-Za-z]{2,}/.test(l.replace(priceAtEnd, ''));
    if (/\btotal\b/i.test(l) && !/sub\s*total|subtotal/i.test(l) && m) { total = Math.abs(money_(m[1])); return; }
    if (RECEIPT_SKIP_.test(l)) return;
    if (onlyPrice.test(l)) { prices.push(money_(l.match(/-?\$?\s?\d{1,4}[.,]\d{2}/)[0]) * (/-\s*$/.test(l) ? -1 : 1)); return; }
    if (m && hasLetters) {
      var p = money_(m[1]) * (m[2] ? -1 : 1);
      var text = l.replace(priceAtEnd, '').trim();
      if (p < 0 || /\b(sav|disc|coupon|promo|off)\b/i.test(text)) {   // discount: apply to the item above
        if (out.length) out[out.length - 1].price = Math.round((out[out.length - 1].price - Math.abs(p)) * 100) / 100;
        return;
      }
      out.push({ text: text, price: p });
      return;
    }
    if (hasLetters && !/\d{3,}\s*$/.test(l)) names.push(l);
  });

  // Column-split OCR: names and prices came out separately — pair them up in order.
  // Store name/address lines come first, so line them up from the bottom.
  if (out.length < 3 && names.length >= 3 && prices.length >= 3) {
    var n = Math.min(names.length, prices.length), nOff = names.length - n, pOff = prices.length - n;
    for (var i = 0; i < n; i++) if (prices[pOff + i] > 0) out.push({ text: names[nOff + i], price: prices[pOff + i], paired: true });
  }
  out.forEach(function (o, i) { o.i = i; });
  return { lines: out, total: total, date: date };
}

function keywords_(item) {
  var words = [];
  [item.name, item.q].concat((item.must || []).map(function (m) { return m.replace(/\|/g, ' '); })).forEach(function (s) {
    String(s || '').toLowerCase().split(/[^a-z]+/).forEach(function (w) { if (w.length >= 3 && !STOP_[w] && words.indexOf(w) < 0) words.push(w); });
  });
  return words;
}
function devowel_(w) { return w.charAt(0) + w.slice(1).replace(/[aeiou]/g, ''); }

/** How well a receipt line matches an item (0 = not at all). Handles receipt abbreviations like "GRK YOG". */
function lineScore_(text, keys) {
  var toks = String(text).toLowerCase().split(/[^a-z]+/).filter(function (t) { return t.length >= 2; });
  var score = 0;
  keys.forEach(function (k) {
    var best = 0;
    toks.forEach(function (t) {
      var s = 0;
      if (t === k || t === k + 's' || t + 's' === k) s = 3;
      else if (t.length >= 3 && k.indexOf(t) === 0) s = 2;                 // YOG → yogurt
      else if (k.length >= 4 && t.indexOf(k.slice(0, 4)) === 0) s = 2;     // CRANBERRIES → cranberr
      else if (t.length >= 3 && devowel_(k).indexOf(t) === 0) s = 2;       // GRK → greek, BTR → butter
      if (s > best) best = s;
    });
    score += best;
  });
  return score;
}

/** Best receipt line for each item (each line used once, strongest matches first). */
function matchReceipt(lines, items) {
  var pairs = [];
  items.forEach(function (it) {
    var keys = keywords_(it);
    lines.forEach(function (l) { var s = lineScore_(l.text, keys); if (s >= 2) pairs.push({ id: it.id, i: l.i, s: s }); });
  });
  pairs.sort(function (a, b) { return b.s - a.s; });
  var usedItem = {}, usedLine = {}, out = {};
  pairs.forEach(function (p) {
    if (usedItem[p.id] || usedLine[p.i]) return;
    usedItem[p.id] = usedLine[p.i] = true;
    out[p.id] = { i: p.i, score: p.s, price: lines[p.i].price, text: lines[p.i].text, count: 1 };
  });
  // Same product rung up more than once (2× squash, 2 cans of beans): add those lines together.
  var norm = function (t) { return String(t).toLowerCase().replace(/[^a-z]/g, ''); };
  Object.keys(out).forEach(function (id) {
    var o = out[id];
    lines.forEach(function (l) {
      if (!usedLine[l.i] && norm(l.text) === norm(o.text)) {
        usedLine[l.i] = true; o.count++; o.price = Math.round((o.price + l.price) * 100) / 100;
      }
    });
    if (o.count > 1) o.text = o.text + ' ×' + o.count;
  });
  return out;
}

/** Planned-vs-paid summary for one receipt. */
function receiptSummary_(rows) {
  var compared = rows.filter(function (r) { return r.status === 'found' && r.paid != null && r.planned != null; });
  var planned = 0, paid = 0, close = 0, misses = [];
  compared.forEach(function (r) {
    planned += r.planned; paid += r.paid;
    var d = r.paid - r.planned;
    if (Math.abs(d) <= Math.max(0.25, r.planned * 0.05)) close++; else misses.push({ name: r.name, planned: r.planned, paid: r.paid, diff: Math.round(d * 100) / 100 });
  });
  misses.sort(function (a, b) { return Math.abs(b.diff) - Math.abs(a.diff); });
  return {
    compared: compared.length, accurate: close,
    accuracyPct: compared.length ? Math.round(close / compared.length * 100) : null,
    planned: Math.round(planned * 100) / 100, paid: Math.round(paid * 100) / 100,
    diff: Math.round((paid - planned) * 100) / 100,
    notFound: rows.filter(function (r) { return r.status === 'notfound'; }).map(function (r) { return r.name; }),
    misses: misses.slice(0, 8)
  };
}


export { parseReceiptText, matchReceipt, receiptSummary_, NOT_FOUND_DAYS, RECEIPT_FRESH_DAYS };
