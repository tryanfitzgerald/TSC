/**
 * Shorewood Charging Intelligence Platform — Financial Model
 * Pure function: no side effects, independently testable
 */

// PMT formula: rate * PV / (1 - (1+rate)^-n)
export function pmt(rate, nper, pv) {
  if (rate === 0) return pv / nper;
  return (rate * pv) / (1 - Math.pow(1 + rate, -nper));
}

// Haversine distance in miles
export function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 3958.8; // Earth radius in miles
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

export function calculateProjections(site, years = 10) {
  const yearly = [];

  for (let y = 1; y <= years; y++) {
    const chargingRate = site.customerRate * Math.pow(1 + site.chargeRateEscalator, y - 1);
    const dailyUsage = site.year1Utilization * Math.pow(1 + site.annualDemandGrowth, y - 1);
    const dailyGrossRevenue = chargingRate * dailyUsage * site.posts * site.kwPerPost;
    const processingFeeAmt = dailyGrossRevenue * site.processingFee;
    const dailyNetRevenue = dailyGrossRevenue - processingFeeAmt;
    const annualNetRevenue = dailyNetRevenue * site.operatingDays;

    const kwhDispensed = site.posts * dailyUsage * site.kwPerPost * site.operatingDays;
    const comedRateY = site.comedRate * Math.pow(1 + site.comedEscalator, y - 1);
    const teslaFeeY = site.teslaLTSAFee * Math.pow(1 + site.teslaEscalator, y - 1);
    const energyCost = kwhDispensed * (comedRateY + teslaFeeY);

    const ltsaFloorCheck = Math.max(0, site.ltsaFloor * site.posts * 12 - kwhDispensed * teslaFeeY);

    // Ground lease with 10% step-up every 5 years
    const groundLeaseY = site.groundLease * site.posts * 12 * (1 + site.groundLeaseStep * Math.floor((y - 1) / 5));

    // Parking lease with annual escalator
    const parkingLeaseY = (site.parkingLease || site.parkingRental || 0) * site.posts * 12 * Math.pow(1 + (site.parkingLeaseEscalator || site.parkingEscalator || 0.02), y - 1);

    const totalOpex = energyCost + ltsaFloorCheck + groundLeaseY + parkingLeaseY;
    const noi = annualNetRevenue - totalOpex;
    const noiMargin = annualNetRevenue > 0 ? noi / annualNetRevenue : 0;
    const grossMarginKwh = chargingRate - comedRateY - teslaFeeY;

    yearly.push({
      year: y,
      chargingRate,
      dailyUsage,
      dailyGrossRevenue,
      processingFeeAmt: processingFeeAmt * site.operatingDays,
      annualGrossRevenue: dailyGrossRevenue * site.operatingDays,
      annualNetRevenue,
      kwhDispensed,
      comedRateY,
      teslaFeeY,
      energyCost,
      ltsaFloorCheck,
      groundLeaseY,
      parkingLeaseY,
      totalOpex,
      noi,
      noiMargin,
      grossMarginKwh,
    });
  }

  // Sources & Uses (one-time)
  const grossCredits = site.apply30C
    ? Math.min(site.creditRate30C * site.constructionCost, site.maxCreditPerPort * site.posts)
    : 0;
  const transferDiscount = site.sellCredits ? grossCredits * (1 - site.transferPrice) : 0;
  const creditProceeds = site.sellCredits
    ? grossCredits * site.transferPrice
    : (site.apply30C ? grossCredits : 0);
  const netProjectCost = site.constructionCost - site.comedRebate - creditProceeds;

  const sbaLoan = netProjectCost * site.sbaLTV;
  const sbaDebtService = pmt(site.sbaRate, site.sbaAmort, sbaLoan);
  const sbaDCR_Y1 = sbaDebtService !== 0 ? yearly[0].noi / sbaDebtService : 0;

  const convLoan = netProjectCost * site.convLTV;
  const convDebtService = pmt(site.convRate, site.convAmort, convLoan);
  const convDCR_Y1 = convDebtService !== 0 ? yearly[0].noi / convDebtService : 0;

  const equityRequired_SBA = netProjectCost - sbaLoan;
  const equityRequired_Conv = netProjectCost - convLoan;
  const equityRequired_None = netProjectCost; // Cash = 100% equity

  // Cash flows and ROE
  const cashFlow_SBA = yearly.map(yr => yr.noi - sbaDebtService);
  const cashFlow_Conv = yearly.map(yr => yr.noi - convDebtService);
  const cashFlow_None = yearly.map(yr => yr.noi); // No debt service
  const cumulativeCF_SBA = cashFlow_SBA.reduce((acc, cf, i) => {
    acc.push((acc[i - 1] || 0) + cf);
    return acc;
  }, []);
  const cumulativeCF_Conv = cashFlow_Conv.reduce((acc, cf, i) => {
    acc.push((acc[i - 1] || 0) + cf);
    return acc;
  }, []);
  const cumulativeCF_None = cashFlow_None.reduce((acc, cf, i) => {
    acc.push((i === 0 ? -netProjectCost : acc[i - 1]) + cf);
    return acc;
  }, []);
  const ROE_SBA = cumulativeCF_SBA.map(cf => equityRequired_SBA !== 0 ? cf / equityRequired_SBA : 0);
  const ROE_Conv = cumulativeCF_Conv.map(cf => equityRequired_Conv !== 0 ? cf / equityRequired_Conv : 0);
  const ROE_None = cumulativeCF_None.map(cf => equityRequired_None !== 0 ? cf / equityRequired_None : 0);

  // Breakeven utilization (iterative solve)
  function findBreakevenUtilization(debtService) {
    for (let util = 0.1; util <= 5.0; util += 0.01) {
      const testSite = { ...site, year1Utilization: util };
      const rate = testSite.customerRate;
      const usage = util;
      const dailyGross = rate * usage * testSite.posts * testSite.kwPerPost;
      const procFee = dailyGross * testSite.processingFee;
      const annualNet = (dailyGross - procFee) * testSite.operatingDays;
      const kwh = testSite.posts * usage * testSite.kwPerPost * testSite.operatingDays;
      const energy = kwh * (testSite.comedRate + testSite.teslaLTSAFee);
      const ltsaFloor = Math.max(0, testSite.ltsaFloor * testSite.posts * 12 - kwh * testSite.teslaLTSAFee);
      const ground = testSite.groundLease * testSite.posts * 12;
      const parkingLease = (testSite.parkingLease || testSite.parkingRental || 0) * testSite.posts * 12;
      const opex = energy + ltsaFloor + ground + parkingLease;
      const testNoi = annualNet - opex;
      if (testNoi >= debtService) return util;
    }
    return null; // Cannot break even within range
  }

  const breakevenUtil_SBA = findBreakevenUtilization(sbaDebtService);
  const breakevenUtil_Conv = findBreakevenUtilization(convDebtService);

  // Payback period — year when cumulative cash flow first goes positive
  function findPaybackYear(cumulativeCF) {
    for (let i = 0; i < cumulativeCF.length; i++) {
      if (cumulativeCF[i] >= 0) return i + 1; // year number (1-indexed)
    }
    return null; // doesn't pay back within projection window
  }
  const paybackYear_SBA = findPaybackYear(cumulativeCF_SBA);
  const paybackYear_Conv = findPaybackYear(cumulativeCF_Conv);
  const paybackYear_None = findPaybackYear(cumulativeCF_None);

  // Breakeven for cash (no debt service, just need positive NOI)
  const breakevenUtil_None = findBreakevenUtilization(0);

  return {
    yearly,
    sourcesUses: {
      constructionCost: site.constructionCost,
      equipmentCost: site.equipmentCost || 500000,
      installCostPerStall: site.installCostPerStall || 50000,
      comedRebate: site.comedRebate,
      grossCredits,
      transferDiscount,
      creditProceeds,
      netProjectCost,
      sbaLoan,
      sbaDebtService,
      sbaDCR_Y1,
      convLoan,
      convDebtService,
      convDCR_Y1,
      equityRequired_SBA,
      equityRequired_Conv,
      equityRequired_None,
    },
    cashFlows: {
      sba: cashFlow_SBA,
      conv: cashFlow_Conv,
      none: cashFlow_None,
      cumulativeSBA: cumulativeCF_SBA,
      cumulativeConv: cumulativeCF_Conv,
      cumulativeNone: cumulativeCF_None,
      ROE_SBA,
      ROE_Conv,
      ROE_None,
    },
    breakeven: {
      sbaDebtService,
      convDebtService,
      breakevenUtil_SBA,
      breakevenUtil_Conv,
      breakevenUtil_None,
      currentUtilization: site.year1Utilization,
      cushionSBA: breakevenUtil_SBA ? ((site.year1Utilization - breakevenUtil_SBA) / breakevenUtil_SBA) : null,
      cushionConv: breakevenUtil_Conv ? ((site.year1Utilization - breakevenUtil_Conv) / breakevenUtil_Conv) : null,
      cushionNone: breakevenUtil_None ? ((site.year1Utilization - breakevenUtil_None) / breakevenUtil_None) : null,
      paybackYear_SBA,
      paybackYear_Conv,
      paybackYear_None,
    },
  };
}

// Format helpers
export const fmt = {
  currency: (v) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v),
  currencyK: (v) => `$${(v / 1000).toFixed(0)}K`,
  currencyM: (v) => `$${(v / 1000000).toFixed(2)}M`,
  percent: (v) => `${(v * 100).toFixed(1)}%`,
  number: (v, d = 2) => v.toFixed(d),
  kwh: (v) => `${v.toFixed(2)} kWh`,
};
