/**
 * EmailAlerter.js — Send daily summary and weekly digest emails
 */

/**
 * Send the daily summary email to all investors with alerts enabled.
 * Includes flags, AI assessment, recommendation, and full positions table.
 *
 * @param {Object} portfolioState - From calculatePortfolioState()
 * @param {Object} aiResult - From runAIAnalysis()
 * @param {Object} settings - From readSettings()
 */
function sendDailySummary(portfolioState, aiResult, settings, rebalanceSuggestions) {
  var recipients = settings.investors.filter(function(inv) { return inv.alertsEnabled && inv.email; });
  if (recipients.length === 0) {
    logInfo('No recipients with alerts enabled — skipping daily summary email');
    return;
  }

  var hasFlags = (portfolioState.flags && portfolioState.flags.length > 0) ||
                 (aiResult.flags && aiResult.flags.length > 0);
  var dateStr = formatDate(now());

  for (var i = 0; i < recipients.length; i++) {
    var investor = recipients[i];
    var subject = hasFlags
      ? '⚠️ Portfolio Flag — ' + dateStr
      : '📊 Portfolio Daily Summary — ' + dateStr;

    var body = buildDailySummaryBody_(investor, portfolioState, aiResult, settings, rebalanceSuggestions);

    try {
      MailApp.sendEmail({
        to: investor.email,
        subject: subject,
        htmlBody: body
      });
      logInfo('Sent daily summary to ' + investor.email);
    } catch (e) {
      logError('Failed to send daily summary to ' + investor.email, e);
    }
  }
}

/**
 * Build daily summary email HTML body matching the clean summary format.
 */
