# Architecture

## High-level
React/Vite frontend app for client-side multicam editing with ffmpeg-web bindings.

```text
User uploads media
      |
      v
React UI state + timeline controls
      |
      +--> ffmpeg-web worker processing
      |
      v
Preview/export artifacts
```

## Reliability notes
- Frontend build via Vite
- Worker-based processing path
- Lint/build scripts for CI validation
