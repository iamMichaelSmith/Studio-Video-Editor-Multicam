# Security Notes

## Current posture
- Frontend-only app processing media in browser
- No server-side upload in current architecture
- No required runtime API secrets

## Secure coding guidance
- Do not commit secrets/tokens in repo
- Keep `.env` out of source control
- Validate file input types and sizes (implemented)
- Limit accepted file extensions (implemented)

## Dependency hygiene
- Run periodically:
```bash
npm audit
npm audit fix
```
- Keep Playwright/TypeScript/Vite dependencies current

## Browser safety
- Media parsing is done by browser APIs and FFmpeg wasm modules
- Avoid loading untrusted remote scripts

## If backend is added later
- Enforce auth on upload endpoints
- Scan uploads and enforce MIME/type checks server-side
- Rate-limit processing endpoints
- Store artifacts with least-privilege access
