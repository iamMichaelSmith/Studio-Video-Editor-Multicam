# Deployment Guide

## Target
Static frontend build served via any static host (Netlify, Vercel, Cloudflare Pages, S3+CloudFront, Nginx).

## Build
```bash
npm install
npm run test:all
npm run build
```

Build output:
- `dist/`

## Environment
No mandatory runtime secrets required for current frontend-only architecture.

## Recommended hosting settings
- Cache immutable assets under `dist/assets/*` aggressively
- Short cache on `index.html`
- Gzip/Brotli enabled
- HTTPS enforced

## Release checklist
1. `npm run test:all`
2. `npm run test:e2e`
3. `npm run build`
4. Verify bundle output and UI manually
5. Deploy `dist/`
6. Smoke test production URL

## Rollback
- Keep previous `dist` artifact/version tag
- Re-point deployment to previous known-good artifact
