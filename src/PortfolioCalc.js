/**
 * PortfolioCalc.js — Calculate portfolio values, weights, drift, P&L, and daily changes
 */

/**
 * Calculate complete portfolio state for all investors.
 *
 * @param {Array} positions - Array of position objects from readPositions()
 * @param {Object} prices - Map of ticker -> { price, source } from fetchPrices()
 * @param {Array} investors - Array of investor objects from settings
 * @param {number} cashTargetWeight - Cash target as decimal (e.g., 0.08)
 * @param {Object} prevValues - Map of investor name -> previous portfolio value
 * @returns {Object} Full portfolio state
 */
function calculatePortfolioState(positions, prices, investors, cashTargetWeight, prevValues, previousPrices) {
  var state = {
    investors: {},
    positions: {},
    flags: [],
    topMover: { ticker: '', change: 0 },
    dailyChange: 0
  };

  // Calculate per-position data (shared across investors)
  for (var p = 0; p < positions.length; p++) {
    var pos = positions[p];
    var priceData = prices[pos.ticker];
    var currentPrice = priceData ? priceData.price : null;

    var prevPrice = (previousPrices && previousPrices[pos.ticker]) ? previousPrices[pos.ticker] : null;
    var dailyChgPct = (currentPrice && prevPrice && prevPrice > 0)
      ? (currentPrice - prevPrice) / prevPrice
      : null;

    state.positions[pos.ticker] = {
      ticker: pos.ticker,
      company: pos.company,
      bucket: pos.bucket,
      targetWeight: pos.targetWeight,
      currentPrice: currentPrice,
      previousPrice: prevPrice,
      dailyChangePct: dailyChgPct,
      buyPrice: pos.buyPrice,
      thesis: pos.thesis,
      priceSource: priceData ? priceData.source : 'unavailable',
      priceError: priceData ? priceData.error : 'No price data'
    };
  }

  // Calculate per-investor portfolio
  for (var inv = 0; inv < investors.length; inv++) {
    var investor = investors[inv];
    var investedAmount = investor.investedAmount;
    var cashAmount = investedAmount * cashTargetWeight;

    var investorState = {
      name: investor.name,
      investedAmount: investedAmount,
      positions: [],
      totalValue: 0,
      totalCost: 0,
      cashValue: cashAmount,
      dailyChange: 0,
      dailyChangePct: 0,
      totalPnl: 0,
      totalPnlPct: 0
    };

    var totalCurrentValue = cashAmount;

    for (var p2 = 0; p2 < positions.length; p2++) {
      var pos2 = positions[p2];
      var posState = state.positions[pos2.ticker];
      var allocationAmount = investedAmount * pos2.targetWeight;

      var shares = 0;
      var currentValue = 0;
      var costBasis = 0;
      var pnl = 0;
      var pnlPct = 0;

      if (pos2.buyPrice && pos2.buyPrice > 0) {
        shares = allocationAmount / pos2.buyPrice;
        costBasis = shares * pos2.buyPrice;

        if (posState.currentPrice) {
          currentValue = shares * posState.currentPrice;
          pnl = currentValue - costBasis;
          pnlPct = costBasis > 0 ? pnl / costBasis : 0;
        } else {
          currentValue = costBasis; // Use cost if no current price
        }
      } else {
        // No buy price and no current price — use allocation as placeholder
        currentValue = allocationAmount;
        costBasis = allocationAmount;
      }

      totalCurrentValue += currentValue;

      investorState.positions.push({
        ticker: pos2.ticker,
        shares: shares,
        currentValue: currentValue,
        costBasis: costBasis,
        pnl: pnl,
        pnlPct: pnlPct
      });

      investorState.totalCost += costBasis;
    }

    investorState.totalValue = totalCurrentValue;
    investorState.totalPnl = totalCurrentValue - investedAmount;
    investorState.totalPnlPct = investedAmount > 0 ? investorState.totalPnl / investedAmount : 0;

    // Calculate current weights and drift
    for (var p3 = 0; p3 < investorState.positions.length; p3++) {
      var ip = investorState.positions[p3];
      ip.currentWeight = totalCurrentValue > 0 ? ip.currentValue / totalCurrentValue : 0;
      ip.weightDrift = ip.currentWeight - positions[p3].targetWeight;
    }

    // Cash current weight
    investorState.cashCurrentWeight = totalCurrentValue > 0 ? cashAmount / totalCurrentValue : 0;
    investorState.cashWeightDrift = investorState.cashCurrentWeight - cashTargetWeight;

    // Daily change
    if (prevValues && prevValues[investor.name]) {
      var prevVal = prevValues[investor.name];
      investorState.dailyChange = totalCurrentValue - prevVal;
      investorState.dailyChangePct = prevVal > 0 ? investorState.dailyChange / prevVal : 0;
    }

    state.investors[investor.name] = investorState;
  }

  // Calculate aggregate daily change (average across investors)
  var totalDailyPct = 0;
  var investorCount = 0;
  for (var name in state.investors) {
    totalDailyPct += state.investors[name].dailyChangePct;
    investorCount++;
  }
  state.dailyChange = investorCount > 0 ? totalDailyPct / investorCount : 0;

  return state;
}

