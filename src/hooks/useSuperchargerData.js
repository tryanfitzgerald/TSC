import { useState, useEffect, useCallback } from 'react';
import { fallbackSuperchargers, midwestStates } from '../data/assumptions';

const CACHE_KEY = 'supercharger_data';
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

function inferChargerType(powerKw) {
  if (powerKw >= 250) return 'V4';
  if (powerKw >= 150) return 'V3';
  if (powerKw > 0) return 'V2';
  return 'V2/V3';
}

function getCachedData() {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (!cached) return null;
    const { data, timestamp } = JSON.parse(cached);
    if (Date.now() - timestamp > CACHE_TTL) {
      localStorage.removeItem(CACHE_KEY);
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

function setCachedData(data) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ data, timestamp: Date.now() }));
  } catch { /* localStorage full or unavailable */ }
}

export function useSuperchargerData() {
  const [sites, setSites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastFetched, setLastFetched] = useState(null);
  const [usingFallback, setUsingFallback] = useState(false);

  const fetchData = useCallback(async (force = false) => {
    setLoading(true);
    setError(null);

    if (!force) {
      const cached = getCachedData();
      if (cached) {
        setSites(cached);
        setLastFetched(new Date());
        setLoading(false);
        return;
      }
    }

    try {
      const response = await fetch('https://supercharge.info/service/supercharge/allSites');
      if (!response.ok) throw new Error(`API returned ${response.status}`);
      const raw = await response.json();

      const processed = raw
        .filter(s => s.gps && s.address)
        .map(s => ({
          id: s.id,
          name: s.name || `${s.address.city}, ${s.address.state}`,
          status: s.status || 'OPEN',
          stallCount: s.stallCount || 0,
          powerKilowatt: s.powerKilowatt || 0,
          lat: s.gps.latitude,
          lng: s.gps.longitude,
          city: s.address.city || '',
          state: s.address.state || '',
          country: s.address.country || '',
          region: s.address.region || '',
          openDate: s.openDate || null,
          chargerType: s.chargerType || inferChargerType(s.powerKilowatt || 0),
        }));

      setCachedData(processed);
      setSites(processed);
      setLastFetched(new Date());
      setUsingFallback(false);
    } catch (err) {
      console.error('Failed to fetch supercharger data:', err);
      setError(err.message);
      // Use fallback data
      const fallback = fallbackSuperchargers.map(s => ({
        id: s.id,
        name: s.name,
        status: s.status,
        stallCount: s.stallCount,
        powerKilowatt: s.powerKilowatt,
        lat: s.gps.latitude,
        lng: s.gps.longitude,
        city: s.address.city,
        state: s.address.state,
        country: s.address.country,
        region: 'North America',
        openDate: s.openDate,
        chargerType: s.chargerType || inferChargerType(s.powerKilowatt),
      }));
      setSites(fallback);
      setUsingFallback(true);
      setLastFetched(new Date());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  return { sites, loading, error, lastFetched, usingFallback, refresh: () => fetchData(true) };
}
