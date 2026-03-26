/**
 * Shorewood Charging Intelligence Platform — Financial Assumptions
 * Sources: Tesla LTSA, ComEd rebate confirmations, §30C IRS guidance,
 * Tesla SEC shareholder letters Q1 2024–Q4 2025, custom pro forma model
 */

// ============================================================
// SHARED FINANCIAL DEFAULTS (base template for all 7 sites)
// ============================================================
const baseDefaults = {
  enabled: true,
  kwPerPost: 250,
  operatingDays: 360,
  annualDemandGrowth: 0.114,     // 11.4%
  customerRate: 0.40,            // $/kWh
  chargeRateEscalator: 0.025,    // 2.5% CPI
  processingFee: 0.00,           // Confirmed zero
  comedRate: 0.12,               // $/kWh ComEd commercial
  comedEscalator: 0.02,
  teslaLTSAFee: 0.10,            // $/kWh — confirmed LTSA
  teslaEscalator: 0.03,          // 3% compounding — confirmed
  ltsaFloor: 200,                // $/post/month minimum
  equipmentCost: 500000,          // $500K per 8 stalls
  installCostPerStall: 50000,     // $35K–$65K per stall
  groundLease: 300,              // $/post/month
  groundLeaseStep: 0.10,         // +10% every 5 years
  parkingLease: 300,             // $/post/month (was Parking Rental + Per-Stall Lease)
  parkingLeaseEscalator: 0.02,
  apply30C: true,
  creditRate30C: 0.30,           // 30% with PWA
  maxCreditPerPort: 100000,
  sellCredits: true,
  transferPrice: 0.90,
  sbaLTV: 0.90,
  sbaRate: 0.065,
  sbaAmort: 10,
  convLTV: 0.75,
  convRate: 0.085,
  convAmort: 7,
};

// Construction cost = equipment + install
function costForStalls(posts, equipmentCost = 500000, installCostPerStall = 50000) {
  if (posts === 0) return 0;
  const equipUnits = posts / 8; // $500K per 8 stalls
  return equipUnits * equipmentCost + posts * installCostPerStall;
}

