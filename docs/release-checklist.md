# Release Checklist

Use this checklist for `v1.0.0-rc6` and the final `v1.0.0` release.

## Preflight

- confirm the repo is clean
- confirm version metadata is aligned in `package.json`, `Chart.yaml`, and `src/config.ts`
- confirm `CHANGELOG.md` and operator docs reflect actual behavior

## Verification

Run the full sequential rehearsal:

```bash
npm run ops:release-verify
```

If `helm` is not installed locally, the Helm validation step falls back to the pinned container automatically.

## Operator validation

- open `/admin`
- mint or paste an operator token
- verify tenants, auth clients, approvals, break-glass, backup, audit, and system panels load as expected
- confirm unauthorized panels fail with visible API errors rather than silent empty success

## Upgrade and rollback

- validate the exact Helm values bundle you intend to deploy
- keep the previous chart archive and values bundle for rollback
- perform `helm upgrade --install` using the validated values set
- if rollback is required, use `helm rollback` to the previous known-good revision

## Recovery

- export a logical backup before production rollout
- verify backup inspection succeeds
- after rollout, run the restore drill on a disposable environment or database clone

## Release publication

- tag the release only after all gates pass
- confirm GitHub Actions release workflow completes with image, SBOM, chart archive, and release artifacts
- record the release in `/home/simon/MACHINE_HISTORY.md`