function buildDailySummaryBody_(investor, portfolioState, aiResult, settings, rebalanceSuggestions) {
  var investorState = portfolioState.investors[investor.name];
  var dateStr = formatDate(now());
  var dailyPct = investorState ? investorState.dailyChangePct : 0;
  var topMover = portfolioState.topMover || { ticker: '', change: 0 };

  var flags = (portfolioState.flags || []).concat(aiResult.flags || []);
  var uniqueFlags = flags.filter(function(f, idx) { return flags.indexOf(f) === idx; });

  var html = '<div style="font-family: -apple-system, BlinkMacSystemFont, \'Segoe UI\', Roboto, sans-serif; max-width: 600px; margin: 0 auto; color: #1a1a1a;">';

  // Title
  html += '<h2 style="margin: 0 0 8px 0; font-size: 22px; font-weight: 600;">Portfolio Daily Summary — ' + formatDateReadable_(dateStr) + '</h2>';

  // Subtitle
  html += '<p style="margin: 0 0 24px 0; font-size: 14px; color: #555;"><strong>Portfolio Change: ' +
    formatPercent(dailyPct) + '</strong> | Top Mover: ' + topMover.ticker + ' (' + formatPercent(topMover.change) + ')</p>';

  // Flags section
  if (uniqueFlags.length > 0) {
    html += '<hr style="border: none; border-top: 1px solid #e0e0e0; margin: 0 0 20px 0;">';
    html += '<h3 style="margin: 0 0 12px 0; font-size: 17px;">⚠️ Flags Triggered</h3>';
    html += '<ul style="margin: 0 0 20px 0; padding-left: 20px;">';
    for (var f = 0; f < uniqueFlags.length; f++) {
      html += '<li style="margin: 4px 0; font-size: 14px;">' + uniqueFlags[f] + '</li>';
    }
    html += '</ul>';
  }

  // AI Assessment
  html += '<hr style="border: none; border-top: 1px solid #e0e0e0; margin: 0 0 20px 0;">';
  html += '<h3 style="margin: 0 0 8px 0; font-size: 17px;">AI Assessment</h3>';
  html += '<p style="margin: 0 0 20px 0; font-size: 14px; line-height: 1.5;">' +
    (aiResult.assessment || 'No assessment available.') + '</p>';

  // Recommendation
  html += '<h3 style="margin: 0 0 8px 0; font-size: 17px;">Recommendation</h3>';
  html += '<p style="margin: 0 0 20px 0; font-size: 14px; line-height: 1.5;"><strong>' +
    (aiResult.recommendation || 'Hold') + '.</strong>';
  // If the assessment has more detail beyond the recommendation, it's already in the assessment section
  html += '</p>';

  // Thesis Updates
  if (aiResult.thesisUpdates && aiResult.thesisUpdates.length > 0) {
    var nonIntact = aiResult.thesisUpdates.filter(function (t) {
      var s = t.status || t.thesis_status || 'intact';
      return s !== 'intact';
    });
    if (nonIntact.length > 0) {
      html += '<hr style="border: none; border-top: 1px solid #e0e0e0; margin: 0 0 20px 0;">';
      html += '<h3 style="margin: 0 0 8px 0; font-size: 17px;">Thesis Updates</h3>';
      html += '<ul style="margin: 0 0 20px 0; padding-left: 20px;">';
      for (var tu = 0; tu < nonIntact.length; tu++) {
        var update = nonIntact[tu];
        var statusEmoji = '';
        var s = update.status || update.thesis_status || '';
        if (s === 'strengthening') statusEmoji = '🟢 ';
        else if (s === 'weakening') statusEmoji = '🟡 ';
        else if (s === 'broken') statusEmoji = '🔴 ';
        html += '<li style="margin: 4px 0; font-size: 14px;">' + statusEmoji + '<strong>' +
          update.ticker + '</strong> — ' + s + ': ' + (update.note || update.notes || '') + '</li>';
      }
      html += '</ul>';
    }
  }

  // Rebalance Suggestions
  if (rebalanceSuggestions && rebalanceSuggestions.length > 0) {
    html += '<hr style="border: none; border-top: 1px solid #e0e0e0; margin: 0 0 20px 0;">';
    html += '<h3 style="margin: 0 0 8px 0; font-size: 17px;">Rebalance Suggestions</h3>';
    html += '<p style="margin: 0 0 12px 0; font-size: 13px; color: #888; font-style: italic;">' +
      'The following positions have drifted beyond the weight drift threshold:</p>';
    html += '<table style="border-collapse: collapse; width: 100%; font-size: 14px;">';
    html += '<tr style="border-bottom: 2px solid #e0e0e0;">';
    html += '<td style="padding: 8px; font-weight: 600;">Action</td>';
    html += '<td style="padding: 8px; font-weight: 600;">Ticker</td>';
    html += '<td style="padding: 8px; font-weight: 600;">Shares</td>';
    html += '<td style="padding: 8px; font-weight: 600;">Amount</td>';
    html += '<td style="padding: 8px; font-weight: 600;">Drift</td>';
    html += '</tr>';
    for (var rb = 0; rb < rebalanceSuggestions.length; rb++) {
      var sug = rebalanceSuggestions[rb];
      var actionColor = sug.action === 'Buy' ? '#059669' : '#dc2626';
      html += '<tr style="border-bottom: 1px solid #e0e0e0;">';
      html += '<td style="padding: 8px; color: ' + actionColor + '; font-weight: 600;">' + sug.action + '</td>';
      html += '<td style="padding: 8px; font-weight: 600;">' + sug.ticker + '</td>';
      html += '<td style="padding: 8px;">' + sug.shares + '</td>';
      html += '<td style="padding: 8px;">' + formatCurrency(sug.amount) + '</td>';
      html += '<td style="padding: 8px;">' + (sug.drift > 0 ? '+' : '') + (sug.drift * 100).toFixed(1) + '%</td>';
      html += '</tr>';
    }
    html += '</table>';
    if (aiResult.rebalanceAction && aiResult.rebalanceAction !== 'none') {
      html += '<p style="margin: 12px 0 0 0; font-size: 14px; line-height: 1.5;"><strong>AI recommendation:</strong> ' +
        aiResult.rebalanceAction + '</p>';
    }
  }

  // Positions table
  html += '<hr style="border: none; border-top: 1px solid #e0e0e0; margin: 0 0 20px 0;">';
  html += '<h3 style="margin: 0 0 12px 0; font-size: 17px;">All Positions (sorted by daily change)</h3>';
  html += buildPositionsTable_(investorState, portfolioState);

  html += '</div>';

  return html;
}

