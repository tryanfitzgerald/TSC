import React, { useState, useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import { statusColors, shorewoodPortfolio, shorewoodSites, competitiveAlerts } from '../data/assumptions';
import { haversineDistance } from '../utils/financialModel';
import { geocodeAll } from '../hooks/useGeocode';
import AmenityPopup from './AmenityPopup';

function FlyTo({ center, zoom }) {
  const map = useMap();
  React.useEffect(() => {
    if (center) map.flyTo(center, zoom || 13, { duration: 1 });
  }, [center, zoom, map]);
  return null;
}

function StatusBadge({ status }) {
  const color = statusColors[status] || '#888';
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium" style={{ backgroundColor: color + '22', color, border: `1px solid ${color}44` }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }}></span>
      {status}
    </span>
  );
}

// Info tooltip component like Easy Z's (i) buttons
function InfoTip({ text }) {
  const [show, setShow] = useState(false);
  return (
    <span className="relative inline-block ml-1">
      <span
        className="inline-flex items-center justify-center w-4 h-4 rounded-full border border-navy-700 text-[9px] text-muted cursor-help hover:text-white hover:border-accent-teal transition-colors"
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
      >i</span>
      {show && (
        <div className="absolute z-50 left-6 top-0 w-48 p-2 bg-navy-800 border border-navy-700 rounded text-[10px] text-muted shadow-xl">
          {text}
        </div>
      )}
    </span>
  );
}

// Competitor pin address for geocoding
const COMPETITOR_ADDRESS = '1446 E Golf Rd, Schaumburg, IL 60173';
const COMPETITOR_FALLBACK = { lat: 42.0351, lng: -88.0378 };

