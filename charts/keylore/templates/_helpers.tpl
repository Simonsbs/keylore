{{- define "keylore.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "keylore.fullname" -}}
{{- if .Values.fullnameOverride -}}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-%s" .Release.Name (include "keylore.name" .) | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}

{{- define "keylore.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" -}}
{{- end -}}

{{- define "keylore.labels" -}}
helm.sh/chart: {{ include "keylore.chart" . }}
app.kubernetes.io/name: {{ include "keylore.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Chart.AppVersion }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end -}}

{{- define "keylore.selectorLabels" -}}
app.kubernetes.io/name: {{ include "keylore.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}

{{- define "keylore.serviceAccountName" -}}
{{- if .Values.serviceAccount.create -}}
{{- default (include "keylore.fullname" .) .Values.serviceAccount.name -}}
{{- else -}}
{{- default "default" .Values.serviceAccount.name -}}
{{- end -}}
{{- end -}}

{{- define "keylore.bootstrapSecretName" -}}
{{- if .Values.bootstrapSecrets.existingSecret -}}
{{- .Values.bootstrapSecrets.existingSecret -}}
{{- else -}}
{{- printf "%s-bootstrap" (include "keylore.fullname" .) -}}
{{- end -}}
{{- end -}}

{{- define "keylore.postgresSecretName" -}}
{{- if .Values.postgresql.existingSecret -}}
{{- .Values.postgresql.existingSecret -}}
{{- else -}}
{{- printf "%s-postgres" (include "keylore.fullname" .) -}}
{{- end -}}
{{- end -}}

{{- define "keylore.databaseUrl" -}}
{{- if .Values.postgresql.enabled -}}
postgresql://{{ .Values.postgresql.username }}:$(POSTGRES_PASSWORD)@{{ include "keylore.fullname" . }}-postgres:5432/{{ .Values.postgresql.database }}
{{- else -}}
{{- required "Set .Values.app.databaseUrl when postgresql.enabled=false" .Values.app.databaseUrl -}}
{{- end -}}
{{- end -}}