/**
 * Build the positions table HTML, sorted by daily change descending.
 */
function buildPositionsTable_(investorState, portfolioState) {
  if (!investorState) return '<p style="font-size: 14px;">No position data available.</p>';

  // Build position rows with daily change data
  var rows = [];
  for (var p = 0; p < investorState.positions.length; p++) {
    var pos = investorState.positions[p];
    var posInfo = portfolioState.positions[pos.ticker];
    rows.push({
      ticker: pos.ticker,
      weight: posInfo.targetWeight,
      price: posInfo.currentPrice,
      dailyChangePct: posInfo.dailyChangePct
    });
  }

  // Sort by daily change descending (biggest gainers first)
  rows.sort(function(a, b) {
    var aVal = a.dailyChangePct != null ? a.dailyChangePct : -999;
    var bVal = b.dailyChangePct != null ? b.dailyChangePct : -999;
    return bVal - aVal;
  });

  var html = '<table style="border-collapse: collapse; width: 100%; font-size: 14px;">';
  html += '<tr style="border-bottom: 2px solid #e0e0e0;">';
  html += '<td style="padding: 10px 12px; font-weight: 600;">Ticker</td>';
  html += '<td style="padding: 10px 12px; font-weight: 600;">Weight</td>';
  html += '<td style="padding: 10px 12px; font-weight: 600;">Price</td>';
  html += '<td style="padding: 10px 12px; font-weight: 600;">Daily Chg</td>';
  html += '</tr>';

  for (var r = 0; r < rows.length; r++) {
    var row = rows[r];
    var chgStr = row.dailyChangePct != null ? formatPercent(row.dailyChangePct) : '—';
    var isBigMove = row.dailyChangePct != null && Math.abs(row.dailyChangePct) >= 0.05;
    var chgStyle = isBigMove ? 'font-weight: 700;' : '';

    html += '<tr style="border-bottom: 1px solid #e0e0e0;">';
    html += '<td style="padding: 10px 12px;">' + row.ticker + '</td>';
    html += '<td style="padding: 10px 12px;">' + Math.round(row.weight * 100) + '%</td>';
    html += '<td style="padding: 10px 12px;">' + (row.price ? formatCurrency(row.price) : 'N/A') + '</td>';
    html += '<td style="padding: 10px 12px; ' + chgStyle + '">' + chgStr + '</td>';
    html += '</tr>';
  }

  html += '</table>';
  return html;
}

/**
 * Format a YYYY-MM-DD date as "April 9, 2026"
 */
function formatDateReadable_(dateStr) {
  var months = ['January','February','March','April','May','June',
                'July','August','September','October','November','December'];
  var parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  var month = months[parseInt(parts[1], 10) - 1] || parts[1];
  var day = parseInt(parts[2], 10);
  return month + ' ' + day + ', ' + parts[0];
}

/**
 * Send the weekly digest email to all investors with alerts enabled.
 *
 * @param {Object} portfolioState - Current portfolio state
 * @param {Array} weekEntries - This week's monitoring log entries
 * @param {Object} priceHistory - Map of date -> { ticker -> price }
 * @param {Object} aiResult - Latest AI result (may include weekly deep data)
 * @param {Object} settings - From readSettings()
 */
function sendWeeklyDigest(portfolioState, weekEntries, priceHistory, aiResult, settings) {
  var recipients = settings.investors.filter(function(inv) { return inv.alertsEnabled && inv.email; });
  if (recipients.length === 0) {
    logInfo('No recipients with alerts enabled — skipping weekly digest');
    return;
  }

  // Calculate date range for subject
  var dates = weekEntries.map(function(e) { return e['Date']; }).filter(function(d) { return d; });
  var dateRange = '';
  if (dates.length > 0) {
    var first = dates[0] instanceof Date ? formatDate(dates[0]) : String(dates[0]);
    var last = dates[dates.length - 1] instanceof Date ? formatDate(dates[dates.length - 1]) : String(dates[dates.length - 1]);
    dateRange = formatDateShort_(first) + '–' + formatDateShort_(last);
  } else {
    dateRange = formatDate(now());
  }

  for (var i = 0; i < recipients.length; i++) {
    var investor = recipients[i];
    var subject = '📈 Weekly Portfolio Digest — ' + dateRange;
    var body = buildWeeklyDigestBody_(investor, portfolioState, weekEntries, priceHistory, aiResult, settings);

    try {
      MailApp.sendEmail({
        to: investor.email,
        subject: subject,
        htmlBody: body
      });
      logInfo('Sent weekly digest to ' + investor.email);
    } catch (e) {
      logError('Failed to send weekly digest to ' + investor.email, e);
    }
  }
}

