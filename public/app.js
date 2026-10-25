const $ = (selector) => document.querySelector(selector);
const money = (price) => new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR', maximumFractionDigits: price % 1 ? 2 : 0 }).format(price);
const storageKey = 'koopjesjagertje-v1';
let storage = { favorites: [], searches: [] };
try {
  const saved = JSON.parse(localStorage.getItem(storageKey));
  if (saved && Array.isArray(saved.favorites) && Array.isArray(saved.searches)) storage = saved;
} catch { /* A fresh session also works when browser storage is unavailable. */ }
let listings = [], view = 'discover', demo = false, busy = false, toastTimer, currentSearch = null;

function node(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}
function toast(message) {
  $('#toast').textContent = message;
  $('#toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 3500);
}
function persist() {
  try { localStorage.setItem(storageKey, JSON.stringify(storage)); }
  catch { toast('Browseropslag is niet beschikbaar. Je wijzigingen blijven alleen deze sessie bewaard.'); }
}
function sourceUrl(query = $('#query').value) { return `https://www.marktplaats.nl/q/${encodeURIComponent(query.trim()).replaceAll('%20', '+')}/`; }
function updateFacebook() {
  $('#facebook-link').href = `https://www.facebook.com/marketplace/category/search/?query=${encodeURIComponent($('#query').value.trim())}`;
}
function isFavorite(item) { return storage.favorites.some(favorite => favorite.id === item.id); }
function toggleFavorite(item) {
  storage.favorites = isFavorite(item) ? storage.favorites.filter(favorite => favorite.id !== item.id) : [...storage.favorites, item];
  persist(); render();
}
function renderSaved() {
  const container = $('#saved-searches'); container.replaceChildren();
  storage.searches.forEach((search, index) => {
    const row = node('div', 'saved-row');
    const button = node('button', '', search.query);
    button.append(node('small', '', search.max === null ? 'Geen maximumprijs' : `Tot ${money(search.max)}`));
    button.addEventListener('click', () => {
      if (busy) return;
      $('#query').value = search.query; $('#max-price').value = search.max ?? '';
      setView('discover'); updateFacebook(); runSearch();
    });
    const remove = node('button', '', '×'); remove.setAttribute('aria-label', `Verwijder zoekopdracht ${search.query}`);
    remove.addEventListener('click', () => { storage.searches.splice(index, 1); persist(); renderSaved(); });
    row.append(button, remove); container.append(row);
  });
}
const icons = {
  console: '<rect x="21" y="30" width="110" height="65" rx="12" fill="#303c35"/><rect x="38" y="36" width="75" height="52" rx="3" fill="#687e70"/><path d="M31 30v65" stroke="#8fb4af" stroke-width="19"/><path d="M121 30v65" stroke="#c98470" stroke-width="19"/><circle cx="30" cy="50" r="5" fill="#364a44"/><circle cx="122" cy="72" r="5" fill="#634c43"/><path d="M60 58l12-9 18 15-12 11z" fill="#aebc9b"/>',
  camera: '<rect x="22" y="38" width="113" height="64" rx="10" fill="#353c35"/><path d="M47 39l9-13h37l10 13" fill="#4c5549"/><circle cx="80" cy="70" r="31" fill="#242f2a" stroke="#72796a" stroke-width="5"/><circle cx="80" cy="70" r="21" fill="#526b63"/><circle cx="80" cy="70" r="12" fill="#263e3b"/><circle cx="85" cy="64" r="5" fill="#a1b7a3"/><rect x="116" y="46" width="11" height="6" rx="2" fill="#b7bcaa"/>',
  chair: '<path d="M44 66L35 112M105 66l12 46" stroke="#6f705d" stroke-width="5"/><rect x="27" y="45" width="100" height="36" rx="17" fill="#b7a88a"/><rect x="35" y="10" width="84" height="63" rx="28" fill="#c9b99d"/><path d="M40 65h75" stroke="#ae9d7f" stroke-width="2"/>',
  speaker: '<rect x="39" y="10" width="75" height="104" rx="24" fill="#454e45"/><rect x="45" y="17" width="63" height="91" rx="20" fill="#626c5b"/><path d="M54 30h44M52 37h48M50 44h52M50 51h52M50 58h52M50 65h52M50 72h52M50 79h52M52 86h48M54 93h44" stroke="#475544" stroke-width="2"/><text x="77" y="68" text-anchor="middle" font-family="Arial" font-size="9" fill="#ccd1bd">SONOS</text>',
  bike: '<circle cx="34" cy="85" r="28" fill="none" stroke="#4c5b50" stroke-width="5"/><circle cx="119" cy="85" r="28" fill="none" stroke="#4c5b50" stroke-width="5"/><path d="M34 85l28-48 28 48H34l22-36h49l14 36-18-60h13M55 36h19" fill="none" stroke="#9d775a" stroke-width="5" stroke-linejoin="round"/>',
  lamp: '<path d="M70 36v73M48 111h45" stroke="#626d5a" stroke-width="5"/><path d="M39 48l12-34h39l17 34z" fill="#d6bd87"/><path d="M38 48h70" stroke="#bca36f" stroke-width="3"/>'
};
function art(item, index) {
  const box = node('div', `demo-art art-${index % 6}`);
  if (item.demo) {
    // SVG markup is selected solely from fixed local illustrations.
    box.innerHTML = `<svg viewBox="0 0 155 125" aria-hidden="true">${icons[item.art] || icons.console}</svg>`;
  } else box.append(node('span', 'illustration', '◇'));
  return box;
}
function validLink(value, image = false) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && (url.hostname === 'www.marktplaats.nl' || url.hostname.endsWith('.marktplaats.nl') || (image && (url.hostname === 'mpcdn.net' || url.hostname.endsWith('.mpcdn.net') || url.hostname.endsWith('.marktplaats.com'))));
  } catch { return false; }
}
function card(item, index) {
  const article = node('article', 'card');
  const imageBox = node('div', 'card-image');
  if (item.image && validLink(item.image, true)) {
    const img = node('img'); img.src = item.image; img.alt = item.title; img.loading = 'lazy'; img.referrerPolicy = 'no-referrer';
    img.addEventListener('error', () => img.replaceWith(art(item, index)), { once: true }); imageBox.append(img);
  } else imageBox.append(art(item, index));
  const maximum = currentSearch?.max;
  if (item.demo || (view === 'discover' && maximum !== null && maximum !== undefined && item.price !== null && item.price <= maximum)) imageBox.append(node('span', 'budget-tag', item.demo ? 'DEMO · VOORBEELD' : 'BINNEN JE BUDGET'));
  const favorite = node('button', `favorite-button${isFavorite(item) ? ' selected' : ''}`, isFavorite(item) ? '♥' : '♡');
  favorite.setAttribute('aria-label', `${isFavorite(item) ? 'Verwijder uit' : 'Bewaar bij'} favorieten: ${item.title}`);
  favorite.setAttribute('aria-pressed', String(isFavorite(item))); favorite.addEventListener('click', () => toggleFavorite(item)); imageBox.append(favorite);
  const content = node('div', 'card-content'); content.append(node('div', 'source-line', item.demo ? 'Voorbeeldadvertentie' : item.source));
  const heading = node('h3');
  if (!item.demo && validLink(item.url)) {
    const link = node('a', '', item.title); link.href = item.url; link.target = '_blank'; link.rel = 'noopener noreferrer'; heading.append(link);
  } else heading.textContent = item.title;
  content.append(heading);
  const meta = node('div', 'card-meta'); meta.append(node('span', '', `⌖ ${item.location}`)); content.append(meta);
  const bottom = node('div', 'card-price-row');
  const price = node('div', `card-price${item.price === null ? ' negotiable' : ''}`);
  if (item.priceType === 'MIN_BID') price.append(node('small', '', 'Bieden vanaf'));
  price.append(document.createTextNode(item.price === null ? 'Prijs op aanvraag' : money(item.price)));
  bottom.append(price);
  if (!item.demo && validLink(item.url)) {
    const link = node('a', 'card-link', '↗'); link.href = item.url; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.setAttribute('aria-label', `Bekijk ${item.title} op Marktplaats`); bottom.append(link);
  }
  content.append(bottom); article.append(imageBox, content); return article;
}
function render() {
  $('#favorite-count').textContent = storage.favorites.length;
  const items = [...(view === 'favorites' ? storage.favorites : listings)];
  const sort = $('#sort').value;
  if (sort !== 'default') items.sort((a, b) => a.price === null ? 1 : b.price === null ? -1 : (sort === 'price-asc' ? a.price - b.price : b.price - a.price));
  $('#result-count').textContent = items.length;
  $('#results').replaceChildren(...items.map(card));
  $('#empty-state').hidden = items.length > 0 || busy;
  $('#demo-notice').hidden = view === 'favorites' ? !items.some(item => item.demo) : !demo;
  $('#results-title').firstChild.textContent = view === 'favorites' ? 'Bewaarde vondsten ' : 'Jouw vondsten ';
  $('#empty-state h3').textContent = view === 'favorites' ? 'Je mooiste vondsten verdienen een hartje.' : currentSearch ? 'Nog geen vondsten voor deze zoekopdracht.' : 'Er ligt vast iets moois op je te wachten.';
  $('#empty-state p').textContent = view === 'favorites' ? 'Klik op het hartje bij een advertentie om hem hier te bewaren.' : currentSearch ? 'Probeer een andere zoekterm, verhoog je budget of open de zoekopdracht rechtstreeks op Marktplaats.' : 'Vul een item en je budget in en klik op ‘Zoek koopjes’. Of bekijk de demo om even rond te snuffelen.';
  $('#empty-demo').hidden = view === 'favorites';
  $('#results-description').textContent = view === 'favorites' ? 'Opgeslagen in deze browser. Controleer de actuele prijs op Marktplaats.' : demo ? 'Een voorproefje van jouw eigen koopjeshoek.' : currentSearch ? `Resultaten voor “${currentSearch.query}” · maximaal 50 advertenties opgehaald` : 'Zoek naar iets dat jij graag wilt hebben.';
}
function setView(next) {
  view = next;
  document.querySelectorAll('[data-view]').forEach(button => { button.classList.toggle('active', button.dataset.view === next); button.setAttribute('aria-current', button.dataset.view === next ? 'page' : 'false'); });
  $('#feedback').replaceChildren(); render();
}
function showDemo() {
  if (busy) return;
  setView('discover'); demo = true;
  const examples = [
    ['Nintendo Switch V2 + Joy-Cons', 165, 'Utrecht', 'console'],
    ['Sony Alpha 6000 met kitlens', 275, 'Amersfoort', 'camera'],
    ['Vintage fauteuil · mooie staat', 85, 'Rotterdam', 'chair'],
    ['Sonos One SL speaker', 95, 'Amsterdam', 'speaker'],
    ['Gazelle stadsfiets · 7 versnellingen', 140, 'Delft', 'bike'],
    ['Tafellamp met stoffen kap', 25, 'Haarlem', 'lamp']
  ];
  listings = examples.map(([title, price, location, icon], index) => ({ id: `demo-${index}`, title, price, location, art: icon, source: 'Demo', demo: true, priceType: 'FIXED' }));
  $('#feedback').replaceChildren(); render();
}
async function runSearch() {
  if (busy || !$('#search-form').reportValidity()) return;
  setView('discover'); demo = false; busy = true; listings = [];
  currentSearch = { query: $('#query').value.trim(), max: $('#max-price').value === '' ? null : Number($('#max-price').value) };
  updateFacebook(); $('#feedback').replaceChildren(node('div', 'feedback-message loading', 'We snuffelen op Marktplaats…'));
  $('#search-form button[type="submit"]').disabled = true; $('#demo-toggle').disabled = true;
  render();
  try {
    const params = new URLSearchParams({ q: currentSearch.query });
    if (currentSearch.max !== null) params.set('max', currentSearch.max);
    const response = await fetch(`/api/search?${params}`, { signal: AbortSignal.timeout(20000) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Zoeken is mislukt.');
    listings = result.listings; $('#feedback').replaceChildren();
  } catch (error) {
    const notice = node('div', 'feedback-message', error.name === 'TimeoutError' ? 'Het zoeken duurt te lang. Probeer het later opnieuw. ' : `${error.message} `);
    const link = node('a', '', 'Zoek rechtstreeks op Marktplaats ↗'); link.href = sourceUrl(currentSearch.query); link.target = '_blank'; link.rel = 'noopener noreferrer'; notice.append(link); $('#feedback').replaceChildren(notice);
  } finally {
    busy = false; $('#search-form button[type="submit"]').disabled = false; $('#demo-toggle').disabled = false; render();
  }
}
$('#search-form').addEventListener('submit', event => { event.preventDefault(); runSearch(); });
$('#query').addEventListener('input', updateFacebook);
$('#sort').addEventListener('change', render);
$('#save-search').addEventListener('click', () => {
  if (!$('#search-form').reportValidity()) return;
  const search = { query: $('#query').value.trim(), max: $('#max-price').value === '' ? null : Number($('#max-price').value) };
  if (!search.query) return;
  if (storage.searches.some(item => item.query === search.query && item.max === search.max)) return toast('Deze zoekopdracht is al bewaard.');
  storage.searches.push(search); persist(); renderSaved(); toast('Zoekopdracht bewaard. Er wordt alleen gezocht wanneer jij klikt.');
});
$('#demo-toggle').addEventListener('click', showDemo);
$('#empty-demo').addEventListener('click', showDemo);
$('#about-open').addEventListener('click', () => $('#about-dialog').showModal());
$('.dialog-close').addEventListener('click', () => $('#about-dialog').close());
$('#clear-data').addEventListener('click', () => {
  if (!confirm('Alle favorieten en bewaarde zoekopdrachten in deze browser wissen?')) return;
  storage = { favorites: [], searches: [] }; persist(); renderSaved(); render(); toast('Je bewaarde gegevens zijn gewist.');
});
document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => setView(button.dataset.view)));
renderSaved(); updateFacebook(); render();