/**
 * Check mechanical thresholds and return flags.
 *
 * @param {Object} portfolioState - From calculatePortfolioState()
 * @param {Object} settings - From readSettings()
 * @returns {Array} Array of flag strings
 */
function checkThresholds(portfolioState, settings) {
  var flags = [];

  var singleMoveThreshold = settings.singlePositionDailyMove / 100;
  var portfolioMoveThreshold = settings.portfolioDailyMove / 100;
  var maxWeightThreshold = settings.maxSinglePositionWeight / 100;
  var driftThreshold = settings.weightDriftAlert / 100;

  // Check portfolio-level daily move
  if (Math.abs(portfolioState.dailyChange) > portfolioMoveThreshold) {
    flags.push('Portfolio moved ' + formatPercent(portfolioState.dailyChange) +
      ' (threshold: ' + settings.portfolioDailyMove + '%)');
  }

  // Check per-position thresholds using the first investor as reference
  var firstInvestorName = Object.keys(portfolioState.investors)[0];
  if (!firstInvestorName) return flags;
  var investorState = portfolioState.investors[firstInvestorName];

  var maxMove = 0;
  var maxMoveTicker = '';

  for (var i = 0; i < investorState.positions.length; i++) {
    var pos = investorState.positions[i];
    var ticker = pos.ticker;
    var posInfo = portfolioState.positions[ticker];

    // Daily move check
    if (posInfo.dailyChangePct != null && Math.abs(posInfo.dailyChangePct) > singleMoveThreshold) {
      flags.push(ticker + ' moved ' + formatPercent(posInfo.dailyChangePct) +
        ' today (exceeds ' + settings.singlePositionDailyMove + '% threshold)');
    }

    // Max weight check
    if (pos.currentWeight > maxWeightThreshold) {
      flags.push(ticker + ' weight is ' + (pos.currentWeight * 100).toFixed(1) +
        '% (max: ' + settings.maxSinglePositionWeight + '%)');
    }

    // Weight drift check
    if (Math.abs(pos.weightDrift) > driftThreshold) {
      flags.push(ticker + ' weight drift is ' + (pos.weightDrift * 100).toFixed(1) +
        '% from target (threshold: ' + settings.weightDriftAlert + '%)');
    }

    // Track top mover by absolute daily change
    var moveVal = posInfo.dailyChangePct != null ? posInfo.dailyChangePct : pos.pnlPct;
    if (Math.abs(moveVal) > Math.abs(maxMove)) {
      maxMove = moveVal;
      maxMoveTicker = ticker;
    }
  }

  portfolioState.topMover = { ticker: maxMoveTicker, change: maxMove };
  portfolioState.flags = flags;

  return flags;
}

/**
 * Build a text summary of the portfolio state for the AI prompt.
 *
 * @param {Object} portfolioState - From calculatePortfolioState()
 * @param {Array} investors - Investor array from settings
 * @returns {string} Formatted portfolio state text
 */
