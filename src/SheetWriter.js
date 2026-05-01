/**
 * SheetWriter.js — Write rows to Monitoring Log and Rebalance History
 */

/**
 * Write a monitoring log entry.
 *
 * @param {Object} portfolioState - From calculatePortfolioState()
 * @param {Object} aiResult - From runAIAnalysis() or buildMechanicalAssessment()
 * @param {string} runType - 'Daily' or 'Weekly Deep'
 * @param {Array} investors - Investor array from settings
 */
function writeMonitoringLog(portfolioState, aiResult, runType, investors) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Monitoring Log');
  if (!sheet) throw new Error('Monitoring Log tab not found');

  var currentDate = now();

  // Build the row: Date, Time, Run Type, Status, [Portfolio Value per investor...],
  // Daily Change (%), Top Mover, Top Mover Change (%), Flags, AI Assessment, Recommendation
  var row = [
    formatDate(currentDate),
    formatTime(currentDate),
    runType,
    formatStatus_(aiResult.status)
  ];

  // Add portfolio value per investor
  for (var i = 0; i < investors.length; i++) {
    var is_ = portfolioState.investors[investors[i].name];
    row.push(is_ ? is_.totalValue : 0);
  }

  // Daily change, top mover
  row.push(portfolioState.dailyChange || 0);
  row.push(portfolioState.topMover ? portfolioState.topMover.ticker : '');
  row.push(portfolioState.topMover ? portfolioState.topMover.change : 0);

  // Flags, Assessment, Recommendation
  var allFlags = (portfolioState.flags || []).concat(aiResult.flags || []);
  var uniqueFlags = allFlags.filter(function(f, idx) { return allFlags.indexOf(f) === idx; });
  row.push(uniqueFlags.join(', '));
  row.push(aiResult.assessment || '');
  row.push(aiResult.recommendation || '');

  sheet.appendRow(row);
  logInfo('Wrote monitoring log entry: ' + aiResult.status);
}

/**
 * Format status for display.
 */
function formatStatus_(status) {
  switch (status) {
    case 'all_clear': return 'All Clear';
    case 'flag': return 'Flag';
    case 'urgent_alert': return 'Urgent Alert';
    default: return status || 'Unknown';
  }
}

/**
 * Write a trade to the Rebalance History tab.
 *
 * @param {Object} trade - { date, ticker, action, shares, price, amount, investor, rationale, triggeredBy }
 */
function logTrade(trade) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Rebalance History');
  if (!sheet) throw new Error('Rebalance History tab not found');

  var row = [
    trade.date || formatDate(now()),
    trade.ticker || '',
    trade.action || '',
    trade.shares || 0,
    trade.price || 0,
    trade.amount || (trade.shares * trade.price) || 0,
    trade.investor || '',
    trade.rationale || '',
    trade.triggeredBy || ''
  ];

  sheet.appendRow(row);
  logInfo('Logged trade: ' + trade.action + ' ' + trade.shares + ' ' + trade.ticker);
}

/**
 * Update the "Last Updated" timestamp on the Dashboard tab.
 */
function updateDashboardTimestamp() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var dashboard = ss.getSheetByName('Dashboard');
  if (!dashboard) return;

  var data = dashboard.getDataRange().getValues();
  for (var i = 0; i < data.length; i++) {
    if (String(data[i][0]).trim() === 'Last Updated') {
      dashboard.getRange(i + 1, 2).setValue(
        formatDate(now()) + ' ' + formatTime(now()) + ' ET'
      );
      return;
    }
  }

  // If "Last Updated" label not found, append it at the bottom
  var lastRow = dashboard.getLastRow();
  dashboard.getRange(lastRow + 2, 1).setValue('Last Updated');
  dashboard.getRange(lastRow + 2, 2).setValue(
    formatDate(now()) + ' ' + formatTime(now()) + ' ET'
  );
}

/**
 * Write buy prices to the Positions tab and Dashboard tab.
 *
 * @param {Object} buyPrices - Map of ticker -> buy price
 */
function writeBuyPrices(buyPrices) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // Update Positions tab
  var posSheet = ss.getSheetByName('Positions');
  if (posSheet) {
    var posData = posSheet.getDataRange().getValues();
    var headers = posData[0].map(function(h) { return String(h).trim(); });
    var tickerCol = headers.indexOf('Ticker');
    var buyPriceCol = headers.indexOf('Buy Price');

    if (tickerCol >= 0 && buyPriceCol >= 0) {
      for (var i = 1; i < posData.length; i++) {
        var ticker = String(posData[i][tickerCol]).trim();
        if (buyPrices[ticker] != null) {
          posSheet.getRange(i + 1, buyPriceCol + 1).setValue(buyPrices[ticker]);
        }
      }
    }
  }

  // Update Dashboard tab
  var dashboard = ss.getSheetByName('Dashboard');
  if (dashboard) {
    var dashData = dashboard.getDataRange().getValues();
    var dashHeaders = dashData[0].map(function(h) { return String(h).trim(); });
    var dashTickerCol = dashHeaders.indexOf('Ticker');
    var dashBuyPriceCol = dashHeaders.indexOf('Buy Price');

    if (dashTickerCol >= 0 && dashBuyPriceCol >= 0) {
      for (var j = 1; j < dashData.length; j++) {
        var t = String(dashData[j][dashTickerCol]).trim();
        if (buyPrices[t] != null) {
          dashboard.getRange(j + 1, dashBuyPriceCol + 1).setValue(buyPrices[t]);
        }
      }
    }
  }
}
