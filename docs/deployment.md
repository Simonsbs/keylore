# Deployment

`v1.0.0-rc3` keeps the Helm-based deployment path for self-hosted Kubernetes environments, carries tenant-aware partitioning in the application data model, preserves the `rc1` contract and hardening gates, serves the minimal admin UI from the same HTTP service, and adds an explicit container smoke path for `/admin`.

## Helm chart

Chart location:

- [charts/keylore/Chart.yaml](/home/simon/keylore/charts/keylore/Chart.yaml)

Environment profiles:

- [charts/keylore/values-dev.yaml](/home/simon/keylore/charts/keylore/values-dev.yaml)
- [charts/keylore/values-staging.yaml](/home/simon/keylore/charts/keylore/values-staging.yaml)
- [charts/keylore/values-prod.yaml](/home/simon/keylore/charts/keylore/values-prod.yaml)
- [charts/keylore/values-ha.yaml](/home/simon/keylore/charts/keylore/values-ha.yaml)

## Example install

After deployment, the operator UI is available at `/admin` on the same origin as the REST API.

## Container smoke

Run the shipped image smoke test to verify the built container serves `/admin`, `/healthz`, and token-backed admin routes against a disposable PostgreSQL instance:

```bash
npm run ops:container-smoke
```

Development-style install:

```bash
helm upgrade --install keylore ./charts/keylore \
  -f ./charts/keylore/values.yaml \
  -f ./charts/keylore/values-dev.yaml \
  --set bootstrapSecrets.adminClientSecret=dev-admin-secret \
  --set bootstrapSecrets.consumerClientSecret=dev-consumer-secret
```

Production-style install with external PostgreSQL:

```bash
helm upgrade --install keylore ./charts/keylore \
  -f ./charts/keylore/values.yaml \
  -f ./charts/keylore/values-prod.yaml \
  --set app.databaseUrl=postgresql://USER:PASSWORD@postgres.example.com:5432/keylore \
  --set bootstrapSecrets.existingSecret=keylore-bootstrap
```

HA-style install with spread controls and an external PostgreSQL service:

```bash
helm upgrade --install keylore ./charts/keylore \
  -f ./charts/keylore/values.yaml \
  -f ./charts/keylore/values-ha.yaml \
  --set app.databaseUrl=postgresql://USER:PASSWORD@postgres.example.com:5432/keylore \
  --set bootstrapSecrets.existingSecret=keylore-bootstrap
```

## Release path

The release workflow lives at [release.yml](/home/simon/keylore/.github/workflows/release.yml). On version tags it:

- runs typecheck, tests, and build
- runs the explicit contract, conformance, and hardening suites
- validates Helm lint, render, and dry-run upgrade paths
- packages a source tarball and Helm chart archive
- builds and pushes a GHCR image
- generates an SPDX SBOM
- runs Trivy scanning
- signs the image with keyless cosign
- publishes a GitHub release with generated notes

## Restore drill

Use the shipped restore drill script after deploying and after any major schema change:

```bash
npm run build
KEYLORE_DATABASE_URL=postgresql://... \
KEYLORE_BOOTSTRAP_ADMIN_CLIENT_SECRET=... \
KEYLORE_BOOTSTRAP_CONSUMER_CLIENT_SECRET=... \
npm run ops:restore-drill
```

## Helm validation and rollback

Run the shipped validation script before promoting a new chart revision:

```bash
npm run ops:helm-validate
```

For production rollouts:

- validate `values.yaml` plus your environment override with `ops:helm-validate`
- run `npm run test:contracts`, `npm run test:conformance`, `npm run test:hardening`, and `npm run ops:container-smoke` before promoting a release candidate
- perform `helm upgrade --install` with the exact values file set you validated
- keep the previous chart package and values bundle so `helm rollback` can restore the prior release quickly
- for replicated deployments, prefer the HA profile or equivalent affinity, topology spread, and pod disruption settings
- treat tenant bootstrap data as application data, not Helm values; tenant-bound records now live in PostgreSQL and are preserved by logical backups

## Upgrade sequence

1. export a logical backup from the current release
2. validate the incoming chart and values set
3. run the container smoke path on the candidate image
4. perform `helm upgrade --install`
5. verify `/healthz`, `/readyz`, `/admin`, and one token-backed operator action

## Rollback sequence

1. use `helm rollback` to the previous release revision
2. verify `/healthz`, `/readyz`, and `/admin`
3. if the rollback exposed data issues rather than chart issues, use logical backup inspection and restore procedures before retrying the upgrade