// ============================================================
// ALL 7 PORTFOLIO SITE DEFAULTS
// ============================================================
export const allSiteDefaults = [
  {
    ...baseDefaults,
    id: "sw-5",
    shortName: "Meacham",
    name: "Meacham — 1160 Lake Cook Rd",
    address: "1160 W Lake Cook Rd, Buffalo Grove, IL 60089",
    county: "Lake",
    posts: 8,
    year1Utilization: 1.20,
    constructionCost: 900000,
    comedRebate: 500000,          // confirmed
    apply30C: true,
    creditRate30C: 0.30,
    sellCredits: true,
    grantStatus: "$500K AWARDED",
    notes: "§30C deadline Jun 30 2026 · $500K ComEd rebate confirmed",
  },
  {
    ...baseDefaults,
    id: "sw-4",
    shortName: "Golf Crossings",
    name: "Golf Crossings — 1701 Golf Rd",
    address: "1701 Golf Rd, Schaumburg, IL 60173",
    county: "Cook",
    posts: 8,
    year1Utilization: 1.50,       // Tesla #1 demand site
    constructionCost: 900000,
    comedRebate: 0,
    apply30C: false,
    creditRate30C: 0.06,
    sellCredits: false,
    grantStatus: "Not Applied",
    notes: "Tesla #1 demand. Woodfield Mall 27M visitors. ⚠ Competitor pin Mar 2026.",
  },
  {
    ...baseDefaults,
    id: "sw-1",
    shortName: "N. Meacham",
    name: "N. Meacham — 1325 N. Meacham Rd",
    address: "1325 N. Meacham Rd, Schaumburg, IL 60173",
    county: "Cook",
    posts: 8,
    year1Utilization: 1.10,
    constructionCost: 900000,
    comedRebate: 500000,          // confirmed
    apply30C: true,
    creditRate30C: 0.30,
    sellCredits: true,
    grantStatus: "$500K AWARDED",
    notes: "Duly Health. 105K SF, ~500 parking. $500K ComEd rebate confirmed.",
  },
  {
    ...baseDefaults,
    id: "sw-2",
    shortName: "Milwaukee Ave (HQ)",
    name: "Milwaukee Ave HQ — 860 Milwaukee Ave",
    address: "860 Milwaukee Ave, Buffalo Grove, IL 60089",
    county: "Lake",
    posts: 8,
    year1Utilization: 1.00,
    constructionCost: 900000,
    comedRebate: 0,
    apply30C: true,
    creditRate30C: 0.30,
    sellCredits: true,
    grantStatus: "Not Applied",
    notes: "Shops of BG — Shorewood HQ. 40.5K SF, 24 acres.",
  },
  {
    ...baseDefaults,
    id: "sw-6",
    shortName: "Dundee Rd",
    name: "Dundee Rd — 915 Dundee Rd",
    address: "915 Dundee Rd, Buffalo Grove, IL 60089",
    county: "Lake",
    posts: 8,
    year1Utilization: 1.00,
    constructionCost: 900000,
    comedRebate: 0,
    apply30C: true,
    creditRate30C: 0.30,
    sellCredits: true,
    grantStatus: "Not Applied",
    notes: "Primary retail/commercial corridor.",
  },
  {
    ...baseDefaults,
    id: "sw-3",
    shortName: "Loves Park",
    name: "Loves Park — 1597 W. Lane Rd",
    address: "1597 W. Lane Rd, Loves Park, IL 61111",
    county: "Winnebago",
    posts: 8,
    year1Utilization: 0.90,
    constructionCost: 900000,
    comedRebate: 0,
    apply30C: true,
    creditRate30C: 0.30,
    sellCredits: true,
    grantStatus: "Not Applied",
    notes: "Rockford area. Strong 30C/NEVI candidate — less urban.",
  },
  {
    ...baseDefaults,
    id: "sw-7",
    shortName: "Woodstock",
    name: "Woodstock — 250 S. Eastwood Dr",
    address: "250 S. Eastwood Dr, Woodstock, IL 60098",
    county: "McHenry",
    posts: 8,
    year1Utilization: 0.80,
    constructionCost: 900000,
    comedRebate: 0,
    apply30C: true,
    creditRate30C: 0.30,
    sellCredits: true,
    grantStatus: "Not Applied",
    notes: "Rt 47 corridor. Most rural = strongest 30C/NEVI candidate.",
  },
];

// Helper to recalculate construction cost when stall count changes
export function adjustSiteForStalls(site, newPosts) {
  return {
    ...site,
    posts: newPosts,
    constructionCost: costForStalls(newPosts, site.equipmentCost, site.installCostPerStall),
  };
}

// Recalculate construction cost from equipment + install
export function recalcConstructionCost(site) {
  return costForStalls(site.posts, site.equipmentCost, site.installCostPerStall);
}

// Legacy exports for backward compatibility
export const siteADefaults = allSiteDefaults[0];
export const siteBDefaults = allSiteDefaults[1];

// ============================================================
// SLIDER CONFIGURATION
// ============================================================
export const sliderConfig = {
  customerRate: { min: 0.25, max: 0.60, step: 0.01, label: "Customer Rate ($/kWh)", format: "currency" },
  year1Utilization: { min: 0.3, max: 3.0, step: 0.1, label: "Year 1 Utilization (hrs/post/day)", format: "number" },
  comedRate: { min: 0.08, max: 0.20, step: 0.01, label: "ComEd Rate ($/kWh)", format: "currency" },
  teslaLTSAFee: { min: 0.08, max: 0.14, step: 0.01, label: "Tesla LTSA Fee ($/kWh)", format: "currency" },
  processingFee: { min: 0.00, max: 0.12, step: 0.005, label: "Billing Fee %", format: "percent" },
  annualDemandGrowth: { min: 0.05, max: 0.20, step: 0.005, label: "Annual Demand Growth", format: "percent" },
  equipmentCost: { min: 300000, max: 800000, step: 25000, label: "Equipment Cost (per 8 stalls)", format: "currency_large" },
  installCostPerStall: { min: 35000, max: 65000, step: 1000, label: "Install Cost ($/stall)", format: "currency_large" },
  comedRebate: { min: 0, max: 1000000, step: 25000, label: "ComEd Rebate", format: "currency_large" },
  groundLease: { min: 0, max: 600, step: 25, label: "Ground Lease ($/post/mo)", format: "currency" },
  parkingLease: { min: 0, max: 600, step: 25, label: "Parking Lease ($/post/mo)", format: "currency" },
  parkingLeaseEscalator: { min: 0, max: 0.05, step: 0.005, label: "Parking Lease Escalator", format: "percent" },
};

