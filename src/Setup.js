/**
 * Setup.js — Parse strategy markdown, create tabs, populate from strategy, create triggers.
 *
 * The strategy is defined in a markdown file (e.g., strategies/strategy-example.md)
 * and compiled into StrategyConfig.js via `npm run build-strategy`.
 *
 * Run setupSheet() once to initialize all 5 tabs with headers, formulas, and data.
 * Run setupTriggers() to create the daily time-driven trigger.
 * Run updateStrategy() to apply changes from an updated strategy markdown.
 */

// ============================================================================
// MARKDOWN PARSER — Reads any strategy markdown into a structured object
// ============================================================================

/**
 * Parse a strategy markdown file into a structured object.
 * Supports any strategy that follows the standard markdown format.
 *
 * @param {string} mdText - Raw markdown text
 * @returns {Object} Parsed strategy object
 */
function parseStrategyMarkdown(mdText) {
  var strategy = {
    name: '',
    description: '',
    investors: [],
    positions: [],
    cash: { targetWeight: 0, purpose: '' },
    buckets: [],
    settings: {},
    managementStyle: {},
    rebalancingRules: []
  };

  // Extract name from title
  var titleMatch = mdText.match(/^#\s+Strategy:\s*(.+)$/m);
  if (titleMatch) strategy.name = titleMatch[1].trim();

  // Extract overview/description
  var overview = extractSection_(mdText, 'Overview');
  if (overview) strategy.description = overview.replace(/\n+/g, ' ').trim();

  // Parse investors table
  var investorsSection = extractSection_(mdText, 'Investors');
  if (investorsSection) {
    var invTable = parseMarkdownTable_(investorsSection);
    for (var i = 0; i < invTable.length; i++) {
      var row = invTable[i];
      strategy.investors.push({
        name: row['Name'] || '',
        email: row['Email'] || '',
        amount: parseMarkdownNumber_(row['Amount'] || '0'),
        date: row['Buy Date'] || ''
      });
    }
  }

  // Parse positions table
  var positionsSection = extractSection_(mdText, 'Positions');
  if (positionsSection) {
    var posTable = parseMarkdownTable_(positionsSection);
    for (var p = 0; p < posTable.length; p++) {
      var pr = posTable[p];
      var weightStr = (pr['Weight'] || '0').replace('%', '').trim();
      var buyPriceStr = pr['Buy Price'] || '';
      strategy.positions.push({
        ticker: pr['Ticker'] || '',
        company: pr['Company'] || '',
        bucket: pr['Bucket'] || '',
        weight: parseFloat(weightStr) || 0,
        buyPrice: (buyPriceStr === 'null' || buyPriceStr === '') ? null : parseMarkdownNumber_(buyPriceStr),
        thesis: pr['Thesis'] || ''
      });
    }
  }

  // Parse cash table
  var cashSection = extractSection_(mdText, 'Cash');
  if (cashSection) {
    var cashTable = parseMarkdownTable_(cashSection);
    if (cashTable.length > 0) {
      var cashRow = cashTable[0];
      var cashWeightStr = (cashRow['Target Weight'] || '0').replace('%', '').trim();
      strategy.cash = {
        targetWeight: parseFloat(cashWeightStr) || 0,
        purpose: cashRow['Purpose'] || ''
      };
    }
  }

  // Parse buckets table
  var bucketsSection = extractSection_(mdText, 'Buckets');
  if (bucketsSection) {
    var bucketTable = parseMarkdownTable_(bucketsSection);
    for (var b = 0; b < bucketTable.length; b++) {
      var br = bucketTable[b];
      var bWeightStr = (br['Weight'] || '0').replace('%', '').trim();
      strategy.buckets.push({
        name: br['Bucket'] || '',
        color: br['Color'] || '#666666',
        weight: parseFloat(bWeightStr) || 0
      });
    }
  }

  // Parse settings defaults table
  var settingsSection = extractSection_(mdText, 'Settings Defaults');
  if (settingsSection) {
    var settingsTable = parseMarkdownTable_(settingsSection);
    for (var s = 0; s < settingsTable.length; s++) {
      var sr = settingsTable[s];
      var key = sr['Setting'] || '';
      var val = sr['Value'] || '';
      switch (key) {
        case 'Daily Run Time': strategy.settings.dailyRunTime = val; break;
        case 'Timezone': strategy.settings.timezone = val; break;
        case 'Deep Analysis Day': strategy.settings.deepAnalysisDay = val; break;
        case 'Weekly Digest Day': strategy.settings.weeklyDigestDay = val; break;
        case 'Single Position Daily Move Alert': strategy.settings.singlePositionDailyMove = parseFloat(val) || 5; break;
        case 'Portfolio Daily Move Alert': strategy.settings.portfolioDailyMove = parseFloat(val) || 3; break;
        case 'Max Single Position Weight': strategy.settings.maxSinglePositionWeight = parseFloat(val) || 15; break;
        case 'Weight Drift Alert': strategy.settings.weightDriftAlert = parseFloat(val) || 5; break;
      }
    }
  }

  // Parse management style table
  var mgmtSection = extractSection_(mdText, 'Management Style');
  if (mgmtSection) {
    var mgmtTable = parseMarkdownTable_(mgmtSection);
    for (var m = 0; m < mgmtTable.length; m++) {
      var mk = mgmtTable[m]['Setting'] || '';
      var mv = mgmtTable[m]['Value'] || '';
      switch (mk) {
        case 'Style': strategy.managementStyle.style = mv; break;
        case 'Review Frequency': strategy.managementStyle.reviewFrequency = mv; break;
        case 'Rebalance Trigger': strategy.managementStyle.rebalanceTrigger = mv; break;
        case '13F Tracking': strategy.managementStyle.thirteenFTracking = mv; break;
        case 'Exit Criteria': strategy.managementStyle.exitCriteria = mv; break;
        case 'Trim Criteria': strategy.managementStyle.trimCriteria = mv; break;
        case 'Add Criteria': strategy.managementStyle.addCriteria = mv; break;
      }
    }
  }

  // Parse rebalancing rules (bullet list)
  var rebalanceSection = extractSection_(mdText, 'Rebalancing Rules');
  if (rebalanceSection) {
    strategy.rebalancingRules = extractListItems_(rebalanceSection);
  }

  return strategy;
}

/**
 * Extract the text content of a markdown section (## heading).
 * Returns text between the heading and the next ## heading (or end of file).
 */
function extractSection_(mdText, sectionName) {
  // Escape special regex characters in section name
  var escaped = sectionName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  var regex = new RegExp('##\\s+' + escaped + '[^\\n]*\\n([\\s\\S]*?)(?=\\n##\\s|$)');
  var match = mdText.match(regex);
  return match ? match[1].trim() : null;
}

/**
 * Parse a markdown table into an array of objects.
 * Each object has keys matching the header row.
 */
function parseMarkdownTable_(text) {
  var lines = text.split('\n');
  var rows = [];
  var headers = [];

  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    if (!line || line.charAt(0) !== '|') continue;

    // Split cells — handle pipe-delimited content
    var cells = splitTableRow_(line);

    if (headers.length === 0) {
      headers = cells;
      continue;
    }

    // Skip separator rows (|---|---|)
    if (cells.length > 0 && cells[0].match(/^[-:]+$/)) continue;

    var rowObj = {};
    for (var j = 0; j < headers.length; j++) {
      rowObj[headers[j]] = j < cells.length ? cells[j] : '';
    }
    rows.push(rowObj);
  }

  return rows;
}

