/**
 * Utils.js — Shared utilities (date formatting, error handling, logging)
 */

/**
 * Format a date as YYYY-MM-DD
 */
function formatDate(date) {
  return Utilities.formatDate(date, getTimezone_(), 'yyyy-MM-dd');
}

/**
 * Format a date as HH:mm
 */
function formatTime(date) {
  return Utilities.formatDate(date, getTimezone_(), 'HH:mm');
}

/**
 * Get the configured timezone, defaulting to America/New_York
 */
function getTimezone_() {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var settingsSheet = ss.getSheetByName('Settings');
    if (settingsSheet) {
      var data = settingsSheet.getDataRange().getValues();
      for (var i = 0; i < data.length; i++) {
        if (String(data[i][0]).trim() === 'Timezone') {
          return String(data[i][1]).trim() || 'America/New_York';
        }
      }
    }
  } catch (e) {
    // fall through
  }
  return 'America/New_York';
}

/**
 * Get the current date/time in the configured timezone
 */
function now() {
  return new Date();
}

/**
 * Get the day of the week name (e.g., "Monday")
 */
function getDayName(date) {
  return Utilities.formatDate(date, getTimezone_(), 'EEEE');
}

/**
 * Log a message with timestamp
 */
function logInfo(message) {
  Logger.log('[INFO] ' + formatDate(now()) + ' ' + formatTime(now()) + ' — ' + message);
}

/**
 * Log an error with timestamp
 */
function logError(message, error) {
  var msg = '[ERROR] ' + formatDate(now()) + ' ' + formatTime(now()) + ' — ' + message;
  if (error) {
    msg += '\n' + (error.stack || error.message || String(error));
  }
  Logger.log(msg);
}

/**
 * Format a number as currency ($X,XXX.XX)
 */
function formatCurrency(value) {
  if (value == null || isNaN(value)) return '$0.00';
  var negative = value < 0;
  var abs = Math.abs(value);
  var formatted = '$' + abs.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return negative ? '-' + formatted : formatted;
}

/**
 * Format a number as percentage (X.XX%)
 */
function formatPercent(value) {
  if (value == null || isNaN(value)) return '0.00%';
  var sign = value >= 0 ? '+' : '';
  return sign + (value * 100).toFixed(2) + '%';
}

/**
 * Safely parse a number from a cell value
 */
function parseNumber(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number') return value;
  var cleaned = String(value).replace(/[$,%\s]/g, '');
  var num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

/**
 * Check if a value is a valid price (positive number, not an error)
 */
function isValidPrice(value) {
  if (value == null) return false;
  if (typeof value === 'string' && (value.indexOf('#') === 0 || value === 'N/A' || value === '#N/A')) return false;
  var num = parseNumber(value);
  return num !== null && num > 0;
}

/**
 * Get the Google Sheet URL for email links
 */
function getSheetUrl() {
  return SpreadsheetApp.getActiveSpreadsheet().getUrl();
}
