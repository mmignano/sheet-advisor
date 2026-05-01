# Strategy: Balanced Tech Growth

## Overview

A core growth portfolio tilted toward large-cap technology and innovation leaders,
with defensive ballast via broad market exposure and a modest cash reserve.

Thesis: technology companies with durable competitive moats, strong free cash flow,
and exposure to secular growth trends (AI, cloud, digital payments) will compound
wealth over a 3–5 year horizon. Large-cap bias reduces single-name risk.
Cash reserve provides optionality during market dislocations.

This is a template — replace tickers, weights, and thesis text with your own
investment convictions, then run setupSheet() to initialize your Google Sheet.

## Investors

| Name | Amount | Buy Date |
|------|--------|----------|
| Alice | $50,000 | January 1, 2025 |
| Bob | $25,000 | January 1, 2025 |

## Positions

| Ticker | Company | Bucket | Weight | Buy Price | Thesis |
|--------|---------|--------|--------|-----------|--------|
| AAPL | Apple | Mega-Cap Tech | 15% | null | Unrivaled hardware-software ecosystem with 2B+ active devices. Services revenue (App Store, iCloud, Apple Pay) now >30% of gross profit and growing faster than hardware. Enormous buyback program. Hold for long-term compounding. |
| MSFT | Microsoft | Mega-Cap Tech | 15% | null | Azure is the #2 cloud platform and growing share. OpenAI partnership embeds Copilot across the entire Office suite. Durable enterprise switching costs. One of only two AAA-rated US companies. |
| GOOGL | Alphabet | Mega-Cap Tech | 10% | null | Search advertising moat remains intact. Google Cloud accelerating. DeepMind and Gemini models competitive with frontier AI. Trading at a discount to peers on a free-cash-flow basis. |
| NVDA | Nvidia | AI Infrastructure | 10% | null | Dominant GPU platform for AI training and inference. CUDA ecosystem creates deep switching costs. Blackwell demand exceeds supply through 2026. Highest-conviction AI infrastructure play. |
| AMZN | Amazon | Cloud & Commerce | 8% | null | AWS is the #1 cloud platform with >30% market share. Retail segment generates massive logistics flywheel. Advertising is a high-margin growth business. Multiple ways to win. |
| V | Visa | Financials | 8% | null | Toll road on global consumer spending. Asset-light model generates exceptional returns on capital. Secular shift from cash to digital payments still has decades to run in emerging markets. |
| UNH | UnitedHealth Group | Healthcare | 7% | null | Diversified healthcare giant combining insurance (UnitedHealthcare) and services (Optum). Consistent earnings growth through economic cycles. Defensive ballast in the portfolio. |
| JPM | JPMorgan Chase | Financials | 7% | null | Best-managed large bank in the US. Strong capital position. Diversified across investment banking, consumer, and wealth management. Benefits from higher-for-longer rate environment. |
| VOO | Vanguard S&P 500 ETF | Broad Market | 12% | null | Core broad-market exposure. Ensures the portfolio participates in general market gains. Provides diversification across sectors not otherwise represented. Low-cost, tax-efficient. |

## Cash

| Target Weight | Purpose |
|---------------|---------|
| 8% | Dry powder for buying dips. Deploy into highest-conviction positions during market dislocations — broad selloffs, earnings overreactions, or macro-driven fear. |

## Buckets

| Bucket | Color | Weight |
|--------|-------|--------|
| Mega-Cap Tech | #2563eb | 40% |
| AI Infrastructure | #7c3aed | 10% |
| Cloud & Commerce | #059669 | 8% |
| Financials | #f59e0b | 15% |
| Healthcare | #dc2626 | 7% |
| Broad Market | #6b7280 | 12% |
| Cash Reserve | #9ca3af | 8% |

## Management Style

| Setting | Value |
|---------|-------|
| Style | Active-Thesis |
| Review Frequency | Weekly |
| Rebalance Trigger | Thesis change or drift >5% |
| Exit Criteria | Thesis broken, or position down >25% with no catalyst for recovery |
| Trim Criteria | Position exceeds 15% weight through appreciation alone |
| Add Criteria | High-conviction position drops >15% with thesis intact |

## Settings Defaults

| Setting | Value |
|---------|-------|
| Daily Run Time | 17:00 |
| Timezone | America/New_York |
| Deep Analysis Day | Monday |
| Weekly Digest Day | Friday |
| Single Position Daily Move Alert | 5% |
| Portfolio Daily Move Alert | 3% |
| Max Single Position Weight | 20% |
| Weight Drift Alert | 5% |

## Rebalancing Rules

Include in the AI prompt:

- Long-term hold. Rebalance only on thesis changes or extreme concentration drift.
- Do NOT recommend action on normal daily or weekly volatility.
- A 3–5% drop in a large-cap tech name on no news is NOT a reason to act.
- A company losing a major product line, regulatory action, or fundamental change in competitive position IS a reason to act.
- Broad market selloffs where all positions drop together — do nothing, consider adding to highest-conviction names.
- A position exceeding 20% of portfolio weight through appreciation alone warrants a trim discussion.
- Earnings beats or misses are worth flagging in the daily summary, but rarely warrant immediate action.
