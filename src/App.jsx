import React, { useState, lazy, Suspense } from 'react';
import NavBar from './components/NavBar';
import MapView from './components/MapView';
import FinancialView from './components/FinancialView';
import UtilityMapView from './components/UtilityMapView';
import { allSiteDefaults, adjustSiteForStalls, recalcConstructionCost } from './data/assumptions';
import { useSuperchargerData } from './hooks/useSuperchargerData';

export default function App() {
  const [view, setView] = useState('map');
  const [financingType, setFinancingType] = useState('sba');
  const superchargerData = useSuperchargerData();

  // State for all 7 sites — each site is independently adjustable
  const [sites, setSites] = useState(() => allSiteDefaults.map(d => ({ ...d })));

  // Active site index for slider editing
  const [activeSiteIdx, setActiveSiteIdx] = useState(0);

  // Update a single field on a site (auto-recalc construction cost for equipment/install changes)
  const updateSite = (idx, key, value) => {
    setSites(prev => prev.map((s, i) => {
      if (i !== idx) return s;
      const updated = { ...s, [key]: value };
      if (key === 'equipmentCost' || key === 'installCostPerStall') {
        updated.constructionCost = recalcConstructionCost(updated);
      }
      return updated;
    }));
  };

  // Toggle stall count between 0, 8, and 16
  const toggleStalls = (idx, newPosts) => {
    setSites(prev => prev.map((s, i) => i === idx ? adjustSiteForStalls(s, newPosts) : s));
  };

  // Toggle site enabled/disabled
  const toggleSiteEnabled = (idx) => {
    setSites(prev => prev.map((s, i) => i === idx ? { ...s, enabled: !s.enabled } : s));
  };

  // Reset a site to defaults
  const resetSite = (idx) => {
    setSites(prev => prev.map((s, i) => i === idx ? { ...allSiteDefaults[idx], posts: s.posts, constructionCost: s.posts === 16 ? 1500000 : 900000 } : s));
  };

  return (
    <div className="min-h-screen bg-navy-900 text-white flex flex-col">
      <NavBar view={view} setView={setView} />
      <main className="flex-1 overflow-hidden">
        {view === 'map' && <MapView superchargerData={superchargerData} />}
        {view === 'utility' && <UtilityMapView />}
        {view === 'financial' && (
          <FinancialView
            sites={sites}
            activeSiteIdx={activeSiteIdx}
            setActiveSiteIdx={setActiveSiteIdx}
            updateSite={updateSite}
            toggleStalls={toggleStalls}
            toggleSiteEnabled={toggleSiteEnabled}
            resetSite={resetSite}
            financingType={financingType}
            setFinancingType={setFinancingType}
          />
        )}
      </main>
    </div>
  );
}
