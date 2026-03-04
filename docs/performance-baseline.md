# Performance Baseline (2026-03-03)

Measured from `npm run build` output on local Windows host.

## Build artifacts
- `assets/vendor-*.js`: ~199.78 kB (gzip ~61.40 kB)
- `assets/index-*.js`: ~40.86 kB (gzip ~12.27 kB)
- `assets/index-*.css`: ~14.00 kB (gzip ~3.46 kB)

## Notes
- Build reports an outdated Browserslist DB warning.
- Optional maintenance:
  - `npx update-browserslist-db@latest`

## Optimization targets (next)
1. Keep non-vendor app JS under 50kB gzip
2. Lazy-load heavy processing paths only after user intent
3. Add CI bundle budget check when release cadence stabilizes
