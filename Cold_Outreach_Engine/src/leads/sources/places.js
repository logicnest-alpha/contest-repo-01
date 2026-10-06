// Google Maps (Places API - Text Search) for local-business ICPs: "dental clinics in Hyderabad",
// "digital marketing agencies in Pune". Returns companies with website + phone; run website
// enrichment afterwards to find their email addresses.
const settings = require('../../settings');
const { normalizeDomain } = require('../../util');

const FIELDS = [
  'places.id', 'places.displayName', 'places.formattedAddress', 'places.websiteUri', 'places.nationalPhoneNumber',
  'places.internationalPhoneNumber', 'places.rating', 'places.userRatingCount', 'places.primaryTypeDisplayName',
  'places.addressComponents', 'places.businessStatus', 'nextPageToken',
].join(',');

function component(place, type) {
  const c = (place.addressComponents || []).find((x) => (x.types || []).includes(type));
  return c ? c.longText : null;
}

// Up to `max` results (Google returns at most 60 per query, 20 per page).
async function textSearch(query, { max = 60, onlyWithWebsite = true } = {}) {
  const key = await settings.getSecret('google_places_api_key');
  if (!key) throw new Error('Add your Google Places API key in Settings > Integrations');
  const out = [];
  let pageToken;
  for (let page = 0; page < 3 && out.length < max; page++) {
    const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': FIELDS },
      body: JSON.stringify({ textQuery: query, pageSize: 20, ...(pageToken ? { pageToken } : {}) }),
      signal: AbortSignal.timeout(30000),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`Google Places ${res.status}: ${(data.error && data.error.message) || res.statusText}`);
    for (const p of data.places || []) {
      if (p.businessStatus && p.businessStatus !== 'OPERATIONAL') continue;
      if (onlyWithWebsite && !p.websiteUri) continue;
      out.push({
        company: p.displayName && p.displayName.text,
        website: p.websiteUri || null,
        company_domain: normalizeDomain(p.websiteUri) || null,
        phone: p.internationalPhoneNumber || p.nationalPhoneNumber || null,
        city: component(p, 'locality') || component(p, 'administrative_area_level_2'),
        country: component(p, 'country'),
        industry: p.primaryTypeDisplayName && p.primaryTypeDisplayName.text,
        custom: {
          address: p.formattedAddress || '',
          google_rating: p.rating != null ? String(p.rating) : '',
          google_reviews: p.userRatingCount != null ? String(p.userRatingCount) : '',
        },
      });
    }
    pageToken = data.nextPageToken;
    if (!pageToken) break;
    await new Promise((r) => setTimeout(r, 1500)); // next page token needs a moment
  }
  return out.slice(0, max);
}

module.exports = { textSearch };