/**
 * Build weekly digest email HTML body matching the comprehensive Tasklet format.
 */
function buildWeeklyDigestBody_(investor, portfolioState, weekEntries, priceHistory, aiResult, settings) {
  var investorState = portfolioState.investors[investor.name];
  var tickers = Object.keys(portfolioState.positions);

  // Calculate date range
  var entryDates = [];
  for (var ed = 0; ed < weekEntries.length; ed++) {
    var d = weekEntries[ed]['Date'];
    entryDates.push(d instanceof Date ? formatDate(d) : String(d).trim());
  }
  var firstDate = entryDates.length > 0 ? entryDates[0] : formatDate(now());
  var lastDate = entryDates.length > 0 ? entryDates[entryDates.length - 1] : formatDate(now());

  var html = '<div style="font-family: -apple-system, BlinkMacSystemFont, \'Segoe UI\', Roboto, sans-serif; max-width: 700px; margin: 0 auto; color: #1a1a1a;">';

  // Title
  html += '<h2 style="margin: 0 0 24px 0; font-size: 24px; font-weight: 600;">📈 Weekly Portfolio Digest — Week of ' +
    formatDateReadable_(firstDate) + ' to ' + formatDateReadable_(lastDate) + '</h2>';

  // --- Performance Summary ---
  html += buildPerformanceSummary_(weekEntries, entryDates);

  // --- Top Movers Table (daily breakdown) ---
  html += '<hr style="border: none; border-top: 1px solid #e0e0e0; margin: 24px 0;">';
  html += buildWeeklyMoversTable_(tickers, priceHistory, entryDates, portfolioState);

  // --- Flags by Day ---
  html += '<hr style="border: none; border-top: 1px solid #e0e0e0; margin: 24px 0;">';
  html += buildWeeklyFlags_(weekEntries, entryDates);

  // --- AI Assessment Summary ---
  html += '<hr style="border: none; border-top: 1px solid #e0e0e0; margin: 24px 0;">';
  html += buildAISummaryTable_(weekEntries, entryDates, aiResult);

  // --- Portfolio Snapshot ---
  html += '<hr style="border: none; border-top: 1px solid #e0e0e0; margin: 24px 0;">';
  html += buildPortfolioSnapshot_(portfolioState, settings);

  // --- Looking Ahead ---
  if ((aiResult.lookingAhead && aiResult.lookingAhead.length > 0) || aiResult.outlook) {
    html += '<hr style="border: none; border-top: 1px solid #e0e0e0; margin: 24px 0;">';
    html += '<h3 style="margin: 0 0 12px 0; font-size: 20px;">Looking Ahead</h3>';

    if (aiResult.lookingAhead && aiResult.lookingAhead.length > 0) {
      html += '<p style="margin: 0 0 8px 0; font-size: 14px;"><strong>Key Items to Watch Next Week:</strong></p>';
      html += '<ul style="margin: 0 0 16px 0; padding-left: 20px;">';
      for (var la = 0; la < aiResult.lookingAhead.length; la++) {
        html += '<li style="margin: 6px 0; font-size: 14px; line-height: 1.5;">' + aiResult.lookingAhead[la] + '</li>';
      }
      html += '</ul>';
    }

    if (aiResult.outlook) {
      html += '<p style="margin: 0 0 0 0; font-size: 14px; line-height: 1.5;"><strong>Outlook:</strong> ' + aiResult.outlook + '</p>';
    }
  }

  // Footer
  html += '<hr style="border: none; border-top: 1px solid #e0e0e0; margin: 24px 0;">';
  html += '<p style="font-size: 13px; color: #888; font-style: italic;">This is an automated weekly digest from your AI Portfolio Monitor. ' +
    '<a href="' + getSheetUrl() + '" style="color: #888;">View the full daily log &rarr;</a></p>';

  html += '</div>';
  return html;
}

