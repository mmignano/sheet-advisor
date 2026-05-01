# Contributing to Sheet Advisor

Thanks for your interest in contributing.

## Bug reports

Open a GitHub issue with:
- What you expected to happen
- What actually happened
- Relevant output from the Apps Script execution log (Project Settings → Executions)

## Bug fixes

PRs for bug fixes are welcome — open one directly. Keep the fix focused and include a description of what was broken and how the fix addresses it.

## New features

Please **open an issue first** before writing code for a new feature. This avoids wasted effort on features that don't fit the project's direction. Once there's agreement on the approach, a PR is welcome.

## Code style

This project runs in Google Apps Script (V8 runtime), which means:
- ES5-style `var` declarations throughout (no `let`/`const`) for compatibility
- No ES6 modules — all functions are global within the Apps Script project
- Follow the existing patterns in each file

## Testing changes

1. Make your changes in `src/`
2. `clasp push` to deploy to your own Apps Script project
3. Run `testRun()` from the Apps Script editor to verify end-to-end
4. Check the Monitoring Log tab and your inbox for the expected output
