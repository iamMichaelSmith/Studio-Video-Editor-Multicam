# QA Checklist (Final Pass)

Use this checklist before tagging a release.

## Functional
- [ ] App loads with no console errors
- [ ] Settings panel toggles open/closed
- [ ] Presets apply (Reels / Shorts / TikTok)
- [ ] File validation blocks unsupported files
- [ ] Processing can be cancelled safely
- [ ] Process button enables only with valid input

## Test gates
- [ ] `npm test`
- [ ] `npm run test:unit`
- [ ] `npm run test:e2e`
- [ ] `npm run build`

## Docs
- [ ] README updated if behavior changed
- [ ] `docs/ops.md` reflects any new runtime warnings
- [ ] `docs/security.md` updated for new dependencies/integrations

## Release readiness
- [ ] Screenshots/demo assets still match current UI
- [ ] No secrets in repo history or tracked files
- [ ] Commit message is clear and scoped
