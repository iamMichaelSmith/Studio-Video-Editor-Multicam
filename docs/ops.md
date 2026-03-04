# Operations Runbook

## Local run
```bash
npm install
npm run dev
```

## Test and quality gates
```bash
npm test
npm run test:unit
npm run test:e2e
npm run build
```

## Known operational warnings
- Browserslist warning may appear:
  - `npx update-browserslist-db@latest`

## Common issues

### Process button remains disabled
- Ensure at least one valid video file is uploaded
- Check validation banner for file type/count/size issues

### Processing cancellation
- Cancel is cooperative (safe cancellation request)
- Re-run by clicking Process again after cancellation

### Browser media limitations
- Some codecs/files may fail depending on browser support
- Prefer MP4/MOV/WebM with common codecs

## Monitoring ideas (next increment)
- Add client-side telemetry for stage durations
- Track error categories (validation vs processing vs codec)
- Add simple analytics event on completed export