/**
 * Build the performance summary section (weekly change, best/worst day).
 */
function buildPerformanceSummary_(weekEntries, entryDates) {
  var html = '<h3 style="margin: 0 0 12px 0; font-size: 20px;">Portfolio Performance This Week</h3>';

  // Parse daily changes from monitoring log
  var dailyChanges = [];
  for (var i = 0; i < weekEntries.length; i++) {
    var chg = parseNumber(weekEntries[i]['Daily Change (%)']);
    var dateStr = entryDates[i];
    dailyChanges.push({ date: dateStr, change: chg || 0, entry: weekEntries[i] });
  }

  // Weekly total (compound)
  var weeklyTotal = 1;
  for (var w = 0; w < dailyChanges.length; w++) {
    weeklyTotal *= (1 + dailyChanges[w].change);
  }
  weeklyTotal = weeklyTotal - 1;

  // Best and worst days
  var best = dailyChanges[0] || { date: '', change: 0 };
  var worst = dailyChanges[0] || { date: '', change: 0 };
  for (var d = 1; d < dailyChanges.length; d++) {
    if (dailyChanges[d].change > best.change) best = dailyChanges[d];
    if (dailyChanges[d].change < worst.change) worst = dailyChanges[d];
  }

  var rocketEmoji = weeklyTotal > 0.05 ? ' 🚀' : '';

  html += '<ul style="margin: 0 0 16px 0; padding-left: 20px; font-size: 14px; line-height: 1.8;">';
  html += '<li><strong>Weekly change: ' + formatPercent(weeklyTotal) + rocketEmoji + '</strong></li>';
  if (dailyChanges.length > 1) {
    html += '<li><strong>Best day:</strong> ' + formatDayDate_(best.date) + ' (' + formatPercent(best.change) + ')</li>';
    html += '<li><strong>Worst day:</strong> ' + formatDayDate_(worst.date) + ' (' + formatPercent(worst.change) + ')</li>';
  }
  html += '</ul>';

  html += '<p style="margin: 0; font-size: 13px; color: #888; font-style: italic; border-left: 3px solid #e0e0e0; padding-left: 12px;">' +
    'Note: Data covers ' + weekEntries.length + ' trading session(s).</p>';

  return html;
}

/**
 * Build the weekly movers table with daily breakdown columns.
 * Falls back to buy price → current price for week total when price history is incomplete.
 */