// ============================================================
// ALL 7 SHOREWOOD PORTFOLIO SITES (for map display)
// ============================================================
export const shorewoodPortfolio = [
  {
    id: "sw-1",
    name: "Shorewood — 1325 N. Meacham Rd",
    address: "1325 N. Meacham Rd, Schaumburg, IL 60173",
    lat: 42.0521,
    lng: -88.0253,
    posts: 8,
    type: "V4",
    status: "PROPOSED",
    property: "Office/Medical (Woodfield Village Green)",
    county: "Cook",
    grantStatus: "$500K AWARDED",
    notes: "Duly Health. 105K SF, ~500 parking spaces, 9.4 acres. $500K ComEd rebate confirmed.",
    modeled: false,
  },
  {
    id: "sw-2",
    name: "Shorewood — 860 Milwaukee Ave (HQ)",
    address: "860 Milwaukee Ave, Buffalo Grove, IL 60089",
    lat: 42.1580,
    lng: -87.9630,
    posts: 8,
    type: "V4",
    status: "PROPOSED",
    property: "Retail (Shops of BG) — Shorewood HQ",
    county: "Lake",
    grantStatus: "Not Applied",
    notes: "SWC Milwaukee & Deerfield Pkwy. 40.5K SF, 24 acres.",
    modeled: false,
  },
  {
    id: "sw-3",
    name: "Shorewood — 1597 W. Lane Rd",
    address: "1597 W. Lane Rd, Loves Park, IL 61111",
    lat: 42.3380,
    lng: -89.0440,
    posts: 8,
    type: "V4",
    status: "PROPOSED",
    property: "TBD (Rockford area)",
    county: "Winnebago",
    grantStatus: "Not Applied",
    notes: "Strong 30C/NEVI candidate — less urban location.",
    modeled: false,
  },
  {
    id: "sw-4",
    name: "Shorewood — Golf Crossings (1701 Golf Rd)",
    address: "1701 Golf Rd, Schaumburg, IL 60173",
    lat: 42.0340,
    lng: -88.0310,
    posts: 16,
    type: "V4",
    status: "PROPOSED",
    property: "Retail (Woodfield Gatherings)",
    county: "Cook",
    grantStatus: "Not Applied",
    notes: "Tesla #1 demand site. In front of Woodfield Mall (27M annual visitors). B-5 zoning, 1.3 acres. ⚠ Competitor pin added Mar 6 2026.",
    modeled: true,
    modelKey: "siteB",
  },
  {
    id: "sw-5",
    name: "Shorewood — Meacham (1160 Lake Cook Rd)",
    address: "1160 W Lake Cook Rd, Buffalo Grove, IL 60089",
    lat: 42.0894,
    lng: -87.9910,
    posts: 8,
    type: "V4",
    status: "PROPOSED",
    property: "TBD",
    county: "Lake",
    grantStatus: "Not Applied",
    notes: "§30C deadline Jun 30 2026 · $500K ComEd rebate confirmed · $15,700 equity required",
    modeled: true,
    modelKey: "siteA",
  },
  {
    id: "sw-6",
    name: "Shorewood — 915 Dundee Rd",
    address: "915 Dundee Rd, Buffalo Grove, IL 60089",
    lat: 42.1510,
    lng: -87.9590,
    posts: 8,
    type: "V4",
    status: "PROPOSED",
    property: "TBD",
    county: "Lake",
    grantStatus: "Not Applied",
    notes: "Primary retail/commercial corridor.",
    modeled: false,
  },
  {
    id: "sw-7",
    name: "Shorewood — 250 S. Eastwood Dr",
    address: "250 S. Eastwood Dr, Woodstock, IL 60098",
    lat: 42.3100,
    lng: -88.4490,
    posts: 8,
    type: "V4",
    status: "PROPOSED",
    property: "Retail/Commercial",
    county: "McHenry",
    grantStatus: "Not Applied",
    notes: "Rt 47 corridor. Most rural site = strongest 30C/NEVI candidate.",
    modeled: false,
  },
];

