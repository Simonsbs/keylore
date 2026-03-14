#!/bin/sh
set -eu

if ! command -v helm >/dev/null 2>&1; then
  exec docker run --rm --entrypoint sh \
    -v "$(pwd):/workspace" \
    -w /workspace \
    alpine/helm:3.17.1 \
    ./scripts/helm-validate.sh
fi

chart_dir="./charts/keylore"
prod_database_url="postgresql://keylore:keylore@postgres.example.com:5432/keylore"

helm lint "$chart_dir"
helm template keylore "$chart_dir" -f "$chart_dir/values.yaml" > /dev/null

for profile in dev staging prod ha; do
  if [ "$profile" = "prod" ]; then
    helm template keylore "$chart_dir" \
      -f "$chart_dir/values.yaml" \
      -f "$chart_dir/values-${profile}.yaml" \
      --set "app.databaseUrl=${prod_database_url}" > /dev/null
  elif [ "$profile" = "ha" ]; then
    helm template keylore "$chart_dir" \
      -f "$chart_dir/values.yaml" \
      -f "$chart_dir/values-${profile}.yaml" \
      --set "app.databaseUrl=${prod_database_url}" > /dev/null
  else
    helm template keylore "$chart_dir" \
      -f "$chart_dir/values.yaml" \
      -f "$chart_dir/values-${profile}.yaml" > /dev/null
  fi
done

for profile in staging prod ha; do
  if [ "$profile" = "prod" ]; then
    helm template keylore "$chart_dir" \
      --is-upgrade \
      -f "$chart_dir/values.yaml" \
      -f "$chart_dir/values-${profile}.yaml" \
      --set "app.databaseUrl=${prod_database_url}" > /dev/null
  elif [ "$profile" = "ha" ]; then
    helm template keylore "$chart_dir" \
      --is-upgrade \
      -f "$chart_dir/values.yaml" \
      -f "$chart_dir/values-${profile}.yaml" \
      --set "app.databaseUrl=${prod_database_url}" > /dev/null
  else
    helm template keylore "$chart_dir" \
      --is-upgrade \
      -f "$chart_dir/values.yaml" \
      -f "$chart_dir/values-${profile}.yaml" > /dev/null
  fi
done