/**
 * Split a markdown table row into cells, trimming whitespace.
 */
function splitTableRow_(line) {
  // Remove leading and trailing pipes
  var inner = line.replace(/^\|/, '').replace(/\|$/, '');
  return inner.split('|').map(function (c) { return c.trim(); });
}

/**
 * Extract bullet list items from markdown text.
 * Handles both - and * prefixes.
 */
function extractListItems_(text) {
  var items = [];
  var lines = text.split('\n');
  for (var i = 0; i < lines.length; i++) {
    var match = lines[i].match(/^\s*[-*]\s+(.+)$/);
    if (match) {
      items.push(match[1].trim());
    }
  }
  return items;
}

/**
 * Parse a number from markdown text, stripping $, commas, % signs.
 */
function parseMarkdownNumber_(value) {
  if (!value || value === 'null') return null;
  var cleaned = String(value).replace(/[$,%\s]/g, '');
  var num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

// ============================================================================
// PROMPT BUILDERS — Generate strategy-agnostic AI prompts
// ============================================================================

/**
 * Build the daily AI prompt template from strategy data.
 * The prompt is generic — it works with any strategy.
 * Strategy-specific context comes from {{placeholders}} filled at runtime.
 */
function buildDailyPrompt_(strategy) {
  var prompt = 'You are a portfolio analyst monitoring an investment portfolio. ' +
    'Your job is to assess whether any positions require attention TODAY and evaluate ' +
    'whether each position\'s investment thesis remains intact.\n\n' +
    'Be conservative — the investor wants to hold long-term and only act on material changes. ' +
    'Normal volatility is not actionable.\n\n';

  prompt += 'Strategy context:\n{{strategy_description}}\n\n';

  // Management style context
  var ms = strategy.managementStyle;
  if (ms.style) {
    prompt += 'Management style: ' + ms.style + '\n';
    if (ms.reviewFrequency) prompt += 'Review frequency: ' + ms.reviewFrequency + '\n';
    if (ms.rebalanceTrigger) prompt += 'Rebalance trigger: ' + ms.rebalanceTrigger + '\n';
    if (ms.exitCriteria) prompt += 'Exit criteria: ' + ms.exitCriteria + '\n';
    if (ms.trimCriteria) prompt += 'Trim criteria: ' + ms.trimCriteria + '\n';
    if (ms.addCriteria) prompt += 'Add criteria: ' + ms.addCriteria + '\n';
    prompt += '\n';
    prompt += 'Use the management style above to calibrate your recommendations. ' +
      'An "Active-Thesis" style means: hold by default, but proactively recommend action ' +
      'when a thesis changes, drift is significant, or exit/trim/add criteria are met. ' +
      'A "Passive" style means: almost never recommend action. ' +
      'An "Active" style means: actively recommend trades based on momentum and technicals.\n\n';
  }

  if (strategy.rebalancingRules.length > 0) {
    prompt += 'Rebalancing philosophy:\n';
    for (var i = 0; i < strategy.rebalancingRules.length; i++) {
      prompt += '- ' + strategy.rebalancingRules[i] + '\n';
    }
    prompt += '\n';
  }

  prompt += 'Current portfolio state:\n{{portfolio_state}}\n\n';
  prompt += 'Positions with significant moves today:\n{{flagged_positions}}\n\n';
  prompt += 'Position theses for context:\n{{position_theses}}\n\n';
  prompt += 'Weight drift and rebalance suggestions:\n{{rebalance_suggestions}}\n\n';
  prompt += 'Recent news for positions with significant moves:\n{{recent_news}}\n\n';

  prompt += 'IMPORTANT: Use the news headlines above to explain WHY positions moved today. ' +
    'Reference specific catalysts (earnings, deals, macro events, analyst actions) in your assessment. ' +
    'If news was found for a mover, your assessment MUST mention what drove the move.\n\n';

  prompt += 'For each position with a significant move (>3%) or thesis-relevant news, ' +
    'evaluate whether the original investment thesis is still intact.\n\n';

  prompt += 'Respond ONLY with a JSON object:\n' +
    '{\n' +
    '  "status": "all_clear" | "flag" | "urgent_alert",\n' +
    '  "assessment": "1-3 sentence summary referencing specific news catalysts that drove today\'s moves",\n' +
    '  "recommendation": "Hold" | "Monitor [ticker]" | "Consider [action] on [ticker]",\n' +
    '  "flags": ["list of specific flags if any, empty array if none"],\n' +
    '  "thesis_updates": [\n' +
    '    {"ticker": "...", "status": "intact|weakening|strengthening|broken", "note": "brief explanation"}\n' +
    '  ],\n' +
    '  "rebalance_action": "none | brief description of suggested rebalance if drift is significant"\n' +
    '}';

  return prompt;
}

/**
 * Build the weekly deep analysis prompt template from strategy data.
 */
function buildWeeklyPrompt_(strategy) {
  var base = buildDailyPrompt_(strategy);

  var weekly = base + '\n\n' +
    'ADDITIONAL WEEKLY ANALYSIS:\n' +
    'This is the weekly deep review. In addition to the daily assessment, also provide:\n\n' +
    '1. Review the thesis for EVERY position — is it still intact based on this week\'s news?\n' +
    '2. Assess the macro environment relevant to this strategy\n' +
    '3. Note any earnings reports this week that changed the outlook\n' +
    '4. Check for any public statements, interviews, or new SEC filings relevant to this strategy\n' +
    '5. Evaluate whether any position is materially over/underweight and suggest rebalancing trades\n' +
    '6. Provide a 1-paragraph "state of the portfolio" summary\n\n' +
    'Respond ONLY with a JSON object:\n' +
    '{\n' +
    '  "status": "all_clear" | "flag" | "urgent_alert",\n' +
    '  "assessment": "1-3 sentence summary",\n' +
    '  "recommendation": "Hold" | "Monitor [ticker]" | "Consider [action]",\n' +
    '  "flags": [],\n' +
    '  "weekly_summary": "1-paragraph state of the portfolio for the weekly digest email",\n' +
    '  "pattern": "2-3 sentence analysis of the key themes/catalysts that drove the portfolio this week",\n' +
    '  "looking_ahead": ["bullet point items to watch next week — specific catalysts, earnings, macro events"],\n' +
    '  "outlook": "1-paragraph forward-looking assessment of portfolio positioning",\n' +
    '  "position_reviews": [\n' +
    '    {"ticker": "...", "thesis_status": "intact|weakening|strengthening|broken", "notes": "brief note"}\n' +
    '  ],\n' +
    '  "macro_assessment": "1-2 sentences on macro environment relevant to this strategy",\n' +
    '  "quarterly_considerations": ["list of things to discuss at next quarterly review"],\n' +
    '  "rebalance_trades": [\n' +
    '    {"ticker": "...", "action": "buy|sell|trim|add", "reason": "brief explanation"}\n' +
    '  ]\n' +
    '}';

  return weekly;
}

// ============================================================================
// SETUP FUNCTIONS
// ============================================================================

/**
 * Main setup function. Parses the strategy markdown and creates all 5 tabs.
 * Run this once when setting up a new strategy.
 */
function setupSheet() {
  var strategy = parseStrategyMarkdown(STRATEGY_MARKDOWN);
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  logInfo('Setting up sheet for strategy: ' + strategy.name);

  // Create tabs (delete defaults if needed)
  var tabNames = ['Dashboard', 'Monitoring Log', 'Rebalance History', 'Positions', 'Settings'];
  for (var t = 0; t < tabNames.length; t++) {
    var existing = ss.getSheetByName(tabNames[t]);
    if (!existing) {
      ss.insertSheet(tabNames[t]);
    }
  }

  // Remove default "Sheet1" if it exists and is empty
  var sheet1 = ss.getSheetByName('Sheet1');
  if (sheet1 && ss.getSheets().length > 1) {
    try { ss.deleteSheet(sheet1); } catch (e) { /* ignore */ }
  }

  // Populate each tab
  setupPositionsTab_(ss, strategy);
  setupSettingsTab_(ss, strategy);
  setupDashboardTab_(ss, strategy);
  setupMonitoringLogTab_(ss, strategy);
  setupRebalanceHistoryTab_(ss);

  // Format
  formatSheet_(ss, strategy);

  logInfo('Sheet setup complete!');
  SpreadsheetApp.flush();
}

/**
 * Set up the Positions tab with all position data.
 */
function setupPositionsTab_(ss, strategy) {
  var sheet = ss.getSheetByName('Positions');
  sheet.clear();

  var headers = ['Ticker', 'Company', 'Bucket', 'Target Weight (%)', 'Buy Price', 'Thesis', 'Active'];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#f0f0f0');

  var data = strategy.positions.map(function (p) {
    return [p.ticker, p.company, p.bucket, p.weight, p.buyPrice || '', p.thesis, true];
  });
  if (data.length > 0) {
    sheet.getRange(2, 1, data.length, headers.length).setValues(data);
    sheet.getRange(2, 7, data.length, 1).insertCheckboxes();
  }

  sheet.setColumnWidth(1, 70);
  sheet.setColumnWidth(2, 180);
  sheet.setColumnWidth(3, 200);
  sheet.setColumnWidth(4, 120);
  sheet.setColumnWidth(5, 90);
  sheet.setColumnWidth(6, 500);
  sheet.setColumnWidth(7, 70);
}

/**
 * Set up the Settings tab with all configuration.
 */
function setupSettingsTab_(ss, strategy) {
  var sheet = ss.getSheetByName('Settings');
  sheet.clear();

  var settings = strategy.settings;
  var row = 1;

  // Strategy Info
  row = writeSection_(sheet, row, '### Strategy Info', [
    ['Strategy Name', strategy.name],
    ['Strategy Description', strategy.description],
    ['Created Date', strategy.investors.length > 0 ? strategy.investors[0].date : '']
  ]);

  row++;

  // Investors
  sheet.getRange(row, 1).setValue('### Investors').setFontWeight('bold');
  row++;
  var invHeaders = ['Name', 'Email', 'Invested Amount', 'Invested Date', 'Alerts Enabled'];
  sheet.getRange(row, 1, 1, invHeaders.length).setValues([invHeaders]).setFontWeight('bold').setBackground('#f0f0f0');
  row++;

  for (var i = 0; i < strategy.investors.length; i++) {
    var inv = strategy.investors[i];
    sheet.getRange(row, 1, 1, invHeaders.length).setValues([
      [inv.name, inv.email, inv.amount, inv.date, true]
    ]);
    sheet.getRange(row, 5).insertCheckboxes();
    row++;
  }

  row++;

  // Schedule
  row = writeSection_(sheet, row, '### Schedule', [
    ['Daily Run Time', settings.dailyRunTime || '07:30'],
    ['Timezone', settings.timezone || 'America/New_York'],
    ['Deep Analysis Day', settings.deepAnalysisDay || 'Monday'],
    ['Weekly Digest Day', settings.weeklyDigestDay || 'Friday'],
    ['Script Enabled', true]
  ]);
  sheet.getRange(row - 1, 2).insertCheckboxes();

  row++;

  // Management Style
  var mgmt = strategy.managementStyle;
  if (mgmt.style) {
    var mgmtPairs = [['Management Style', mgmt.style]];
    if (mgmt.reviewFrequency) mgmtPairs.push(['Review Frequency', mgmt.reviewFrequency]);
    if (mgmt.rebalanceTrigger) mgmtPairs.push(['Rebalance Trigger', mgmt.rebalanceTrigger]);
    if (mgmt.thirteenFTracking) mgmtPairs.push(['13F Tracking', mgmt.thirteenFTracking]);
    if (mgmt.exitCriteria) mgmtPairs.push(['Exit Criteria', mgmt.exitCriteria]);
    if (mgmt.trimCriteria) mgmtPairs.push(['Trim Criteria', mgmt.trimCriteria]);
    if (mgmt.addCriteria) mgmtPairs.push(['Add Criteria', mgmt.addCriteria]);
    row = writeSection_(sheet, row, '### Management Style', mgmtPairs);
    row++;
  }

  // Alert Thresholds
  row = writeSection_(sheet, row, '### Alert Thresholds', [
    ['Single Position Daily Move (%)', settings.singlePositionDailyMove || 5],
    ['Portfolio Daily Move (%)', settings.portfolioDailyMove || 3],
    ['Max Single Position Weight (%)', settings.maxSinglePositionWeight || 15],
    ['Weight Drift Alert (%)', settings.weightDriftAlert || 5]
  ]);

  row++;

  // Cash
  row = writeSection_(sheet, row, '### Cash', [
    ['Cash Target Weight (%)', strategy.cash.targetWeight],
    ['Cash Purpose', strategy.cash.purpose]
  ]);

  row++;

  // AI Configuration
  row = writeSection_(sheet, row, '### AI Configuration', [
    ['AI Enabled', true],
    ['AI Model', 'claude-sonnet-4-6'],
    ['API Key Property Name', 'CLAUDE_API_KEY']
  ]);
  var aiEnabledRow = row - 3;
  sheet.getRange(aiEnabledRow, 2).insertCheckboxes();

  row++;

  // AI Prompts — built generically from the strategy
  sheet.getRange(row, 1).setValue('### AI Prompts').setFontWeight('bold');
  row++;
  sheet.getRange(row, 1).setValue('Daily Prompt');
  sheet.getRange(row, 2).setValue(buildDailyPrompt_(strategy));
  row += 2;
  sheet.getRange(row, 1).setValue('Weekly Deep Prompt');
  sheet.getRange(row, 2).setValue(buildWeeklyPrompt_(strategy));

  sheet.setColumnWidth(1, 250);
  sheet.setColumnWidth(2, 600);
}

/**
 * Write a settings section with header and key-value rows.
 * Returns the next available row.
 */
function writeSection_(sheet, startRow, header, pairs) {
  sheet.getRange(startRow, 1).setValue(header).setFontWeight('bold');
  startRow++;

  for (var i = 0; i < pairs.length; i++) {
    sheet.getRange(startRow, 1).setValue(pairs[i][0]);
    sheet.getRange(startRow, 2).setValue(pairs[i][1]);
    startRow++;
  }

  return startRow;
}

/**
 * Set up the Dashboard tab with GOOGLEFINANCE formulas and calculated columns.
 */
function setupDashboardTab_(ss, strategy) {
  var sheet = ss.getSheetByName('Dashboard');
  sheet.clear();

  var investors = strategy.investors;
  var positions = strategy.positions;

  // Build header row
  var headers = ['Ticker', 'Company', 'Bucket', 'Target Weight (%)', 'Current Price', 'Buy Price'];
  for (var inv = 0; inv < investors.length; inv++) {
    var name = investors[inv].name;
    headers.push('Shares (' + name + ')');
    headers.push('Current Value (' + name + ')');
    headers.push('Current Weight (' + name + ')');
    headers.push('Weight Drift (' + name + ')');
    headers.push('P&L $ (' + name + ')');
    headers.push('P&L % (' + name + ')');
  }

  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#f0f0f0').setWrap(true);

  var dataStartRow = 2;
  for (var p = 0; p < positions.length; p++) {
    var row = dataStartRow + p;
    var pos = positions[p];

    sheet.getRange(row, 1).setValue(pos.ticker);
    sheet.getRange(row, 2).setValue(pos.company);
    sheet.getRange(row, 3).setValue(pos.bucket);
    sheet.getRange(row, 4).setValue(pos.weight);
    sheet.getRange(row, 5).setFormula('=IFERROR(GOOGLEFINANCE("' + pos.ticker + '", "price"), "N/A")');
    sheet.getRange(row, 6).setValue(pos.buyPrice || '');

    var colOffset = 7;
    for (var inv2 = 0; inv2 < investors.length; inv2++) {
      var investedAmount = investors[inv2].amount;
      var priceCol = 'E' + row;
      var buyPriceCol = 'F' + row;
      var weightCol = 'D' + row;
      var sharesCol = colLetter_(colOffset) + row;
      var valueCol = colLetter_(colOffset + 1) + row;

      var totalValueRow = dataStartRow + positions.length + 1;
      var totalValueCol = colLetter_(colOffset + 1) + totalValueRow;

      sheet.getRange(row, colOffset).setFormula(
        '=IF(' + buyPriceCol + '=""," ",' + investedAmount + '*' + weightCol + '/100/' + buyPriceCol + ')'
      );
      sheet.getRange(row, colOffset + 1).setFormula(
        '=IF(' + sharesCol + '=" ",' + investedAmount + '*' + weightCol + '/100,' + sharesCol + '*' + priceCol + ')'
      );
      sheet.getRange(row, colOffset + 2).setFormula(
        '=IF(' + totalValueCol + '=0,0,' + valueCol + '/' + totalValueCol + ')'
      );
      var cwCol = colLetter_(colOffset + 2) + row;
      sheet.getRange(row, colOffset + 3).setFormula(
        '=' + cwCol + '-' + weightCol + '/100'
      );
      sheet.getRange(row, colOffset + 4).setFormula(
        '=IF(OR(' + buyPriceCol + '="",' + sharesCol + '=" "),0,' + valueCol + '-(' + sharesCol + '*' + buyPriceCol + '))'
      );
      var pnlCol = colLetter_(colOffset + 4) + row;
      sheet.getRange(row, colOffset + 5).setFormula(
        '=IF(OR(' + buyPriceCol + '="",' + sharesCol + '=" "),0,' + pnlCol + '/(' + sharesCol + '*' + buyPriceCol + '))'
      );

      colOffset += 6;
    }
  }

  // Cash row
  var cashRow = dataStartRow + positions.length;
  sheet.getRange(cashRow, 1).setValue('CASH');
  sheet.getRange(cashRow, 2).setValue('Cash Reserve');
  sheet.getRange(cashRow, 4).setValue(strategy.cash.targetWeight);

  var colOff = 7;
  for (var inv3 = 0; inv3 < investors.length; inv3++) {
    sheet.getRange(cashRow, colOff + 1).setFormula(
      '=' + investors[inv3].amount + '*' + strategy.cash.targetWeight + '/100'
    );
    colOff += 6;
  }

  // Total row
  var totalRow = cashRow + 1;
  sheet.getRange(totalRow, 1).setValue('TOTAL');
  sheet.getRange(totalRow, 1).setFontWeight('bold');

  colOff = 7;
  for (var inv4 = 0; inv4 < investors.length; inv4++) {
    var valueColLetter = colLetter_(colOff + 1);
    var pnlColLetter = colLetter_(colOff + 4);

    sheet.getRange(totalRow, colOff + 1).setFormula(
      '=SUM(' + valueColLetter + dataStartRow + ':' + valueColLetter + cashRow + ')'
    );
    sheet.getRange(totalRow, colOff + 4).setFormula(
      '=SUM(' + pnlColLetter + dataStartRow + ':' + pnlColLetter + (cashRow - 1) + ')'
    );
    sheet.getRange(totalRow, colOff + 5).setFormula(
      '=IF(' + investors[inv4].amount + '=0,0,' + colLetter_(colOff + 4) + totalRow + '/' + investors[inv4].amount + ')'
    );

    colOff += 6;
  }

  // Last Updated
  var lastUpdatedRow = totalRow + 2;
  sheet.getRange(lastUpdatedRow, 1).setValue('Last Updated');
  sheet.getRange(lastUpdatedRow, 2).setValue('Not yet run');

  formatDashboardNumbers_(sheet, positions.length, investors.length, dataStartRow);
}

/**
 * Convert a 1-based column number to a letter (1=A, 2=B, ..., 27=AA).
 */
function colLetter_(col) {
  var letter = '';
  while (col > 0) {
    var rem = (col - 1) % 26;
    letter = String.fromCharCode(65 + rem) + letter;
    col = Math.floor((col - 1) / 26);
  }
  return letter;
}

/**
 * Format Dashboard numbers (currency, percentages).
 */
function formatDashboardNumbers_(sheet, posCount, invCount, dataStartRow) {
  var lastDataRow = dataStartRow + posCount + 1;

  sheet.getRange(dataStartRow, 5, posCount, 1).setNumberFormat('$#,##0.00');
  sheet.getRange(dataStartRow, 6, posCount, 1).setNumberFormat('$#,##0.00');

  var colOff = 7;
  for (var inv = 0; inv < invCount; inv++) {
    sheet.getRange(dataStartRow, colOff, posCount + 2, 1).setNumberFormat('#,##0.00');
    sheet.getRange(dataStartRow, colOff + 1, posCount + 2, 1).setNumberFormat('$#,##0.00');
    sheet.getRange(dataStartRow, colOff + 2, posCount + 2, 1).setNumberFormat('0.0%');
    sheet.getRange(dataStartRow, colOff + 3, posCount + 2, 1).setNumberFormat('+0.0%;-0.0%');
    sheet.getRange(dataStartRow, colOff + 4, posCount + 2, 1).setNumberFormat('$#,##0.00');
    sheet.getRange(dataStartRow, colOff + 5, posCount + 2, 1).setNumberFormat('+0.00%;-0.00%');
    colOff += 6;
  }
}

/**
 * Set up the Monitoring Log tab with headers.
 */
function setupMonitoringLogTab_(ss, strategy) {
  var sheet = ss.getSheetByName('Monitoring Log');
  sheet.clear();

  var headers = ['Date', 'Time', 'Run Type', 'Status'];
  for (var i = 0; i < strategy.investors.length; i++) {
    headers.push('Portfolio Value (' + strategy.investors[i].name + ')');
  }
  headers.push('Daily Change (%)');
  headers.push('Top Mover');
  headers.push('Top Mover Change (%)');
  headers.push('Flags');
  headers.push('AI Assessment');
  headers.push('Recommendation');

  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#f0f0f0');

  sheet.setColumnWidth(1, 100);
  sheet.setColumnWidth(2, 60);
  sheet.setColumnWidth(3, 100);
  sheet.setColumnWidth(4, 100);

  var col = 5;
  for (var j = 0; j < strategy.investors.length; j++) {
    sheet.setColumnWidth(col, 140); col++;
  }
  sheet.setColumnWidth(col, 110); col++;
  sheet.setColumnWidth(col, 80);  col++;
  sheet.setColumnWidth(col, 130); col++;
  sheet.setColumnWidth(col, 300); col++;
  sheet.setColumnWidth(col, 400); col++;
  sheet.setColumnWidth(col, 200);
}

/**
 * Set up the Rebalance History tab with headers.
 */
function setupRebalanceHistoryTab_(ss) {
  var sheet = ss.getSheetByName('Rebalance History');
  sheet.clear();

  var headers = ['Date', 'Ticker', 'Action', 'Shares', 'Price', 'Amount ($)', 'Investor', 'Rationale', 'Triggered By'];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#f0f0f0');

  sheet.setColumnWidth(1, 100);
  sheet.setColumnWidth(2, 70);
  sheet.setColumnWidth(3, 70);
  sheet.setColumnWidth(4, 80);
  sheet.setColumnWidth(5, 90);
  sheet.setColumnWidth(6, 100);
  sheet.setColumnWidth(7, 120);
  sheet.setColumnWidth(8, 300);
  sheet.setColumnWidth(9, 150);
}

/**
 * Apply general sheet formatting.
 */
function formatSheet_(ss, strategy) {
  var tabColors = {
    'Dashboard': '#2563eb',
    'Monitoring Log': '#059669',
    'Rebalance History': '#f59e0b',
    'Positions': '#7c3aed',
    'Settings': '#6b7280'
  };

  for (var name in tabColors) {
    var sheet = ss.getSheetByName(name);
    if (sheet) {
      sheet.setTabColor(tabColors[name]);
      sheet.setFrozenRows(1);
    }
  }

  // Conditional formatting for Dashboard weight drift
  var dashboard = ss.getSheetByName('Dashboard');
  if (dashboard) {
    var posCount = strategy.positions.length;
    var colOff = 7;
    for (var inv = 0; inv < strategy.investors.length; inv++) {
      var driftCol = colOff + 3;
      var range = dashboard.getRange(2, driftCol, posCount, 1);

      var ruleRed = SpreadsheetApp.newConditionalFormatRule()
        .whenNumberGreaterThan(0.05)
        .setBackground('#fecaca')
        .setRanges([range])
        .build();
      var ruleRedNeg = SpreadsheetApp.newConditionalFormatRule()
        .whenNumberLessThan(-0.05)
        .setBackground('#fecaca')
        .setRanges([range])
        .build();
      var ruleYellow = SpreadsheetApp.newConditionalFormatRule()
        .whenNumberGreaterThan(0.03)
        .setBackground('#fef3c7')
        .setRanges([range])
        .build();

      var rules = dashboard.getConditionalFormatRules();
      rules.push(ruleRed, ruleRedNeg, ruleYellow);
      dashboard.setConditionalFormatRules(rules);

      colOff += 6;
    }
  }

  // Conditional formatting for Monitoring Log status
  var monLog = ss.getSheetByName('Monitoring Log');
  if (monLog) {
    var statusRange = monLog.getRange('D2:D1000');

    var urgentRule = SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo('Urgent Alert')
      .setBackground('#fecaca')
      .setFontColor('#dc2626')
      .setRanges([statusRange])
      .build();
    var flagRule = SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo('Flag')
      .setBackground('#fef3c7')
      .setFontColor('#d97706')
      .setRanges([statusRange])
      .build();
    var clearRule = SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo('All Clear')
      .setBackground('#d1fae5')
      .setFontColor('#059669')
      .setRanges([statusRange])
      .build();

    var rules = monLog.getConditionalFormatRules();
    rules.push(urgentRule, flagRule, clearRule);
    monLog.setConditionalFormatRules(rules);
  }
}

// ============================================================================
// STRATEGY UPDATE — Apply changes from an updated markdown without full reset
// ============================================================================

/**
 * Update the sheet from an updated strategy markdown.
 * Diffs current positions against the new strategy and applies changes
 * to the Positions, Dashboard, and Settings tabs.
 *
 * Run this after updating the strategy markdown and doing `clasp push`.
 */
function updateStrategy() {
  var newStrategy = parseStrategyMarkdown(STRATEGY_MARKDOWN);
  var currentPositions = readPositions();

  logInfo('Updating strategy: ' + newStrategy.name);

  // Build lookup of current positions
  var currentMap = {};
  for (var i = 0; i < currentPositions.length; i++) {
    currentMap[currentPositions[i].ticker] = currentPositions[i];
  }

  var changes = { added: [], removed: [], weightChanged: [], thesisChanged: [] };

  // Check for new/changed positions
  var newMap = {};
  for (var j = 0; j < newStrategy.positions.length; j++) {
    var np = newStrategy.positions[j];
    newMap[np.ticker] = np;

    if (!currentMap[np.ticker]) {
      changes.added.push(np);
    } else {
      var currentWeight = currentMap[np.ticker].targetWeight;
      var newWeight = np.weight / 100;
      if (Math.abs(currentWeight - newWeight) > 0.001) {
        changes.weightChanged.push({
          ticker: np.ticker,
          oldWeight: currentWeight,
          newWeight: newWeight
        });
      }
      if (currentMap[np.ticker].thesis !== np.thesis) {
        changes.thesisChanged.push(np.ticker);
      }
    }
  }

  // Check for removed positions
  for (var k = 0; k < currentPositions.length; k++) {
    if (!newMap[currentPositions[k].ticker]) {
      changes.removed.push(currentPositions[k]);
    }
  }

  // Apply changes
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // Update Positions tab
  var posSheet = ss.getSheetByName('Positions');
  if (posSheet) {
    var posData = posSheet.getDataRange().getValues();
    var headers = posData[0].map(function (h) { return String(h).trim(); });
    var tickerCol = headers.indexOf('Ticker');
    var companyCol = headers.indexOf('Company');
    var bucketCol = headers.indexOf('Bucket');
    var weightCol = headers.indexOf('Target Weight (%)');
    var thesisCol = headers.indexOf('Thesis');
    var activeCol = headers.indexOf('Active');

    // Update existing rows
    for (var r = 1; r < posData.length; r++) {
      var ticker = String(posData[r][tickerCol]).trim();
      if (newMap[ticker]) {
        var np2 = newMap[ticker];
        if (weightCol >= 0) posSheet.getRange(r + 1, weightCol + 1).setValue(np2.weight);
        if (thesisCol >= 0) posSheet.getRange(r + 1, thesisCol + 1).setValue(np2.thesis);
        if (companyCol >= 0) posSheet.getRange(r + 1, companyCol + 1).setValue(np2.company);
        if (bucketCol >= 0) posSheet.getRange(r + 1, bucketCol + 1).setValue(np2.bucket);
      }

      // Mark removed positions as inactive
      if (!newMap[ticker] && ticker) {
        if (activeCol >= 0) posSheet.getRange(r + 1, activeCol + 1).setValue(false);
      }
    }

    // Add new positions
    for (var a = 0; a < changes.added.length; a++) {
      var ap = changes.added[a];
      var newRow = [ap.ticker, ap.company, ap.bucket, ap.weight, '', ap.thesis, true];
      posSheet.appendRow(newRow);
      var lastRow = posSheet.getLastRow();
      posSheet.getRange(lastRow, 7).insertCheckboxes();
    }
  }

  // Update Dashboard tab — only for weight changes and new positions
  // Full dashboard rebuild is cleaner for structural changes
  if (changes.added.length > 0 || changes.removed.length > 0) {
    logInfo('Positions added/removed — rebuilding Dashboard tab');
    setupDashboardTab_(ss, newStrategy);
  } else if (changes.weightChanged.length > 0) {
    // Just update weight column
    var dashboard = ss.getSheetByName('Dashboard');
    if (dashboard) {
      var dashData = dashboard.getDataRange().getValues();
      var dashTickerCol = dashData[0].indexOf('Ticker');
      var dashWeightCol = dashData[0].indexOf('Target Weight (%)');
      if (dashWeightCol < 0) dashWeightCol = 3; // column D

      for (var dw = 1; dw < dashData.length; dw++) {
        var dt = String(dashData[dw][dashTickerCol]).trim();
        if (newMap[dt]) {
          dashboard.getRange(dw + 1, dashWeightCol + 1).setValue(newMap[dt].weight);
        }
      }
    }
  }

  // Update Settings tab — strategy name and description
  var settingsSheet = ss.getSheetByName('Settings');
  if (settingsSheet) {
    var settingsData = settingsSheet.getDataRange().getValues();
    for (var si = 0; si < settingsData.length; si++) {
      var key = String(settingsData[si][0]).trim();
      if (key === 'Strategy Name') settingsSheet.getRange(si + 1, 2).setValue(newStrategy.name);
      if (key === 'Strategy Description') settingsSheet.getRange(si + 1, 2).setValue(newStrategy.description);
    }
  }

  // Log summary
  var summary = [];
  if (changes.added.length > 0) summary.push('Added: ' + changes.added.map(function (p) { return p.ticker; }).join(', '));
  if (changes.removed.length > 0) summary.push('Removed: ' + changes.removed.map(function (p) { return p.ticker; }).join(', '));
  if (changes.weightChanged.length > 0) summary.push('Weight changed: ' + changes.weightChanged.map(function (w) {
    return w.ticker + ' (' + (w.oldWeight * 100).toFixed(0) + '% -> ' + (w.newWeight * 100).toFixed(0) + '%)';
  }).join(', '));
  if (changes.thesisChanged.length > 0) summary.push('Thesis updated: ' + changes.thesisChanged.join(', '));

  if (summary.length === 0) {
    logInfo('No changes detected — strategy is already up to date');
  } else {
    logInfo('Strategy updated: ' + summary.join('; '));
  }

  return changes;
}

// ============================================================================
// PORTFOLIO COMPARISON — Compare your portfolio against an external one
// ============================================================================

/**
 * Compare current positions against an external portfolio.
 * Useful for tracking changes in a reference portfolio (e.g., a fund's 13F filing).
 *
 * @param {string} externalText - Simple format: "TICKER WEIGHT%" per line, or markdown table
 * @returns {Object} { inBoth, onlyInYours, onlyInExternal, weightDifferences }
 */
function comparePortfolios(externalText) {
  var currentPositions = readPositions();

  // Parse external positions
  var externalPositions = [];
  var lines = externalText.split('\n');
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    if (!line || line.charAt(0) === '#' || line.charAt(0) === '|' && line.indexOf('---') >= 0) continue;

    // Try "TICKER WEIGHT%" format
    var simpleMatch = line.match(/^([A-Z]{1,5})\s+([\d.]+)%?/);
    if (simpleMatch) {
      externalPositions.push({
        ticker: simpleMatch[1],
        weight: parseFloat(simpleMatch[2]) / 100
      });
      continue;
    }

    // Try markdown table row
    if (line.charAt(0) === '|') {
      var cells = splitTableRow_(line);
      if (cells.length >= 2 && cells[0].match(/^[A-Z]{1,5}$/)) {
        var w = parseFloat(cells[1].replace('%', ''));
        if (!isNaN(w)) {
          externalPositions.push({ ticker: cells[0], weight: w / 100 });
        }
      }
    }
  }

  // Build maps
  var currentMap = {};
  for (var c = 0; c < currentPositions.length; c++) {
    currentMap[currentPositions[c].ticker] = currentPositions[c];
  }
  var externalMap = {};
  for (var e = 0; e < externalPositions.length; e++) {
    externalMap[externalPositions[e].ticker] = externalPositions[e];
  }

  var result = {
    inBoth: [],
    onlyInYours: [],
    onlyInExternal: [],
    weightDifferences: []
  };

  // Compare
  for (var t1 in currentMap) {
    if (externalMap[t1]) {
      result.inBoth.push(t1);
      var yourWeight = currentMap[t1].targetWeight;
      var theirWeight = externalMap[t1].weight;
      if (Math.abs(yourWeight - theirWeight) > 0.01) {
        result.weightDifferences.push({
          ticker: t1,
          yourWeight: yourWeight,
          externalWeight: theirWeight,
          difference: theirWeight - yourWeight
        });
      }
    } else {
      result.onlyInYours.push(t1);
    }
  }
  for (var t2 in externalMap) {
    if (!currentMap[t2]) {
      result.onlyInExternal.push({ ticker: t2, weight: externalMap[t2].weight });
    }
  }

  // Log summary
  logInfo('Portfolio comparison: ' + result.inBoth.length + ' shared, ' +
    result.onlyInYours.length + ' only in yours, ' +
    result.onlyInExternal.length + ' only in external');

  return result;
}