function buildWeeklyMoversTable_(tickers, priceHistory, entryDates, portfolioState) {
  var html = '<h3 style="margin: 0 0 4px 0; font-size: 20px;">Top Movers This Week</h3>';
  html += '<p style="margin: 0 0 12px 0; font-size: 13px; color: #888; font-style: italic;">Sorted by absolute weekly change — all ' + tickers.length + ' positions</p>';

  // Get sorted dates from price history
  var historyDates = Object.keys(priceHistory).sort();
  var hasFullHistory = true;

  // For each entry date, calculate per-ticker daily change
  var tickerWeekData = {}; // ticker -> { dailyChanges: [{ date, pct }], weekTotal }
  for (var t = 0; t < tickers.length; t++) {
    tickerWeekData[tickers[t]] = { dailyChanges: [], weekTotal: 1, hasDailyData: false };
  }

  for (var d = 0; d < entryDates.length; d++) {
    var date = entryDates[d];
    var prevDate = null;

    // Find the previous date in history
    for (var h = 0; h < historyDates.length; h++) {
      if (historyDates[h] === date && h > 0) {
        prevDate = historyDates[h - 1];
        break;
      }
    }

    for (var t2 = 0; t2 < tickers.length; t2++) {
      var ticker = tickers[t2];
      var todayPrice = priceHistory[date] ? priceHistory[date][ticker] : null;
      var prevPrice = prevDate && priceHistory[prevDate] ? priceHistory[prevDate][ticker] : null;

      var dailyPct = null;
      if (todayPrice && prevPrice && prevPrice > 0) {
        dailyPct = (todayPrice - prevPrice) / prevPrice;
        tickerWeekData[ticker].hasDailyData = true;
      } else {
        hasFullHistory = false;
      }

      tickerWeekData[ticker].dailyChanges.push({ date: date, pct: dailyPct });
      if (dailyPct != null) {
        tickerWeekData[ticker].weekTotal *= (1 + dailyPct);
      }
    }
  }

  // Finalize week totals — fall back to buy price → current price when history is incomplete
  for (var tk in tickerWeekData) {
    if (tickerWeekData[tk].hasDailyData) {
      tickerWeekData[tk].weekTotal = tickerWeekData[tk].weekTotal - 1;
    } else {
      // Fallback: use total P&L from buy price as the "week" change
      var posInfo = portfolioState.positions[tk];
      if (posInfo && posInfo.currentPrice && posInfo.buyPrice && posInfo.buyPrice > 0) {
        tickerWeekData[tk].weekTotal = (posInfo.currentPrice - posInfo.buyPrice) / posInfo.buyPrice;
      } else {
        tickerWeekData[tk].weekTotal = 0;
      }
    }
  }

  // Sort by absolute week total
  var sortedTickers = tickers.slice().sort(function(a, b) {
    return Math.abs(tickerWeekData[b].weekTotal) - Math.abs(tickerWeekData[a].weekTotal);
  });

  // Only show daily columns if we have at least some daily data
  var showDailyColumns = hasFullHistory || entryDates.length <= 1;

  // Build table
  html += '<table style="border-collapse: collapse; width: 100%; font-size: 14px;">';
  html += '<tr style="border-bottom: 2px solid #e0e0e0;">';
  html += '<td style="padding: 10px 8px; font-weight: 600;">Ticker</td>';
  if (showDailyColumns) {
    for (var hd = 0; hd < entryDates.length; hd++) {
      html += '<td style="padding: 10px 8px; font-weight: 600;">' + formatDayDateShort_(entryDates[hd]) + '</td>';
    }
  }
  html += '<td style="padding: 10px 8px; font-weight: 600;">Week Total</td>';
  html += '</tr>';

  for (var s = 0; s < sortedTickers.length; s++) {
    var st = sortedTickers[s];
    var data = tickerWeekData[st];

    html += '<tr style="border-bottom: 1px solid #e0e0e0;">';
    html += '<td style="padding: 10px 8px; font-weight: 600;">' + st + '</td>';

    if (showDailyColumns) {
      for (var dc = 0; dc < data.dailyChanges.length; dc++) {
        var pct = data.dailyChanges[dc].pct;
        var pctStr = pct != null ? formatPercentSigned_(pct) : '—';
        html += '<td style="padding: 10px 8px;">' + pctStr + '</td>';
      }
    }

    var weekStr = formatPercentSigned_(data.weekTotal);
    var weekBold = Math.abs(data.weekTotal) >= 0.05 ? 'font-weight: 700;' : 'font-weight: 600;';
    html += '<td style="padding: 10px 8px; ' + weekBold + '">' + weekStr + '</td>';
    html += '</tr>';
  }

  html += '</table>';

  if (!hasFullHistory) {
    html += '<p style="margin: 8px 0 0 0; font-size: 13px; color: #888; font-style: italic;">Note: Daily breakdown columns will appear once a full week of price history has been collected. Week totals show change since buy price.</p>';
  }

  return html;
}

/**
 * Build the flags-by-day section.
 */
