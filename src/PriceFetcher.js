/**
 * PriceFetcher.js — Get current prices from Dashboard (GOOGLEFINANCE) or fallback API
 */

/**
 * Read current prices from the Dashboard tab's GOOGLEFINANCE cells.
 * Falls back to Yahoo Finance API if a price is unavailable.
 *
 * @param {Array} positions - Array of position objects with ticker property
 * @returns {Object} Map of ticker -> { price, source, error }
 */
function fetchPrices(positions) {
  var prices = {};
  var needsFallback = [];

  // Build a set of valid tickers from positions
  var validTickers = {};
  for (var p = 0; p < positions.length; p++) {
    validTickers[positions[p].ticker] = true;
  }

  // First, try reading from Dashboard GOOGLEFINANCE cells
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var dashboard = ss.getSheetByName('Dashboard');

  if (dashboard) {
    var data = dashboard.getDataRange().getValues();
    var headers = data[0].map(function(h) { return String(h).trim(); });
    var tickerCol = headers.indexOf('Ticker');
    var priceCol = headers.indexOf('Current Price');

    if (tickerCol >= 0 && priceCol >= 0) {
      for (var i = 1; i < data.length; i++) {
        var ticker = String(data[i][tickerCol]).trim();
        var price = data[i][priceCol];

        // Skip non-ticker rows (TOTAL, Last Updated, Cash, etc.)
        if (!ticker || !validTickers[ticker]) continue;

        if (isValidPrice(price)) {
          prices[ticker] = { price: parseNumber(price), source: 'googlefinance' };
        } else {
          needsFallback.push(ticker);
        }
      }
    }
  }

  // Check which positions still need prices
  for (var j = 0; j < positions.length; j++) {
    var t = positions[j].ticker;
    if (!prices[t]) {
      if (needsFallback.indexOf(t) === -1) {
        needsFallback.push(t);
      }
    }
  }

  // Fallback: fetch from Yahoo Finance API
  if (needsFallback.length > 0) {
    var fallbackPrices = fetchFromYahoo_(needsFallback);
    for (var ticker in fallbackPrices) {
      prices[ticker] = fallbackPrices[ticker];
    }
  }

  return prices;
}

/**
 * Fetch prices from Yahoo Finance via UrlFetchApp.
 * Uses the Yahoo Finance v8 chart endpoint with cookie/crumb authentication.
 *
 * @param {Array} tickers - Array of ticker strings
 * @returns {Object} Map of ticker -> { price, source, error }
 */
function fetchFromYahoo_(tickers) {
  var results = {};

  // Get auth cookie and crumb first
  var crumbData = getYahooCrumb_();
  if (!crumbData) {
    // Auth failed — mark all tickers as failed
    for (var f = 0; f < tickers.length; f++) {
      results[tickers[f]] = { price: null, source: 'yahoo', error: 'Auth failed' };
    }
    return results;
  }

  for (var i = 0; i < tickers.length; i++) {
    var ticker = tickers[i];
    try {
      var chartUrl = 'https://query1.finance.yahoo.com/v8/finance/chart/' +
        encodeURIComponent(ticker) + '?interval=1d&range=1d&crumb=' +
        encodeURIComponent(crumbData.crumb);

      var response = UrlFetchApp.fetch(chartUrl, {
        muteHttpExceptions: true,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Cookie': crumbData.cookie
        }
      });

      if (response.getResponseCode() === 200) {
        var json = JSON.parse(response.getContentText());
        var meta = json.chart.result[0].meta;
        var price = meta.regularMarketPrice;

        if (price && price > 0) {
          results[ticker] = { price: price, source: 'yahoo' };
        } else {
          results[ticker] = { price: null, source: 'yahoo', error: 'No price data' };
        }
      } else {
        results[ticker] = { price: null, source: 'yahoo', error: 'HTTP ' + response.getResponseCode() };
      }
    } catch (e) {
      results[ticker] = { price: null, source: 'yahoo', error: e.message };
      logError('Yahoo Finance fetch failed for ' + ticker, e);
    }
  }

  return results;
}

