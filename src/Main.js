/**
 * Main.js — Entry point. Orchestrates each daily/weekly run.
 *
 * This is the function that gets triggered by the daily time-driven trigger.
 * It reads everything from the Google Sheet, calculates portfolio state,
 * optionally calls Claude for AI analysis, writes results, and sends alerts.
 */

/**
 * Main daily run function — called by the time-driven trigger.
 */
function dailyRun() {
  var settings;

  try {
    // 1. Read settings
    settings = readSettings();
    logInfo('Starting run for strategy: ' + settings.strategyName);

    // 2. Check master switch
    if (!settings.scriptEnabled) {
      logInfo('Script disabled — exiting');
      return;
    }

    // 3. Check for duplicate run today
    if (hasTodayEntry()) {
      logInfo('Today already has a monitoring log entry — skipping');
      return;
    }

    // 4. Read positions
    var positions = readPositions();
    if (positions.length === 0) {
      logInfo('No active positions found — skipping');
      return;
    }

    // 5. Validate weights
    var weightCheck = validateWeights(positions, settings.cashTargetWeight / 100);
    if (!weightCheck.valid) {
      logInfo(weightCheck.message);
    }

    // 6. Fetch prices
    var prices = fetchPrices(positions);
    var failedPrices = [];
    for (var t in prices) {
      if (!prices[t].price) {
        failedPrices.push(t + ': ' + (prices[t].error || 'unknown'));
      }
    }
    if (failedPrices.length > 0) {
      logInfo('Price fetch failures: ' + failedPrices.join(', '));
    }

    // 6b. Auto-fill missing buy prices from current market prices
    var missingBuyPrices = {};
    for (var bp = 0; bp < positions.length; bp++) {
      var pos = positions[bp];
      if ((!pos.buyPrice || pos.buyPrice <= 0) && prices[pos.ticker] && prices[pos.ticker].price) {
        pos.buyPrice = prices[pos.ticker].price;
        missingBuyPrices[pos.ticker] = prices[pos.ticker].price;
      }
    }
    if (Object.keys(missingBuyPrices).length > 0) {
      logInfo('Auto-filled buy prices for: ' + Object.keys(missingBuyPrices).join(', '));
      writeBuyPrices(missingBuyPrices);
    }

    // 7. Get previous values for daily change
    var prevEntry = readPreviousMonitoringEntry();
    var prevValues = getPreviousValues(prevEntry, settings.investors);
    var previousPrices = loadPreviousPrices();

    // 8. Calculate portfolio state
    var cashWeight = settings.cashTargetWeight / 100;
    var portfolioState = calculatePortfolioState(
      positions, prices, settings.investors, cashWeight, prevValues, previousPrices
    );

    // Store today's prices for tomorrow's daily change calculation
    storePrices(prices);

    // 9. Check mechanical thresholds
    var flags = checkThresholds(portfolioState, settings);

    // 9b. Calculate rebalance suggestions
    var rebalanceSuggestions = calculateRebalanceSuggestions(portfolioState, positions, settings);
    if (rebalanceSuggestions.length > 0) {
      logInfo('Rebalance suggestions: ' + rebalanceSuggestions.length + ' position(s) with drift > threshold');
    }

    // 10. Determine run type
    var today = getDayName(now());
    var runType = (today === settings.deepAnalysisDay) ? 'weekly_deep' : 'daily';
    var runTypeDisplay = runType === 'weekly_deep' ? 'Weekly Deep' : 'Daily';
    logInfo('Run type: ' + runTypeDisplay + ' (today is ' + today + ')');

    // 11. AI analysis (or mechanical fallback)
    var aiResult;
    if (settings.aiEnabled) {
      var startTime = new Date().getTime();
      aiResult = runAIAnalysis(portfolioState, positions, settings, runType, rebalanceSuggestions);
      var elapsed = new Date().getTime() - startTime;
      logInfo('AI analysis completed in ' + (elapsed / 1000).toFixed(1) + 's — status: ' + aiResult.status);
    } else {
      logInfo('AI disabled — using mechanical assessment');
      aiResult = buildMechanicalAssessment(portfolioState);
    }

    // 12. Write monitoring log
    writeMonitoringLog(portfolioState, aiResult, runTypeDisplay, settings.investors);

    // 13. Send daily summary email
    sendDailySummary(portfolioState, aiResult, settings, rebalanceSuggestions);

    // 14. Weekly digest
    if (today === settings.weeklyDigestDay) {
      logInfo('Today is digest day — sending weekly digest');
      var weekEntries = readWeekEntries();
      var priceHistory = loadPriceHistory();

      // Use current AI result (ideally from a weekly deep run)
      var deepResult = aiResult;

      sendWeeklyDigest(portfolioState, weekEntries, priceHistory, deepResult, settings);
    }

    // 15. Update dashboard timestamp
    updateDashboardTimestamp();

    logInfo('Run completed successfully');

  } catch (e) {
    logError('dailyRun failed', e);
    try {
      sendErrorEmail(e.message + '\n\n' + (e.stack || ''), settings);
    } catch (emailErr) {
      logError('Could not send error email', emailErr);
    }
  }
}

/**
 * Manual trigger for testing — runs dailyRun() and logs the output.
 */
function testRun() {
  dailyRun();
  Logger.log('=== Test run complete ===');
  Logger.log(Logger.getLog());
}

/**
 * Utility function to log a trade from the script editor.
 * Usage: logTradeManual('NVDA', 'Buy', 50, 115.00, 'Alice', 'Initial purchase', 'Strategy setup')
 */
function logTradeManual(ticker, action, shares, price, investor, rationale, triggeredBy) {
  logTrade({
    date: formatDate(now()),
    ticker: ticker,
    action: action,
    shares: shares,
    price: price,
    amount: shares * price,
    investor: investor,
    rationale: rationale || '',
    triggeredBy: triggeredBy || 'Manual'
  });
}