function buildWeeklyFlags_(weekEntries, entryDates) {
  var html = '<h3 style="margin: 0 0 12px 0; font-size: 20px;">Flags Triggered This Week</h3>';

  var anyFlags = false;
  for (var i = 0; i < weekEntries.length; i++) {
    var flagStr = weekEntries[i]['Flags'] ? String(weekEntries[i]['Flags']).trim() : '';
    if (flagStr) anyFlags = true;
  }

  if (!anyFlags) {
    html += '<p style="font-size: 14px;">No flags triggered this week — all clear.</p>';
    return html;
  }

  for (var d = 0; d < weekEntries.length; d++) {
    var entry = weekEntries[d];
    var flagStr2 = entry['Flags'] ? String(entry['Flags']).trim() : '';
    if (!flagStr2) continue;

    var flags = flagStr2.split(',').map(function(f) { return f.trim(); }).filter(function(f) { return f; });
    var status = entry['Status'] ? String(entry['Status']).trim() : '';
    var isUrgent = status === 'Urgent Alert' || status === 'Flag';

    html += '<p style="margin: 16px 0 8px 0; font-size: 14px;"><strong>' +
      formatDayDate_(entryDates[d]) + (isUrgent ? ' ⚠️' : '') + ':</strong></p>';
    html += '<ul style="margin: 0 0 0 0; padding-left: 20px;">';
    for (var f = 0; f < flags.length; f++) {
      html += '<li style="margin: 4px 0; font-size: 14px;">' + flags[f] + '</li>';
    }
    html += '</ul>';
  }

  return html;
}

/**
 * Build the AI Assessment Summary table (date / status / key takeaway).
 */
function buildAISummaryTable_(weekEntries, entryDates, aiResult) {
  var html = '<h3 style="margin: 0 0 12px 0; font-size: 20px;">AI Assessment Summary</h3>';

  html += '<table style="border-collapse: collapse; width: 100%; font-size: 14px;">';
  html += '<tr style="border-bottom: 2px solid #e0e0e0;">';
  html += '<td style="padding: 10px 8px; font-weight: 600; width: 80px;">Date</td>';
  html += '<td style="padding: 10px 8px; font-weight: 600; width: 90px;">Status</td>';
  html += '<td style="padding: 10px 8px; font-weight: 600;">Key Takeaway</td>';
  html += '</tr>';

  for (var i = 0; i < weekEntries.length; i++) {
    var entry = weekEntries[i];
    var status = entry['Status'] ? String(entry['Status']).trim() : 'Unknown';
    var assessment = entry['AI Assessment'] ? String(entry['AI Assessment']).trim() : '';

    // Truncate assessment for table
    if (assessment.length > 200) {
      assessment = assessment.substring(0, 197) + '...';
    }

    var statusEmoji = '✅';
    if (status === 'Flag') statusEmoji = '🟡';
    if (status === 'Urgent Alert') statusEmoji = '🔴';

    html += '<tr style="border-bottom: 1px solid #e0e0e0; vertical-align: top;">';
    html += '<td style="padding: 10px 8px;">' + formatDayDateShort_(entryDates[i]) + '</td>';
    html += '<td style="padding: 10px 8px;">' + statusEmoji + ' ' + status.toLowerCase().replace(' ', '_') + '</td>';
    html += '<td style="padding: 10px 8px;">' + assessment + '</td>';
    html += '</tr>';
  }

  html += '</table>';

  // Pattern and recommendation
  if (aiResult.pattern) {
    html += '<p style="margin: 16px 0 8px 0; font-size: 14px; line-height: 1.5;"><strong>Pattern:</strong> ' + aiResult.pattern + '</p>';
  }

  // Aggregate recommendation
  var recommendations = weekEntries.map(function(e) { return e['Recommendation'] ? String(e['Recommendation']).trim() : ''; })
    .filter(function(r) { return r; });
  var allHold = recommendations.every(function(r) { return r.toLowerCase().indexOf('hold') >= 0; });
  if (allHold && recommendations.length > 0) {
    html += '<p style="margin: 8px 0 0 0; font-size: 14px;"><strong>Recommendation across all ' +
      weekEntries.length + ' days:</strong> Hold all positions. No rebalancing needed.</p>';
  }

  return html;
}

/**
 * Build the portfolio snapshot section with investor table.
 */