/**
 * Get Yahoo Finance authentication cookie and crumb.
 * Required since Yahoo locked down the finance API.
 *
 * @returns {Object|null} { cookie, crumb } or null on failure
 */
function getYahooCrumb_() {
  try {
    // First request to get the auth cookie
    var consentResponse = UrlFetchApp.fetch('https://fc.yahoo.com', {
      muteHttpExceptions: true,
      followRedirects: true,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    var cookies = consentResponse.getAllHeaders()['Set-Cookie'];
    if (!cookies) return null;

    // Extract cookie string
    var cookieStr = '';
    if (Array.isArray(cookies)) {
      cookieStr = cookies.map(function(c) { return c.split(';')[0]; }).join('; ');
    } else {
      cookieStr = cookies.split(';')[0];
    }

    // Get crumb using the cookie
    var crumbResponse = UrlFetchApp.fetch('https://query2.finance.yahoo.com/v1/test/getcrumb', {
      muteHttpExceptions: true,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Cookie': cookieStr
      }
    });

    if (crumbResponse.getResponseCode() === 200) {
      var crumb = crumbResponse.getContentText().trim();
      if (crumb && crumb.length > 0 && crumb.length < 50) {
        return { cookie: cookieStr, crumb: crumb };
      }
    }

    return null;
  } catch (e) {
    logError('Yahoo Finance auth failed', e);
    return null;
  }
}

/**
 * Get previous close prices for daily change calculation.
 * Reads from the most recent Monitoring Log entry.
 *
 * @param {Object} previousEntry - Previous monitoring log row
 * @param {Array} positions - Array of position objects
 * @param {Array} investors - Array of investor objects
 * @returns {Object} Map of investor name -> previous total value
 */
function getPreviousValues(previousEntry, investors) {
  if (!previousEntry) return {};

  var prevValues = {};
  for (var i = 0; i < investors.length; i++) {
    var colName = 'Portfolio Value (' + investors[i].name + ')';
    if (previousEntry[colName] != null) {
      prevValues[investors[i].name] = parseNumber(previousEntry[colName]);
    }
  }
  return prevValues;
}

/**
 * Store current prices in ScriptProperties for next-day comparison
 * and maintain a rolling 7-day price history for weekly digests.
 *
 * @param {Object} prices - Map of ticker -> { price, source }
 */
function storePrices(prices) {
  var priceMap = {};
  for (var ticker in prices) {
    if (prices[ticker].price) {
      priceMap[ticker] = prices[ticker].price;
    }
  }
  try {
    var props = PropertiesService.getScriptProperties();

    // Store for daily change calculation
    props.setProperty('PREVIOUS_PRICES', JSON.stringify(priceMap));

    // Append to rolling price history (keyed by date)
    var today = formatDate(now());
    var history = {};
    var historyJson = props.getProperty('PRICE_HISTORY');
    if (historyJson) {
      try { history = JSON.parse(historyJson); } catch (e) { history = {}; }
    }
    history[today] = priceMap;

    // Keep only the last 7 days
    var dates = Object.keys(history).sort();
    while (dates.length > 7) {
      delete history[dates.shift()];
    }

    props.setProperty('PRICE_HISTORY', JSON.stringify(history));
  } catch (e) {
    logError('Failed to store prices', e);
  }
}

/**
 * Load previous day's prices from ScriptProperties.
 *
 * @returns {Object} Map of ticker -> price, or empty object
 */
function loadPreviousPrices() {
  try {
    var json = PropertiesService.getScriptProperties().getProperty('PREVIOUS_PRICES');
    if (json) return JSON.parse(json);
  } catch (e) {
    logError('Failed to load previous prices', e);
  }
  return {};
}

/**
 * Load the rolling price history for weekly digest.
 *
 * @returns {Object} Map of date string -> { ticker -> price }
 */
function loadPriceHistory() {
  try {
    var json = PropertiesService.getScriptProperties().getProperty('PRICE_HISTORY');
    if (json) return JSON.parse(json);
  } catch (e) {
    logError('Failed to load price history', e);
  }
  return {};
}