// Primary distance-reference sites (the two modeled sites)
export const shorewoodSites = {
  meacham: { lat: 42.0894, lng: -87.9910, name: "Meacham" },
  golf: { lat: 42.0340, lng: -88.0310, name: "Golf Crossings" },
};

// ============================================================
// NETWORK UTILIZATION DATA — Tesla SEC quarterly reports
// ============================================================
export const networkUtilizationData = [
  { q: "Q1'22", kwhDay: 115, hrsDay: 0.46, confirmed: false },
  { q: "Q2'22", kwhDay: 124, hrsDay: 0.50, confirmed: false },
  { q: "Q3'22", kwhDay: 131, hrsDay: 0.52, confirmed: false },
  { q: "Q4'22", kwhDay: 142, hrsDay: 0.57, confirmed: false },
  { q: "Q1'23", kwhDay: 119, hrsDay: 0.48, confirmed: false },
  { q: "Q2'23", kwhDay: 127, hrsDay: 0.51, confirmed: false },
  { q: "Q3'23", kwhDay: 248, hrsDay: 0.99, confirmed: false },
  { q: "Q4'23", kwhDay: 220, hrsDay: 0.88, confirmed: false },
  { q: "Q1'24", kwhDay: 218, hrsDay: 0.87, confirmed: true },
  { q: "Q2'24", kwhDay: 247, hrsDay: 0.99, confirmed: true },
  { q: "Q3'24", kwhDay: 250, hrsDay: 1.00, confirmed: true },
  { q: "Q4'24", kwhDay: 237, hrsDay: 0.95, confirmed: true },
  { q: "Q1'25", kwhDay: 227, hrsDay: 0.91, confirmed: true },
  { q: "Q2'25", kwhDay: 251, hrsDay: 1.00, confirmed: true },
  { q: "Q3'25", kwhDay: 268, hrsDay: 1.07, confirmed: true },
  { q: "Q4'25", kwhDay: 261, hrsDay: 1.04, confirmed: true },
];

// ============================================================
// COMPETITIVE ALERTS LOG
// ============================================================
export const competitiveAlerts = [
  {
    id: 1,
    date: "2026-03-06",
    severity: "high",
    title: "New Tesla permit pin: Woodfield Village Green",
    location: "1446 E Golf Rd, Schaumburg, IL 60173",
    affectsSite: "Golf Crossings",
    details: "Tesla permit/planning pin appeared on supercharge.info adjacent to Golf Crossings site. Estimated 12–24 months to opening. First-mover advantage requires commissioning by mid-2026.",
    action: "Monitor weekly on supercharge.info. Consider accelerating Golf Crossings timeline.",
  },
  {
    id: 2,
    date: "2025-12-15",
    severity: "info",
    title: "Buffalo Grove Supercharger pricing update",
    location: "1550 Deerfield Parkway, Buffalo Grove, IL",
    affectsSite: "Meacham",
    details: "Nearest competitor (3 mi from Meacham) charges $0.47/kWh peak, $0.40 evening, $0.20–$0.24 overnight. Non-Tesla EVs pay $0.66/kWh peak. Shorewood $0.40 flat rate undercuts peak by 15%.",
    action: "Pricing headroom exists. Could charge $0.45 and still undercut peak competitor rate.",
  },
];

