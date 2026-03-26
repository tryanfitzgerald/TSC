import React, { useState, useMemo } from 'react';
import {
  LineChart, Line, BarChart, Bar, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine, ComposedChart
} from 'recharts';
import { calculateProjections, fmt } from '../utils/financialModel';
import { sliderConfig, networkUtilizationData, SECTION_30C_DEADLINE, allSiteDefaults, competitiveAlerts } from '../data/assumptions';

// Site accent colors for charts (7 colors)
const SITE_COLORS = ['#00B4D8', '#F4A261', '#2EC4B6', '#E76F51', '#A78BFA', '#34D399', '#F472B6'];

// ─── Custom Tooltip ───
function DarkTooltip({ active, payload, label, formatter }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-navy-800 border border-navy-700 rounded-lg p-3 text-xs shadow-xl">
      <div className="font-medium text-white mb-1">{label}</div>
      {payload.map((entry, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }}></span>
          <span className="text-muted">{entry.name}:</span>
          <span className="font-mono text-white">{formatter ? formatter(entry.value) : entry.value?.toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Section Header ───
function SectionHeader({ title, subtitle }) {
  return (
    <div className="mb-4">
      <h2 className="text-[11px] font-bold text-muted uppercase tracking-[0.15em]">{title}</h2>
      {subtitle && <p className="text-xs text-muted/60 mt-0.5">{subtitle}</p>}
    </div>
  );
}

// ─── Metric Card ───
function MetricCard({ label, value, color = 'text-white', subtext, warning }) {
  return (
    <div className="bg-navy-800 rounded-lg border border-navy-700 p-3 text-center">
      <div className="text-[10px] text-muted uppercase tracking-wider mb-1">{label}</div>
      <div className={`text-lg font-bold tabular-nums ${color}`}>{value}</div>
      {subtext && <div className="text-[10px] text-muted mt-1">{subtext}</div>}
      {warning && <div className="text-[10px] text-accent-amber mt-1">{warning}</div>}
    </div>
  );
}

// ─── Main Component ───
export default function FinancialView({ sites, activeSiteIdx, setActiveSiteIdx, updateSite, toggleStalls, toggleSiteEnabled, resetSite, financingType, setFinancingType }) {
  const site = sites[activeSiteIdx];
  const update = (key, value) => updateSite(activeSiteIdx, key, value);

  // Compute projections for all 7 sites
  const allProj = useMemo(() => sites.map(s => calculateProjections(s)), [sites]);
  const proj = allProj[activeSiteIdx];
  const y1 = proj.yearly[0];

  const isSBA = financingType === 'sba';
  const isNone = financingType === 'none';

  // Helper to pick the right financing-type field
  const fin = (sbaVal, convVal, noneVal) => isNone ? noneVal : isSBA ? sbaVal : convVal;
  const finLabel = isNone ? 'CASH' : financingType.toUpperCase();

  const daysTo30C = Math.max(0, Math.floor((SECTION_30C_DEADLINE - new Date()) / (1000*60*60*24)));

  // Portfolio aggregates — only enabled sites with posts > 0
  const enabledSites = sites.map((s, i) => ({ ...s, idx: i })).filter(s => s.enabled !== false && s.posts > 0);
  const totalCredits30C = enabledSites.reduce((sum, s) => sum + allProj[s.idx].sourcesUses.grossCredits, 0);
  const getEquity = (p) => fin(p.sourcesUses.equityRequired_SBA, p.sourcesUses.equityRequired_Conv, p.sourcesUses.equityRequired_None);
  const totalEquity = enabledSites.reduce((sum, s) => sum + getEquity(allProj[s.idx]), 0);
  const total10YrNOI = enabledSites.reduce((sum, s) => sum + allProj[s.idx].yearly.reduce((acc, y) => acc + y.noi, 0), 0);
  const totalY1NOI = enabledSites.reduce((sum, s) => sum + allProj[s.idx].yearly[0].noi, 0);
  const activeSiteCount = enabledSites.length;

  const formatSliderValue = (key, val) => {
    const cfg = sliderConfig[key];
    if (!cfg) return val;
    if (cfg.format === 'currency') return `$${Number(val).toFixed(2)}`;
    if (cfg.format === 'currency_large') return `$${(val/1000).toFixed(0)}K`;
    if (cfg.format === 'percent') return `${(val * 100).toFixed(1)}%`;
    return Number(val).toFixed(1);
  };

  // Chart data — cumulative cash flow (only enabled sites)
  const cashFlowData = Array.from({ length: 10 }, (_, i) => {
    const row = { year: `Yr ${i + 1}` };
    let portfolioTotal = 0;
    sites.forEach((s, si) => {
      if (s.enabled === false || s.posts === 0) return;
      const cf = fin(allProj[si].cashFlows.cumulativeSBA, allProj[si].cashFlows.cumulativeConv, allProj[si].cashFlows.cumulativeNone);
      row[s.shortName] = cf[i];
      portfolioTotal += cf[i];
    });
    row['Portfolio'] = portfolioTotal;
    return row;
  });

  // NOI data (only enabled sites)
  const noiData = Array.from({ length: 10 }, (_, i) => {
    const row = { year: `Yr ${i + 1}` };
    sites.forEach((s, si) => {
      if (s.enabled === false || s.posts === 0) return;
      row[s.shortName] = allProj[si].yearly[i].noi;
    });
    return row;
  });

  // ROE data (only enabled sites)
  const roeData = Array.from({ length: 10 }, (_, i) => {
    const row = { year: `Yr ${i + 1}` };
    sites.forEach((s, si) => {
      if (s.enabled === false || s.posts === 0) return;
      const roe = fin(allProj[si].cashFlows.ROE_SBA, allProj[si].cashFlows.ROE_Conv, allProj[si].cashFlows.ROE_None);
      row[s.shortName] = roe[i] * 100;
    });
    return row;
  });

  // Sensitivity for active site only
  const sensitivityData = [];
  for (let u = 0.3; u <= 3.0; u += 0.1) {
    const t = calculateProjections({ ...site, year1Utilization: u }, 1);
    sensitivityData.push({
      util: u.toFixed(1),
      'NOI': t.yearly[0].noi,
    });
  }

  const networkData = networkUtilizationData;

  // CSV Export — all 7 sites
  const exportCSV = () => {
    const headers = ['Year','Site','Posts','Charging Rate','Daily Usage','Annual Gross Revenue','Processing Fee','Annual Net Revenue','kWh Dispensed','ComEd Rate','Tesla Fee','Energy Cost','LTSA Floor','Ground Lease','Parking Lease','Total OpEx','NOI','NOI Margin','Gross Margin/kWh'];
    const rows = [];
    sites.forEach((s, si) => {
      allProj[si].yearly.forEach(y => rows.push([y.year, s.shortName, s.posts, y.chargingRate.toFixed(3), y.dailyUsage.toFixed(3), y.annualGrossRevenue.toFixed(0), y.processingFeeAmt.toFixed(0), y.annualNetRevenue.toFixed(0), y.kwhDispensed.toFixed(0), y.comedRateY.toFixed(4), y.teslaFeeY.toFixed(4), y.energyCost.toFixed(0), y.ltsaFloorCheck.toFixed(0), y.groundLeaseY.toFixed(0), y.parkingLeaseY.toFixed(0), y.totalOpex.toFixed(0), y.noi.toFixed(0), y.noiMargin.toFixed(4), y.grossMarginKwh.toFixed(4)]));
    });
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'shorewood_7site_projections.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  // Breakeven for all sites
  const cushionColor = (c) => c === null ? 'text-red-400' : c > 0.3 ? 'text-green-400' : c > 0.1 ? 'text-amber-400' : 'text-red-400';
  const cushionBg = (c) => c === null ? 'bg-red-900/20' : c > 0.3 ? 'bg-green-900/20' : c > 0.1 ? 'bg-amber-900/20' : 'bg-red-900/20';

  return (
    <div className="flex h-full overflow-hidden">

      {/* ═══════════════════════════════════════════ */}
      {/* LEFT SIDEBAR — Site Selector + Controls     */}
      {/* ═══════════════════════════════════════════ */}
      <div className="w-[280px] flex-shrink-0 bg-navy-900 border-r border-navy-700 overflow-y-auto"
        style={{ scrollbarWidth: 'thin', scrollbarColor: '#1B3A4B #0D1B2A' }}>
        <div className="p-4 space-y-4">

          {/* Title */}
          <div className="pb-3 border-b border-navy-700">
            <h2 className="text-sm font-bold text-white tracking-wide">Revenue Modeler</h2>
            <p className="text-[10px] text-muted mt-0.5">7-Site Portfolio · Adjust inputs</p>
          </div>

          {/* ── ACTIVE SITE SELECTOR ── */}
          <div>
            <div className="text-[10px] font-bold text-muted uppercase tracking-wider mb-2">Sites ({activeSiteCount} active)</div>
            <div className="space-y-1">
              {sites.map((s, i) => {
                const isOff = s.enabled === false;
                const payback = fin(allProj[i].breakeven.paybackYear_SBA, allProj[i].breakeven.paybackYear_Conv, allProj[i].breakeven.paybackYear_None);
                return (
                <div key={s.id} className="flex items-center gap-1.5">
                  {/* On/Off toggle */}
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleSiteEnabled(i); }}
                    className={`w-7 h-4 rounded-full transition-colors flex items-center flex-shrink-0 ${isOff ? 'bg-navy-700' : 'bg-accent-green'}`}
                    title={isOff ? 'Enable site' : 'Disable site'}
                  >
                    <div className={`w-2.5 h-2.5 rounded-full bg-white transition-transform mx-0.5 ${isOff ? '' : 'translate-x-3'}`}></div>
                  </button>
                  {/* Site button */}
                  <button onClick={() => setActiveSiteIdx(i)}
                    className={`flex-1 text-left px-2 py-1.5 rounded text-[11px] transition-colors border ${
                      isOff ? 'opacity-40 bg-navy-800 border-navy-700 text-muted' :
                      activeSiteIdx === i
                        ? 'bg-accent-teal/15 border-accent-teal/40 text-white'
                        : 'bg-navy-800 border-navy-700 text-muted hover:text-white hover:border-navy-600'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className={`font-medium truncate ${isOff ? 'line-through' : ''}`} style={{ maxWidth: '120px' }}>{s.shortName}</span>
                      <div className="flex items-center gap-1.5">
                        {!isOff && s.posts > 0 && payback && <span className="text-[9px] text-accent-teal font-mono">{payback}yr</span>}
                        <span className={`font-mono text-[10px] ${isOff ? 'text-red-400' : s.posts === 0 ? 'text-red-400' : ''}`}>
                          {isOff ? 'OFF' : s.posts === 0 ? '0p' : `${s.posts}p`}
                        </span>
                      </div>
                    </div>
                    {activeSiteIdx === i && !isOff && (
                      <div className="text-[9px] text-muted mt-0.5 truncate">{s.address}</div>
                    )}
                  </button>
                </div>
                );
              })}
            </div>
          </div>

          {/* ── STALL COUNT TOGGLE ── */}
          <div>
            <div className="text-[10px] font-bold text-muted uppercase tracking-wider mb-2">
              Stalls — {site.shortName}
            </div>
            <div className="flex gap-1">
              {[0, 8, 16].map(n => (
                <button key={n} onClick={() => toggleStalls(activeSiteIdx, n)}
                  className={`flex-1 px-2 py-1.5 rounded text-[11px] font-medium transition-colors ${
                    site.posts === n
                      ? (n === 0 ? 'bg-red-500/80 text-white' : 'bg-accent-teal text-navy-900')
                      : 'bg-navy-800 text-muted hover:text-white'
                  }`}>{n === 0 ? 'None' : `${n} Stalls`}</button>
              ))}
            </div>
            {site.posts === 0 && <div className="text-[9px] text-red-400 mt-1">Site excluded from portfolio</div>}
          </div>

          {/* ── FINANCING ── */}
          <div>
            <div className="text-[10px] font-bold text-muted uppercase tracking-wider mb-2">Financing</div>
            <div className="flex gap-1">
              <button onClick={() => setFinancingType('sba')} className={`flex-1 px-2 py-1.5 rounded text-[11px] font-medium transition-colors ${financingType === 'sba' ? 'bg-accent-teal text-navy-900' : 'bg-navy-800 text-muted hover:text-white'}`}>SBA 504</button>
              <button onClick={() => setFinancingType('conv')} className={`flex-1 px-2 py-1.5 rounded text-[11px] font-medium transition-colors ${financingType === 'conv' ? 'bg-accent-teal text-navy-900' : 'bg-navy-800 text-muted hover:text-white'}`}>Conv.</button>
              <button onClick={() => setFinancingType('none')} className={`flex-1 px-2 py-1.5 rounded text-[11px] font-medium transition-colors ${financingType === 'none' ? 'bg-accent-gold text-navy-900' : 'bg-navy-800 text-muted hover:text-white'}`}>Cash</button>
            </div>
          </div>

          {/* ── SLIDERS ── */}
          <div>
            <div className="text-[10px] font-bold text-muted uppercase tracking-wider mb-3">Assumptions</div>
            <div className="space-y-3">
              {Object.entries(sliderConfig).map(([key, cfg]) => (
                <div key={key}>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[11px] text-muted leading-tight">{cfg.label}</label>
                    <span className="text-[11px] font-mono text-white tabular-nums">{formatSliderValue(key, site[key] ?? 0)}</span>
                  </div>
                  {cfg.warning && <div className="text-[9px] text-accent-amber mb-1">{cfg.warning}</div>}
                  {cfg.description && <div className="text-[9px] text-muted/60 mb-1">{cfg.description}</div>}
                  <input
                    type="range" min={cfg.min} max={cfg.max} step={cfg.step}
                    value={site[key] ?? cfg.min}
                    onChange={e => update(key, parseFloat(e.target.value))}
                    className="w-full h-1.5 bg-navy-700 rounded-lg appearance-none cursor-pointer accent-accent-teal"
                  />
                  {/* Show computed construction cost after installCostPerStall slider */}
                  {key === 'installCostPerStall' && (
                    <div className="mt-2 bg-navy-700/50 rounded px-2 py-1.5 flex justify-between items-center">
                      <span className="text-[10px] text-muted font-medium">Total Construction Cost</span>
                      <span className="text-[11px] font-mono font-bold text-accent-gold">{fmt.currencyK(site.constructionCost)}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* ── TOGGLES ── */}
          <div className="space-y-3">
            <div className="text-[10px] font-bold text-muted uppercase tracking-wider mb-1">Credits & Options</div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-muted">§30C Credit</span>
              <button onClick={() => update('apply30C', !site.apply30C)} className={`w-9 h-5 rounded-full transition-colors flex items-center ${site.apply30C ? 'bg-accent-teal' : 'bg-navy-700'}`}>
                <div className={`w-3.5 h-3.5 rounded-full bg-white transition-transform mx-0.5 ${site.apply30C ? 'translate-x-4' : ''}`}></div>
              </button>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-muted">Sell/Transfer Credits</span>
              <button onClick={() => update('sellCredits', !site.sellCredits)} className={`w-9 h-5 rounded-full transition-colors flex items-center ${site.sellCredits ? 'bg-accent-teal' : 'bg-navy-700'}`}>
                <div className={`w-3.5 h-3.5 rounded-full bg-white transition-transform mx-0.5 ${site.sellCredits ? 'translate-x-4' : ''}`}></div>
              </button>
            </div>
          </div>

          {/* ── RESET + EXPORT ── */}
          <div className="pt-2 space-y-2 border-t border-navy-700">
            <button onClick={() => resetSite(activeSiteIdx)} className="w-full px-3 py-1.5 text-[11px] text-muted hover:text-white bg-navy-800 hover:bg-navy-700 rounded transition-colors">
              Reset {site.shortName} Defaults
            </button>
            <button onClick={exportCSV} className="w-full px-3 py-1.5 text-[11px] text-muted hover:text-white bg-navy-800 hover:bg-navy-700 rounded transition-colors">
              Export All Sites CSV
            </button>
          </div>

          {/* ── QUICK STATS ── */}
          <div className="pt-2 border-t border-navy-700 space-y-2">
            <div className="text-[10px] font-bold text-muted uppercase tracking-wider">Yr 1 — {site.shortName} ({site.posts}p)</div>
            <div className="flex justify-between text-[11px]"><span className="text-muted">Net Revenue</span><span className="font-mono text-white">{fmt.currencyK(y1.annualNetRevenue)}</span></div>
            <div className="flex justify-between text-[11px]"><span className="text-muted">Energy Cost</span><span className="font-mono text-white">{fmt.currencyK(y1.energyCost)}</span></div>
            <div className="flex justify-between text-[11px]"><span className="text-muted">NOI</span><span className={`font-mono font-bold ${y1.noi > 0 ? 'text-accent-green' : 'text-accent-red'}`}>{fmt.currencyK(y1.noi)}</span></div>
            <div className="flex justify-between text-[11px]"><span className="text-muted">NOI Margin</span><span className={`font-mono ${y1.noiMargin > 0.2 ? 'text-accent-teal' : 'text-accent-amber'}`}>{fmt.percent(y1.noiMargin)}</span></div>
            <div className="flex justify-between text-[11px]"><span className="text-muted">Margin/kWh</span><span className="font-mono text-white">${y1.grossMarginKwh.toFixed(3)}</span></div>
            {(() => { const pb = fin(proj.breakeven.paybackYear_SBA, proj.breakeven.paybackYear_Conv, proj.breakeven.paybackYear_None); return (
            <div className="flex justify-between text-[11px]"><span className="text-muted">Payback</span><span className={`font-mono font-bold ${pb && pb <= 5 ? 'text-accent-green' : 'text-accent-amber'}`}>{pb ? `Year ${pb}` : '>10 Yrs'}</span></div>
            ); })()}
          </div>

        </div>
      </div>

      {/* ═══════════════════════════════════════════════════ */}
      {/* RIGHT MAIN CONTENT — Cards, Charts, Tables         */}
      {/* ═══════════════════════════════════════════════════ */}
      <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: 'thin', scrollbarColor: '#1B3A4B #0D1B2A' }}>
        <div className="p-6 space-y-6">

          {/* ═══ COMPETITIVE INTELLIGENCE ═══ */}
          <div>
            <SectionHeader title="Competitive Intelligence — Chicago North Suburbs" />
            <div className="bg-red-900/20 border border-red-800/40 rounded-lg p-3 mb-4">
              <p className="text-xs">
                <span className="font-bold text-red-400">New competitive entry detected:</span>{' '}
                <span className="text-muted">Tesla added a Supercharger pin at Woodfield Village Green (1446 E Golf Rd, Schaumburg) on March 6, 2026 — {Math.floor((new Date() - new Date('2026-03-06')) / (1000*60*60*24))} days ago. Adjacent to Golf Crossings. Status: permit/planning.</span>
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-navy-800 rounded-lg border border-navy-700 p-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-semibold">Nearest — Meacham Sites</h3>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-accent-teal/20 text-accent-teal border border-accent-teal/30">3.2 mi</span>
                </div>
                <h4 className="text-sm font-bold mb-1">Buffalo Grove Supercharger</h4>
                <p className="text-[10px] text-muted mb-2">1550 Deerfield Pkwy · 12 stalls · V3 250kW · 24/7</p>
                <div className="space-y-1 text-[10px]">
                  {[
                    { time: '12am–4am', tesla: '$0.20', nonTesla: '$0.28' },
                    { time: '4am–8am', tesla: '$0.24', nonTesla: '$0.34' },
                    { time: '8am–8pm (peak)', tesla: '$0.47', nonTesla: '$0.66' },
                    { time: '8pm–12am', tesla: '$0.40', nonTesla: '$0.56' },
                  ].map(row => (
                    <div key={row.time} className="flex items-center justify-between">
                      <span className="text-muted w-28">{row.time}</span>
                      <span className="text-accent-teal font-mono">T: {row.tesla}</span>
                      <span className="text-muted font-mono">NT: {row.nonTesla}</span>
                    </div>
                  ))}
                </div>
                <p className="text-[10px] text-muted mt-2 pt-2 border-t border-navy-700">$0.40/kWh model rate matches shoulder, 15% below peak.</p>
              </div>

              <div className="bg-navy-800 rounded-lg border border-navy-700 p-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-semibold">Nearest — Golf Crossings</h3>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-red-900/30 text-red-400 border border-red-800/40">Adjacent</span>
                </div>
                <h4 className="text-sm font-bold mb-1">Woodfield Village Green (planned)</h4>
                <p className="text-[10px] text-muted mb-2">1446 E Golf Rd, Schaumburg · Pin Mar 6, 2026 · Planning/permit</p>
                <div className="bg-amber-900/20 border border-amber-800/30 rounded p-2 text-[10px] text-muted mb-2">
                  Planning-stage. Tesla permit-to-open: 12–24 mo. First-mover advantage if commissioned by mid-2026.
                </div>
                <h4 className="text-xs font-bold mb-1">Rolling Meadows Supercharger</h4>
                <p className="text-[10px] text-muted mb-1">~4 mi · Existing open site</p>
                <h4 className="text-xs font-bold mb-1">Schaumburg area</h4>
                <p className="text-[10px] text-muted">Golf Rd corridor currently underserved per Tesla demand data.</p>
              </div>
            </div>
          </div>

          {/* ═══ PORTFOLIO SUMMARY CARDS ═══ */}
          <div>
            <SectionHeader title="Portfolio Summary — All 7 Sites" />
            <div className="grid grid-cols-4 gap-3 mb-4">
              <MetricCard label="Total Equity Required" value={fmt.currency(totalEquity)} subtext={`${finLabel} · ${activeSiteCount} sites · ${enabledSites.reduce((s,x) => s + x.posts, 0)} stalls`} color="text-accent-gold" />
              <MetricCard label="10-Yr Portfolio NOI" value={fmt.currencyM(total10YrNOI)} color="text-accent-green" />
              <MetricCard label="Year 1 Portfolio NOI" value={fmt.currency(totalY1NOI)} />
              <MetricCard label="§30C Credits" value={fmt.currency(totalCredits30C)} subtext={`${daysTo30C} days to deadline`} color={daysTo30C < 30 ? 'text-accent-red' : daysTo30C < 60 ? 'text-accent-amber' : 'text-accent-green'} />
            </div>
            {/* Per-site summary row */}
            <div className="grid grid-cols-7 gap-2">
              {sites.map((s, i) => {
                const p = allProj[i];
                const off = s.posts === 0 || s.enabled === false;
                const payback = fin(p.breakeven.paybackYear_SBA, p.breakeven.paybackYear_Conv, p.breakeven.paybackYear_None);
                return (
                  <div key={s.id}
                    className={`bg-navy-800 rounded-lg border p-2 text-center cursor-pointer transition-colors ${
                      off ? 'opacity-40 border-navy-700' : activeSiteIdx === i ? 'border-accent-teal' : 'border-navy-700 hover:border-navy-600'
                    }`}
                    onClick={() => setActiveSiteIdx(i)}
                  >
                    <div className={`text-[9px] font-bold truncate mb-1 ${off ? 'text-muted line-through' : 'text-white'}`}>{s.shortName}</div>
                    <div className="text-[9px] text-muted">{off ? 'OFF' : `${s.posts}p`}</div>
                    {off ? (
                      <div className="text-xs font-bold text-muted">—</div>
                    ) : (
                      <div className={`text-xs font-bold tabular-nums font-mono ${p.yearly[0].noi > 0 ? 'text-accent-green' : 'text-accent-red'}`}>
                        {fmt.currencyK(p.yearly[0].noi)}
                      </div>
                    )}
                    <div className="text-[9px] text-muted">{off ? 'Excluded' : 'Y1 NOI'}</div>
                    {!off && <div className="text-[8px] text-accent-teal mt-0.5 font-mono">{payback ? `Payback: Yr ${payback}` : '>10yr'}</div>}
                  </div>
                );
              })}
            </div>
          </div>

          {/* ═══ YEAR 1 DETAIL — ACTIVE SITE ═══ */}
          <div>
            <SectionHeader title={`Year 1 Detail — ${site.shortName} (${site.posts} stalls)`} subtitle={site.notes} />
            <div className="grid grid-cols-3 gap-3 mb-3">
              <MetricCard label="Annual Net Revenue" value={fmt.currencyK(y1.annualNetRevenue)} />
              <MetricCard label="Annual Energy Cost" value={fmt.currencyK(y1.energyCost)} />
              <MetricCard label="Annual NOI" value={fmt.currencyK(y1.noi)} color={y1.noi > 0 ? 'text-accent-green' : 'text-accent-red'} />
            </div>
            <div className="grid grid-cols-4 gap-3">
              <MetricCard label="Gross Margin/kWh" value={`$${y1.grossMarginKwh.toFixed(3)}`} />
              <MetricCard label="NOI Margin" value={fmt.percent(y1.noiMargin)} color={y1.noiMargin > 0.2 ? 'text-accent-teal' : 'text-accent-amber'} />
              <MetricCard label="kWh Dispensed" value={`${(y1.kwhDispensed / 1000).toFixed(0)}K`} />
              {(() => { const pb = fin(proj.breakeven.paybackYear_SBA, proj.breakeven.paybackYear_Conv, proj.breakeven.paybackYear_None); return (
              <MetricCard label={`Payback Period (${finLabel})`}
                value={pb ? `Year ${pb}` : '>10 Yrs'}
                color={pb && pb <= 5 ? 'text-accent-green' : 'text-accent-amber'}
              />); })()}
            </div>
          </div>

          {/* ═══ CHARTS ═══ */}
          <div>
            <SectionHeader title="10-Year Projection Charts — All Sites" />
            <div className="grid grid-cols-2 gap-4">
              {/* Cumulative Cash Flow */}
              <div className="bg-navy-800 rounded-lg border border-navy-700 p-4">
                <h3 className="text-xs font-semibold mb-3 text-muted">Cumulative Cash Flow ({finLabel})</h3>
                <ResponsiveContainer width="100%" height={240}>
                  <LineChart data={cashFlowData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#2E4A60" />
                    <XAxis dataKey="year" stroke="#8BAFC0" tick={{ fontSize: 10 }} />
                    <YAxis stroke="#8BAFC0" tick={{ fontSize: 10 }} tickFormatter={v => `$${(v/1e6).toFixed(1)}M`} />
                    <Tooltip content={<DarkTooltip formatter={v => fmt.currency(v)} />} />
                    <Legend wrapperStyle={{ fontSize: 9 }} />
                    <ReferenceLine y={0} stroke="#E63946" strokeDasharray="3 3" />
                    {sites.map((s, i) => (s.enabled !== false && s.posts > 0) ? (
                      <Line key={s.id} type="monotone" dataKey={s.shortName} stroke={SITE_COLORS[i]} strokeWidth={1.5} dot={false} />
                    ) : null)}
                    <Line type="monotone" dataKey="Portfolio" stroke="#FFFFFF" strokeWidth={2.5} dot={{ r: 2 }} strokeDasharray="6 3" />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* Annual NOI */}
              <div className="bg-navy-800 rounded-lg border border-navy-700 p-4">
                <h3 className="text-xs font-semibold mb-3 text-muted">Annual NOI by Site</h3>
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={noiData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#2E4A60" />
                    <XAxis dataKey="year" stroke="#8BAFC0" tick={{ fontSize: 10 }} />
                    <YAxis stroke="#8BAFC0" tick={{ fontSize: 10 }} tickFormatter={v => `$${(v/1000).toFixed(0)}K`} />
                    <Tooltip content={<DarkTooltip formatter={v => fmt.currency(v)} />} />
                    <Legend wrapperStyle={{ fontSize: 9 }} />
                    {sites.map((s, i) => (s.enabled !== false && s.posts > 0) ? (
                      <Bar key={s.id} dataKey={s.shortName} stackId="noi" fill={SITE_COLORS[i]} />
                    ) : null)}
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* ROE */}
              <div className="bg-navy-800 rounded-lg border border-navy-700 p-4">
                <h3 className="text-xs font-semibold mb-3 text-muted">Return on Equity ({finLabel})</h3>
                <ResponsiveContainer width="100%" height={240}>
                  <LineChart data={roeData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#2E4A60" />
                    <XAxis dataKey="year" stroke="#8BAFC0" tick={{ fontSize: 10 }} />
                    <YAxis stroke="#8BAFC0" tick={{ fontSize: 10 }} tickFormatter={v => `${v.toFixed(0)}%`} />
                    <Tooltip content={<DarkTooltip formatter={v => `${v.toFixed(1)}%`} />} />
                    <Legend wrapperStyle={{ fontSize: 9 }} />
                    <ReferenceLine y={100} stroke="#2EC4B6" strokeDasharray="3 3" label={{ value: '100% ROE', fill: '#2EC4B6', fontSize: 9 }} />
                    {sites.map((s, i) => (s.enabled !== false && s.posts > 0) ? (
                      <Line key={s.id} type="monotone" dataKey={s.shortName} stroke={SITE_COLORS[i]} strokeWidth={1.5} dot={false} />
                    ) : null)}
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* Sensitivity — active site */}
              <div className="bg-navy-800 rounded-lg border border-navy-700 p-4">
                <h3 className="text-xs font-semibold mb-3 text-muted">Utilization Sensitivity — {site.shortName}</h3>
                <ResponsiveContainer width="100%" height={240}>
                  <AreaChart data={sensitivityData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#2E4A60" />
                    <XAxis dataKey="util" stroke="#8BAFC0" tick={{ fontSize: 10 }} />
                    <YAxis stroke="#8BAFC0" tick={{ fontSize: 10 }} tickFormatter={v => `$${(v/1000).toFixed(0)}K`} />
                    <Tooltip content={<DarkTooltip formatter={v => fmt.currency(v)} />} />
                    <ReferenceLine y={0} stroke="#E63946" strokeDasharray="3 3" />
                    <ReferenceLine x={site.year1Utilization.toFixed(1)} stroke={SITE_COLORS[activeSiteIdx]} strokeDasharray="5 5" label={{ value: `Model (${site.year1Utilization.toFixed(1)})`, fill: SITE_COLORS[activeSiteIdx], fontSize: 9, position: 'top' }} />
                    <Area type="monotone" dataKey="NOI" stroke={SITE_COLORS[activeSiteIdx]} fill={SITE_COLORS[activeSiteIdx]} fillOpacity={0.15} strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              {/* Network Utilization — full width */}
              <div className="bg-navy-800 rounded-lg border border-navy-700 p-4 col-span-2">
                <h3 className="text-xs font-semibold mb-3 text-muted">Tesla Global Network Utilization History</h3>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={networkData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#2E4A60" />
                    <XAxis dataKey="q" stroke="#8BAFC0" tick={{ fontSize: 10 }} />
                    <YAxis stroke="#8BAFC0" tick={{ fontSize: 10 }} domain={[0, 1.8]} />
                    <Tooltip content={<DarkTooltip formatter={v => `${v.toFixed(2)} hrs/post/day`} />} />
                    {sites.map((s, i) => (s.enabled !== false && s.posts > 0) ? (
                      <ReferenceLine key={s.id} y={s.year1Utilization} stroke={SITE_COLORS[i]} strokeDasharray="5 5"
                        label={{ value: `${s.shortName} (${s.year1Utilization.toFixed(2)})`, fill: SITE_COLORS[i], fontSize: 8, position: 'right' }} />
                    ) : null)}
                    <Line type="monotone" dataKey="hrsDay" stroke="#2EC4B6" strokeWidth={2} dot={{ r: 3 }} name="Network Avg" />
                  </LineChart>
                </ResponsiveContainer>
                <p className="text-[10px] text-muted mt-2">Source: Tesla SEC shareholder letters Q1 2024–Q4 2025</p>
              </div>
            </div>
          </div>

          {/* ═══ BREAKEVEN ANALYSIS — ALL 7 SITES ═══ */}
          <div>
            <SectionHeader title="Breakeven Utilization Analysis — All Sites" subtitle="At what utilization does each site break even against debt service?" />
            <div className="bg-navy-800 rounded-lg border border-navy-700 overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-navy-700/50">
                    <th className="text-left px-3 py-2 text-muted font-medium">Site</th>
                    <th className="text-center px-2 py-2 text-muted font-medium">Posts</th>
                    <th className="text-right px-3 py-2 text-muted font-medium">Debt Svc</th>
                    <th className="text-right px-3 py-2 text-muted font-medium">BE Util</th>
                    <th className="text-right px-3 py-2 text-muted font-medium">Model</th>
                    <th className="text-right px-3 py-2 text-muted font-medium">Margin</th>
                    <th className="text-right px-3 py-2 text-muted font-medium">Payback</th>
                  </tr>
                </thead>
                <tbody>
                  {sites.map((s, i) => {
                    const be = allProj[i].breakeven;
                    const ds = fin(be.sbaDebtService, be.convDebtService, 0);
                    const beUtil = fin(be.breakevenUtil_SBA, be.breakevenUtil_Conv, be.breakevenUtil_None);
                    const cushion = fin(be.cushionSBA, be.cushionConv, be.cushionNone);
                    const payback = fin(be.paybackYear_SBA, be.paybackYear_Conv, be.paybackYear_None);
                    const isOff = s.enabled === false;
                    return (
                      <tr key={s.id} className={`border-t border-navy-700/50 ${isOff ? 'opacity-30' : activeSiteIdx === i ? 'bg-accent-teal/5' : ''}`}>
                        <td className={`px-3 py-2 font-medium ${isOff ? 'line-through' : ''}`}>{s.shortName}{isOff ? ' (OFF)' : ''}</td>
                        <td className="px-2 py-2 text-center text-muted">{s.posts}</td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums">{fmt.currency(ds)}</td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums">{beUtil?.toFixed(2) ?? 'N/A'} hrs</td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums">{s.year1Utilization.toFixed(2)} hrs</td>
                        <td className={`px-3 py-2 text-right font-mono tabular-nums font-bold ${cushionColor(cushion)}`}>
                          <span className={`px-2 py-0.5 rounded ${cushionBg(cushion)}`}>
                            {cushion !== null ? fmt.percent(cushion) : 'N/A'}
                          </span>
                        </td>
                        <td className={`px-3 py-2 text-right font-mono tabular-nums font-bold ${payback && payback <= 5 ? 'text-accent-green' : payback ? 'text-accent-amber' : 'text-red-400'}`}>
                          {payback ? `Yr ${payback}` : '>10'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* ═══ SOURCES & USES — ALL 7 SITES ═══ */}
          <div>
            <SectionHeader title={`Sources & Uses + Key Ratios (${finLabel}) — All Sites`} />
            <div className="bg-navy-800 rounded-lg border border-navy-700 overflow-x-auto">
              <table className="w-full text-xs min-w-[800px]">
                <thead>
                  <tr className="bg-navy-700/50">
                    <th className="text-left px-3 py-2 text-muted font-medium sticky left-0 bg-navy-700/50 z-10">Metric</th>
                    {sites.map((s, i) => (
                      <th key={s.id} className="text-right px-2 py-2 font-medium whitespace-nowrap" style={{ color: SITE_COLORS[i] }}>{s.shortName} ({s.posts}p)</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[
                    { label: 'Construction Cost', fn: (p) => fmt.currency(p.sourcesUses.constructionCost) },
                    { label: 'ComEd Rebate', fn: (p) => `(${fmt.currency(p.sourcesUses.comedRebate)})` },
                    { label: '§30C Credits', fn: (p) => fmt.currency(p.sourcesUses.grossCredits) },
                    { label: 'Credit Proceeds', fn: (p) => `(${fmt.currency(p.sourcesUses.creditProceeds)})` },
                    { label: 'Net Project Cost', fn: (p) => fmt.currency(p.sourcesUses.netProjectCost), bold: true },
                    ...(!isNone ? [
                      { label: isSBA ? 'SBA Loan' : 'Conv. Loan', fn: (p) => fmt.currency(isSBA ? p.sourcesUses.sbaLoan : p.sourcesUses.convLoan) },
                      { label: 'Annual Debt Svc', fn: (p) => fmt.currency(isSBA ? p.sourcesUses.sbaDebtService : p.sourcesUses.convDebtService) },
                      { label: 'Year 1 DCR', fn: (p) => (isSBA ? p.sourcesUses.sbaDCR_Y1 : p.sourcesUses.convDCR_Y1).toFixed(2) + 'x' },
                    ] : []),
                    { label: isNone ? 'Cash Required' : 'Equity Required', fn: (p) => fmt.currency(fin(p.sourcesUses.equityRequired_SBA, p.sourcesUses.equityRequired_Conv, p.sourcesUses.equityRequired_None)), bold: true },
                    { label: 'Year 1 NOI', fn: (p) => fmt.currency(p.yearly[0].noi) },
                    { label: 'Y1 NOI Margin', fn: (p) => fmt.percent(p.yearly[0].noiMargin) },
                    { label: 'Margin/kWh', fn: (p) => `$${p.yearly[0].grossMarginKwh.toFixed(3)}` },
                    { label: '10-Yr Cum. CF', fn: (p) => { const cf = fin(p.cashFlows.cumulativeSBA, p.cashFlows.cumulativeConv, p.cashFlows.cumulativeNone); return fmt.currency(cf[9]); } },
                    { label: 'Payback Period', fn: (p) => { const pb = fin(p.breakeven.paybackYear_SBA, p.breakeven.paybackYear_Conv, p.breakeven.paybackYear_None); return pb ? `Year ${pb}` : '>10 Yrs'; } },
                    { label: '10-Yr ROE', fn: (p) => { const roe = fin(p.cashFlows.ROE_SBA, p.cashFlows.ROE_Conv, p.cashFlows.ROE_None); return fmt.percent(roe[9]); }, bold: true },
                  ].map(({ label, fn, bold }, i) => (
                    <tr key={i} className={`border-t ${bold ? 'border-navy-600 bg-navy-700/20' : 'border-navy-700/30'}`}>
                      <td className={`px-3 py-2 text-muted sticky left-0 bg-navy-800 z-10 ${bold ? 'font-semibold text-white' : ''}`}>{label}</td>
                      {allProj.map((p, si) => (
                        <td key={si} className={`px-2 py-2 text-right font-mono tabular-nums whitespace-nowrap ${bold ? 'font-semibold' : ''}`}>{fn(p)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
