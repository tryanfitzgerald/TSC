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
  const [showPrint, setShowPrint] = useState(false);
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

  // ─── Print handler ───
  const handlePrint = () => {
    setTimeout(() => { window.print(); }, 300);
  };

  // ─── PRINT REPORT OVERLAY ───
  if (showPrint) {
    const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const S = { // print styles
      page: { background: '#fff', color: '#111', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', minHeight: '100vh', padding: '0' },
      header: { background: '#0D1B2A', color: '#fff', padding: '24px 32px', marginBottom: '0' },
      section: { padding: '20px 32px', borderBottom: '1px solid #ddd' },
      sectionTitle: { fontSize: '13px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#0D1B2A', marginBottom: '12px', borderBottom: '2px solid #0D1B2A', paddingBottom: '4px' },
      table: { width: '100%', borderCollapse: 'collapse', fontSize: '11px' },
      th: { background: '#f0f2f5', padding: '6px 8px', textAlign: 'left', fontWeight: 600, borderBottom: '2px solid #ccc', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' },
      thR: { background: '#f0f2f5', padding: '6px 8px', textAlign: 'right', fontWeight: 600, borderBottom: '2px solid #ccc', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' },
      td: { padding: '5px 8px', borderBottom: '1px solid #e5e7eb' },
      tdR: { padding: '5px 8px', borderBottom: '1px solid #e5e7eb', textAlign: 'right', fontFamily: 'monospace', fontVariantNumeric: 'tabular-nums' },
      tdBold: { padding: '5px 8px', borderBottom: '2px solid #ccc', fontWeight: 700, background: '#f9fafb' },
      tdBoldR: { padding: '5px 8px', borderBottom: '2px solid #ccc', fontWeight: 700, background: '#f9fafb', textAlign: 'right', fontFamily: 'monospace' },
      grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' },
      grid3: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' },
      card: { border: '1px solid #ddd', borderRadius: '6px', padding: '12px', textAlign: 'center' },
      cardLabel: { fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.1em', color: '#666', marginBottom: '4px' },
      cardValue: { fontSize: '18px', fontWeight: 700, fontFamily: 'monospace' },
      cardSub: { fontSize: '9px', color: '#888', marginTop: '2px' },
      green: { color: '#16a34a' },
      red: { color: '#dc2626' },
      amber: { color: '#d97706' },
      teal: { color: '#0891b2' },
      pageBreak: { pageBreakBefore: 'always' },
    };

    return (
      <div style={S.page} className="print-report">
        {/* ── CLOSE BUTTON (hidden in print) ── */}
        <div className="no-print" style={{ position: 'fixed', top: 16, right: 16, zIndex: 9999, display: 'flex', gap: 8 }}>
          <button onClick={handlePrint} style={{ background: '#0D1B2A', color: '#fff', border: 'none', borderRadius: 6, padding: '10px 20px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            Print / Save PDF
          </button>
          <button onClick={() => setShowPrint(false)} style={{ background: '#e5e7eb', color: '#333', border: 'none', borderRadius: 6, padding: '10px 16px', fontSize: 13, cursor: 'pointer' }}>
            Close
          </button>
        </div>

        {/* ════════ PAGE 1: COVER + PORTFOLIO SUMMARY ════════ */}
        <div style={S.header}>
          <div style={{ fontSize: '22px', fontWeight: 700, letterSpacing: '0.02em' }}>Shorewood Charging Intelligence Platform</div>
          <div style={{ fontSize: '13px', opacity: 0.7, marginTop: 4 }}>Tesla V4 Supercharger Portfolio — 10-Year Financial Pro Forma</div>
          <div style={{ fontSize: '11px', opacity: 0.5, marginTop: 8 }}>Prepared {today} · Financing: {finLabel} · {activeSiteCount} active sites · {enabledSites.reduce((s,x) => s + x.posts, 0)} total stalls</div>
        </div>

        {/* Portfolio Summary */}
        <div style={S.section}>
          <div style={S.sectionTitle}>Portfolio Summary</div>
          <div style={{ ...S.grid3, gridTemplateColumns: '1fr 1fr 1fr 1fr' }}>
            <div style={S.card}>
              <div style={S.cardLabel}>Total Equity Required</div>
              <div style={{ ...S.cardValue, color: '#d97706' }}>{fmt.currency(totalEquity)}</div>
              <div style={S.cardSub}>{finLabel} · {activeSiteCount} sites</div>
            </div>
            <div style={S.card}>
              <div style={S.cardLabel}>Year 1 Portfolio NOI</div>
              <div style={{ ...S.cardValue, color: totalY1NOI > 0 ? '#16a34a' : '#dc2626' }}>{fmt.currency(totalY1NOI)}</div>
            </div>
            <div style={S.card}>
              <div style={S.cardLabel}>10-Year Portfolio NOI</div>
              <div style={{ ...S.cardValue, color: '#16a34a' }}>{fmt.currencyM(total10YrNOI)}</div>
            </div>
            <div style={S.card}>
              <div style={S.cardLabel}>§30C Tax Credits</div>
              <div style={{ ...S.cardValue, color: '#0891b2' }}>{fmt.currency(totalCredits30C)}</div>
              <div style={S.cardSub}>{daysTo30C} days to deadline</div>
            </div>
          </div>
        </div>

        {/* Per-Site Summary Table */}
        <div style={S.section}>
          <div style={S.sectionTitle}>Per-Site Year 1 Overview</div>
          <table style={S.table}>
            <thead>
              <tr>
                <th style={S.th}>Site</th>
                <th style={S.thR}>Stalls</th>
                <th style={S.thR}>Utilization</th>
                <th style={S.thR}>Construction</th>
                <th style={S.thR}>Net Revenue</th>
                <th style={S.thR}>NOI</th>
                <th style={S.thR}>NOI Margin</th>
                <th style={S.thR}>Equity Req.</th>
                <th style={S.thR}>Payback</th>
                <th style={S.thR}>Status</th>
              </tr>
            </thead>
            <tbody>
              {sites.map((s, i) => {
                const p = allProj[i];
                const off = s.enabled === false || s.posts === 0;
                const eq = fin(p.sourcesUses.equityRequired_SBA, p.sourcesUses.equityRequired_Conv, p.sourcesUses.equityRequired_None);
                const pb = fin(p.breakeven.paybackYear_SBA, p.breakeven.paybackYear_Conv, p.breakeven.paybackYear_None);
                return (
                  <tr key={s.id} style={off ? { opacity: 0.35 } : {}}>
                    <td style={{ ...S.td, fontWeight: 600 }}>{s.shortName}{off ? ' (OFF)' : ''}</td>
                    <td style={S.tdR}>{s.posts}</td>
                    <td style={S.tdR}>{s.year1Utilization.toFixed(2)} hrs</td>
                    <td style={S.tdR}>{fmt.currency(s.constructionCost)}</td>
                    <td style={S.tdR}>{off ? '—' : fmt.currency(p.yearly[0].annualNetRevenue)}</td>
                    <td style={{ ...S.tdR, fontWeight: 600, color: p.yearly[0].noi > 0 ? '#16a34a' : '#dc2626' }}>{off ? '—' : fmt.currency(p.yearly[0].noi)}</td>
                    <td style={S.tdR}>{off ? '—' : fmt.percent(p.yearly[0].noiMargin)}</td>
                    <td style={S.tdR}>{off ? '—' : fmt.currency(eq)}</td>
                    <td style={{ ...S.tdR, fontWeight: 600, color: pb && pb <= 5 ? '#16a34a' : '#d97706' }}>{off ? '—' : pb ? `Yr ${pb}` : '>10'}</td>
                    <td style={{ ...S.td, fontSize: '10px' }}>{off ? 'Excluded' : s.grantStatus || '—'}</td>
                  </tr>
                );
              })}
              {/* Portfolio total row */}
              <tr>
                <td style={S.tdBold}>PORTFOLIO TOTAL</td>
                <td style={S.tdBoldR}>{enabledSites.reduce((s,x) => s + x.posts, 0)}</td>
                <td style={S.tdBoldR}>—</td>
                <td style={S.tdBoldR}>{fmt.currency(enabledSites.reduce((s,x) => s + x.constructionCost, 0))}</td>
                <td style={S.tdBoldR}>{fmt.currency(enabledSites.reduce((s,x) => s + allProj[x.idx].yearly[0].annualNetRevenue, 0))}</td>
                <td style={{ ...S.tdBoldR, color: '#16a34a' }}>{fmt.currency(totalY1NOI)}</td>
                <td style={S.tdBoldR}>—</td>
                <td style={S.tdBoldR}>{fmt.currency(totalEquity)}</td>
                <td style={S.tdBoldR}>—</td>
                <td style={S.tdBold}>—</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* ════════ PAGE 2: SOURCES & USES ════════ */}
        <div style={{ ...S.section, ...S.pageBreak }}>
          <div style={S.sectionTitle}>Sources & Uses — All Sites ({finLabel})</div>
          <table style={S.table}>
            <thead>
              <tr>
                <th style={S.th}>Metric</th>
                {sites.map((s, i) => <th key={s.id} style={{ ...S.thR, color: SITE_COLORS[i], fontSize: '9px' }}>{s.shortName} ({s.posts}p)</th>)}
              </tr>
            </thead>
            <tbody>
              {[
                { label: 'Equipment Cost', fn: (p) => fmt.currency(p.sourcesUses.equipmentCost) },
                { label: 'Install Cost', fn: (p, s) => fmt.currency((s.installCostPerStall || 50000) * s.posts) },
                { label: 'Total Construction', fn: (p) => fmt.currency(p.sourcesUses.constructionCost), bold: true },
                { label: 'ComEd Rebate', fn: (p) => p.sourcesUses.comedRebate ? `(${fmt.currency(p.sourcesUses.comedRebate)})` : '—' },
                { label: '§30C Credits', fn: (p) => p.sourcesUses.grossCredits ? fmt.currency(p.sourcesUses.grossCredits) : '—' },
                { label: 'Credit Proceeds', fn: (p) => p.sourcesUses.creditProceeds ? `(${fmt.currency(p.sourcesUses.creditProceeds)})` : '—' },
                { label: 'Net Project Cost', fn: (p) => fmt.currency(p.sourcesUses.netProjectCost), bold: true },
                ...(!isNone ? [
                  { label: isSBA ? 'SBA Loan' : 'Conv. Loan', fn: (p) => fmt.currency(isSBA ? p.sourcesUses.sbaLoan : p.sourcesUses.convLoan) },
                  { label: 'Annual Debt Service', fn: (p) => fmt.currency(isSBA ? p.sourcesUses.sbaDebtService : p.sourcesUses.convDebtService) },
                  { label: 'Year 1 DCR', fn: (p) => (isSBA ? p.sourcesUses.sbaDCR_Y1 : p.sourcesUses.convDCR_Y1).toFixed(2) + 'x' },
                ] : []),
                { label: isNone ? 'Cash Required' : 'Equity Required', fn: (p) => fmt.currency(fin(p.sourcesUses.equityRequired_SBA, p.sourcesUses.equityRequired_Conv, p.sourcesUses.equityRequired_None)), bold: true },
                { label: 'Year 1 NOI', fn: (p) => fmt.currency(p.yearly[0].noi) },
                { label: 'NOI Margin', fn: (p) => fmt.percent(p.yearly[0].noiMargin) },
                { label: 'Margin/kWh', fn: (p) => `$${p.yearly[0].grossMarginKwh.toFixed(3)}` },
                { label: 'Payback Period', fn: (p) => { const pb = fin(p.breakeven.paybackYear_SBA, p.breakeven.paybackYear_Conv, p.breakeven.paybackYear_None); return pb ? `Year ${pb}` : '>10 Yrs'; } },
                { label: '10-Yr Cum. CF', fn: (p) => { const cf = fin(p.cashFlows.cumulativeSBA, p.cashFlows.cumulativeConv, p.cashFlows.cumulativeNone); return fmt.currency(cf[9]); } },
                { label: '10-Yr ROE', fn: (p) => { const roe = fin(p.cashFlows.ROE_SBA, p.cashFlows.ROE_Conv, p.cashFlows.ROE_None); return fmt.percent(roe[9]); }, bold: true },
              ].map(({ label, fn, bold }, ri) => (
                <tr key={ri}>
                  <td style={bold ? S.tdBold : S.td}>{label}</td>
                  {allProj.map((p, si) => <td key={si} style={bold ? S.tdBoldR : S.tdR}>{fn(p, sites[si])}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* ════════ PAGE 3: 10-YEAR PROJECTIONS ════════ */}
        <div style={{ ...S.section, ...S.pageBreak }}>
          <div style={S.sectionTitle}>10-Year Cash Flow Projections ({finLabel})</div>
          <table style={S.table}>
            <thead>
              <tr>
                <th style={S.th}>Year</th>
                {enabledSites.map(s => <th key={s.id} style={{ ...S.thR, color: SITE_COLORS[s.idx], fontSize: '9px' }}>{s.shortName}</th>)}
                <th style={{ ...S.thR, fontWeight: 800 }}>Portfolio</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 10 }, (_, yr) => {
                let total = 0;
                return (
                  <tr key={yr}>
                    <td style={S.td}>Year {yr + 1}</td>
                    {enabledSites.map(s => {
                      const cf = fin(allProj[s.idx].cashFlows.sba, allProj[s.idx].cashFlows.conv, allProj[s.idx].cashFlows.none);
                      total += cf[yr];
                      return <td key={s.id} style={{ ...S.tdR, color: cf[yr] >= 0 ? '#16a34a' : '#dc2626' }}>{fmt.currency(cf[yr])}</td>;
                    })}
                    <td style={{ ...S.tdR, fontWeight: 700, color: total >= 0 ? '#16a34a' : '#dc2626' }}>{fmt.currency(total)}</td>
                  </tr>
                );
              })}
              {/* Cumulative row */}
              <tr>
                <td style={S.tdBold}>10-Yr Cumulative</td>
                {enabledSites.map(s => {
                  const cf = fin(allProj[s.idx].cashFlows.cumulativeSBA, allProj[s.idx].cashFlows.cumulativeConv, allProj[s.idx].cashFlows.cumulativeNone);
                  return <td key={s.id} style={{ ...S.tdBoldR, color: cf[9] >= 0 ? '#16a34a' : '#dc2626' }}>{fmt.currency(cf[9])}</td>;
                })}
                <td style={{ ...S.tdBoldR, color: '#16a34a' }}>{fmt.currency(enabledSites.reduce((s,x) => {
                  const cf = fin(allProj[x.idx].cashFlows.cumulativeSBA, allProj[x.idx].cashFlows.cumulativeConv, allProj[x.idx].cashFlows.cumulativeNone);
                  return s + cf[9];
                }, 0))}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* ════════ PAGE 4: BREAKEVEN + ASSUMPTIONS ════════ */}
        <div style={{ ...S.section, ...S.pageBreak }}>
          <div style={S.grid2}>
            {/* Breakeven */}
            <div>
              <div style={S.sectionTitle}>Breakeven Analysis</div>
              <table style={S.table}>
                <thead>
                  <tr>
                    <th style={S.th}>Site</th>
                    <th style={S.thR}>BE Util</th>
                    <th style={S.thR}>Model</th>
                    <th style={S.thR}>Cushion</th>
                    <th style={S.thR}>Payback</th>
                  </tr>
                </thead>
                <tbody>
                  {sites.map((s, i) => {
                    const be = allProj[i].breakeven;
                    const beUtil = fin(be.breakevenUtil_SBA, be.breakevenUtil_Conv, be.breakevenUtil_None);
                    const cushion = fin(be.cushionSBA, be.cushionConv, be.cushionNone);
                    const pb = fin(be.paybackYear_SBA, be.paybackYear_Conv, be.paybackYear_None);
                    const off = s.enabled === false || s.posts === 0;
                    return (
                      <tr key={s.id} style={off ? { opacity: 0.3 } : {}}>
                        <td style={{ ...S.td, fontWeight: 600 }}>{s.shortName}</td>
                        <td style={S.tdR}>{beUtil?.toFixed(2) ?? 'N/A'} hrs</td>
                        <td style={S.tdR}>{s.year1Utilization.toFixed(2)} hrs</td>
                        <td style={{ ...S.tdR, fontWeight: 600, color: cushion === null ? '#dc2626' : cushion > 0.3 ? '#16a34a' : cushion > 0.1 ? '#d97706' : '#dc2626' }}>
                          {cushion !== null ? fmt.percent(cushion) : 'N/A'}
                        </td>
                        <td style={{ ...S.tdR, fontWeight: 600, color: pb && pb <= 5 ? '#16a34a' : '#d97706' }}>{pb ? `Yr ${pb}` : '>10'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Model Assumptions */}
            <div>
              <div style={S.sectionTitle}>Model Assumptions</div>
              <table style={{ ...S.table, fontSize: '10px' }}>
                <tbody>
                  {[
                    ['Customer Rate', `$${(site.customerRate).toFixed(2)}/kWh`],
                    ['Rate Escalator', fmt.percent(site.chargeRateEscalator)],
                    ['ComEd Rate', `$${(site.comedRate).toFixed(2)}/kWh`],
                    ['ComEd Escalator', fmt.percent(site.comedEscalator)],
                    ['Tesla LTSA Fee', `$${(site.teslaLTSAFee).toFixed(2)}/kWh`],
                    ['Tesla Escalator', fmt.percent(site.teslaEscalator)],
                    ['Billing Fee', fmt.percent(site.processingFee)],
                    ['Demand Growth', fmt.percent(site.annualDemandGrowth)],
                    ['Equipment Cost', fmt.currencyK(site.equipmentCost) + ' per 8 stalls'],
                    ['Install Cost', fmt.currencyK(site.installCostPerStall) + ' per stall'],
                    ['Ground Lease', `$${site.groundLease}/post/mo`],
                    ['Parking Lease', `$${(site.parkingLease || 0)}/post/mo`],
                    ['LTSA Floor', `$${site.ltsaFloor}/post/mo`],
                    ['Operating Days', `${site.operatingDays}/yr`],
                    ['kW per Post', `${site.kwPerPost} kW`],
                    ...(!isNone ? [
                      [isSBA ? 'SBA LTV' : 'Conv. LTV', fmt.percent(isSBA ? site.sbaLTV : site.convLTV)],
                      [isSBA ? 'SBA Rate' : 'Conv. Rate', fmt.percent(isSBA ? site.sbaRate : site.convRate)],
                      [isSBA ? 'SBA Term' : 'Conv. Term', `${isSBA ? site.sbaAmort : site.convAmort} yrs`],
                    ] : []),
                    ['§30C Credit', site.apply30C ? `${fmt.percent(site.creditRate30C)} (${site.sellCredits ? 'Transferable' : 'Direct'})` : 'Not Applied'],
                  ].map(([label, value], ri) => (
                    <tr key={ri}>
                      <td style={{ ...S.td, color: '#666' }}>{label}</td>
                      <td style={{ ...S.tdR, fontWeight: 500 }}>{value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* ════════ PAGE 5: SITE-BY-SITE ASSUMPTIONS ════════ */}
        <div style={{ ...S.section, ...S.pageBreak }}>
          <div style={S.sectionTitle}>Site-by-Site Configuration</div>
          <table style={S.table}>
            <thead>
              <tr>
                <th style={S.th}>Parameter</th>
                {sites.map((s, i) => <th key={s.id} style={{ ...S.thR, color: SITE_COLORS[i], fontSize: '9px' }}>{s.shortName}</th>)}
              </tr>
            </thead>
            <tbody>
              {[
                { label: 'Status', fn: (s) => s.enabled === false ? 'OFF' : 'Active' },
                { label: 'Stalls', fn: (s) => s.posts },
                { label: 'Address', fn: (s) => s.address, left: true },
                { label: 'County', fn: (s) => s.county },
                { label: 'Y1 Utilization', fn: (s) => s.year1Utilization.toFixed(2) + ' hrs' },
                { label: 'Construction Cost', fn: (s) => fmt.currency(s.constructionCost) },
                { label: 'Equipment', fn: (s) => fmt.currencyK(s.equipmentCost || 500000) },
                { label: 'Install/Stall', fn: (s) => fmt.currencyK(s.installCostPerStall || 50000) },
                { label: 'ComEd Rebate', fn: (s) => s.comedRebate ? fmt.currency(s.comedRebate) : '—' },
                { label: '§30C Applied', fn: (s) => s.apply30C ? `Yes (${fmt.percent(s.creditRate30C)})` : 'No' },
                { label: 'Credits Transferable', fn: (s) => s.sellCredits ? 'Yes' : 'No' },
                { label: 'Grant Status', fn: (s) => s.grantStatus || '—' },
                { label: 'Notes', fn: (s) => s.notes || '—', left: true },
              ].map(({ label, fn, left }, ri) => (
                <tr key={ri}>
                  <td style={{ ...S.td, fontWeight: 500, whiteSpace: 'nowrap' }}>{label}</td>
                  {sites.map((s, si) => <td key={si} style={left ? { ...S.td, fontSize: '9px' } : S.tdR}>{fn(s)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* ════════ FOOTER ════════ */}
        <div style={{ padding: '16px 32px', borderTop: '2px solid #0D1B2A', fontSize: '9px', color: '#888', display: 'flex', justifyContent: 'space-between' }}>
          <span>Shorewood Charging Intelligence Platform · Confidential</span>
          <span>{today}</span>
        </div>
      </div>
    );
  }

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
            <button onClick={() => setShowPrint(true)} className="w-full px-3 py-1.5 text-[11px] font-medium text-navy-900 bg-accent-gold hover:bg-accent-gold/90 rounded transition-colors">
              Print Report
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
