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
- `keylore_notification_deliveries_total`
- `keylore_trace_exports_total`
- `keylore_trace_export_batch_size_count`
- `keylore_rotation_runs_total`

## Traces

KeyLore now keeps a bounded in-memory list of recent spans for operator inspection and can optionally export batches to an external HTTP endpoint. The in-memory list is still intentionally lightweight: it is for local debugging and self-hosted incident response, not a replacement for a full tracing backend.

Trace visibility is exposed through:

- `GET /v1/system/traces`
- `GET /v1/system/trace-exporter`
- `npm run dev:cli -- system traces`
- `npm run dev:cli -- system trace-exporter`
- MCP tool `system_recent_traces`

HTTP callers can supply `x-trace-id`; KeyLore echoes it in the response and propagates it into approval, break-glass, and notification spans.

If trace export is configured, operators can inspect queue depth, last flush time, and recent export failures before forcing a manual flush.

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
