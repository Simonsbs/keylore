# Deployment

`v0.6` introduces a Helm-based deployment path for self-hosted Kubernetes environments.

## Helm chart

Chart location:

- [charts/keylore/Chart.yaml](/home/simon/keylore/charts/keylore/Chart.yaml)

Environment profiles:

- [charts/keylore/values-dev.yaml](/home/simon/keylore/charts/keylore/values-dev.yaml)
- [charts/keylore/values-staging.yaml](/home/simon/keylore/charts/keylore/values-staging.yaml)
- [charts/keylore/values-prod.yaml](/home/simon/keylore/charts/keylore/values-prod.yaml)

## Example install

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

## Release path

The release workflow lives at [release.yml](/home/simon/keylore/.github/workflows/release.yml). On version tags it:

- runs typecheck, tests, and build
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