export default function MapView({ superchargerData }) {
  const { sites, loading, error, lastFetched, usingFallback, refresh } = superchargerData;
  const [search, setSearch] = useState('');
  const [statusFilters, setStatusFilters] = useState(['OPEN', 'PERMIT', 'CONSTRUCTION', 'PLAN', 'VOTING']);
  const [typeFilters, setTypeFilters] = useState(['V2', 'V3', 'V4', 'V2/V3']);
  const [radiusMiles, setRadiusMiles] = useState(0);
  const [radiusCenter, setRadiusCenter] = useState('meacham');
  const [flyTarget, setFlyTarget] = useState(null);
  const [flyZoom, setFlyZoom] = useState(null);
  const [baseMap, setBaseMap] = useState('dark');
  const [showShorewood, setShowShorewood] = useState(true);
  const [showCompetitor, setShowCompetitor] = useState(true);
  const [alertsDismissed, setAlertsDismissed] = useState([]);
  const [showTable, setShowTable] = useState(false);
  const [sortField, setSortField] = useState('distMeacham');
  const [sortDir, setSortDir] = useState('asc');

  // ── Auto-geocode Shorewood sites + competitor on first load ──
  const [geocodedSites, setGeocodedSites] = useState(shorewoodPortfolio);
  const [competitorCoords, setCompetitorCoords] = useState(COMPETITOR_FALLBACK);
  const [geocodeStatus, setGeocodeStatus] = useState('pending');

  useEffect(() => {
    const items = [
      ...shorewoodPortfolio.map(s => ({ address: s.address, fallbackLat: s.lat, fallbackLng: s.lng })),
      { address: COMPETITOR_ADDRESS, fallbackLat: COMPETITOR_FALLBACK.lat, fallbackLng: COMPETITOR_FALLBACK.lng },
    ];
    setGeocodeStatus('loading');
    geocodeAll(items).then(results => {
      // Update Shorewood sites
      const updated = shorewoodPortfolio.map(s => {
        const coords = results.get(s.address);
        return coords ? { ...s, lat: coords.lat, lng: coords.lng } : s;
      });
      setGeocodedSites(updated);
      // Update competitor
      const comp = results.get(COMPETITOR_ADDRESS);
      if (comp) setCompetitorCoords(comp);
      setGeocodeStatus('done');
    }).catch(() => setGeocodeStatus('error'));
  }, []);

  const tileUrls = {
    dark: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    streets: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    satellite: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  };

  // Filter sites
  const filteredSites = useMemo(() => {
    let filtered = sites.filter(s => s.country === 'United States' || s.country === 'USA');
    filtered = filtered.filter(s => statusFilters.includes(s.status));
    filtered = filtered.filter(s => typeFilters.includes(s.chargerType));
    if (search.trim()) {
      const q = search.toLowerCase();
      filtered = filtered.filter(s =>
        s.name?.toLowerCase().includes(q) ||
        s.city?.toLowerCase().includes(q) ||
        s.state?.toLowerCase().includes(q)
      );
    }
    if (radiusMiles > 0) {
      const center = shorewoodSites[radiusCenter];
      filtered = filtered.filter(s => haversineDistance(center.lat, center.lng, s.lat, s.lng) <= radiusMiles);
    }
    return filtered.map(s => ({
      ...s,
      distMeacham: haversineDistance(shorewoodSites.meacham.lat, shorewoodSites.meacham.lng, s.lat, s.lng),
      distGolf: haversineDistance(shorewoodSites.golf.lat, shorewoodSites.golf.lng, s.lat, s.lng),
    }));
  }, [sites, statusFilters, typeFilters, search, radiusMiles, radiusCenter]);

  const stats = useMemo(() => ({
    total: filteredSites.length,
    open: filteredSites.filter(s => s.status === 'OPEN').length,
    permit: filteredSites.filter(s => s.status === 'PERMIT').length,
    construction: filteredSites.filter(s => s.status === 'CONSTRUCTION').length,
    closed: filteredSites.filter(s => s.status === 'CLOSED').length,
    plan: filteredSites.filter(s => s.status === 'PLAN').length,
    v4: filteredSites.filter(s => s.chargerType === 'V4').length,
    v3: filteredSites.filter(s => s.chargerType === 'V3').length,
    v2: filteredSites.filter(s => s.chargerType === 'V2').length,
  }), [filteredSites]);

  // Nearest sites to Meacham
  const nearestToMeacham = useMemo(() => {
    return [...filteredSites]
      .filter(s => s.status === 'OPEN')
      .sort((a, b) => a.distMeacham - b.distMeacham)
      .slice(0, 8);
  }, [filteredSites]);

  const sortedSites = useMemo(() => {
    return [...filteredSites].sort((a, b) => {
      let va = a[sortField], vb = b[sortField];
      if (typeof va === 'string') { va = va.toLowerCase(); vb = (vb || '').toLowerCase(); }
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
  }, [filteredSites, sortField, sortDir]);

  const handleSort = (field) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('asc'); }
  };

  const toggleStatus = (s) => setStatusFilters(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);
  const toggleType = (t) => setTypeFilters(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);
  const markerRadius = (stallCount) => Math.min(18, Math.max(5, 4 + (stallCount || 0) / 4));

  const activeAlerts = competitiveAlerts.filter(a => !alertsDismissed.includes(a.id));

  return (
    <div className="flex h-full">
      {/* ═══ LEFT SIDEBAR ═══ */}
      <div className="w-[280px] bg-navy-800 border-r border-navy-700 flex flex-col flex-shrink-0 overflow-hidden">
        <div className="flex-1 overflow-y-auto">

          {/* Logo / Title */}
          <div className="p-4 border-b border-navy-700">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-lg bg-accent-gold/20 flex items-center justify-center text-lg">⚡</div>
              <div>
                <h1 className="text-sm font-bold text-accent-gold leading-tight">SHOREWOOD CHARGING</h1>
                <p className="text-[10px] text-muted leading-tight">Competitive Intelligence Map</p>
              </div>
            </div>
          </div>

          {/* Competitive Alerts */}
          {activeAlerts.length > 0 && (
            <div className="p-3 border-b border-navy-700">
              <div className="text-[10px] font-semibold text-muted uppercase tracking-wider mb-2">Alerts</div>
              {activeAlerts.map(alert => (
                <div key={alert.id} className={`p-2 rounded mb-1.5 text-[11px] ${alert.severity === 'high' ? 'bg-red-900/30 border border-red-800/40' : 'bg-navy-700/50 border border-navy-700'}`}>
                  <div className="flex items-start justify-between gap-1">
                    <div>
                      <span className="mr-1">{alert.severity === 'high' ? '⚠️' : 'ℹ️'}</span>
                      <span className="font-medium">{alert.title}</span>
                    </div>
                    <button onClick={() => setAlertsDismissed(p => [...p, alert.id])} className="text-muted hover:text-white text-xs leading-none mt-0.5">✕</button>
                  </div>
                  <div className="text-muted mt-1">{alert.details}</div>
                  <div className="text-[10px] text-muted mt-1 opacity-60">{alert.date} · Affects: {alert.affectsSite}</div>
                </div>
              ))}
            </div>
          )}

          {/* Search */}
          <div className="p-3 border-b border-navy-700">
            <div className="text-[10px] font-semibold text-muted uppercase tracking-wider mb-2">
              Search <InfoTip text="Filter by city, state, or station name" />
            </div>
            <input
              type="text" placeholder="City, state, or site name..."
              value={search} onChange={e => setSearch(e.target.value)}
              className="w-full bg-navy-900 border border-navy-700 rounded-lg px-3 py-2 text-xs text-white placeholder-muted/60 focus:outline-none focus:border-accent-teal/60 transition-colors"
            />
          </div>

          {/* Status Filter */}
          <div className="p-3 border-b border-navy-700">
            <div className="text-[10px] font-semibold text-muted uppercase tracking-wider mb-2">
              Status Filter <InfoTip text="Toggle station statuses on/off" />
            </div>
            <div className="flex flex-wrap gap-1">
              {Object.entries(statusColors).filter(([k]) => k !== 'PROPOSED').map(([status, color]) => (
                <button key={status} onClick={() => toggleStatus(status)}
                  className={`px-2 py-1 rounded text-[10px] font-medium transition-all ${
                    statusFilters.includes(status) ? 'text-white' : 'text-muted/30 line-through'
                  }`}
                  style={{
                    backgroundColor: statusFilters.includes(status) ? color + '25' : 'transparent',
                    border: `1px solid ${statusFilters.includes(status) ? color + '60' : '#2E4A6033'}`,
                  }}
                >
                  <span className="inline-block w-1.5 h-1.5 rounded-full mr-1" style={{ backgroundColor: color, opacity: statusFilters.includes(status) ? 1 : 0.3 }}></span>
                  {status}
                </button>
              ))}
            </div>
          </div>

          {/* Charger Type Filter */}
          <div className="p-3 border-b border-navy-700">
            <div className="text-[10px] font-semibold text-muted uppercase tracking-wider mb-2">
              Charger Type <InfoTip text="V4: 250+ kW, V3: 150-249 kW, V2: <150 kW" />
            </div>
            <div className="flex gap-1.5">
              {['V2', 'V3', 'V4'].map(t => (
                <button key={t} onClick={() => toggleType(t)}
                  className={`flex-1 py-1.5 rounded text-xs font-medium transition-all ${
                    typeFilters.includes(t)
                      ? 'bg-accent-teal/20 border-accent-teal/50 text-accent-teal'
                      : 'bg-navy-900 border-navy-700 text-muted/40'
                  } border`}
                >{t}</button>
              ))}
            </div>
          </div>

          {/* Radius Filter */}
          <div className="p-3 border-b border-navy-700">
            <div className="text-[10px] font-semibold text-muted uppercase tracking-wider mb-2">
              Radius <InfoTip text="Show only stations within this distance of a Shorewood site" />
            </div>
            <div className="flex gap-1.5 mb-2">
              {[0, 10, 25, 50, 100].map(r => (
                <button key={r} onClick={() => setRadiusMiles(r)}
                  className={`flex-1 py-1 rounded text-[10px] font-medium transition-all ${
                    radiusMiles === r ? 'bg-accent-teal/20 border-accent-teal/50 text-accent-teal' : 'bg-navy-900 border-navy-700 text-muted'
                  } border`}
                >{r === 0 ? 'All' : `${r}mi`}</button>
              ))}
            </div>
            {radiusMiles > 0 && (
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-muted">From:</span>
                <select value={radiusCenter} onChange={e => setRadiusCenter(e.target.value)} className="flex-1 bg-navy-900 border border-navy-700 rounded px-2 py-1 text-[10px] text-white">
                  <option value="meacham">Meacham</option>
                  <option value="golf">Golf Crossings</option>
                </select>
              </div>
            )}
          </div>

          {/* Base Map */}
          <div className="p-3 border-b border-navy-700">
            <div className="text-[10px] font-semibold text-muted uppercase tracking-wider mb-2">Base Map</div>
            <div className="flex gap-1.5">
              {[
                { key: 'dark', icon: '🌙', label: 'Dark' },
                { key: 'streets', icon: '🏘️', label: 'Streets' },
                { key: 'satellite', icon: '🛰️', label: 'Satellite' },
              ].map(m => (
                <button key={m.key} onClick={() => setBaseMap(m.key)}
                  className={`flex-1 py-2 rounded border text-center transition-all ${
                    baseMap === m.key ? 'bg-accent-teal/15 border-accent-teal/50 text-white' : 'bg-navy-900 border-navy-700 text-muted'
                  }`}>
                  <div className="text-sm">{m.icon}</div>
                  <div className="text-[10px]">{m.label}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Overlays */}
          <div className="p-3 border-b border-navy-700">
            <div className="text-[10px] font-semibold text-muted uppercase tracking-wider mb-2">Overlays</div>
            <div className="space-y-2">
              {geocodeStatus === 'loading' && (
                <div className="text-[10px] text-accent-amber mb-1">Geocoding addresses...</div>
              )}
              {geocodeStatus === 'done' && (
                <div className="text-[10px] text-accent-green mb-1">Locations verified via geocoder</div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted">Shorewood Sites (7)</span>
                <button onClick={() => setShowShorewood(!showShorewood)}
                  className={`w-9 h-5 rounded-full transition-colors flex items-center ${showShorewood ? 'bg-accent-gold' : 'bg-navy-700'}`}>
                  <div className={`w-3.5 h-3.5 rounded-full bg-white transition-transform mx-0.5 ${showShorewood ? 'translate-x-4' : ''}`}></div>
                </button>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted">Competitor Alert Pin</span>
                <button onClick={() => setShowCompetitor(!showCompetitor)}
                  className={`w-9 h-5 rounded-full transition-colors flex items-center ${showCompetitor ? 'bg-accent-red' : 'bg-navy-700'}`}>
                  <div className={`w-3.5 h-3.5 rounded-full bg-white transition-transform mx-0.5 ${showCompetitor ? 'translate-x-4' : ''}`}></div>
                </button>
              </div>
            </div>
          </div>

          {/* Statistics */}
          <div className="p-3 border-b border-navy-700">
            <div className="text-[10px] font-semibold text-muted uppercase tracking-wider mb-2">Statistics</div>
            <div className="space-y-1">
              {[
                { label: 'Total Visible', value: stats.total, color: 'text-white' },
                { label: 'Open', value: stats.open, color: 'text-green-400' },
                { label: 'Permit', value: stats.permit, color: 'text-amber-400' },
                { label: 'Construction', value: stats.construction, color: 'text-blue-400' },
                { label: 'Plan', value: stats.plan, color: 'text-gray-400' },
                { label: 'V4 Stations', value: stats.v4, color: 'text-accent-teal' },
                { label: 'V3 Stations', value: stats.v3, color: 'text-accent-teal' },
                { label: 'V2 Stations', value: stats.v2, color: 'text-muted' },
              ].map(({ label, value, color }) => (
                <div key={label} className="flex items-center justify-between text-xs">
                  <span className="text-muted">{label}</span>
                  <span className={`font-bold tabular-nums ${color}`}>{value.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Nearest to Meacham */}
          <div className="p-3 border-b border-navy-700">
            <div className="text-[10px] font-semibold text-muted uppercase tracking-wider mb-2">
              Nearest to Meacham <InfoTip text="Closest open Superchargers to the Meacham proposed site" />
            </div>
            <div className="space-y-1">
              {nearestToMeacham.map((site, i) => (
                <div key={site.id}
                  onClick={() => { setFlyTarget([site.lat, site.lng]); setFlyZoom(14); }}
                  className="flex items-center gap-2 p-1.5 rounded hover:bg-navy-700/50 cursor-pointer transition-colors"
                >
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                    i < 3 ? 'bg-accent-teal/20 text-accent-teal' : 'bg-navy-700 text-muted'
                  }`}>{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] text-white truncate">{site.city}, {site.state}</div>
                    <div className="text-[10px] text-muted">{site.stallCount} stalls · {site.chargerType}</div>
                  </div>
                  <span className="text-[10px] font-mono text-accent-teal tabular-nums">{site.distMeacham.toFixed(1)} mi</span>
                </div>
              ))}
            </div>
          </div>

          {/* Legend */}
          <div className="p-3 border-b border-navy-700">
            <div className="text-[10px] font-semibold text-muted uppercase tracking-wider mb-2">Legend</div>
            <div className="space-y-1 text-[10px]">
              {Object.entries(statusColors).map(([status, color]) => (
                <div key={status} className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full border" style={{ backgroundColor: color + '44', borderColor: color }}></span>
                  <span className="text-muted">{status === 'PROPOSED' ? 'Shorewood Proposed' : status.charAt(0) + status.slice(1).toLowerCase()}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Data Table Toggle */}
          <div className="p-3">
            <button onClick={() => setShowTable(!showTable)}
              className="w-full py-2 rounded border border-navy-700 text-xs text-muted hover:text-white hover:border-accent-teal/40 transition-colors">
              {showTable ? '▲ Hide Data Table' : '▼ Show Data Table'} ({filteredSites.length})
            </button>
            {usingFallback && <div className="text-[10px] text-accent-amber mt-2">⚠ Using cached fallback data</div>}
            {lastFetched && <div className="text-[10px] text-muted mt-1">Updated: {lastFetched.toLocaleTimeString()}</div>}
            <button onClick={refresh} disabled={loading}
              className="w-full mt-2 py-1.5 rounded bg-navy-700 hover:bg-accent-teal/20 text-xs text-muted hover:text-accent-teal transition-colors disabled:opacity-50">
              {loading ? '⏳ Loading...' : '🔄 Refresh Data'}
            </button>
          </div>
        </div>
      </div>

      {/* ═══ MAP + TABLE AREA ═══ */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Map */}
        <div className="flex-1 relative" style={{ minHeight: 0 }}>
          {loading && (
            <div className="absolute inset-0 bg-navy-900/80 flex items-center justify-center z-[1000]">
              <div className="text-center">
                <div className="animate-spin w-8 h-8 border-2 border-accent-teal border-t-transparent rounded-full mx-auto mb-3"></div>
                <p className="text-muted text-sm">Fetching live Supercharger data from supercharge.info...</p>
              </div>
            </div>
          )}

          <MapContainer center={[41.5, -89.0]} zoom={6} className="w-full h-full" scrollWheelZoom={true} zoomControl={false}>
            <TileLayer url={tileUrls[baseMap]} attribution='&copy; OpenStreetMap &copy; CARTO' />
            {flyTarget && <FlyTo center={flyTarget} zoom={flyZoom} />}

            <MarkerClusterGroup chunkedLoading maxClusterRadius={50}>
              {filteredSites.map(site => (
                <CircleMarker
                  key={site.id}
                  center={[site.lat, site.lng]}
                  radius={markerRadius(site.stallCount)}
                  pathOptions={{ color: statusColors[site.status] || '#888', fillColor: statusColors[site.status] || '#888', fillOpacity: 0.7, weight: 1 }}
                >
                  <Popup maxWidth={320} minWidth={260}>
                    <div className="text-sm min-w-[240px]">
                      <div className="font-bold text-white mb-1">{site.name}</div>
                      <div className="text-muted text-xs mb-2">{site.city}, {site.state}</div>
                      <StatusBadge status={site.status} />
                      <div className="grid grid-cols-2 gap-1 text-xs mt-2">
                        <span className="text-muted">Stalls:</span><span>{site.stallCount}</span>
                        <span className="text-muted">Type:</span><span>{site.chargerType}</span>
                        <span className="text-muted">Power:</span><span>{site.powerKilowatt} kW</span>
                        {site.openDate && <><span className="text-muted">Opened:</span><span>{site.openDate}</span></>}
                        <span className="text-muted">→ Meacham:</span><span>{site.distMeacham?.toFixed(1)} mi</span>
                        <span className="text-muted">→ Golf:</span><span>{site.distGolf?.toFixed(1)} mi</span>
                      </div>
                      <AmenityPopup lat={site.lat} lng={site.lng} />
                    </div>
                  </Popup>
                </CircleMarker>
              ))}
            </MarkerClusterGroup>

            {/* Shorewood Portfolio (gold) — using geocoded coordinates */}
            {showShorewood && geocodedSites.map(site => (
              <CircleMarker
                key={site.id}
                center={[site.lat, site.lng]}
                radius={site.modeled ? 12 : 9}
                pathOptions={{ color: '#F4A261', fillColor: '#F4A261', fillOpacity: 0.9, weight: 2.5 }}
              >
                <Popup maxWidth={320} minWidth={260}>
                  <div className="text-sm min-w-[240px]">
                    <div className="font-bold mb-1" style={{ color: '#F4A261' }}>★ {site.name}</div>
                    <div className="text-xs text-muted mb-1">{site.address}</div>
                    <StatusBadge status="PROPOSED" />
                    <div className="grid grid-cols-2 gap-1 text-xs mt-2">
                      <span className="text-muted">Posts:</span><span>{site.posts}</span>
                      <span className="text-muted">Type:</span><span>{site.type}</span>
                      <span className="text-muted">Property:</span><span>{site.property}</span>
                      <span className="text-muted">County:</span><span>{site.county}</span>
                      <span className="text-muted">Grant:</span><span className={site.grantStatus.includes('AWARDED') ? 'text-green-400' : ''}>{site.grantStatus}</span>
                    </div>
                    {site.notes && <div className="mt-2 text-xs text-muted border-t border-navy-700 pt-1">{site.notes}</div>}
                    {site.modeled && <div className="mt-1 text-xs" style={{ color: '#00B4D8' }}>📊 Modeled in Financial Projections</div>}
                    <AmenityPopup lat={site.lat} lng={site.lng} />
                  </div>
                </Popup>
              </CircleMarker>
            ))}

            {/* Competitor Alert (pulsing red) — using geocoded coordinates */}
            {showCompetitor && (
              <CircleMarker
                center={[competitorCoords.lat, competitorCoords.lng]}
                radius={14}
                pathOptions={{ color: '#E63946', fillColor: '#E63946', fillOpacity: 0.5, weight: 2, className: 'pulse-marker' }}
              >
                <Popup>
                  <div className="text-sm min-w-[220px]">
                    <div className="font-bold text-red-400 mb-1">⚠ Woodfield Village Green</div>
                    <div className="text-xs text-muted mb-1">1446 E Golf Rd, Schaumburg, IL 60173</div>
                    <StatusBadge status="PERMIT" />
                    <div className="mt-2 text-xs text-red-300">Tesla permit pin added March 6, 2026</div>
                    <div className="mt-1 text-xs text-muted">Adjacent to Golf Crossings · Est. 12–24 mo to open</div>
                  </div>
                </Popup>
              </CircleMarker>
            )}
          </MapContainer>
        </div>

        {/* Data Table (collapsible) */}
        {showTable && (
          <div className="bg-navy-900 border-t border-navy-700 overflow-auto" style={{ maxHeight: '250px' }}>
            <table className="w-full text-xs">
              <thead className="bg-navy-800 sticky top-0 z-10">
                <tr>
                  {[
                    { key: 'name', label: 'Site Name' },
                    { key: 'city', label: 'City' },
                    { key: 'state', label: 'ST' },
                    { key: 'status', label: 'Status' },
                    { key: 'stallCount', label: 'Stalls' },
                    { key: 'chargerType', label: 'Type' },
                    { key: 'powerKilowatt', label: 'kW' },
                    { key: 'distMeacham', label: '→ Meacham' },
                    { key: 'distGolf', label: '→ Golf' },
                  ].map(col => (
                    <th key={col.key} onClick={() => handleSort(col.key)} className="px-2 py-1.5 text-left text-muted cursor-pointer hover:text-white whitespace-nowrap text-[10px]">
                      {col.label} {sortField === col.key ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedSites.slice(0, 200).map(site => (
                  <tr key={site.id} onClick={() => { setFlyTarget([site.lat, site.lng]); setFlyZoom(14); }}
                    className="border-t border-navy-700/30 hover:bg-navy-800 cursor-pointer transition-colors">
                    <td className="px-2 py-1 font-medium text-[11px]">{site.name}</td>
                    <td className="px-2 py-1 text-muted">{site.city}</td>
                    <td className="px-2 py-1 text-muted">{site.state}</td>
                    <td className="px-2 py-1"><StatusBadge status={site.status} /></td>
                    <td className="px-2 py-1 tabular-nums">{site.stallCount}</td>
                    <td className="px-2 py-1">{site.chargerType}</td>
                    <td className="px-2 py-1 tabular-nums">{site.powerKilowatt}</td>
                    <td className="px-2 py-1 tabular-nums">{site.distMeacham?.toFixed(1)}</td>
                    <td className="px-2 py-1 tabular-nums">{site.distGolf?.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
