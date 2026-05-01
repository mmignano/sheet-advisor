/**
 * SheetReader.js — Read settings, positions, investors from the Google Sheet
 */

/**
 * Read all settings from the Settings tab.
 * Settings are stored as key-value pairs in columns A and B,
 * with section headers and special blocks (investors, prompts).
 */
function readSettings() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Settings');
  if (!sheet) throw new Error('Settings tab not found');

  var data = sheet.getDataRange().getValues();
  var settings = {
    strategyName: '',
    strategyDescription: '',
    createdDate: '',
    investors: [],
    dailyRunTime: '07:30',
    timezone: 'America/New_York',
    deepAnalysisDay: 'Monday',
    weeklyDigestDay: 'Friday',
    scriptEnabled: true,
    singlePositionDailyMove: 5,
    portfolioDailyMove: 3,
    maxSinglePositionWeight: 15,
    weightDriftAlert: 5,
    cashTargetWeight: 8,
    cashPurpose: '',
    aiEnabled: true,
    aiModel: 'claude-sonnet-4-6',
    apiKeyPropertyName: 'CLAUDE_API_KEY',
    dailyPrompt: '',
    weeklyDeepPrompt: '',
    managementStyle: '',
    exitCriteria: '',
    trimCriteria: '',
    addCriteria: ''
  };

  var currentSection = '';
  var investorHeaderRow = -1;
  var investorHeaders = [];
  var promptField = '';
  var promptLines = [];
  var collectingPrompt = false;

  for (var i = 0; i < data.length; i++) {
    var cellA = String(data[i][0]).trim();
    var cellB = data[i][1];
    var cellBStr = String(cellB != null ? cellB : '').trim();

    // Detect section headers
    if (cellA.match(/^#{1,3}\s/) || cellA.match(/section$/i) || cellA.match(/^---/)) {
      if (collectingPrompt && promptLines.length > 0) {
        if (promptField === 'dailyPrompt') settings.dailyPrompt = promptLines.join('\n');
        if (promptField === 'weeklyDeepPrompt') settings.weeklyDeepPrompt = promptLines.join('\n');
        collectingPrompt = false;
        promptLines = [];
      }
      currentSection = cellA.toLowerCase();
      continue;
    }

    // Collecting multi-line prompt text
    if (collectingPrompt) {
      var rowText = data[i].map(function(c) { return c != null ? String(c) : ''; }).join('').trim();
      if (rowText === '' && promptLines.length > 0) {
        // Empty row might be end of prompt, or just a blank line in the prompt
        // We'll continue collecting until we hit a new section header
        promptLines.push('');
      } else if (rowText !== '') {
        promptLines.push(rowText);
      }
      continue;
    }

    // Key-value pairs
    if (cellA && cellBStr !== '') {
      switch (cellA) {
        case 'Strategy Name': settings.strategyName = cellBStr; break;
        case 'Strategy Description': settings.strategyDescription = cellBStr; break;
        case 'Created Date': settings.createdDate = cellBStr; break;
        case 'Daily Run Time':
          // Google Sheets auto-converts "17:00" entries into Date objects
          // (using the 1899-12-30 epoch). Detect that and format as "HH:MM"
          // so downstream parsers don't choke on the stringified Date.
          if (cellB instanceof Date) {
            var hh = cellB.getHours();
            var mm = cellB.getMinutes();
            settings.dailyRunTime = (hh < 10 ? '0' : '') + hh + ':' + (mm < 10 ? '0' : '') + mm;
          } else {
            settings.dailyRunTime = cellBStr;
          }
          break;
        case 'Timezone': settings.timezone = cellBStr; break;
        case 'Deep Analysis Day': settings.deepAnalysisDay = cellBStr; break;
        case 'Weekly Digest Day': settings.weeklyDigestDay = cellBStr; break;
        case 'Script Enabled': settings.scriptEnabled = (cellB === true || cellBStr.toLowerCase() === 'true'); break;
        case 'Single Position Daily Move (%)': settings.singlePositionDailyMove = parseNumber(cellB) || 5; break;
        case 'Portfolio Daily Move (%)': settings.portfolioDailyMove = parseNumber(cellB) || 3; break;
        case 'Max Single Position Weight (%)': settings.maxSinglePositionWeight = parseNumber(cellB) || 15; break;
        case 'Weight Drift Alert (%)': settings.weightDriftAlert = parseNumber(cellB) || 5; break;
        case 'Cash Target Weight (%)': settings.cashTargetWeight = parseNumber(cellB) || 8; break;
        case 'Cash Purpose': settings.cashPurpose = cellBStr; break;
        case 'Management Style': settings.managementStyle = cellBStr; break;
        case 'Exit Criteria': settings.exitCriteria = cellBStr; break;
        case 'Trim Criteria': settings.trimCriteria = cellBStr; break;
        case 'Add Criteria': settings.addCriteria = cellBStr; break;
        case 'AI Enabled': settings.aiEnabled = (cellB === true || cellBStr.toLowerCase() === 'true'); break;
        case 'AI Model': settings.aiModel = cellBStr; break;
        case 'API Key Property Name': settings.apiKeyPropertyName = cellBStr; break;
      }
    }

    // Investor table detection
    if (cellA === 'Name' && cellBStr === 'Email') {
      investorHeaderRow = i;
      investorHeaders = data[i].map(function(h) { return String(h).trim(); });
      continue;
    }

    // Read investor rows (rows after the investor header that have a name)
    if (investorHeaderRow >= 0 && i > investorHeaderRow && cellA !== '' && cellA !== 'Name') {
      var nameIdx = investorHeaders.indexOf('Name');
      var emailIdx = investorHeaders.indexOf('Email');
      var amountIdx = investorHeaders.indexOf('Invested Amount');
      var dateIdx = investorHeaders.indexOf('Invested Date');
      var alertsIdx = investorHeaders.indexOf('Alerts Enabled');

      if (nameIdx >= 0 && cellA !== '') {
        var investor = {
          name: String(data[i][nameIdx]).trim(),
          email: emailIdx >= 0 ? String(data[i][emailIdx]).trim() : '',
          investedAmount: amountIdx >= 0 ? parseNumber(data[i][amountIdx]) || 0 : 0,
          investedDate: dateIdx >= 0 ? String(data[i][dateIdx]).trim() : '',
          alertsEnabled: alertsIdx >= 0 ? (data[i][alertsIdx] === true || String(data[i][alertsIdx]).toLowerCase() === 'true') : true
        };
        if (investor.name) {
          settings.investors.push(investor);
        }
      }

      // If next row is empty or a new section, stop reading investors
      if (i + 1 < data.length) {
        var nextA = String(data[i + 1][0]).trim();
        if (nextA === '' || nextA.match(/^#{1,3}\s/) || nextA.match(/section$/i)) {
          investorHeaderRow = -1;
        }
      }
    }

    // Prompt detection
    if (cellA === 'Daily Prompt' || cellA === 'Daily AI Prompt') {
      promptField = 'dailyPrompt';
      if (cellBStr) {
        settings.dailyPrompt = cellBStr;
      } else {
        collectingPrompt = true;
        promptLines = [];
      }
      continue;
    }
    if (cellA === 'Weekly Deep Prompt' || cellA === 'Weekly AI Prompt') {
      promptField = 'weeklyDeepPrompt';
      if (cellBStr) {
        settings.weeklyDeepPrompt = cellBStr;
      } else {
        collectingPrompt = true;
        promptLines = [];
      }
      continue;
    }
  }

  // Flush any remaining prompt
  if (collectingPrompt && promptLines.length > 0) {
    if (promptField === 'dailyPrompt') settings.dailyPrompt = promptLines.join('\n');
    if (promptField === 'weeklyDeepPrompt') settings.weeklyDeepPrompt = promptLines.join('\n');
  }

  return settings;
}

/**
 * Read all active positions from the Positions tab.
 */
function readPositions() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Positions');
  if (!sheet) throw new Error('Positions tab not found');

  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];

  var headers = data[0].map(function(h) { return String(h).trim(); });
  var tickerIdx = headers.indexOf('Ticker');
  var companyIdx = headers.indexOf('Company');
  var bucketIdx = headers.indexOf('Bucket');
  var weightIdx = headers.indexOf('Target Weight (%)');
  if (weightIdx < 0) weightIdx = headers.indexOf('Target Weight');
  var buyPriceIdx = headers.indexOf('Buy Price');
  var thesisIdx = headers.indexOf('Thesis');
  var activeIdx = headers.indexOf('Active');

  var positions = [];
  for (var i = 1; i < data.length; i++) {
    var ticker = tickerIdx >= 0 ? String(data[i][tickerIdx]).trim() : '';
    if (!ticker) continue;

    var active = true;
    if (activeIdx >= 0) {
      active = data[i][activeIdx] === true || String(data[i][activeIdx]).toLowerCase() === 'true';
    }
    if (!active) continue;

    positions.push({
      ticker: ticker,
      company: companyIdx >= 0 ? String(data[i][companyIdx]).trim() : '',
      bucket: bucketIdx >= 0 ? String(data[i][bucketIdx]).trim() : '',
      targetWeight: weightIdx >= 0 ? (parseNumber(data[i][weightIdx]) || 0) / 100 : 0,
      buyPrice: buyPriceIdx >= 0 ? parseNumber(data[i][buyPriceIdx]) : null,
      thesis: thesisIdx >= 0 ? String(data[i][thesisIdx]).trim() : '',
      row: i + 1 // 1-based row number in the sheet
    });
  }

  return positions;
}

