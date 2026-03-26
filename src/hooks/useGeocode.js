/**
 * Browser-side geocoding via Nominatim (OpenStreetMap).
 * Geocodes addresses on first load, caches in localStorage for 30 days.
 * Falls back to provided default coordinates if geocoding fails.
 */

const CACHE_KEY = 'shorewood_geocode_cache';
const CACHE_TTL = 30 * 24 * 60 * 60 * 1000; // 30 days

function getCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (Date.now() - (parsed._ts || 0) > CACHE_TTL) return {};
    return parsed;
  } catch { return {}; }
}

function setCache(data) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ ...data, _ts: Date.now() }));
  } catch {}
}

async function geocodeAddress(address) {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1&countrycodes=us`;
  const resp = await fetch(url, {
    headers: { 'User-Agent': 'ShorewoodChargingApp/1.0' }
  });
  if (!resp.ok) return null;
  const data = await resp.json();
  if (data && data.length > 0) {
    return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
  }
  return null;
}

/**
 * Geocode an array of { address, fallbackLat, fallbackLng } objects.
 * Returns a Map<address, { lat, lng }>.
 * Rate-limited to 1 request/second per Nominatim policy.
 */
export async function geocodeAll(items) {
  const cache = getCache();
  const results = new Map();
  const toFetch = [];

  for (const item of items) {
    if (cache[item.address]) {
      results.set(item.address, cache[item.address]);
    } else {
      toFetch.push(item);
    }
  }

  for (let i = 0; i < toFetch.length; i++) {
    const item = toFetch[i];
    try {
      // Rate limit: 1 req/sec
      if (i > 0) await new Promise(r => setTimeout(r, 1100));
      const coords = await geocodeAddress(item.address);
      if (coords) {
        results.set(item.address, coords);
        cache[item.address] = coords;
      } else {
        results.set(item.address, { lat: item.fallbackLat, lng: item.fallbackLng });
      }
    } catch {
      results.set(item.address, { lat: item.fallbackLat, lng: item.fallbackLng });
    }
  }

  setCache(cache);
  return results;
}
