/**
 * ClaudeAnalyst.js — Call Claude API for portfolio analysis
 */

/**
 * Build the prompt from the template, injecting portfolio data.
 *
 * @param {string} template - Prompt template with {{placeholders}}
 * @param {Object} portfolioState - From calculatePortfolioState()
 * @param {Array} positions - From readPositions()
 * @param {Array} investors - From settings
 * @param {Object} settings - From readSettings()
 * @returns {string} Complete prompt ready to send
 */
function buildPrompt(template, portfolioState, positions, investors, settings, rebalanceSuggestions) {
  var prompt = template;

  // Fetch news for positions with significant moves (>3%)
  var newsText = fetchNewsForMovers_(portfolioState, positions);

  var replacements = {
    '{{strategy_description}}': settings.strategyDescription || settings.strategyName || '',
    '{{portfolio_state}}': buildPortfolioStateText(portfolioState, investors),
    '{{flagged_positions}}': buildFlaggedPositionsText(portfolioState.flags || []),
    '{{position_theses}}': buildPositionThesesText(positions),
    '{{recent_news}}': newsText,
    '{{rebalance_suggestions}}': buildRebalanceSuggestionsText(rebalanceSuggestions || [])
  };

  for (var placeholder in replacements) {
    prompt = prompt.replace(new RegExp(placeholder.replace(/[{}]/g, '\\$&'), 'g'), replacements[placeholder]);
  }

  // If the prompt template doesn't have the {{recent_news}} placeholder,
  // append news context automatically so existing sheets get the upgrade
  if (template.indexOf('{{recent_news}}') < 0 && newsText.indexOf('No positions moved') < 0) {
    prompt += '\n\nRecent news for positions with significant moves:\n' + newsText +
      '\n\nIMPORTANT: Use the news above to explain WHY positions moved. ' +
      'Reference specific catalysts (earnings, deals, macro events) in your assessment.';
  }

  // If the prompt template doesn't have the {{rebalance_suggestions}} placeholder,
  // append rebalance context automatically
  if (template.indexOf('{{rebalance_suggestions}}') < 0 && rebalanceSuggestions && rebalanceSuggestions.length > 0) {
    prompt += '\n\nWeight drift and rebalance suggestions:\n' + buildRebalanceSuggestionsText(rebalanceSuggestions);
  }

  return prompt;
}

/**
 * Fetch recent news headlines for positions with significant price moves.
 * Uses Google News RSS (no API key required).
 *
 * @param {Object} portfolioState - From calculatePortfolioState()
 * @param {Array} positions - From readPositions()
 * @returns {string} Formatted news text for the prompt
 */
function fetchNewsForMovers_(portfolioState, positions) {
  var newsThreshold = 0.03; // 3% daily move triggers news search
  var tickersToSearch = [];

  for (var i = 0; i < positions.length; i++) {
    var ticker = positions[i].ticker;
    var posInfo = portfolioState.positions[ticker];
    if (posInfo && posInfo.dailyChangePct != null && Math.abs(posInfo.dailyChangePct) >= newsThreshold) {
      tickersToSearch.push({
        ticker: ticker,
        company: positions[i].company,
        change: posInfo.dailyChangePct
      });
    }
  }

  if (tickersToSearch.length === 0) {
    return 'No positions moved more than 3% today — no targeted news search performed.';
  }

  var allNews = [];
  for (var t = 0; t < tickersToSearch.length; t++) {
    var item = tickersToSearch[t];
    var headlines = fetchGoogleNewsHeadlines_(item.ticker, item.company);
    if (headlines.length > 0) {
      allNews.push(item.ticker + ' (' + formatPercent(item.change) + ' today):');
      for (var h = 0; h < headlines.length; h++) {
        allNews.push('  - ' + headlines[h]);
      }
    } else {
      allNews.push(item.ticker + ' (' + formatPercent(item.change) + ' today): No recent news found');
    }
  }

  return allNews.join('\n');
}

/**
 * Fetch headlines from Google News RSS for a given stock ticker.
 * Returns up to 5 recent headlines.
 *
 * @param {string} ticker - Stock ticker symbol
 * @param {string} company - Company name for better search results
 * @returns {Array} Array of headline strings
 */