/**
 * Read the previous day's monitoring log entry for daily change calculation.
 * Returns the most recent row, or null if no previous entries.
 */
function readPreviousMonitoringEntry() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Monitoring Log');
  if (!sheet) return null;

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return null; // Only header or empty

  var data = sheet.getDataRange().getValues();
  var headers = data[0].map(function(h) { return String(h).trim(); });

  // Return the last row as an object
  var lastEntry = {};
  for (var j = 0; j < headers.length; j++) {
    lastEntry[headers[j]] = data[lastRow - 1][j];
  }
  return lastEntry;
}

/**
 * Check if today's date already has an entry in the Monitoring Log.
 */
function hasTodayEntry() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Monitoring Log');
  if (!sheet) return false;

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return false;

  var today = formatDate(now());
  var data = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (var i = data.length - 1; i >= 0; i--) {
    var entryDate = data[i][0];
    if (entryDate instanceof Date) {
      entryDate = formatDate(entryDate);
    }
    if (String(entryDate).trim() === today) return true;
  }
  return false;
}

/**
 * Read this week's monitoring log entries (for weekly digest).
 */
function readWeekEntries() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Monitoring Log');
  if (!sheet) return [];

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  var data = sheet.getDataRange().getValues();
  var headers = data[0].map(function(h) { return String(h).trim(); });

  var today = now();
  var dayOfWeek = today.getDay(); // 0 = Sunday
  var monday = new Date(today);
  monday.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
  monday.setHours(0, 0, 0, 0);

  var entries = [];
  for (var i = 1; i < data.length; i++) {
    var entryDate = data[i][0];
    if (entryDate instanceof Date && entryDate >= monday) {
      var entry = {};
      for (var j = 0; j < headers.length; j++) {
        entry[headers[j]] = data[i][j];
      }
      entries.push(entry);
    }
  }
  return entries;
}

/**
 * Validate that target weights sum to 100%.
 * Returns { valid: boolean, total: number, message: string }
 */
function validateWeights(positions, cashWeight) {
  var total = cashWeight;
  for (var i = 0; i < positions.length; i++) {
    total += positions[i].targetWeight;
  }
  total = Math.round(total * 10000) / 10000; // Fix floating point
  var valid = Math.abs(total - 1.0) < 0.001;
  return {
    valid: valid,
    total: total,
    message: valid
      ? 'Weights sum to 100%'
      : 'WARNING: Weights sum to ' + (total * 100).toFixed(1) + '% (should be 100%)'
  };
}