// ============================================================================
// TRIGGER SETUP
// ============================================================================

/**
 * Set up the daily time-driven trigger.
 * Run this once after setupSheet(), and again any time you change
 * Daily Run Time / Timezone in the Settings tab.
 */
function setupTriggers() {
  // Prefer the live Settings tab so edits to Daily Run Time / Timezone
  // take effect without needing to re-edit the bundled strategy markdown.
  // Fall back to the bundled markdown only if the Settings tab isn't set up yet.
  var settings;
  try {
    settings = readSettings();
  } catch (e) {
    logInfo('Settings tab not readable, falling back to bundled strategy markdown: ' + e.message);
    settings = parseStrategyMarkdown(STRATEGY_MARKDOWN).settings;
  }

  // Remove existing triggers to avoid duplicates
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'dailyRun') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }

  var hour = 7;
  var minute = 30;
  try {
    var parts = (settings.dailyRunTime || '07:30').split(':');
    hour = parseInt(parts[0], 10);
    minute = parseInt(parts[1], 10);
  } catch (e) {
    logInfo('Could not parse run time, defaulting to 07:30');
  }

  var tz = settings.timezone || 'America/New_York';

  ScriptApp.newTrigger('dailyRun')
    .timeBased()
    .everyDays(1)
    .atHour(hour)
    .nearMinute(minute)
    .inTimezone(tz)
    .create();

  logInfo('Daily trigger created for ' + hour + ':' + (minute < 10 ? '0' : '') + minute + ' ' + tz);
}

/**
 * Remove all triggers for this project.
 */
function removeTriggers() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    ScriptApp.deleteTrigger(triggers[i]);
  }
  logInfo('All triggers removed');
}
