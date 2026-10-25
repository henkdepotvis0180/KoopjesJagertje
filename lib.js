export class SourceError extends Error {
  constructor(message, status = 502) { super(message); this.status = status; }
}

export function searchOptions(params) {
  const query = (params.get('q') || '').trim();
  if (!query || query.length > 100) throw new SourceError('Vul een zoekterm in van maximaal 100 tekens.', 400);
  const raw = params.get('max');
  const max = raw === null || raw === '' ? null : Number(raw);
  if (max !== null && (!Number.isFinite(max) || max < 0 || max > 1000000)) throw new SourceError('Vul een geldige maximumprijs in.', 400);
  return { query, max };
}

function safeUrl(value, image = false) {
  if (typeof value !== 'string' || !value) return null;
  try {
    const url = new URL(value.startsWith('//') ? `https:${value}` : value, 'https://www.marktplaats.nl');
    if (url.protocol !== 'https:') return null;
    const hosts = image ? ['marktplaats.nl', 'marktplaats.com', 'mpcdn.net'] : ['marktplaats.nl'];
    return hosts.some(host => url.hostname === host || url.hostname.endsWith(`.${host}`)) ? url.href : null;
  } catch { return null; }
}

export function normalizeListing(item) {
  if (!item || typeof item !== 'object' || typeof item.title !== 'string') return null;
  const url = safeUrl(item.vipUrl || item.url);
  if (!url) return null;
  const cents = item.priceInfo?.priceCents;
  const priceType = item.priceInfo?.priceType;
  const price = typeof cents === 'number' && Number.isFinite(cents) && cents >= 0 && (!priceType || ['FIXED', 'MIN_BID', 'RESERVED'].includes(priceType)) ? cents / 100 : null;
  const image = safeUrl(item.imageUrls?.[0] || item.pictures?.[0]?.url, true);
  const city = item.location?.cityName;
  return {
    id: String(item.itemId || item.id || url), title: item.title.slice(0, 250),
    description: typeof item.description === 'string' ? item.description.slice(0, 350) : '',
    price, priceType: priceType || 'UNKNOWN', image, url,
    location: typeof city === 'string' ? city : 'Locatie onbekend',
    date: typeof item.date === 'string' ? item.date : null,
    source: 'Marktplaats'
  };
}

export async function searchMarktplaats(options, fetcher = fetch) {
  const url = new URL('https://www.marktplaats.nl/lrp/api/search');
  url.searchParams.set('query', options.query);
  url.searchParams.set('limit', '50');
  url.searchParams.set('offset', '0');
  url.searchParams.set('searchInTitleAndDescription', 'true');
  if (options.max !== null) url.searchParams.set('priceTo', String(Math.round(options.max * 100)));
  let response;
  try {
    response = await fetcher(url, {
      headers: { Accept: 'application/json', 'User-Agent': 'KoopjesJagertje/1.0 (local personal search)' },
      signal: AbortSignal.timeout(15000), redirect: 'error'
    });
  } catch {
    throw new SourceError('Marktplaats is niet bereikbaar. Controleer je internetverbinding of open de zoekopdracht op Marktplaats.');
  }
  if (!response.ok) {
    const message = response.status === 429 ? 'Marktplaats vraagt om even te wachten. Probeer het over een paar minuten opnieuw.'
      : 'Marktplaats staat deze openbare zoekopdracht momenteel niet toe. Je kunt de zoekopdracht rechtstreeks openen.';
    throw new SourceError(message);
  }
  let data;
  try { data = await response.json(); } catch { throw new SourceError('Marktplaats stuurde geen leesbare zoekresultaten. Open de zoekopdracht rechtstreeks.'); }
  if (!Array.isArray(data.listings)) throw new SourceError('De indeling van Marktplaats is gewijzigd. De koppeling moet worden bijgewerkt.');
  const seen = new Set();
  const listings = data.listings.map(normalizeListing).filter(item => {
    if (!item || seen.has(item.id)) return false;
    seen.add(item.id);
    return options.max === null || (item.price !== null && item.price <= options.max);
  });
  return { listings, fetchedAt: new Date().toISOString(), source: 'Marktplaats', sampled: 50 };
}
