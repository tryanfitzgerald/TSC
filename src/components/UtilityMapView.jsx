import React, { useState, useEffect, useMemo, useRef } from 'react';
import { MapContainer, TileLayer, GeoJSON, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import {
  utilityIncentivesByState, defaultStateData, getTier, INCENTIVE_TIERS,
  V4_SPECS, US_STATES_GEOJSON_URL, ALL_US_STATES
} from '../data/utilityIncentives';
import { shorewoodPortfolio } from '../data/assumptions';
import { fmt } from '../utils/financialModel';

// ─── Gold star icon for Shorewood sites ───
const goldIcon = new L.DivIcon({
  className: '',
  html: '<div style="width:14px;height:14px;background:#F4A261;border:2px solid #fff;border-radius:50%;box-shadow:0 0 6px rgba(244,162,97,0.8)"></div>',
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

// ─── Format helpers ───
const fmtK = (v) => v >= 1000000 ? `$${(v/1000000).toFixed(1)}M` : v >= 1000 ? `$${(v/1000).toFixed(0)}K` : `$${v.toLocaleString()}`;

// ─── Map tile options ───
const TILES = {
  dark: { url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', attr: '&copy; CARTO' },
  streets: { url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', attr: '&copy; OSM' },
};

// ─── Fit bounds helper ───
function FitBounds({ geojson }) {
  const map = useMap();
  useEffect(() => {
    if (geojson) {
      const layer = L.geoJSON(geojson);
      map.fitBounds(layer.getBounds(), { padding: [20, 20] });
    }
  }, [geojson, map]);
  return null;
}

// ─── Main Component ───
export default function UtilityMapView() {
  const [geojsonData, setGeojsonData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [hoveredState, setHoveredState] = useState(null);
  const [selectedState, setSelectedState] = useState(null);
  const [baseTile, setBaseTile] = useState('dark');
  const [showShorewood, setShowShorewood] = useState(true);
  const [tierFilter, setTierFilter] = useState('all');
  const geojsonRef = useRef();

  // Fetch US states GeoJSON
  useEffect(() => {
    fetch(US_STATES_GEOJSON_URL)
      .then(r => { if (!r.ok) throw new Error('Failed to load'); return r.json(); })
      .then(data => { setGeojsonData(data); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, []);

  // State abbreviation lookup from GeoJSON feature name
  const stateNameToAbbr = useMemo(() => ({
    'Alabama':'AL','Alaska':'AK','Arizona':'AZ','Arkansas':'AR','California':'CA',
    'Colorado':'CO','Connecticut':'CT','Delaware':'DE','Florida':'FL','Georgia':'GA',
    'Hawaii':'HI','Idaho':'ID','Illinois':'IL','Indiana':'IN','Iowa':'IA','Kansas':'KS',
    'Kentucky':'KY','Louisiana':'LA','Maine':'ME','Maryland':'MD','Massachusetts':'MA',
    'Michigan':'MI','Minnesota':'MN','Mississippi':'MS','Missouri':'MO','Montana':'MT',
    'Nebraska':'NE','Nevada':'NV','New Hampshire':'NH','New Jersey':'NJ','New Mexico':'NM',
    'New York':'NY','North Carolina':'NC','North Dakota':'ND','Ohio':'OH','Oklahoma':'OK',
    'Oregon':'OR','Pennsylvania':'PA','Rhode Island':'RI','South Carolina':'SC',
    'South Dakota':'SD','Tennessee':'TN','Texas':'TX','Utah':'UT','Vermont':'VT',
    'Virginia':'VA','Washington':'WA','West Virginia':'WV','Wisconsin':'WI','Wyoming':'WY',
    'District of Columbia':'DC',
  }), []);

  function getStateData(abbr) {
    return utilityIncentivesByState[abbr] || { ...defaultStateData, state: abbr };
  }

  // GeoJSON style per feature
  function style(feature) {
    const abbr = stateNameToAbbr[feature.properties.name];
    const data = getStateData(abbr);
    const incentive = data.impact8v4?.totalPotential || 0;
    const tier = getTier(data.impact8v4?.bestUtilityRebate || 0);

    if (tierFilter !== 'all' && tier.tier !== tierFilter) {
      return { fillColor: '#1B2838', fillOpacity: 0.15, weight: 0.5, color: '#2E4A60' };
    }

    return {
      fillColor: tier.color,
      fillOpacity: hoveredState === abbr ? 0.6 : 0.35,
      weight: hoveredState === abbr ? 2.5 : 1,
      color: hoveredState === abbr ? '#fff' : '#2E4A60',
      dashArray: hoveredState === abbr ? '' : '2',
    };
  }

  function onEachFeature(feature, layer) {
    const abbr = stateNameToAbbr[feature.properties.name];
    layer.on({
      mouseover: () => setHoveredState(abbr),
      mouseout: () => setHoveredState(null),
      click: () => setSelectedState(abbr === selectedState ? null : abbr),
    });
  }

  // Re-style on hover/filter change
  useEffect(() => {
    if (geojsonRef.current) {
      geojsonRef.current.setStyle((feature) => style(feature));
    }
  }, [hoveredState, tierFilter]);

  // Data for the hovered or selected state
  const activeAbbr = selectedState || hoveredState;
  const activeData = activeAbbr ? getStateData(activeAbbr) : null;

  // Rankings
  const stateRankings = useMemo(() => {
    return Object.entries(utilityIncentivesByState)
      .map(([abbr, d]) => ({ abbr, name: d.state, total: d.impact8v4.totalPotential, rebate: d.impact8v4.bestUtilityRebate }))
      .sort((a, b) => b.total - a.total);
  }, []);

  return (
    <div className="flex h-full overflow-hidden">

      {/* ═══ LEFT SIDEBAR ═══ */}
      <div className="w-[300px] flex-shrink-0 bg-navy-900 border-r border-navy-700 overflow-y-auto"
        style={{ scrollbarWidth: 'thin', scrollbarColor: '#1B3A4B #0D1B2A' }}>
        <div className="p-4 space-y-4">

          {/* Title */}
          <div className="pb-3 border-b border-navy-700">
            <h2 className="text-sm font-bold text-white tracking-wide">Utility EV Incentives</h2>
            <p className="text-[10px] text-muted mt-0.5">DCFC programs for 8× Tesla V4 Superchargers</p>
          </div>

          {/* Reference: 8 V4 Stalls */}
          <div className="bg-navy-800 rounded-lg border border-navy-700 p-3">
            <div className="text-[10px] font-bold text-muted uppercase tracking-wider mb-2">Reference Configuration</div>
            <div className="space-y-1.5 text-[11px]">
              <div className="flex justify-between"><span className="text-muted">Stalls</span><span className="text-white font-mono">8× V4 (250kW)</span></div>
              <div className="flex justify-between"><span className="text-muted">Est. Project Cost</span><span className="text-white font-mono">{fmtK(V4_SPECS.totalProjectCost)}</span></div>
              <div className="flex justify-between"><span className="text-muted">§30C Credit (30%)</span><span className="text-accent-green font-mono">$270K</span></div>
              <div className="flex justify-between"><span className="text-muted">Annual kWh/stall</span><span className="text-white font-mono">108K</span></div>
            </div>
          </div>

          {/* Base map */}
          <div>
            <div className="text-[10px] font-bold text-muted uppercase tracking-wider mb-2">Base Map</div>
            <div className="flex gap-1">
              {Object.entries({ dark: 'Dark', streets: 'Streets' }).map(([k, v]) => (
                <button key={k} onClick={() => setBaseTile(k)}
                  className={`flex-1 px-2 py-1.5 rounded text-[11px] font-medium transition-colors ${
                    baseTile === k ? 'bg-accent-teal text-navy-900' : 'bg-navy-800 text-muted hover:text-white'
                  }`}>{v}</button>
              ))}
            </div>
          </div>

          {/* Tier filter */}
          <div>
            <div className="text-[10px] font-bold text-muted uppercase tracking-wider mb-2">Filter by Incentive Tier</div>
            <div className="space-y-1">
              <button onClick={() => setTierFilter('all')}
                className={`w-full text-left px-2 py-1 rounded text-[11px] transition-colors ${tierFilter === 'all' ? 'bg-accent-teal/15 text-white' : 'text-muted hover:text-white'}`}>
                All States
              </button>
              {INCENTIVE_TIERS.filter(t => t.tier !== 'none').map(t => (
                <button key={t.tier} onClick={() => setTierFilter(tierFilter === t.tier ? 'all' : t.tier)}
                  className={`w-full text-left px-2 py-1 rounded text-[11px] flex items-center gap-2 transition-colors ${
                    tierFilter === t.tier ? 'bg-accent-teal/15 text-white' : 'text-muted hover:text-white'
                  }`}>
                  <span className="w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: t.color }}></span>
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Overlays */}
          <div>
            <div className="text-[10px] font-bold text-muted uppercase tracking-wider mb-2">Overlays</div>
            <label className="flex items-center gap-2 text-[11px] text-muted cursor-pointer">
              <input type="checkbox" checked={showShorewood} onChange={e => setShowShorewood(e.target.checked)} className="accent-accent-teal" />
              Shorewood Portfolio Sites (7)
            </label>
          </div>

          {/* ═══ HOVER/SELECTED STATE DETAIL ═══ */}
          {activeData ? (
            <div className="bg-navy-800 rounded-lg border border-accent-teal/30 p-3 space-y-3">
              <div>
                <h3 className="text-sm font-bold text-white">{activeData.state || activeAbbr}</h3>
                <div className="text-[10px] text-muted">{activeAbbr} · {activeData.utilities?.length || 0} utilities with DCFC programs</div>
              </div>

              {/* Impact for 8 V4 */}
              <div className="bg-navy-900/60 rounded p-2 space-y-1">
                <div className="text-[10px] font-bold text-accent-teal uppercase">Impact: 8× V4 Superchargers</div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-muted">Best Utility Rebate</span>
                  <span className="font-mono text-accent-green">{fmtK(activeData.impact8v4.bestUtilityRebate)}</span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-muted">§30C Federal Credit</span>
                  <span className="font-mono text-white">{fmtK(activeData.impact8v4.federal30C)}</span>
                </div>
                <div className="flex justify-between text-[11px] pt-1 border-t border-navy-700">
                  <span className="text-muted font-semibold">Total Potential Incentive</span>
                  <span className="font-mono font-bold text-accent-gold">{fmtK(activeData.impact8v4.totalPotential)}</span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-muted">Est. Net Cost (after incentives)</span>
                  <span className={`font-mono font-bold ${activeData.impact8v4.netCost <= 0 ? 'text-accent-green' : 'text-white'}`}>
                    {activeData.impact8v4.netCost <= 0 ? '$0 (fully funded!)' : fmtK(activeData.impact8v4.netCost)}
                  </span>
                </div>
                {/* Coverage bar */}
                <div className="mt-1">
                  <div className="flex justify-between text-[9px] text-muted mb-0.5">
                    <span>Incentive Coverage</span>
                    <span>{Math.min(100, Math.round(activeData.impact8v4.totalPotential / V4_SPECS.totalProjectCost * 100))}%</span>
                  </div>
                  <div className="h-2 bg-navy-700 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-300"
                      style={{
                        width: `${Math.min(100, activeData.impact8v4.totalPotential / V4_SPECS.totalProjectCost * 100)}%`,
                        backgroundColor: activeData.impact8v4.totalPotential >= V4_SPECS.totalProjectCost ? '#2EC4B6' : '#F4A261',
                      }}></div>
                  </div>
                </div>
              </div>

              {/* Utilities list */}
              {activeData.utilities?.length > 0 && (
                <div>
                  <div className="text-[10px] font-bold text-muted uppercase mb-1.5">Utility Programs</div>
                  {activeData.utilities.map((u, i) => (
                    <div key={i} className="mb-2 last:mb-0">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-semibold text-white">{u.name}</span>
                        <span className="text-[10px] font-mono text-accent-teal">{fmtK(u.maxPerProject)}/project</span>
                      </div>
                      <div className="text-[10px] text-muted">{u.program}</div>
                      <div className="text-[10px] text-muted/70">{u.territory}</div>
                      <div className="text-[10px] text-muted/70">{u.type}</div>
                      {u.notes && <div className="text-[9px] text-muted/60 mt-0.5">{u.notes}</div>}
                      {u.active && u.expires && <div className="text-[9px] text-accent-amber">Expires: {u.expires}</div>}
                      {u.url && (
                        <a href={u.url} target="_blank" rel="noopener noreferrer"
                          className="text-[10px] text-accent-teal hover:underline inline-block mt-0.5">
                          Program details ↗
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* State programs */}
              {activeData.statePrograms?.length > 0 && (
                <div>
                  <div className="text-[10px] font-bold text-muted uppercase mb-1">State / Federal Programs</div>
                  {activeData.statePrograms.map((p, i) => (
                    <div key={i} className="text-[10px] text-muted">• {p}</div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="bg-navy-800 rounded-lg border border-navy-700 p-3 text-center">
              <div className="text-[11px] text-muted">Hover over or click a state to see utility incentive details and impact for 8 Tesla V4 Superchargers.</div>
            </div>
          )}

          {/* ═══ TOP STATES RANKING ═══ */}
          <div>
            <div className="text-[10px] font-bold text-muted uppercase tracking-wider mb-2">Top States by Total Incentive (8× V4)</div>
            <div className="space-y-1">
              {stateRankings.slice(0, 10).map((s, i) => {
                const tier = getTier(s.rebate);
                return (
                  <button key={s.abbr} onClick={() => setSelectedState(s.abbr)}
                    className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-[11px] transition-colors ${
                      selectedState === s.abbr ? 'bg-accent-teal/15 border border-accent-teal/30' : 'hover:bg-navy-800 border border-transparent'
                    }`}>
                    <span className="w-4 text-muted font-mono text-[10px]">{i + 1}.</span>
                    <span className="w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: tier.color }}></span>
                    <span className="flex-1 text-left text-white">{s.name}</span>
                    <span className="font-mono text-accent-gold text-[10px]">{fmtK(s.total)}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Legend */}
          <div className="pt-2 border-t border-navy-700">
            <div className="text-[10px] font-bold text-muted uppercase tracking-wider mb-2">Legend</div>
            {INCENTIVE_TIERS.map(t => (
              <div key={t.tier} className="flex items-center gap-2 mb-1">
                <span className="w-4 h-3 rounded-sm" style={{ backgroundColor: t.color }}></span>
                <span className="text-[10px] text-muted">{t.label}</span>
              </div>
            ))}
            <div className="flex items-center gap-2 mt-2">
              <div style={{ width: 14, height: 14, background: '#F4A261', borderRadius: '50%', border: '2px solid #fff' }}></div>
              <span className="text-[10px] text-muted">Shorewood proposed site</span>
            </div>
          </div>

          <div className="text-[9px] text-muted/50 pt-2 border-t border-navy-700">
            Data: AFDC, utility program pages, CPUC, state energy offices. §30C assumes 30% rate + PWA compliance. Incentive amounts are maximums; actual awards vary. Last updated Mar 2026.
          </div>

        </div>
      </div>

      {/* ═══ MAP ═══ */}
      <div className="flex-1 relative">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-navy-900 z-[1000]">
            <div className="text-center">
              <div className="w-8 h-8 border-2 border-accent-teal border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
              <div className="text-sm text-muted">Loading utility territory map...</div>
            </div>
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-navy-900 z-[1000]">
            <div className="text-center max-w-md p-6">
              <div className="text-red-400 text-sm font-semibold mb-2">Could not load state boundaries</div>
              <div className="text-xs text-muted mb-4">{error}</div>
              <button onClick={() => { setLoading(true); setError(null); fetch(US_STATES_GEOJSON_URL).then(r => r.json()).then(d => { setGeojsonData(d); setLoading(false); }).catch(e => { setError(e.message); setLoading(false); }); }}
                className="px-4 py-2 bg-navy-800 border border-navy-700 rounded text-xs text-muted hover:text-white">
                Retry
              </button>
            </div>
          </div>
        )}
        <MapContainer
          center={[39.5, -98.5]}
          zoom={4}
          className="h-full w-full"
          style={{ background: '#0D1B2A' }}
          zoomControl={false}
        >
          <TileLayer url={TILES[baseTile].url} attribution={TILES[baseTile].attr} />

          {geojsonData && (
            <GeoJSON
              ref={geojsonRef}
              data={geojsonData}
              style={style}
              onEachFeature={onEachFeature}
            />
          )}

          {geojsonData && <FitBounds geojson={geojsonData} />}

          {/* Shorewood portfolio sites */}
          {showShorewood && shorewoodPortfolio.map(site => (
            <Marker key={site.id} position={[site.lat, site.lng]} icon={goldIcon}>
              <Popup>
                <div style={{ color: '#0D1B2A', minWidth: 200 }}>
                  <strong>{site.name}</strong><br />
                  <span style={{ fontSize: 11 }}>{site.address}</span><br />
                  <span style={{ fontSize: 11 }}>{site.posts} stalls · {site.type} · {site.status}</span><br />
                  <span style={{ fontSize: 11 }}>{site.grantStatus}</span><br />
                  {site.notes && <span style={{ fontSize: 10, color: '#666' }}>{site.notes}</span>}
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>

        {/* Floating state name label */}
        {activeAbbr && activeData && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000] bg-navy-800/95 backdrop-blur border border-navy-700 rounded-lg px-4 py-2 text-center pointer-events-none">
            <div className="text-sm font-bold text-white">{activeData.state || activeAbbr}</div>
            <div className="text-xs text-accent-gold font-mono">
              Total Incentive: {fmtK(activeData.impact8v4.totalPotential)} for 8× V4
            </div>
            {activeData.utilities?.length > 0 && (
              <div className="text-[10px] text-muted mt-0.5">
                {activeData.utilities.map(u => u.name).join(' · ')}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
