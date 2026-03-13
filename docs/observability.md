# Observability

KeyLore exposes operational metrics at `GET /metrics` in Prometheus text format.

## Core metrics

- `keylore_http_requests_total`
- `keylore_http_request_duration_ms_count`
- `keylore_http_request_duration_ms_sum`
- `keylore_http_request_duration_ms_max`
- `keylore_http_inflight_requests`
- `keylore_rate_limit_blocks_total`
- `keylore_auth_token_issuance_total`
- `keylore_auth_token_validation_total`
- `keylore_adapter_operations_total`
- `keylore_maintenance_runs_total`
- `keylore_maintenance_duration_ms_count`
- `keylore_maintenance_duration_ms_sum`
- `keylore_maintenance_last_run_timestamp_seconds`

## Shipped artifacts

- Grafana dashboard: [ops/dashboards/keylore-overview.json](/home/simon/keylore/ops/dashboards/keylore-overview.json)
- Prometheus alert rules: [ops/alerts/keylore-prometheusrule.yaml](/home/simon/keylore/ops/alerts/keylore-prometheusrule.yaml)

## Recommended scrape configuration

- scrape interval: `30s`
- scrape path: `/metrics`
- scrape timeout: `10s`

## Minimum alert set

- KeyLore process missing from Prometheus
- elevated request latency
- repeated maintenance failures
- elevated rate-limit block volume

## Dashboard focus

The shipped dashboard is intended to answer four operator questions quickly:

- Is the service up and serving traffic?
- Are requests getting slower?
- Are clients being rate-limited unusually often?
- Are adapter backends or maintenance loops degrading?