function buildPortfolioSnapshot_(portfolioState, settings) {
  var html = '<h3 style="margin: 0 0 12px 0; font-size: 20px;">Portfolio Snapshot</h3>';

  html += '<table style="border-collapse: collapse; width: 100%; font-size: 14px;">';
  html += '<tr style="border-bottom: 2px solid #e0e0e0;">';
  html += '<td style="padding: 10px 8px; font-weight: 600;">Investor</td>';
  html += '<td style="padding: 10px 8px; font-weight: 600;">Portfolio Value</td>';
  html += '<td style="padding: 10px 8px; font-weight: 600;">Total P&L</td>';
  html += '<td style="padding: 10px 8px; font-weight: 600;">Status</td>';
  html += '</tr>';

  for (var i = 0; i < settings.investors.length; i++) {
    var inv = settings.investors[i];
    var is_ = portfolioState.investors[inv.name];

    html += '<tr style="border-bottom: 1px solid #e0e0e0;">';
    html += '<td style="padding: 10px 8px;">' + inv.name + '</td>';
    html += '<td style="padding: 10px 8px;">' + (is_ ? formatCurrency(is_.totalValue) : '—') + '</td>';
    html += '<td style="padding: 10px 8px;">' + (is_ ? formatPercent(is_.totalPnlPct) : '—') + '</td>';
    html += '<td style="padding: 10px 8px;">Active' + (inv.email ? '' : ' (no email on file)') + '</td>';
    html += '</tr>';
  }

  html += '</table>';
  return html;
}

/**
 * Format a percentage with explicit sign: +1.23% or -1.23%
 */
function formatPercentSigned_(value) {
  if (value == null || isNaN(value)) return '—';
  var sign = value >= 0 ? '+' : '';
  return sign + (value * 100).toFixed(2) + '%';
}

/**
 * Format a date as "Mon 4/7" style.
 */
function formatDayDateShort_(dateStr) {
  var days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  var parts = String(dateStr).split('-');
  if (parts.length !== 3) return dateStr;
  var d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
  var dayName = days[d.getDay()];
  return dayName + ' ' + (d.getMonth() + 1) + '/' + d.getDate();
}

/**
 * Format a date as "Wednesday Apr 8" style.
 */
function formatDayDate_(dateStr) {
  var days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  var parts = String(dateStr).split('-');
  if (parts.length !== 3) return dateStr;
  var d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
  return days[d.getDay()] + ' ' + months[d.getMonth()] + ' ' + d.getDate();
}

/**
 * Format date as "Apr 7–10, 2026" for subject line.
 */
function formatDateShort_(dateStr) {
  var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  var parts = String(dateStr).split('-');
  if (parts.length !== 3) return dateStr;
  var month = months[parseInt(parts[1], 10) - 1] || parts[1];
  var day = parseInt(parts[2], 10);
  return month + ' ' + day + ', ' + parts[0];
}

/**
 * Send an error notification email to the first investor.
 */
function sendErrorEmail(errorMessage, settings) {
  if (!settings || !settings.investors || settings.investors.length === 0) return;

  var recipient = settings.investors[0];
  if (!recipient.email) return;

  try {
    MailApp.sendEmail({
      to: recipient.email,
      subject: '🔴 ' + (settings.strategyName || 'Portfolio Monitor') + ' — Script Error',
      htmlBody: '<div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif;">' +
        '<p>The portfolio monitoring script encountered an error:</p>' +
        '<pre style="background: #f8f9fa; padding: 12px; border-radius: 6px; overflow-x: auto;">' +
        errorMessage + '</pre>' +
        '<p>The script will try again on the next scheduled run.</p>' +
        '</div>'
    });
  } catch (e) {
    logError('Failed to send error email', e);
  }
}

/**
 * Calculate the next quarterly review date (first week of Jul, Oct, Jan, Apr).
 */
function getNextQuarterlyReview_() {
  var today = now();
  var year = today.getFullYear();

  var quarters = [
    new Date(year, 0, 7),   // January
    new Date(year, 3, 7),   // April
    new Date(year, 6, 7),   // July
    new Date(year, 9, 7)    // October
  ];

  for (var i = 0; i < quarters.length; i++) {
    if (quarters[i] > today) {
      return formatDate(quarters[i]);
    }
  }
  return formatDate(new Date(year + 1, 0, 7));
}