function buildPortfolioStateText(portfolioState, investors) {
  var lines = [];

  for (var inv = 0; inv < investors.length; inv++) {
    var name = investors[inv].name;
    var is_ = portfolioState.investors[name];
    if (!is_) continue;

    lines.push('--- ' + name + ' (invested: ' + formatCurrency(is_.investedAmount) + ') ---');
    lines.push('Total Value: ' + formatCurrency(is_.totalValue) +
      ' | Daily Change: ' + formatPercent(is_.dailyChangePct) +
      ' | Total P&L: ' + formatPercent(is_.totalPnlPct) + ' (' + formatCurrency(is_.totalPnl) + ')');
    lines.push('');
    lines.push('Ticker | Price | Weight (Target) | Drift | P&L');
    lines.push('-------|-------|-----------------|-------|----');

    for (var p = 0; p < is_.positions.length; p++) {
      var pos = is_.positions[p];
      var posInfo = portfolioState.positions[pos.ticker];
      var priceStr = posInfo.currentPrice ? formatCurrency(posInfo.currentPrice) : 'N/A';
      lines.push(
        pos.ticker + ' | ' + priceStr +
        ' | ' + (pos.currentWeight * 100).toFixed(1) + '% (' + (posInfo.targetWeight * 100).toFixed(1) + '%)' +
        ' | ' + (pos.weightDrift > 0 ? '+' : '') + (pos.weightDrift * 100).toFixed(1) + '%' +
        ' | ' + formatPercent(pos.pnlPct) + ' (' + formatCurrency(pos.pnl) + ')'
      );
    }

    lines.push('Cash | ' + formatCurrency(is_.cashValue) +
      ' | ' + (is_.cashCurrentWeight * 100).toFixed(1) + '%' +
      ' (' + (investors[inv].investedAmount > 0 ? (is_.cashValue / is_.totalValue * 100).toFixed(1) : '0') + '%)');
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Build text of flagged positions for the AI prompt.
 */
function buildFlaggedPositionsText(flags) {
  if (flags.length === 0) return 'No positions flagged — all within normal thresholds.';
  return flags.map(function(f) { return '• ' + f; }).join('\n');
}

/**
 * Build position theses text for the AI prompt.
 */
function buildPositionThesesText(positions) {
  return positions.map(function(p) {
    return p.ticker + ' (' + p.company + '): ' + (p.thesis || 'No thesis provided');
  }).join('\n');
}

/**
 * Calculate rebalance suggestions for positions with significant weight drift.
 * Returns specific trade recommendations (buy/sell shares and dollar amounts).
 *
 * @param {Object} portfolioState - From calculatePortfolioState()
 * @param {Array} positions - From readPositions()
 * @param {Object} settings - From readSettings()
 * @returns {Array} Array of suggestion objects
 */
function calculateRebalanceSuggestions(portfolioState, positions, settings) {
  var suggestions = [];
  var driftThreshold = (settings.weightDriftAlert || 5) / 100;

  var firstInvestorName = Object.keys(portfolioState.investors)[0];
  if (!firstInvestorName) return suggestions;
  var investorState = portfolioState.investors[firstInvestorName];

  for (var i = 0; i < investorState.positions.length; i++) {
    var pos = investorState.positions[i];
    var posInfo = portfolioState.positions[pos.ticker];

    if (Math.abs(pos.weightDrift) > driftThreshold) {
      var targetValue = investorState.totalValue * posInfo.targetWeight;
      var tradeAmount = targetValue - pos.currentValue;
      var shares = posInfo.currentPrice ? Math.abs(tradeAmount) / posInfo.currentPrice : 0;

      suggestions.push({
        ticker: pos.ticker,
        action: tradeAmount > 0 ? 'Buy' : 'Sell',
        currentWeight: pos.currentWeight,
        targetWeight: posInfo.targetWeight,
        drift: pos.weightDrift,
        amount: Math.abs(tradeAmount),
        shares: Math.round(shares * 100) / 100,
        currentPrice: posInfo.currentPrice,
        reason: pos.ticker + ' is ' + (tradeAmount > 0 ? 'underweight' : 'overweight') +
          ' by ' + (Math.abs(pos.weightDrift) * 100).toFixed(1) + '%' +
          ' (current: ' + (pos.currentWeight * 100).toFixed(1) + '%, target: ' + (posInfo.targetWeight * 100).toFixed(1) + '%)'
      });
    }
  }

  // Sort by absolute drift descending
  suggestions.sort(function (a, b) {
    return Math.abs(b.drift) - Math.abs(a.drift);
  });

  return suggestions;
}

/**
 * Build rebalance suggestions text for the AI prompt.
 */
function buildRebalanceSuggestionsText(suggestions) {
  if (!suggestions || suggestions.length === 0) {
    return 'No positions have significant weight drift. Portfolio is within rebalance thresholds.';
  }

  var lines = [];
  for (var i = 0; i < suggestions.length; i++) {
    var s = suggestions[i];
    lines.push(s.action + ' ' + s.shares + ' shares of ' + s.ticker +
      ' (~' + formatCurrency(s.amount) + ') — ' + s.reason);
  }
  return lines.join('\n');
}
