// Every card with a heading can be collapsed by tapping the heading; the choice is remembered per page.
const KEY = 'wfd-collapsed';
let saved = {};
try { saved = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { saved = {}; }
const keyOf = (head) => (location.hash || '#plan') + '|' + head.textContent.replace(/[\d$.,()·]+/g, '').replace(/\s+/g, ' ').trim().slice(0, 40);

function setup(card) {
  if (card.dataset.col || card.closest('.modal') || card.classList.contains('nocollapse')) return;
  const head = card.firstElementChild;
  if (!head || !(head.matches('h1,h2,h3,h4') || (head.matches('.spread,.row,div') && head.querySelector(':scope > h2, :scope > h3, :scope > div > h3, :scope > b')))) return;
  if (card.children.length < 2) return;
  card.dataset.col = '1';
  head.classList.add('card-head');
  head.setAttribute('role', 'button');
  head.setAttribute('aria-expanded', 'true');
  const k = keyOf(head);
  if (saved[k]) { card.classList.add('collapsed'); head.setAttribute('aria-expanded', 'false'); }
  head.addEventListener('click', (e) => {
    const ctl = e.target.closest('button, a, input, select, label, textarea'); if (ctl && head.contains(ctl)) return;
    const on = card.classList.toggle('collapsed');
    head.setAttribute('aria-expanded', String(!on));
    if (on) saved[k] = 1; else delete saved[k];
    try { localStorage.setItem(KEY, JSON.stringify(saved)); } catch {}
  });
}
export function enableCollapse(root = document.body) {
  const run = () => root.querySelectorAll('.card:not([data-col])').forEach(setup);
  run();
  let t = 0;
  new MutationObserver(() => { cancelAnimationFrame(t); t = requestAnimationFrame(run); }).observe(root, { childList: true, subtree: true });
}