function fetchGoogleNewsHeadlines_(ticker, company) {
  var headlines = [];

  // Search with both ticker and company name for better results
  var query = encodeURIComponent(ticker + ' stock ' + company);
  var url = 'https://news.google.com/rss/search?q=' + query + '+when:2d&hl=en-US&gl=US&ceid=US:en';

  try {
    var response = UrlFetchApp.fetch(url, {
      muteHttpExceptions: true,
      headers: {
        'User-Agent': 'Mozilla/5.0'
      }
    });

    if (response.getResponseCode() === 200) {
      var xml = response.getContentText();

      // Parse RSS XML to extract titles
      var titleMatches = xml.match(/<item>[\s\S]*?<title>([\s\S]*?)<\/title>/g);
      if (titleMatches) {
        for (var i = 0; i < Math.min(titleMatches.length, 5); i++) {
          var titleMatch = titleMatches[i].match(/<title>([\s\S]*?)<\/title>/);
          if (titleMatch && titleMatch[1]) {
            var title = titleMatch[1]
              .replace(/<!\[CDATA\[|\]\]>/g, '')
              .replace(/&amp;/g, '&')
              .replace(/&lt;/g, '<')
              .replace(/&gt;/g, '>')
              .replace(/&quot;/g, '"')
              .replace(/&#39;/g, "'")
              .trim();
            if (title) headlines.push(title);
          }
        }
      }
    }
  } catch (e) {
    logError('News fetch failed for ' + ticker, e);
  }

  return headlines;
}

/**
 * Call the Claude API and parse the JSON response.
 *
 * @param {string} prompt - The complete prompt
 * @param {string} model - Model identifier (e.g., 'claude-sonnet-4-6')
 * @param {string} apiKeyPropertyName - Name of the script property holding the API key
 * @param {number} maxTokens - Max tokens for response (default 1024)
 * @returns {Object} Parsed JSON response from Claude
 */
function callClaude(prompt, model, apiKeyPropertyName, maxTokens) {
  maxTokens = maxTokens || 1024;
  // Always use 'CLAUDE_API_KEY' as the script property name
  var apiKey = PropertiesService.getScriptProperties().getProperty('CLAUDE_API_KEY');
  if (!apiKey) {
    throw new Error('API key not found. Add CLAUDE_API_KEY in Project Settings > Script Properties.');
  }

  var payload = {
    model: model,
    max_tokens: maxTokens,
    messages: [{ role: 'user', content: prompt }]
  };

  var options = {
    method: 'POST',
    contentType: 'application/json',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  var response;
  try {
    response = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', options);
  } catch (e) {
    logError('Claude API call failed (attempt 1)', e);
    // Retry once after 5 seconds
    Utilities.sleep(5000);
    try {
      response = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', options);
    } catch (e2) {
      logError('Claude API call failed (attempt 2)', e2);
      return null;
    }
  }

  var code = response.getResponseCode();
  if (code !== 200) {
    logError('Claude API returned HTTP ' + code + ': ' + response.getContentText());
    // Retry once on server errors
    if (code >= 500) {
      Utilities.sleep(5000);
      try {
        response = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', options);
        code = response.getResponseCode();
        if (code !== 200) {
          logError('Claude API retry also failed: HTTP ' + code);
          return null;
        }
      } catch (e3) {
        logError('Claude API retry threw exception', e3);
        return null;
      }
    } else {
      return null;
    }
  }

  try {
    var data = JSON.parse(response.getContentText());
    var text = data.content[0].text;
    // Strip markdown code fences if present
    var clean = text.replace(/```json\n?|```\n?/g, '').trim();
    return JSON.parse(clean);
  } catch (e) {
    logError('Failed to parse Claude response', e);
    logInfo('Raw response: ' + response.getContentText().substring(0, 500));
    return null;
  }
}

/**
 * Run AI analysis on the portfolio.
 * Returns a standardized result object.
 *
 * @param {Object} portfolioState - From calculatePortfolioState()
 * @param {Array} positions - From readPositions()
 * @param {Object} settings - From readSettings()
 * @param {string} runType - 'daily' or 'weekly_deep'
 * @returns {Object} { status, assessment, recommendation, flags, weeklyData }
 */
function runAIAnalysis(portfolioState, positions, settings, runType, rebalanceSuggestions) {
  var template = runType === 'weekly_deep'
    ? (settings.weeklyDeepPrompt || settings.dailyPrompt)
    : settings.dailyPrompt;

  if (!template) {
    logInfo('No AI prompt template configured — using mechanical assessment only');
    return buildMechanicalAssessment(portfolioState);
  }

  var prompt = buildPrompt(template, portfolioState, positions, settings.investors, settings, rebalanceSuggestions);
  var maxTokens = runType === 'weekly_deep' ? 4096 : 2048;
  var result = callClaude(prompt, settings.aiModel, settings.apiKeyPropertyName, maxTokens);

  if (!result) {
    logInfo('AI analysis unavailable — falling back to mechanical assessment');
    var mechanical = buildMechanicalAssessment(portfolioState);
    mechanical.assessment = 'AI unavailable. ' + mechanical.assessment;
    return mechanical;
  }

  return {
    status: result.status || 'all_clear',
    assessment: result.assessment || '',
    recommendation: result.recommendation || 'Hold',
    flags: result.flags || [],
    thesisUpdates: result.thesis_updates || result.position_reviews || [],
    rebalanceAction: result.rebalance_action || 'none',
    weeklySummary: result.weekly_summary || '',
    pattern: result.pattern || '',
    lookingAhead: result.looking_ahead || [],
    outlook: result.outlook || '',
    positionReviews: result.position_reviews || [],
    macroAssessment: result.macro_assessment || '',
    quarterlyConsiderations: result.quarterly_considerations || [],
    rebalanceTrades: result.rebalance_trades || []
  };
}

/**
 * Build a mechanical-only assessment (no AI) based on threshold checks.
 */
function buildMechanicalAssessment(portfolioState) {
  var flags = portfolioState.flags || [];
  var status = flags.length > 0 ? 'flag' : 'all_clear';
  var assessment = flags.length > 0
    ? flags.length + ' threshold(s) breached: ' + flags.join('; ')
    : 'All positions within normal thresholds. No action needed.';

  return {
    status: status,
    assessment: assessment,
    recommendation: flags.length > 0 ? 'Monitor flagged positions' : 'Hold',
    flags: flags,
    weeklySummary: '',
    positionReviews: [],
    macroAssessment: '',
    quarterlyConsiderations: []
  };
}