// ============================================================
// CONSTANTS
// ============================================================
export const SECTION_30C_DEADLINE = new Date('2026-06-30T23:59:59');

export const statusColors = {
  OPEN: '#1D9E75',
  PERMIT: '#EF9F27',
  CONSTRUCTION: '#378ADD',
  CLOSED: '#E24B4A',
  PLAN: '#888780',
  VOTING: '#7F77DD',
  PROPOSED: '#F4A261',
};

export const midwestStates = ['IL', 'WI', 'IN', 'MO', 'IA', 'MI', 'OH', 'MN', 'KY'];

// Fallback data (Illinois Superchargers) if API fails
export const fallbackSuperchargers = [
  { id: 99901, name: "Buffalo Grove, IL", status: "OPEN", stallCount: 12, powerKilowatt: 250, gps: { latitude: 42.1583, longitude: -87.9589 }, address: { city: "Buffalo Grove", state: "IL", country: "United States" }, openDate: "2023-04-15", chargerType: "V3" },
  { id: 99902, name: "Schaumburg - Woodfield, IL", status: "OPEN", stallCount: 16, powerKilowatt: 250, gps: { latitude: 42.0411, longitude: -88.0341 }, address: { city: "Schaumburg", state: "IL", country: "United States" }, openDate: "2022-09-20", chargerType: "V3" },
  { id: 99903, name: "Libertyville, IL", status: "OPEN", stallCount: 8, powerKilowatt: 250, gps: { latitude: 42.2822, longitude: -87.9530 }, address: { city: "Libertyville", state: "IL", country: "United States" }, openDate: "2023-11-01", chargerType: "V3" },
  { id: 99904, name: "Gurnee, IL", status: "OPEN", stallCount: 12, powerKilowatt: 250, gps: { latitude: 42.3692, longitude: -87.9019 }, address: { city: "Gurnee", state: "IL", country: "United States" }, openDate: "2019-03-15", chargerType: "V2" },
  { id: 99905, name: "Chicago - Magnificent Mile, IL", status: "OPEN", stallCount: 12, powerKilowatt: 250, gps: { latitude: 41.8951, longitude: -87.6243 }, address: { city: "Chicago", state: "IL", country: "United States" }, openDate: "2023-06-01", chargerType: "V3" },
  { id: 99906, name: "Naperville, IL", status: "OPEN", stallCount: 12, powerKilowatt: 250, gps: { latitude: 41.7860, longitude: -88.1473 }, address: { city: "Naperville", state: "IL", country: "United States" }, openDate: "2018-12-01", chargerType: "V2" },
  { id: 99907, name: "Normal, IL", status: "OPEN", stallCount: 8, powerKilowatt: 250, gps: { latitude: 40.5142, longitude: -88.9906 }, address: { city: "Normal", state: "IL", country: "United States" }, openDate: "2017-09-15", chargerType: "V2" },
  { id: 99908, name: "Springfield, IL", status: "OPEN", stallCount: 8, powerKilowatt: 150, gps: { latitude: 39.7817, longitude: -89.6501 }, address: { city: "Springfield", state: "IL", country: "United States" }, openDate: "2019-06-01", chargerType: "V2" },
  { id: 99909, name: "Rockford, IL", status: "OPEN", stallCount: 8, powerKilowatt: 250, gps: { latitude: 42.2711, longitude: -89.0940 }, address: { city: "Rockford", state: "IL", country: "United States" }, openDate: "2022-03-15", chargerType: "V3" },
  { id: 99910, name: "Woodfield Village Green, IL", status: "PERMIT", stallCount: 0, powerKilowatt: 250, gps: { latitude: 42.0351, longitude: -88.0378 }, address: { city: "Schaumburg", state: "IL", country: "United States" }, openDate: null, chargerType: "V4" },
];
