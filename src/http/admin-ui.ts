import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { KeyLoreApp } from "../app.js";

const adminStyles = String.raw`
:root {
  --canvas: #f4efe3;
  --paper: rgba(255, 250, 241, 0.9);
  --ink: #17211f;
  --muted: #5d685f;
  --line: rgba(23, 33, 31, 0.12);
  --accent: #135d4a;
  --accent-soft: rgba(19, 93, 74, 0.12);
  --warning: #9d4b14;
  --danger: #8f2d23;
  --shadow: 0 24px 60px rgba(23, 33, 31, 0.12);
  --radius: 18px;
  --font-sans: "Avenir Next", "Trebuchet MS", Verdana, sans-serif;
  --font-serif: "Iowan Old Style", "Palatino Linotype", "Book Antiqua", serif;
  --font-mono: "IBM Plex Mono", "SFMono-Regular", "DejaVu Sans Mono", monospace;
}

* {
  box-sizing: border-box;
}

html {
  scroll-behavior: smooth;
}

body {
  margin: 0;
  min-height: 100vh;
  color: var(--ink);
  font-family: var(--font-sans);
  background:
    radial-gradient(circle at top left, rgba(182, 116, 42, 0.18), transparent 28%),
    radial-gradient(circle at top right, rgba(19, 93, 74, 0.18), transparent 34%),
    linear-gradient(180deg, #fcf6ea 0%, #efe5d1 100%);
}

body::before {
  content: "";
  position: fixed;
  inset: 0;
  pointer-events: none;
  background-image:
    linear-gradient(rgba(23, 33, 31, 0.03) 1px, transparent 1px),
    linear-gradient(90deg, rgba(23, 33, 31, 0.03) 1px, transparent 1px);
  background-size: 28px 28px;
  mask-image: linear-gradient(180deg, rgba(0, 0, 0, 0.9), transparent 88%);
}

a {
  color: inherit;
}

button,
input,
select,
textarea {
  font: inherit;
}

.page-shell {
  position: relative;
  display: grid;
  grid-template-columns: 290px minmax(0, 1fr);
  min-height: 100vh;
}

.sidebar {
  position: sticky;
  top: 0;
  align-self: start;
  height: 100vh;
  padding: 28px 22px;
  border-right: 1px solid var(--line);
  background: rgba(255, 248, 236, 0.78);
  backdrop-filter: blur(18px);
}

.brand {
  margin: 0 0 10px;
  font-family: var(--font-serif);
  font-size: 2rem;
  line-height: 0.95;
}

.brand-subtitle,
.helper-copy,
.muted-copy {
  margin: 0;
  color: var(--muted);
  line-height: 1.5;
}

.helper-copy {
  font-size: 0.94rem;
}

.nav-group {
  display: grid;
  gap: 8px;
  margin: 28px 0;
}

.sidebar-section-label {
  margin: 18px 0 8px;
  color: var(--muted);
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.nav-button,
.button,
.button-secondary,
.button-danger {
  appearance: none;
  border: 0;
  border-radius: 999px;
  padding: 12px 16px;
  cursor: pointer;
  transition: transform 140ms ease, box-shadow 140ms ease, background 140ms ease;
}

.nav-button {
  text-align: left;
  background: transparent;
  color: var(--ink);
}

.nav-button:hover,
.nav-button:focus-visible,
.button:hover,
.button:focus-visible,
.button-secondary:hover,
.button-secondary:focus-visible,
.button-danger:hover,
.button-danger:focus-visible {
  transform: translateY(-1px);
  box-shadow: 0 14px 28px rgba(23, 33, 31, 0.12);
}

.nav-button.is-active {
  background: var(--accent-soft);
  color: var(--accent);
  font-weight: 600;
}

.tab-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 18px;
}

.tab-button {
  appearance: none;
  border: 1px solid var(--line);
  border-radius: 999px;
  padding: 10px 14px;
  background: #f7f2e8;
  color: var(--ink);
  cursor: pointer;
  font-weight: 600;
}

.tab-button.is-active {
  background: var(--accent-soft);
  color: var(--accent);
  border-color: rgba(19, 93, 74, 0.24);
}

.button,
.button-secondary,
.button-danger {
  font-weight: 600;
}

.button {
  background: var(--accent);
  color: #f8f5f0;
}

.button-secondary {
  background: #f7f2e8;
  color: var(--ink);
  border: 1px solid var(--line);
}

.button-danger {
  background: var(--danger);
  color: #fff6f3;
}

.button[disabled],
.button-secondary[disabled],
.button-danger[disabled] {
  cursor: progress;
  opacity: 0.72;
  transform: none;
  box-shadow: none;
}

.content {
  padding: 28px;
}

.hero {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 18px;
  align-items: start;
  padding: 24px 26px;
  border: 1px solid rgba(19, 93, 74, 0.14);
  border-radius: 28px;
  background:
    radial-gradient(circle at top left, rgba(19, 93, 74, 0.14), transparent 26%),
    linear-gradient(135deg, rgba(255, 250, 241, 0.95), rgba(246, 236, 214, 0.9));
  box-shadow: var(--shadow);
}

.eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 999px;
  background: rgba(19, 93, 74, 0.08);
  color: var(--accent);
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.hero h1,
.section-heading h2 {
  margin: 10px 0 8px;
  font-family: var(--font-serif);
  font-size: clamp(2.2rem, 4vw, 3.4rem);
  line-height: 0.95;
}

.hero-copy {
  max-width: 720px;
  margin: 0;
  color: var(--muted);
  font-size: 1rem;
  line-height: 1.6;
}

.hero-meta {
  display: grid;
  gap: 10px;
  min-width: 240px;
}

.meta-card,
.panel,
.metric-card {
  border: 1px solid var(--line);
  background: var(--paper);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
}

.meta-card {
  padding: 16px 18px;
}

.meta-label {
  display: block;
  color: var(--muted);
  font-size: 0.82rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.meta-value {
  display: block;
  margin-top: 8px;
  font-family: var(--font-mono);
  font-size: 0.9rem;
  word-break: break-word;
}

.notice {
  display: none;
}

.notice.is-visible {
  display: none;
}

.toast-console {
  position: fixed;
  right: 20px;
  bottom: 20px;
  z-index: 80;
  display: grid;
  gap: 10px;
  width: min(420px, calc(100vw - 32px));
}

.toast {
  border: 1px solid var(--line);
  background: rgba(255, 250, 241, 0.96);
  border-radius: 16px;
  box-shadow: 0 20px 40px rgba(23, 33, 31, 0.18);
  padding: 14px 16px;
}

.toast.is-info {
  border-color: rgba(19, 93, 74, 0.16);
}

.toast.is-error {
  border-color: rgba(143, 45, 35, 0.2);
}

.toast.is-warning {
  border-color: rgba(157, 75, 20, 0.18);
}

.toast-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 6px;
}

.toast-title {
  font-size: 0.82rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.toast-close {
  appearance: none;
  border: 0;
  background: transparent;
  color: var(--muted);
  font-size: 1rem;
  cursor: pointer;
  padding: 0;
}

.toast-copy {
  margin: 0;
  color: var(--ink);
  line-height: 1.5;
}

.dashboard {
  display: grid;
  gap: 24px;
  margin-top: 24px;
}

.step-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
}

.step-card {
  padding: 16px;
  border-radius: 16px;
  border: 1px solid rgba(23, 33, 31, 0.08);
  background: rgba(255, 255, 255, 0.7);
}

.step-card h3 {
  margin: 10px 0 6px;
  font-size: 1rem;
}

.step-card p {
  margin: 0;
  color: var(--muted);
  line-height: 1.5;
}

.step-number {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 999px;
  background: rgba(19, 93, 74, 0.1);
  color: var(--accent);
  font-size: 0.84rem;
  font-weight: 700;
}

.advanced-shell[hidden],
.advanced-nav[hidden] {
  display: none;
}

.advanced-summary {
  margin-top: 12px;
}

.section-heading {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: center;
  margin-bottom: 12px;
}

.section-heading h2 {
  margin: 0;
  font-size: 1.9rem;
}

.section-heading p {
  margin: 6px 0 0;
  color: var(--muted);
}

.panel {
  padding: 20px;
}

.panel > details.disclosure:first-child {
  margin-top: 0;
}

.panel-grid {
  display: grid;
  grid-template-columns: repeat(12, minmax(0, 1fr));
  gap: 18px;
}

.span-12 {
  grid-column: span 12;
}

.span-8 {
  grid-column: span 8;
}

.span-7 {
  grid-column: span 7;
}

.span-6 {
  grid-column: span 6;
}

.span-5 {
  grid-column: span 5;
}

.span-4 {
  grid-column: span 4;
}

.span-3 {
  grid-column: span 3;
}

.metric-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 16px;
}

.metric-card {
  padding: 18px;
}

.metric-card strong {
  display: block;
  margin-top: 10px;
  font-family: var(--font-serif);
  font-size: 2rem;
}

.metric-card span {
  color: var(--muted);
  font-size: 0.9rem;
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.field,
.field-wide {
  display: grid;
  gap: 8px;
}

.field-wide {
  grid-column: 1 / -1;
}

.field label,
.field-wide label {
  font-size: 0.84rem;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.field input,
.field textarea,
.field select,
.field-wide textarea,
.field-wide input {
  width: 100%;
  padding: 12px 14px;
  border: 1px solid rgba(23, 33, 31, 0.14);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.75);
  color: var(--ink);
}

.field textarea,
.field-wide textarea {
  min-height: 116px;
  resize: vertical;
  font-family: var(--font-mono);
  font-size: 0.9rem;
  line-height: 1.5;
}

pre {
  max-width: 100%;
  margin: 0;
  overflow: auto;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.form-actions,
.panel-actions,
.toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
}

.panel-actions {
  margin-top: 16px;
}

.toolbar {
  justify-content: space-between;
}

.session-line {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
}

.utility-shell {
  display: none;
}

.token-toolbar {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
  margin-bottom: 16px;
}

.token-list {
  display: grid;
  gap: 12px;
}

.token-row {
  padding: 16px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.72);
  border: 1px solid rgba(23, 33, 31, 0.08);
}

.token-row h3 {
  margin: 0 0 6px;
  font-size: 1rem;
}

.token-row p {
  margin: 0;
}

dialog.modal {
  width: min(920px, calc(100vw - 32px));
  max-height: calc(100vh - 32px);
  padding: 0;
  border: 0;
  border-radius: 24px;
  background: transparent;
}

dialog.modal::backdrop {
  background: rgba(23, 33, 31, 0.38);
  backdrop-filter: blur(6px);
}

.modal-card {
  border: 1px solid var(--line);
  background: rgba(255, 250, 241, 0.98);
  border-radius: 24px;
  box-shadow: var(--shadow);
  overflow: auto;
  max-height: calc(100vh - 32px);
}

.modal-header {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
  padding: 22px 24px 0;
}

.modal-body {
  padding: 18px 24px 24px;
}

.pill {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 999px;
  background: rgba(23, 33, 31, 0.05);
  color: var(--muted);
  font-size: 0.82rem;
}

.pill strong {
  color: var(--ink);
  font-weight: 700;
}

.state-ok,
.state-pending,
.state-denied,
.state-disabled,
.state-active,
.state-warning {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 7px 11px;
  border-radius: 999px;
  font-size: 0.76rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.state-ok,
.state-active {
  background: rgba(19, 93, 74, 0.1);
  color: var(--accent);
}

.state-pending,
.state-warning {
  background: rgba(157, 75, 20, 0.12);
  color: var(--warning);
}

.state-denied,
.state-disabled {
  background: rgba(143, 45, 35, 0.1);
  color: var(--danger);
}

.list-stack,
.code-stack {
  display: grid;
  gap: 12px;
}

.snippet-stack {
  display: grid;
  gap: 14px;
}

.snippet-box {
  position: relative;
}

.snippet-box textarea {
  padding-right: 54px;
}

.copy-glyph {
  position: absolute;
  top: 10px;
  right: 10px;
  width: 34px;
  height: 34px;
  border-radius: 10px;
  border: 1px solid var(--line);
  background: rgba(255, 250, 241, 0.92);
  color: var(--ink);
  cursor: pointer;
  font-size: 1rem;
  font-weight: 700;
}

.copy-glyph:hover,
.copy-glyph:focus-visible {
  background: var(--accent-soft);
  color: var(--accent);
}

.list-card {
  padding: 16px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.72);
  border: 1px solid rgba(23, 33, 31, 0.08);
}

.list-card h3 {
  margin: 0 0 8px;
  font-size: 1rem;
}

.list-card p {
  margin: 0;
  color: var(--muted);
  line-height: 1.5;
}

.list-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 12px;
}

.mono {
  font-family: var(--font-mono);
}

.table-wrap {
  overflow: auto;
  border-radius: 14px;
  border: 1px solid rgba(23, 33, 31, 0.08);
}

table {
  width: 100%;
  border-collapse: collapse;
  min-width: 640px;
  background: rgba(255, 255, 255, 0.6);
}

th,
td {
  padding: 12px 14px;
  text-align: left;
  border-bottom: 1px solid rgba(23, 33, 31, 0.08);
  vertical-align: top;
}

th {
  font-size: 0.8rem;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

pre {
  margin: 0;
  padding: 16px;
  overflow: auto;
  border-radius: 16px;
  border: 1px solid rgba(23, 33, 31, 0.08);
  background: #fbf7ef;
  color: #233230;
  font-family: var(--font-mono);
  font-size: 0.85rem;
  line-height: 1.55;
}

.empty-state,
.error-state {
  padding: 18px;
  border-radius: 16px;
  border: 1px dashed rgba(23, 33, 31, 0.18);
  color: var(--muted);
  background: rgba(255, 255, 255, 0.45);
}

.error-state {
  color: var(--danger);
  border-style: solid;
  border-color: rgba(143, 45, 35, 0.18);
  background: rgba(143, 45, 35, 0.04);
}

.panel-footnote {
  margin-top: 12px;
  color: var(--muted);
  font-size: 0.9rem;
}

.disclosure {
  margin-top: 16px;
  padding: 16px;
  border-radius: 16px;
  border: 1px solid rgba(23, 33, 31, 0.08);
  background: rgba(255, 255, 255, 0.5);
}

.disclosure summary {
  cursor: pointer;
  list-style: none;
  font-weight: 700;
}

.disclosure summary::-webkit-details-marker {
  display: none;
}

.disclosure[open] summary {
  margin-bottom: 12px;
}

.stack-tight {
  display: grid;
  gap: 12px;
}

@media (max-width: 1120px) {
  .page-shell {
    grid-template-columns: 1fr;
  }

  .sidebar {
    position: relative;
    height: auto;
    border-right: 0;
    border-bottom: 1px solid var(--line);
  }

  .metric-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .step-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .span-8,
  .span-7,
  .span-6,
  .span-5,
  .span-4,
  .span-3 {
    grid-column: span 12;
  }
}

@media (max-width: 720px) {
  .content,
  .sidebar {
    padding: 20px;
  }

  .hero {
    grid-template-columns: 1fr;
  }

  .step-grid,
  .metric-grid,
  .form-grid {
    grid-template-columns: 1fr;
  }
}
`;

function resolveLocalStdioEntryPath(): string {
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  const packageRoot = path.resolve(moduleDir, "..", "..");
  const builtEntry = path.join(packageRoot, "dist", "index.js");
  if (fs.existsSync(builtEntry)) {
    return builtEntry;
  }
  return path.join(packageRoot, "src", "index.ts");
}

const adminApp = String.raw`
const config = window.__KEYLORE_ADMIN_CONFIG__;
const state = {
  baseUrl: config.baseUrl,
  resource: config.baseUrl.replace(/\/$/, '') + '/v1',
  localQuickstartEnabled: config.localQuickstartEnabled === true,
  localAdminBootstrap: config.localAdminBootstrap || null,
  token: '',
  sessionClientId: '',
  sessionScopes: '',
  sessionTenantId: '',
  busy: false,
  data: {},
  lastBackup: null,
  lastClientSecret: null,
  lastResponse: null,
  lastCredentialTest: null,
  lastCredentialTestContext: null,
  lastCreatedCredentialId: '',
  selectedCredentialId: '',
  currentCredentialContext: null,
  lastMcpConnection: null,
  mcpToken: '',
  connectTab: 'codex',
  advancedVisible: false,
  credentialIdManuallyEdited: false,
  credentialModalMode: 'create',
  toastCounter: 0
};

const storageKey = 'keylore-admin-session';

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function byId(id) {
  return document.getElementById(id);
}

function showDialog(id) {
  const dialog = byId(id);
  if (!(dialog instanceof HTMLDialogElement)) {
    return;
  }
  if (!dialog.open) {
    dialog.showModal();
  }
}

function closeDialog(id) {
  const dialog = byId(id);
  if (!(dialog instanceof HTMLDialogElement)) {
    return;
  }
  if (dialog.open) {
    dialog.close();
  }
}

function splitList(value) {
  return String(value ?? '')
    .split(/[\n,]/)
    .map(function(item) {
      return item.trim();
    })
    .filter(Boolean);
}

function formatDate(value) {
  if (!value) {
    return 'n/a';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}

function prettyJson(value) {
  return JSON.stringify(value ?? {}, null, 2);
}

function defaultTestUrlForCredential(credential) {
  if (!credential) {
    return '';
  }
  if (credential.service === 'github') {
    return 'https://api.github.com/rate_limit';
  }
  if (credential.allowedDomains && credential.allowedDomains.length > 0) {
    return 'https://' + credential.allowedDomains[0];
  }
  return '';
}

function slugifyTokenKey(value) {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return normalized || 'token';
}

function firstPrompt() {
  const credential = state.currentCredentialContext || selectedCredentialSummary() || visibleCredentials()[0];
  if (!credential) {
    return 'Search KeyLore for the best credential for the target service, explain why you chose it, and use it through the broker without exposing the raw token.';
  }

  const domain = credential.allowedDomains && credential.allowedDomains.length > 0
    ? credential.allowedDomains[0]
    : 'target-service.example.com';
  const targetUrl = defaultTestUrlForCredential(credential) || ('https://' + domain);
  return 'Search KeyLore for the best credential for ' + credential.service + ' on ' + domain + '. Explain why you chose it, then use it through KeyLore to fetch ' + targetUrl + ' without exposing the raw token.';
}

function mcpHttpTokenValue() {
  return state.mcpToken || 'REPLACE_ME_MCP_TOKEN';
}

function codexStdioSnippet() {
  return [
    '[mcp_servers.keylore_stdio]',
    'command = "node"',
    'args = ["' + config.stdioEntryPath.replace(/\\/g, '\\\\') + '", "--transport", "stdio"]'
  ].join('\n');
}

function codexHttpSnippet() {
  return [
    '[mcp_servers.keylore_http]',
    'url = "' + config.baseUrl.replace(/\/$/, '') + '/mcp"',
    'bearer_token_env_var = "KEYLORE_MCP_ACCESS_TOKEN"'
  ].join('\n');
}

function geminiStdioSnippet() {
  return prettyJson({
    mcpServers: {
      keylore_stdio: {
        command: 'node',
        args: [config.stdioEntryPath, '--transport', 'stdio']
      }
    }
  });
}

function geminiHttpSnippet() {
  return prettyJson({
    mcpServers: {
      keylore_http: {
        httpUrl: config.baseUrl.replace(/\/$/, '') + '/mcp',
        headers: {
          Authorization: 'Bearer ' + mcpHttpTokenValue()
        }
      }
    }
  });
}

function claudeStdioSnippet() {
  return [
    'claude mcp add keylore_stdio -- node ' + config.stdioEntryPath + ' --transport stdio',
    'claude mcp list'
  ].join('\n');
}

function claudeHttpSnippet() {
  return [
    'export KEYLORE_MCP_ACCESS_TOKEN=' + mcpHttpTokenValue(),
    'claude mcp add --transport http --header "Authorization: Bearer $KEYLORE_MCP_ACCESS_TOKEN" keylore_http ' + config.baseUrl.replace(/\/$/, '') + '/mcp',
    'claude mcp list'
  ].join('\n');
}

function genericHttpSnippet() {
  return [
    'MCP endpoint: ' + config.baseUrl.replace(/\/$/, '') + '/mcp',
    'Authorization: Bearer ' + mcpHttpTokenValue()
  ].join('\n');
}

function humanizeErrorMessage(message) {
  if (message.includes('Missing secret material in local secret store for')) {
    return 'This token record exists, but its stored secret is missing. Open Edit token, paste the token again, and save changes.';
  }
  return message;
}

function pushToast(kind, message) {
  const node = byId('toast-console');
  if (!node) {
    return;
  }
  state.toastCounter += 1;
  const toast = document.createElement('div');
  toast.className = 'toast is-' + kind;
  toast.dataset.toastId = String(state.toastCounter);
  toast.innerHTML = [
    '<div class="toast-head">',
    '<span class="toast-title">' + escapeHtml(kind === 'error' ? 'Error' : kind === 'warning' ? 'Warning' : 'Info') + '</span>',
    '<button class="toast-close" type="button" data-toast-close="' + escapeHtml(String(state.toastCounter)) + '" aria-label="Close notification">×</button>',
    '</div>',
    '<p class="toast-copy">' + escapeHtml(message) + '</p>'
  ].join('');
  node.prepend(toast);
  while (node.childElementCount > 6) {
    node.lastElementChild?.remove();
  }
  if (kind !== 'error') {
    const dismissAfterMs = kind === 'warning' ? 7000 : 4000;
    window.setTimeout(function() {
      if (toast.isConnected) {
        toast.remove();
      }
    }, dismissAfterMs);
  }
}

function setNotice(kind, message) {
  pushToast(kind, humanizeErrorMessage(String(message ?? '')));
}

function clearNotice() {
  // Intentionally keep previous toasts visible until the user dismisses them.
}

function setBusy(value) {
  state.busy = value;
  document.body.dataset.busy = value ? 'true' : 'false';
  document.querySelectorAll('[data-busy-label]').forEach(function(button) {
    if (!(button instanceof HTMLButtonElement)) {
      return;
    }
    button.disabled = value;
    button.textContent = value ? button.dataset.busyLabel : button.dataset.idleLabel;
  });
}

function persistSession() {
  const payload = {
    baseUrl: state.baseUrl,
    resource: state.resource,
    token: state.token,
    sessionClientId: state.sessionClientId,
    sessionScopes: state.sessionScopes,
    sessionTenantId: state.sessionTenantId,
    connectTab: state.connectTab,
    advancedVisible: state.advancedVisible
  };
  localStorage.setItem(storageKey, JSON.stringify(payload));
}

function loadPersistedSession() {
  const raw = localStorage.getItem(storageKey);
  if (!raw) {
    return;
  }

  try {
    const parsed = JSON.parse(raw);
    state.baseUrl = parsed.baseUrl || state.baseUrl;
    state.resource = parsed.resource || state.resource;
    state.token = parsed.token || '';
    state.sessionClientId = parsed.sessionClientId || '';
    state.sessionScopes = parsed.sessionScopes || '';
    state.sessionTenantId = parsed.sessionTenantId || '';
    state.connectTab = parsed.connectTab || 'codex';
    state.advancedVisible = parsed.advancedVisible === true;
  } catch (_error) {
    localStorage.removeItem(storageKey);
  }
}

function clearSession() {
  state.token = '';
  state.sessionClientId = '';
  state.sessionScopes = '';
  state.sessionTenantId = '';
  state.data = {};
  state.lastBackup = null;
  state.lastClientSecret = null;
  state.lastResponse = null;
  state.lastCredentialTest = null;
  state.lastCredentialTestContext = null;
  state.lastCreatedCredentialId = '';
  state.selectedCredentialId = '';
  state.currentCredentialContext = null;
  state.lastMcpConnection = null;
  state.mcpToken = '';
  state.connectTab = 'codex';
  state.advancedVisible = false;
  state.credentialIdManuallyEdited = false;
  localStorage.removeItem(storageKey);
  syncSessionFields();
  renderAll();
}

function handleExpiredSession() {
  clearSession();
  if (state.localQuickstartEnabled) {
    setNotice('warning', 'Your saved session expired. Start working locally to open a fresh session, then try again.');
    return;
  }
  setNotice('warning', 'Your saved session expired. Open a new operator session, then try again.');
}

function syncSessionFields() {
  byId('base-url').value = state.baseUrl;
  byId('resource').value = state.resource;
  byId('session-client-id').textContent = state.sessionClientId || 'anonymous token';
  byId('session-scopes').textContent = state.sessionScopes || 'not loaded';
  byId('session-tenant').textContent = state.sessionTenantId || 'global operator';
  byId('session-status').textContent = state.token ? 'Session active' : 'Not connected';
  byId('session-status').className = state.token ? 'state-active' : 'state-warning';
  byId('login-panel').hidden = !!state.token;
  byId('dashboard').hidden = !state.token;
}

function renderAdvancedMode() {
  const advancedNav = byId('advanced-nav');
  const advancedShell = byId('advanced-shell');
  const toggle = byId('advanced-toggle');
  const summary = byId('advanced-summary');

  if (!advancedNav || !advancedShell || !toggle || !summary) {
    return;
  }

  advancedNav.hidden = !state.advancedVisible;
  advancedShell.hidden = !state.advancedVisible;
  toggle.textContent = state.advancedVisible ? 'Hide advanced controls' : 'Show advanced controls';
  summary.innerHTML = state.advancedVisible
    ? '<div class="panel-footnote">Advanced mode is open. Tenant management, OAuth clients, approvals, backups, audit, and system internals are available below.</div>'
    : '<div class="panel-footnote">Advanced mode is optional. You can ignore tenants, approvals, backups, audit, and system internals until you move beyond the local core workflow.</div>';
}

function populateLoginDefaults(force) {
  if (!state.localAdminBootstrap) {
    return;
  }

  if (force || !byId('client-id').value.trim()) {
    byId('client-id').value = state.localAdminBootstrap.clientId;
  }
  if (force || !byId('client-secret').value) {
    byId('client-secret').value = state.localAdminBootstrap.clientSecret;
  }
  if (force || !byId('scope-input').value.trim()) {
    byId('scope-input').value = state.localAdminBootstrap.scopes.join(' ');
  }
}

async function requestTokenFromCredentials() {
  const clientId = byId('client-id').value.trim();
  const clientSecret = byId('client-secret').value;
  const scopes = byId('scope-input').value.trim();
  const resource = byId('resource').value.trim();

  const response = await fetch(state.baseUrl.replace(/\/$/, '') + '/oauth/token', {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
      scope: scopes,
      resource: resource
    })
  });

  const payload = await response.json().catch(function() {
    return { error: 'Unable to parse token response.' };
  });

  if (!response.ok) {
    throw new Error(payload.error || 'Failed to mint access token.');
  }

  state.token = payload.access_token;
  state.sessionClientId = clientId;
  state.sessionScopes = payload.scope || scopes;
  state.resource = resource;
  state.lastResponse = payload;
}

async function fetchJson(path, options) {
  const request = Object.assign({}, options || {});
  const headers = new Headers(request.headers || {});
  if (state.token) {
    headers.set('authorization', 'Bearer ' + state.token);
  }
  request.headers = headers;

  const response = await fetch(state.baseUrl.replace(/\/$/, '') + path, request);
  const payload = await response.json().catch(function() {
    return { error: 'Unable to parse server response.' };
  });
  if (!response.ok) {
    if (response.status === 401 && state.token) {
      handleExpiredSession();
      throw new Error('Session expired. Open a fresh session and try again.');
    }
    throw new Error(payload.error || ('Request failed with status ' + response.status));
  }
  return payload;
}

async function safeFetch(path, options) {
  try {
    return {
      ok: true,
      data: await fetchJson(path, options)
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

function renderResultState(result, renderOk) {
  if (!result) {
    return '<div class="empty-state">No data requested yet.</div>';
  }
  if (!result.ok) {
    return '<div class="error-state">' + escapeHtml(result.error) + '</div>';
  }
  return renderOk(result.data);
}

function renderOverview() {
  const ready = state.data.readyz && state.data.readyz.ok ? state.data.readyz.data : null;
  const credentialCount = state.data.credentials && state.data.credentials.ok
    ? state.data.credentials.data.credentials.length
    : ready ? ready.credentials : 'n/a';
  const tenantCount = state.data.tenants && state.data.tenants.ok ? state.data.tenants.data.tenants.length : 0;
  const clientCount = state.data.authClients && state.data.authClients.ok ? state.data.authClients.data.clients.length : 0;
  const pendingApprovals = state.data.approvals && state.data.approvals.ok
    ? state.data.approvals.data.approvals.filter(function(item) { return item.status === 'pending'; }).length
    : 0;
  const activeBreakGlass = state.data.breakGlass && state.data.breakGlass.ok
    ? state.data.breakGlass.data.requests.filter(function(item) { return item.status === 'active'; }).length
    : 0;

  byId('overview-metrics').innerHTML = [
    '<article class="metric-card"><span>Credentials</span><strong>' + escapeHtml(String(credentialCount)) + '</strong></article>',
    '<article class="metric-card"><span>Tenants</span><strong>' + escapeHtml(String(tenantCount)) + '</strong></article>',
    '<article class="metric-card"><span>OAuth Clients</span><strong>' + escapeHtml(String(clientCount)) + '</strong></article>',
    '<article class="metric-card"><span>Pending Reviews</span><strong>' + escapeHtml(String(pendingApprovals + activeBreakGlass)) + '</strong></article>'
  ].join('');

  byId('overview-ready').innerHTML = renderResultState(state.data.readyz, function(payload) {
    return '<pre>' + escapeHtml(prettyJson(payload)) + '</pre>';
  });
  byId('overview-last-response').innerHTML = state.lastResponse
    ? '<pre>' + escapeHtml(prettyJson(state.lastResponse)) + '</pre>'
    : '<div class="empty-state">Fresh token issues and admin actions are echoed here for quick operator inspection.</div>';
}

function renderCoreJourney() {
  const node = byId('core-journey');
  if (!node) {
    return;
  }

  const credentials = visibleCredentials();
  const hasCredential = credentials.length > 0;
  const hasTest = !!state.lastCredentialTest;
  const hasConnection = !!state.lastMcpConnection;
  const nextAction = !state.token
    ? 'Open a local admin session first.'
    : !hasCredential
      ? 'Create your first credential from a template.'
      : !hasTest
        ? 'Run Test Credential to verify the broker path.'
        : !hasConnection
          ? 'Open Connect your AI tool, copy the setup for Codex, Gemini, or Claude, and try the first prompt.'
          : 'Restart your MCP client and try the suggested first prompt.';

  const steps = !state.token
    ? [
        '<article class="step-card"><span class="state-warning">Step 1</span><h3>Open a session</h3><p>Use local quickstart or manual sign-in so KeyLore can save and test tokens for you.</p><div class="panel-actions"><button class="button-secondary" type="button" data-nav-target="login-panel">Go there</button></div></article>',
        '<article class="step-card"><span class="' + (hasCredential ? 'state-active' : 'state-warning') + '">Step 2</span><h3>Add a token</h3><p>Pick a template, paste the token, and explain when the AI should use it.</p><div class="panel-actions"><button class="button-secondary" type="button" data-nav-target="credentials-section">Open tokens</button></div></article>',
        '<article class="step-card"><span class="' + (hasTest ? 'state-active' : 'state-warning') + '">Step 3</span><h3>Test it safely</h3><p>Run a brokered check to confirm the token works without exposing the secret.</p><div class="panel-actions"><button class="button-secondary" type="button" data-nav-target="credentials-section">Open test</button></div></article>',
        '<article class="step-card"><span class="' + (hasConnection ? 'state-active' : 'state-warning') + '">Step 4</span><h3>Connect your AI tool</h3><p>Choose Codex, Gemini, or Claude, follow the setup steps, then try the suggested prompt.</p><div class="panel-actions"><button class="button-secondary" type="button" data-nav-target="connect-section">Open connect</button></div></article>',
      ]
    : [
        '<article class="step-card"><span class="' + (hasCredential ? 'state-active' : 'state-warning') + '">Step 1</span><h3>Add a token</h3><p>Pick a template, paste the token, and explain when the AI should use it.</p><div class="panel-actions"><button class="button-secondary" type="button" id="journey-open-token-modal">Add token</button></div></article>',
        '<article class="step-card"><span class="' + (hasTest ? 'state-active' : 'state-warning') + '">Step 2</span><h3>Test it safely</h3><p>Run a brokered check to confirm the token works without exposing the secret.</p><div class="panel-actions"><button class="button-secondary" type="button" data-nav-target="credentials-section">Open test</button></div></article>',
        '<article class="step-card"><span class="' + (hasConnection ? 'state-active' : 'state-warning') + '">Step 3</span><h3>Connect your AI tool</h3><p>Choose Codex, Gemini, or Claude, follow the setup steps, then try the suggested prompt.</p><div class="panel-actions"><button class="button-secondary" type="button" data-nav-target="connect-section">Open connect</button></div></article>',
      ];

  node.innerHTML = [
    '<div class="section-heading"><div><h2 style="font-size:1.4rem;">Step by step</h2><p>Follow the short path. Everything else can wait until later.</p></div></div>',
    '<div class="step-grid">',
    steps.join(''),
    '</div>',
    '<p class="panel-footnote" style="margin-top:12px;"><strong>Next:</strong> ' + escapeHtml(nextAction) + '</p>'
  ].join('');

  const journeyOpenTokenModal = byId('journey-open-token-modal');
  if (journeyOpenTokenModal) {
    journeyOpenTokenModal.addEventListener('click', openCreateCredentialModal);
  }
}

function renderCredentials() {
  byId('credential-list').innerHTML = renderResultState(state.data.credentials, function(payload) {
    if (!payload.credentials.length) {
      return '<div class="empty-state">No tokens are saved yet. Use Add token to create the first one.</div>';
    }

    function renderCredentialCard(credential) {
      const nextStatus = credential.status === 'active' ? 'disabled' : 'active';
      const statusActionLabel = credential.status === 'active' ? 'Archive' : 'Restore';
      const isNew = credential.id === state.lastCreatedCredentialId;
      const isSelected = credential.id === state.selectedCredentialId;
      const ownershipLabel = credential.owner === 'local' ? 'saved token' : 'example';
      return [
        '<article class="token-row">',
        '<div class="toolbar"><div><h3>' + escapeHtml(credential.displayName) + '</h3><p class="mono"><strong>Token key:</strong> ' + escapeHtml(credential.id) + '</p></div><div class="panel-actions">' + (isNew ? '<span class="state-active">Just added</span>' : '') + (isSelected ? '<span class="state-ok">Selected</span>' : '') + '<span class="' + (credential.status === 'active' ? 'state-active' : 'state-disabled') + '">' + escapeHtml(credential.status) + '</span></div></div>',
        '<div class="list-meta">',
        '<span class="pill"><strong>Kind</strong> ' + escapeHtml(ownershipLabel) + '</span>',
        '<span class="pill"><strong>Service</strong> ' + escapeHtml(credential.service) + '</span>',
        '<span class="pill"><strong>Scope</strong> ' + escapeHtml(credential.scopeTier) + '</span>',
        '<span class="pill"><strong>Sensitivity</strong> ' + escapeHtml(credential.sensitivity) + '</span>',
        '</div>',
        '<p class="panel-footnote"><strong>LLM context:</strong> ' + escapeHtml(credential.llmContext || credential.selectionNotes) + '</p>',
        '<p class="panel-footnote"><strong>User context:</strong> ' + escapeHtml(credential.userContext || credential.llmContext || credential.selectionNotes) + '</p>',
        '<p class="muted-copy mono">Domains: ' + escapeHtml(credential.allowedDomains.join(', ')) + '</p>',
        '<div class="panel-actions"><button class="button-secondary" type="button" data-credential-context-action="open" data-credential-context-id="' + escapeHtml(credential.id) + '">Edit token</button><button class="button-secondary" type="button" data-credential-context-action="test" data-credential-context-id="' + escapeHtml(credential.id) + '">Use in test</button><button class="button-secondary" type="button" data-credential-context-action="status" data-credential-context-id="' + escapeHtml(credential.id) + '" data-credential-context-status="' + escapeHtml(nextStatus) + '">' + statusActionLabel + '</button><button class="button-danger" type="button" data-credential-context-action="delete" data-credential-context-id="' + escapeHtml(credential.id) + '" data-credential-context-name="' + escapeHtml(credential.displayName) + '">Delete</button></div>',
        '</article>'
      ].join('');
    }

    const credentials = payload.credentials.slice().sort(function(left, right) {
      if (left.id === state.lastCreatedCredentialId) {
        return -1;
      }
      if (right.id === state.lastCreatedCredentialId) {
        return 1;
      }
      if (left.id === state.selectedCredentialId) {
        return -1;
      }
      if (right.id === state.selectedCredentialId) {
        return 1;
      }
      if (left.owner !== right.owner) {
        return left.owner === 'local' ? -1 : 1;
      }
      return left.displayName.localeCompare(right.displayName);
    });
    return '<div class="token-list">' + credentials.map(renderCredentialCard).join('') + '</div>';
  });

  if (!state.data.credentials) {
    byId('credential-test-id').innerHTML = '<option value="">Load credentials first</option>';
  } else if (!state.data.credentials.ok) {
    byId('credential-test-id').innerHTML = '<option value="">Credentials unavailable</option>';
  } else {
    byId('credential-test-id').innerHTML = state.data.credentials.data.credentials.map(function(credential) {
      const label = credential.owner === 'local' ? 'saved' : 'example';
      return '<option value="' + escapeHtml(credential.id) + '">' + escapeHtml(credential.displayName + ' (' + credential.id + ', ' + label + ')') + '</option>';
    }).join('');
  }

  if (state.lastCredentialTest) {
    const lastCredential = visibleCredentials().find(function(credential) {
      return credential.id === state.lastCredentialTestContext?.credentialId;
    });
    const summary = [
      '<div class="list-card">',
      '<h3 style="margin:0 0 8px;">What this check did</h3>',
      '<p>KeyLore tried a real <span class="mono">http.get</span> using <strong>' + escapeHtml(lastCredential ? lastCredential.displayName : (state.lastCredentialTestContext?.credentialId || 'the selected token')) + '</strong> against <span class="mono">' + escapeHtml(state.lastCredentialTestContext?.targetUrl || 'the selected URL') + '</span>.</p>',
      '<div class="list-meta">',
      '<span class="' + (state.lastCredentialTest.decision === 'allowed' ? 'state-active' : state.lastCredentialTest.decision === 'approval_required' ? 'state-warning' : 'state-disabled') + '">' + escapeHtml(state.lastCredentialTest.decision.replace('_', ' ')) + '</span>',
      '<span class="pill"><strong>Reason</strong> ' + escapeHtml(state.lastCredentialTest.reason || 'n/a') + '</span>',
      state.lastCredentialTest.httpResult ? '<span class="pill"><strong>HTTP status</strong> ' + escapeHtml(String(state.lastCredentialTest.httpResult.status)) + '</span>' : '',
      '</div>',
      state.lastCredentialTest.httpResult ? '<pre style="margin-top:12px;">' + escapeHtml(state.lastCredentialTest.httpResult.bodyPreview) + '</pre>' : '',
      '<div class="panel-footnote">Success means the token, the target domain, and KeyLore policy all allowed the request. Failure means one of those checks blocked it.</div>',
      '</div>'
    ].join('');
    byId('credential-test-result').innerHTML = summary;
  } else {
    byId('credential-test-result').innerHTML = '<div class="empty-state">This check makes a real brokered <span class="mono">http.get</span> call with the selected token and URL. Use it to confirm the token, target domain, and policy all work together.</div>';
  }

  renderCredentialContextManager();
}

function renderCredentialTestError(message) {
  const friendly = humanizeErrorMessage(message);
  byId('credential-test-result').innerHTML = [
    '<div class="list-card" style="border-color: rgba(143, 45, 35, 0.2); background: rgba(143, 45, 35, 0.06);">',
    '<h3 style="margin:0 0 8px;">Token check failed</h3>',
    '<p><strong>Token:</strong> ' + escapeHtml(state.lastCredentialTestContext?.credentialId || 'the selected token') + '</p>',
    '<p><strong>URL:</strong> <span class="mono">' + escapeHtml(state.lastCredentialTestContext?.targetUrl || 'the selected URL') + '</span></p>',
    '<p>' + escapeHtml(friendly) + '</p>',
    '<div class="panel-footnote">Use <strong>Edit token</strong> to paste a replacement token and save changes.</div>',
    '</div>'
  ].join('');
}

function visibleCredentials() {
  return state.data.credentials && state.data.credentials.ok
    ? state.data.credentials.data.credentials
    : [];
}

function selectedCredentialSummary() {
  const credentials = visibleCredentials();
  return credentials.find(function(credential) {
    return credential.id === state.selectedCredentialId;
  });
}

function credentialContextAssessment(payload) {
  const errors = [];
  const warnings = [];
  const llmContext = String(payload.llmContext || payload.selectionNotes || '');
  const userContext = String(payload.userContext || '');
  const normalizedLlmContext = llmContext.trim().toLowerCase();
  if (!llmContext.trim()) {
    errors.push('LLM context is required. Explain when the agent should use this credential.');
  } else if (llmContext.trim().length < 16) {
    errors.push('LLM context is too short. Add enough detail for the agent to distinguish this credential from others.');
  } else if (llmContext.trim().length < 40) {
    warnings.push('LLM context is short. Add when-to-use guidance so the agent can choose this credential reliably.');
  }

  if (!userContext.trim()) {
    errors.push('User context is required. Explain the human purpose of this credential.');
  } else if (userContext.trim().length < 24) {
    warnings.push('User context is short. Add ownership, intent, or caveats so humans can understand why this credential exists.');
  }

  if (!payload.allowedDomains || !payload.allowedDomains.length) {
    warnings.push('Allowed domains are empty. The agent-visible metadata should make the intended target explicit.');
  }

  if (!payload.permittedOperations || !payload.permittedOperations.length) {
    warnings.push('Permitted operations are empty. The preview should make the intended read or write capability explicit.');
  }

  if (/^(use when needed|general use|general purpose|for api|api token|token for api|default token|main token)$/i.test(normalizedLlmContext)) {
    errors.push('LLM context is too vague. Say what the credential is for, when the agent should choose it, and what it should avoid.');
  }

  if (/(gh[pousr]_[A-Za-z0-9_]+|github_pat_|sk-[A-Za-z0-9_-]+|AKIA[0-9A-Z]{16})/.test(llmContext + '\n' + userContext)) {
    errors.push('Context text looks like it may contain a secret. Keep raw tokens out of the human and agent-visible context.');
  }

  return { errors: errors, warnings: warnings };
}

function credentialGuidanceForTemplate() {
  const template = byId('credential-template').value;
  if (template === 'github-readonly') {
    return {
      good: 'LLM: Use for GitHub repository metadata, issues, pull requests, and rate-limit reads. Never use it for write operations.',
      user: 'User: Primary read-only GitHub token for routine repository lookups.',
      avoid: 'GitHub token'
    };
  }
  if (template === 'github-write') {
    return {
      good: 'LLM: Use for GitHub workflows that need authenticated reads plus controlled writes such as issue comments, labels, or pull request updates. Prefer the read-only GitHub credential when writes are not needed.',
      user: 'User: Higher-risk GitHub token for controlled write workflows.',
      avoid: 'Main GitHub token'
    };
  }
  if (template === 'npm-readonly') {
    return {
      good: 'LLM: Use for npm package metadata, dependency lookup, and registry read operations. Do not use it for publish workflows.',
      user: 'User: Read-only npm registry token for package inspection.',
      avoid: 'npm token'
    };
  }
  if (template === 'internal-service') {
    return {
      good: 'LLM: Use only for the listed internal service domain when the task explicitly targets that API. Avoid unrelated external services.',
      user: 'User: Internal service credential scoped to one API or workflow.',
      avoid: 'Internal token'
    };
  }
  return {
    good: 'LLM: Describe the target service, the intended domain, when the agent should choose this credential, and what kinds of actions it should avoid.',
    user: 'User: Describe why this token exists, who it is for, and any caveats for humans.',
    avoid: 'Use when needed'
  };
}

function renderCredentialGuidance() {
  const node = byId('credential-guidance');
  if (!node) {
    return;
  }
  const guidance = credentialGuidanceForTemplate();
  node.innerHTML = [
    '<div class="panel-footnote"><strong>Good LLM context:</strong> ' + escapeHtml(guidance.good) + '</div>',
    '<div class="panel-footnote"><strong>Good user context:</strong> ' + escapeHtml(guidance.user) + '</div>',
    '<div class="panel-footnote"><strong>Avoid:</strong> ' + escapeHtml(guidance.avoid) + '</div>',
    '<div class="panel-footnote">LLM context should answer: when should the agent choose this credential, and what should it avoid doing? User context should explain the human purpose and ownership.</div>'
  ].join('');
}

function renderCredentialPreview() {
  const previewNode = byId('credential-mcp-preview');
  const warningNode = byId('credential-preview-warnings');
  if (!previewNode || !warningNode) {
    return;
  }

  const payload = serializeCredentialForm();
  const preview = {
    result: {
      id: payload.credentialId || 'credential-id-preview',
      tenantId: payload.tenantId || 'default',
      displayName: payload.displayName || 'Credential Preview',
      service: payload.service || 'service',
      owner: payload.owner,
      scopeTier: payload.scopeTier,
      sensitivity: payload.sensitivity,
      allowedDomains: payload.allowedDomains,
      permittedOperations: payload.permittedOperations,
      expiresAt: payload.expiresAt || null,
      rotationPolicy: payload.rotationPolicy || 'Managed locally',
      lastValidatedAt: null,
      userContext: payload.userContext || '',
      llmContext: payload.llmContext || payload.selectionNotes || '',
      selectionNotes: payload.llmContext || payload.selectionNotes || '',
      tags: payload.tags,
      status: payload.status,
    },
  };

  previewNode.innerHTML = '<pre>' + escapeHtml(prettyJson(preview)) + '</pre>';
  const assessment = credentialContextAssessment(payload);
  const messages = [];
  assessment.errors.forEach(function(message) {
    messages.push('<div class="error-state">' + escapeHtml(message) + '</div>');
  });
  assessment.warnings.forEach(function(message) {
    messages.push('<div class="panel-footnote">' + escapeHtml(message) + '</div>');
  });
  if (!messages.length) {
    messages.push('<div class="panel-footnote">This is the MCP-visible metadata shape. Secret storage details, binding refs, and raw token values do not appear here. KeyLore also mirrors <span class="mono">llmContext</span> into <span class="mono">selectionNotes</span> for older clients.</div>');
  }
  warningNode.innerHTML = messages.join('');
  renderCredentialGuidance();
}

function renderContextPreview(previewNodeId, warningNodeId, payload, currentId) {
  const previewNode = byId(previewNodeId);
  const warningNode = byId(warningNodeId);
  if (!previewNode || !warningNode) {
    return;
  }

  const preview = {
    credential: {
      id: currentId || state.selectedCredentialId || 'credential-id-preview',
      tenantId: 'default',
      displayName: payload.displayName || 'Credential Context',
      service: payload.service || 'service',
      owner: 'local',
      scopeTier: payload.scopeTier,
      sensitivity: payload.sensitivity,
      allowedDomains: payload.allowedDomains,
      permittedOperations: payload.permittedOperations,
      expiresAt: null,
      rotationPolicy: 'Managed separately',
      lastValidatedAt: null,
      userContext: payload.userContext || '',
      llmContext: payload.llmContext || payload.selectionNotes || '',
      selectionNotes: payload.llmContext || payload.selectionNotes || '',
      tags: payload.tags,
      status: payload.status || 'active',
    },
  };

  previewNode.innerHTML = '<pre>' + escapeHtml(prettyJson(preview)) + '</pre>';
  const assessment = credentialContextAssessment(payload);
  const messages = [];
  assessment.errors.forEach(function(message) {
    messages.push('<div class="error-state">' + escapeHtml(message) + '</div>');
  });
  assessment.warnings.forEach(function(message) {
    messages.push('<div class="panel-footnote">' + escapeHtml(message) + '</div>');
  });
  if (!messages.length) {
    messages.push('<div class="panel-footnote">This preview is metadata only. Secret bindings and raw tokens stay separate and are not editable here. Older clients still receive <span class="mono">selectionNotes</span> as a compatibility alias of <span class="mono">llmContext</span>.</div>');
  }
  warningNode.innerHTML = messages.join('');
}

function populateCredentialContextForm(credential) {
  byId('credential-context-id').value = credential.id;
  byId('credential-context-display-name').value = credential.displayName;
  byId('credential-context-service').value = credential.service;
  byId('credential-context-sensitivity').value = credential.sensitivity;
  byId('credential-context-status').value = credential.status;
  byId('credential-context-operations').value = credential.permittedOperations.includes('http.post')
    ? 'http.get,http.post'
    : 'http.get';
  byId('credential-context-domains').value = credential.allowedDomains.join(', ');
  byId('credential-context-user-context').value = credential.userContext || credential.llmContext || credential.selectionNotes;
  byId('credential-context-llm-context').value = credential.llmContext || credential.selectionNotes;
  byId('credential-context-tags').value = credential.tags.join(', ');
}

function serializeCredentialContextForm() {
  const operations = splitList(byId('credential-context-operations').value);
  return {
    displayName: byId('credential-context-display-name').value.trim(),
    service: byId('credential-context-service').value.trim(),
    scopeTier: operations.includes('http.post') ? 'read_write' : 'read_only',
    sensitivity: byId('credential-context-sensitivity').value,
    status: byId('credential-context-status').value,
    allowedDomains: splitList(byId('credential-context-domains').value),
    permittedOperations: operations.length ? operations : ['http.get'],
    userContext: byId('credential-context-user-context').value.trim(),
    llmContext: byId('credential-context-llm-context').value.trim(),
    selectionNotes: byId('credential-context-llm-context').value.trim(),
    tags: splitList(byId('credential-context-tags').value),
  };
}

function renderCredentialContextManager() {
  const currentNode = byId('credential-context-current');
  const formNode = byId('credential-context-form');
  if (!currentNode || !formNode) {
    return;
  }

  const selected = state.currentCredentialContext || selectedCredentialSummary();
  if (!selected) {
    currentNode.innerHTML = '<div class="empty-state">Select a credential from the list to inspect or edit its MCP-visible context. Secret storage stays out of this flow.</div>';
    formNode.hidden = true;
    return;
  }

  state.selectedCredentialId = selected.id;
  state.currentCredentialContext = selected;
  currentNode.innerHTML = '<pre>' + escapeHtml(prettyJson({ credential: selected })) + '</pre>';
  formNode.hidden = false;
  populateCredentialContextForm(selected);
  renderContextPreview(
    'credential-context-preview',
    'credential-context-preview-warnings',
    serializeCredentialContextForm(),
    selected.id,
  );
}

function resetCredentialFormForCreate() {
  state.credentialModalMode = 'create';
  state.credentialIdManuallyEdited = false;
  byId('credential-modal-title').textContent = 'Add token';
  byId('credential-modal-copy').textContent = 'Paste the token, add the human and AI context, and save it into KeyLore.';
  byId('credential-submit').dataset.idleLabel = 'Save token';
  byId('credential-submit').textContent = 'Save token';
  byId('credential-template').disabled = false;
  byId('credential-form').reset();
  byId('credential-template').value = 'github-readonly';
  byId('credential-storage').value = 'local';
  byId('credential-id').readOnly = false;
  byId('credential-secret-field').hidden = false;
  byId('credential-secret-label').textContent = 'Paste token';
  byId('credential-secret').value = '';
  byId('credential-secret').placeholder = 'Paste the raw token here. KeyLore stores it outside the searchable metadata catalogue.';
  byId('credential-secret').disabled = false;
  byId('credential-storage').disabled = false;
  applyCredentialTemplate();
  syncCredentialSourceFields();
  renderCredentialPreview();
}

function openCreateCredentialModal() {
  resetCredentialFormForCreate();
  showDialog('credential-modal');
}

function openEditCredentialModal(credential) {
  state.credentialModalMode = 'edit';
  state.selectedCredentialId = credential.id;
  state.currentCredentialContext = credential;
  byId('credential-modal-title').textContent = 'Edit token';
  byId('credential-modal-copy').textContent = 'Update the token metadata and context. Stored secret material stays separate and is not shown here.';
  byId('credential-submit').dataset.idleLabel = 'Save changes';
  byId('credential-submit').textContent = 'Save changes';
  byId('credential-template').disabled = true;
  byId('credential-name').value = credential.displayName;
  byId('credential-id').value = credential.id;
  byId('credential-id').readOnly = true;
  byId('credential-service').value = credential.service;
  byId('credential-sensitivity').value = credential.sensitivity;
  byId('credential-operations').value = credential.permittedOperations.includes('http.post')
    ? 'http.get,http.post'
    : 'http.get';
  byId('credential-domains').value = credential.allowedDomains.join(', ');
  byId('credential-user-context').value = credential.userContext || credential.llmContext || credential.selectionNotes;
  byId('credential-llm-context').value = credential.llmContext || credential.selectionNotes;
  byId('credential-tags').value = credential.tags.join(', ');
  const localOwner = credential.owner === 'local';
  byId('credential-storage').value = credential.binding?.adapter === 'env' ? 'env' : 'local';
  byId('credential-storage').disabled = true;
  byId('credential-secret-field').hidden = !localOwner;
  byId('credential-secret-label').textContent = 'Replace stored token (optional)';
  byId('credential-secret').value = '';
  byId('credential-secret').placeholder = localOwner
    ? 'Paste a replacement token only if you want to update the stored secret.'
    : 'Secret replacement is only available for locally stored tokens.';
  byId('credential-secret').disabled = !localOwner;
  byId('credential-env-ref-field').hidden = true;
  renderCredentialPreview();
  showDialog('credential-modal');
}

async function openCredentialContext(credentialId) {
  const result = await fetchJson('/v1/core/credentials/' + encodeURIComponent(credentialId) + '/context');
  state.selectedCredentialId = credentialId;
  state.currentCredentialContext = result.credential;
  renderCredentialContextManager();
}

function renderConnect() {
  byId('codex-stdio-snippet').value = codexStdioSnippet();
  byId('codex-http-snippet').value = codexHttpSnippet();
  byId('gemini-stdio-snippet').value = geminiStdioSnippet();
  byId('gemini-http-snippet').value = geminiHttpSnippet();
  byId('claude-stdio-snippet').value = claudeStdioSnippet();
  byId('claude-http-snippet').value = claudeHttpSnippet();
  byId('generic-http-snippet').value = genericHttpSnippet();
  byId('mcp-token-export').value = "export KEYLORE_MCP_ACCESS_TOKEN='" + mcpHttpTokenValue() + "'";
  byId('connect-client-id').value = state.localAdminBootstrap ? state.localAdminBootstrap.clientId : (state.sessionClientId || '');
  if (state.localAdminBootstrap && !byId('connect-client-secret').value) {
    byId('connect-client-secret').value = state.localAdminBootstrap.clientSecret;
  }
  byId('shared-first-prompt').value = firstPrompt();
  byId('connect-result').innerHTML = state.lastMcpConnection
    ? '<pre>' + escapeHtml(prettyJson(state.lastMcpConnection)) + '</pre>'
    : '<div class="empty-state">For local use, choose a tool tab, copy the setup snippet or apply it directly, then restart your MCP client. For remote HTTP MCP, run the connection check here first.</div>';
  renderConnectTabs();
}

function renderConnectTabs() {
  document.querySelectorAll('[data-connect-tab]').forEach(function(button) {
    const isActive = button.getAttribute('data-connect-tab') === state.connectTab;
    button.classList.toggle('is-active', isActive);
    button.setAttribute('aria-selected', isActive ? 'true' : 'false');
  });

  document.querySelectorAll('[data-connect-panel]').forEach(function(panel) {
    const isActive = panel.getAttribute('data-connect-panel') === state.connectTab;
    panel.hidden = !isActive;
  });
}

async function copySnippet(targetId, label) {
  const node = byId(targetId);
  if (!(node instanceof HTMLTextAreaElement || node instanceof HTMLInputElement)) {
    setNotice('error', 'Nothing to copy for ' + label + '.');
    return;
  }
  await navigator.clipboard.writeText(node.value);
  setNotice('info', label + ' copied to clipboard.');
}

async function handleCopyAction(event) {
  const button = event.target instanceof Element ? event.target.closest('[data-copy-target]') : null;
  if (!button) {
    return;
  }
  const targetId = button.getAttribute('data-copy-target');
  const label = button.getAttribute('data-copy-label') || 'Snippet';
  if (!targetId) {
    return;
  }
  try {
    await copySnippet(targetId, label);
  } catch (error) {
    setNotice('error', error instanceof Error ? error.message : String(error));
  }
}

async function handleApplyToolSetup(event) {
  const button = event.target instanceof Element ? event.target.closest('[data-apply-tool]') : null;
  if (!button) {
    return;
  }
  const tool = button.getAttribute('data-apply-tool');
  if (!tool) {
    return;
  }
  const result = await withAction('Applied local ' + tool + ' setup.', async function() {
    return fetchJson('/v1/core/tooling/apply', {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify({ tool: tool })
    });
  });
  setNotice('info', tool.charAt(0).toUpperCase() + tool.slice(1) + ' updated at ' + result.path + '. Restart the tool and try the prompt below.');
}

function handleConnectTabClick(event) {
  const button = event.target instanceof Element ? event.target.closest('[data-connect-tab]') : null;
  if (!button) {
    return;
  }
  state.connectTab = button.getAttribute('data-connect-tab') || 'codex';
  persistSession();
  renderConnectTabs();
}

function renderTenants() {
  byId('tenant-list').innerHTML = renderResultState(state.data.tenants, function(payload) {
    if (!payload.tenants.length) {
      return '<div class="empty-state">No tenants are visible to this session.</div>';
    }

    return [
      '<div class="table-wrap"><table><thead><tr><th>Tenant</th><th>Status</th><th>Counts</th><th>Actions</th></tr></thead><tbody>',
      payload.tenants.map(function(tenant) {
        const nextStatus = tenant.status === 'active' ? 'disabled' : 'active';
        return [
          '<tr>',
          '<td><strong>' + escapeHtml(tenant.displayName) + '</strong><div class="muted-copy mono">' + escapeHtml(tenant.tenantId) + '</div></td>',
          '<td><span class="' + (tenant.status === 'active' ? 'state-active' : 'state-disabled') + '">' + escapeHtml(tenant.status) + '</span></td>',
          '<td class="mono">credentials ' + escapeHtml(String(tenant.credentialCount)) + ' · clients ' + escapeHtml(String(tenant.authClientCount)) + ' · tokens ' + escapeHtml(String(tenant.activeTokenCount)) + '</td>',
          '<td><div class="panel-actions"><button class="button-secondary" data-tenant-action="toggle" data-tenant-id="' + escapeHtml(tenant.tenantId) + '" data-next-status="' + escapeHtml(nextStatus) + '">' + (nextStatus === 'active' ? 'Enable' : 'Disable') + '</button></div></td>',
          '</tr>'
        ].join('');
      }).join(''),
      '</tbody></table></div>'
    ].join('');
  });
}

function renderAuthClients() {
  byId('auth-client-list').innerHTML = renderResultState(state.data.authClients, function(payload) {
    if (!payload.clients.length) {
      return '<div class="empty-state">No auth clients are visible to this session.</div>';
    }

    return payload.clients.map(function(client) {
      const toggleAction = client.status === 'active' ? 'disable' : 'enable';
      const toggleLabel = client.status === 'active' ? 'Disable' : 'Enable';
      return [
        '<article class="list-card">',
        '<div class="toolbar"><div><h3>' + escapeHtml(client.displayName) + '</h3><p class="mono">' + escapeHtml(client.clientId) + '</p></div><span class="' + (client.status === 'active' ? 'state-active' : 'state-disabled') + '">' + escapeHtml(client.status) + '</span></div>',
        '<div class="list-meta">',
        '<span class="pill"><strong>Tenant</strong> ' + escapeHtml(client.tenantId) + '</span>',
        '<span class="pill"><strong>Auth</strong> ' + escapeHtml(client.tokenEndpointAuthMethod) + '</span>',
        '<span class="pill"><strong>Grants</strong> ' + escapeHtml(client.grantTypes.join(', ')) + '</span>',
        '</div>',
        '<p class="panel-footnote">Roles: ' + escapeHtml(client.roles.join(', ')) + '<br>Scopes: ' + escapeHtml(client.allowedScopes.join(', ')) + '</p>',
        '<div class="panel-actions">',
        '<button class="button-secondary" data-client-action="' + escapeHtml(toggleAction) + '" data-client-id="' + escapeHtml(client.clientId) + '">' + toggleLabel + '</button>',
        '<button class="button-secondary" data-client-action="rotate" data-client-id="' + escapeHtml(client.clientId) + '">Rotate secret</button>',
        '</div>',
        '</article>'
      ].join('');
    }).join('');
  });

  byId('issued-secret').innerHTML = state.lastClientSecret
    ? '<pre>' + escapeHtml(prettyJson(state.lastClientSecret)) + '</pre>'
    : '<div class="empty-state">Generated or rotated client secrets are displayed here exactly once.</div>';
}

function renderApprovals() {
  byId('approval-list').innerHTML = renderResultState(state.data.approvals, function(payload) {
    if (!payload.approvals.length) {
      return '<div class="empty-state">No approval requests are currently visible.</div>';
    }

    return payload.approvals.map(function(approval) {
      const actions = approval.status === 'pending'
        ? '<div class="panel-actions"><button class="button" data-approval-action="approve" data-approval-id="' + escapeHtml(approval.id) + '">Approve</button><button class="button-danger" data-approval-action="deny" data-approval-id="' + escapeHtml(approval.id) + '">Deny</button></div>'
        : '';
      return [
        '<article class="list-card">',
        '<div class="toolbar"><div><h3>' + escapeHtml(approval.credentialId) + '</h3><p class="mono">' + escapeHtml(approval.id) + '</p></div><span class="' + (approval.status === 'approved' ? 'state-active' : approval.status === 'pending' ? 'state-pending' : 'state-disabled') + '">' + escapeHtml(approval.status) + '</span></div>',
        '<p>' + escapeHtml(approval.operation + ' → ' + approval.targetUrl) + '</p>',
        '<div class="list-meta"><span class="pill"><strong>Requested by</strong> ' + escapeHtml(approval.requestedBy) + '</span><span class="pill"><strong>Quorum</strong> ' + escapeHtml(String(approval.approvalCount)) + ' / ' + escapeHtml(String(approval.requiredApprovals)) + '</span><span class="pill"><strong>Expires</strong> ' + escapeHtml(formatDate(approval.expiresAt)) + '</span></div>',
        actions,
        '</article>'
      ].join('');
    }).join('');
  });
}

function renderBreakGlass() {
  byId('breakglass-list').innerHTML = renderResultState(state.data.breakGlass, function(payload) {
    if (!payload.requests.length) {
      return '<div class="empty-state">No break-glass requests are currently visible.</div>';
    }

    return payload.requests.map(function(request) {
      const actions = request.status === 'pending'
        ? '<div class="panel-actions"><button class="button" data-breakglass-action="approve" data-breakglass-id="' + escapeHtml(request.id) + '">Approve</button><button class="button-danger" data-breakglass-action="deny" data-breakglass-id="' + escapeHtml(request.id) + '">Deny</button></div>'
        : request.status === 'active'
          ? '<div class="panel-actions"><button class="button-danger" data-breakglass-action="revoke" data-breakglass-id="' + escapeHtml(request.id) + '">Revoke</button></div>'
          : '';
      return [
        '<article class="list-card">',
        '<div class="toolbar"><div><h3>' + escapeHtml(request.credentialId) + '</h3><p class="mono">' + escapeHtml(request.id) + '</p></div><span class="' + (request.status === 'active' ? 'state-active' : request.status === 'pending' ? 'state-pending' : 'state-disabled') + '">' + escapeHtml(request.status) + '</span></div>',
        '<p>' + escapeHtml(request.operation + ' → ' + request.targetUrl) + '</p>',
        '<div class="list-meta"><span class="pill"><strong>Requested by</strong> ' + escapeHtml(request.requestedBy) + '</span><span class="pill"><strong>Quorum</strong> ' + escapeHtml(String(request.approvalCount)) + ' / ' + escapeHtml(String(request.requiredApprovals)) + '</span></div>',
        actions,
        '</article>'
      ].join('');
    }).join('');
  });
}

function renderAudit() {
  byId('audit-list').innerHTML = renderResultState(state.data.audit, function(payload) {
    if (!payload.events.length) {
      return '<div class="empty-state">No audit events are visible to this session.</div>';
    }

    return [
      '<div class="table-wrap"><table><thead><tr><th>When</th><th>Type</th><th>Outcome</th><th>Principal</th><th>Action</th></tr></thead><tbody>',
      payload.events.map(function(event) {
        return [
          '<tr>',
          '<td class="mono">' + escapeHtml(formatDate(event.occurredAt)) + '</td>',
          '<td>' + escapeHtml(event.type) + '</td>',
          '<td><span class="' + (event.outcome === 'success' || event.outcome === 'allowed' ? 'state-active' : 'state-disabled') + '">' + escapeHtml(event.outcome) + '</span></td>',
          '<td>' + escapeHtml(event.principal) + '</td>',
          '<td><div><strong>' + escapeHtml(event.action) + '</strong><div class="muted-copy mono">' + escapeHtml(event.correlationId) + '</div></div></td>',
          '</tr>'
        ].join('');
      }).join(''),
      '</tbody></table></div>'
    ].join('');
  });
}

function renderSystem() {
  byId('maintenance-status').innerHTML = renderResultState(state.data.maintenance, function(payload) {
    return '<pre>' + escapeHtml(prettyJson(payload.maintenance)) + '</pre>';
  });

  byId('trace-exporter-status').innerHTML = renderResultState(state.data.exporter, function(payload) {
    return '<pre>' + escapeHtml(prettyJson(payload.exporter)) + '</pre>';
  });

  byId('adapter-health').innerHTML = renderResultState(state.data.adapters, function(payload) {
    return '<pre>' + escapeHtml(prettyJson(payload.adapters)) + '</pre>';
  });

  byId('recent-traces').innerHTML = renderResultState(state.data.traces, function(payload) {
    return payload.traces.length
      ? '<pre>' + escapeHtml(prettyJson(payload.traces)) + '</pre>'
      : '<div class="empty-state">No traces captured yet.</div>';
  });

  byId('rotation-list').innerHTML = renderResultState(state.data.rotations, function(payload) {
    return payload.rotations.length
      ? '<pre>' + escapeHtml(prettyJson(payload.rotations)) + '</pre>'
      : '<div class="empty-state">No rotation runs are visible.</div>';
  });
}

function renderBackups() {
  byId('backup-summary').innerHTML = state.lastBackup
    ? '<pre>' + escapeHtml(prettyJson(state.lastBackup.summary || state.lastBackup.backup || state.lastBackup)) + '</pre>'
    : '<div class="empty-state">Export a backup or inspect a pasted payload to populate this panel.</div>';
}

function renderAll() {
  syncSessionFields();
  renderAdvancedMode();
  renderCoreJourney();
  renderCredentials();
  renderConnect();
  renderOverview();
  renderTenants();
  renderAuthClients();
  renderApprovals();
  renderBreakGlass();
  renderAudit();
  renderSystem();
  renderBackups();
}

async function refreshDashboard() {
  if (!state.token) {
    return;
  }

  setBusy(true);
  clearNotice();
  state.data.readyz = await safeFetch('/readyz');
  state.data.credentials = await safeFetch('/v1/catalog/credentials');
  state.data.tenants = await safeFetch('/v1/tenants');
  state.data.authClients = await safeFetch('/v1/auth/clients');
  state.data.approvals = await safeFetch('/v1/approvals');
  state.data.breakGlass = await safeFetch('/v1/break-glass');
  state.data.audit = await safeFetch('/v1/audit/events?limit=20');
  state.data.maintenance = await safeFetch('/v1/system/maintenance');
  state.data.exporter = await safeFetch('/v1/system/trace-exporter');
  state.data.adapters = await safeFetch('/v1/system/adapters');
  state.data.traces = await safeFetch('/v1/system/traces?limit=15');
  state.data.rotations = await safeFetch('/v1/system/rotations');
  if (state.data.authClients && state.data.authClients.ok) {
    const matchingClient = state.data.authClients.data.clients.find(function(client) {
      return client.clientId === state.sessionClientId;
    });
    if (matchingClient) {
      state.sessionTenantId = matchingClient.tenantId || state.sessionTenantId;
      persistSession();
    }
  }
  const credentials = visibleCredentials();
  if (state.selectedCredentialId) {
    state.currentCredentialContext = credentials.find(function(credential) {
      return credential.id === state.selectedCredentialId;
    }) || state.currentCredentialContext;
  }
  if (!state.selectedCredentialId && credentials.length > 0) {
    state.selectedCredentialId = credentials[0].id;
    state.currentCredentialContext = credentials[0];
  }
  renderAll();
  syncCredentialTestDefaults(false);
  setBusy(false);
}

async function withAction(message, action) {
  setBusy(true);
  clearNotice();
  try {
    const result = await action();
    if (message) {
      setNotice('info', message);
    }
    state.lastResponse = result;
    await refreshDashboard();
    return result;
  } catch (error) {
    setBusy(false);
    setNotice('error', error instanceof Error ? error.message : String(error));
    throw error;
  }
}

function serializeAuthClientForm() {
  return {
    clientId: byId('new-client-id').value.trim(),
    tenantId: byId('new-client-tenant').value.trim() || 'default',
    displayName: byId('new-client-name').value.trim(),
    roles: splitList(byId('new-client-roles').value),
    allowedScopes: splitList(byId('new-client-scopes').value),
    clientSecret: byId('new-client-secret').value.trim() || undefined,
    tokenEndpointAuthMethod: byId('new-client-auth-method').value,
    grantTypes: splitList(byId('new-client-grants').value),
    redirectUris: splitList(byId('new-client-redirects').value),
    jwks: undefined
  };
}

function applyCredentialTemplate() {
  const template = byId('credential-template').value;
  state.credentialIdManuallyEdited = false;
  if (template === 'github-readonly') {
    byId('credential-name').value = 'GitHub Read-Only Token';
    byId('credential-service').value = 'github';
    byId('credential-operations').value = 'http.get';
    byId('credential-domains').value = 'api.github.com';
    byId('credential-user-context').value = 'Primary read-only GitHub token for routine repository metadata and issue lookups.';
    byId('credential-llm-context').value = 'Use for GitHub repository metadata, issues, pull requests, and rate-limit reads. Never use it for write operations.';
    byId('credential-tags').value = 'github,readonly';
    byId('credential-sensitivity').value = 'high';
    renderCredentialPreview();
    return;
  }

  if (template === 'github-write') {
    byId('credential-name').value = 'GitHub Write Token';
    byId('credential-service').value = 'github';
    byId('credential-operations').value = 'http.get,http.post';
    byId('credential-domains').value = 'api.github.com';
    byId('credential-user-context').value = 'Higher-risk GitHub token for controlled repository writes and authenticated maintenance workflows.';
    byId('credential-llm-context').value = 'Use for GitHub workflows that need authenticated reads plus controlled writes such as issue comments, pull request updates, labels, or status changes. Prefer the read-only GitHub credential when writes are not required.';
    byId('credential-tags').value = 'github,write';
    byId('credential-sensitivity').value = 'critical';
    renderCredentialPreview();
    return;
  }

  if (template === 'npm-readonly') {
    byId('credential-name').value = 'npm Read-Only Token';
    byId('credential-service').value = 'npm';
    byId('credential-operations').value = 'http.get';
    byId('credential-domains').value = 'registry.npmjs.org';
    byId('credential-user-context').value = 'Read-only npm registry token for package inspection and dependency lookup.';
    byId('credential-llm-context').value = 'Use for npm package metadata, dependency lookup, and registry read operations. Do not use this credential for publish or package mutation workflows.';
    byId('credential-tags').value = 'npm,readonly';
    byId('credential-sensitivity').value = 'high';
    renderCredentialPreview();
    return;
  }

  if (template === 'internal-service') {
    byId('credential-name').value = 'Internal Service Token';
    byId('credential-service').value = 'internal_api';
    byId('credential-operations').value = 'http.get,http.post';
    byId('credential-domains').value = 'internal.example.com';
    byId('credential-user-context').value = 'Internal service credential scoped to one documented API workflow.';
    byId('credential-llm-context').value = 'Use only for the listed internal service domain when the task explicitly targets that service. Keep this credential scoped to the documented internal API workflow and avoid unrelated external APIs.';
    byId('credential-tags').value = 'internal,bearer';
    byId('credential-sensitivity').value = 'critical';
    renderCredentialPreview();
    return;
  }

  if (template === 'generic-bearer') {
    byId('credential-id').value = '';
    byId('credential-name').value = '';
    byId('credential-service').value = '';
    byId('credential-operations').value = 'http.get';
    byId('credential-domains').value = '';
    byId('credential-user-context').value = '';
    byId('credential-llm-context').value = '';
    byId('credential-tags').value = '';
    byId('credential-sensitivity').value = 'moderate';
    renderCredentialPreview();
  }

  syncCredentialIdFromName(true);
}

function syncCredentialIdFromName(force) {
  if (state.credentialIdManuallyEdited && !force) {
    return;
  }

  const name = byId('credential-name').value.trim();
  const template = byId('credential-template').value;
  const fallback = template === 'generic-bearer' ? 'token' : template.replace(/[^a-z0-9]+/g, '-');
  byId('credential-id').value = slugifyTokenKey(name || fallback) + '-local';
  renderCredentialPreview();
}

function syncCredentialSourceFields() {
  const adapter = byId('credential-storage').value;
  byId('credential-secret-field').hidden = adapter !== 'local';
  byId('credential-env-ref-field').hidden = adapter !== 'env';
  renderCredentialPreview();
}

function serializeCredentialForm() {
  const operations = splitList(byId('credential-operations').value);
  const adapter = byId('credential-storage').value;
  const secretValue = byId('credential-secret').value;
  return {
    credentialId: byId('credential-id').value.trim(),
    displayName: byId('credential-name').value.trim(),
    service: byId('credential-service').value.trim(),
    owner: 'local',
    scopeTier: operations.includes('http.post') ? 'read_write' : 'read_only',
    sensitivity: byId('credential-sensitivity').value,
    allowedDomains: splitList(byId('credential-domains').value),
    permittedOperations: operations.length ? operations : ['http.get'],
    userContext: byId('credential-user-context').value.trim(),
    llmContext: byId('credential-llm-context').value.trim(),
    selectionNotes: byId('credential-llm-context').value.trim(),
    tags: splitList(byId('credential-tags').value),
    authType: 'bearer',
    headerName: 'Authorization',
    headerPrefix: 'Bearer ',
    secretSource: adapter === 'local'
      ? {
          adapter: 'local',
          secretValue: secretValue
        }
      : {
          adapter: 'env',
          ref: byId('credential-env-ref').value.trim()
        }
  };
}

function syncCredentialTestDefaults(force) {
  const credentials = state.data.credentials && state.data.credentials.ok
    ? state.data.credentials.data.credentials
    : [];
  if (!credentials.length) {
    return;
  }
  const selectedId = byId('credential-test-id').value;
  const selected = credentials.find(function(credential) {
    return credential.id === selectedId;
  }) || credentials.find(function(credential) {
    return credential.id === state.lastCreatedCredentialId;
  }) || credentials.find(function(credential) {
    return credential.id === state.selectedCredentialId;
  }) || credentials[0];
  if (force || !byId('credential-test-id').value) {
    byId('credential-test-id').value = selected.id;
  }
  if (force || !byId('credential-test-url').value.trim()) {
    byId('credential-test-url').value = defaultTestUrlForCredential(selected);
  }
}

async function handleLogin(event) {
  if (event) {
    event.preventDefault();
  }
  state.baseUrl = byId('base-url').value.trim().replace(/\/$/, '');
  state.resource = byId('resource').value.trim();
  const pastedToken = byId('pasted-token').value.trim();

  setBusy(true);
  clearNotice();

  try {
    if (pastedToken) {
      state.token = pastedToken;
      state.sessionClientId = byId('client-id').value.trim() || 'pasted-token';
      state.sessionScopes = byId('scope-input').value.trim() || 'unknown';
    } else {
      await requestTokenFromCredentials();
    }
    persistSession();
    renderAll();
    setNotice('info', 'Operator session established.');
    await refreshDashboard();
  } catch (error) {
    setBusy(false);
    setNotice('error', error instanceof Error ? error.message : String(error));
  }
}

async function handleLocalQuickstartLogin() {
  setBusy(true);
  clearNotice();

  try {
    const payload = await fetchJson('/v1/core/local-session', {
      method: 'POST'
    });
    state.token = payload.access_token;
    state.sessionClientId = payload.clientId || 'keylore-admin-local';
    state.sessionScopes = payload.scope || 'catalog:read';
    state.resource = payload.resource || (state.baseUrl.replace(/\/$/, '') + '/v1');
    persistSession();
    renderAll();
    setNotice('info', 'Local session established. Next: save a token.');
    await refreshDashboard();
  } catch (error) {
    setBusy(false);
    setNotice('error', error instanceof Error ? error.message : String(error));
  }
}

async function handleCreateCredential(event) {
  event.preventDefault();
  const payload = serializeCredentialForm();
  const assessment = credentialContextAssessment(payload);
  if (assessment.errors.length) {
    renderCredentialPreview();
    setNotice('error', assessment.errors[0]);
    return;
  }
  const result = await withAction(
    state.credentialModalMode === 'edit'
      ? 'Token updated.'
      : 'Token created. Next: run Test Credential or connect your AI tool.'
    ,
    async function() {
      if (state.credentialModalMode === 'edit') {
        const contextResult = await fetchJson('/v1/core/credentials/' + encodeURIComponent(payload.credentialId) + '/context', {
          method: 'PATCH',
          headers: {
            'content-type': 'application/json'
          },
          body: JSON.stringify({
            displayName: payload.displayName,
            service: payload.service,
            scopeTier: payload.scopeTier,
            sensitivity: payload.sensitivity,
            allowedDomains: payload.allowedDomains,
            permittedOperations: payload.permittedOperations,
            userContext: payload.userContext,
            llmContext: payload.llmContext,
            selectionNotes: payload.llmContext,
            tags: payload.tags,
          })
        });
        if (payload.secretSource.adapter === 'local' && payload.secretSource.secretValue.trim()) {
          await fetchJson('/v1/core/credentials/' + encodeURIComponent(payload.credentialId) + '/local-secret', {
            method: 'POST',
            headers: {
              'content-type': 'application/json'
            },
            body: JSON.stringify({
              secretValue: payload.secretSource.secretValue.trim()
            })
          });
        }
        return contextResult;
      }
      try {
        return await fetchJson('/v1/core/credentials', {
          method: 'POST',
          headers: {
            'content-type': 'application/json'
          },
          body: JSON.stringify(payload)
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes('already exists')) {
          throw new Error('Token key "' + payload.credentialId + '" is already in use. Change the Token key field and save again.');
        }
        throw error;
      }
    }
  );
  state.lastCreatedCredentialId = result.credential.id;
  state.selectedCredentialId = result.credential.id;
  state.currentCredentialContext = result.credential;
  closeDialog('credential-modal');
  resetCredentialFormForCreate();
  syncCredentialTestDefaults(true);
}

async function handleCredentialTest(event) {
  event.preventDefault();
  const credentialId = byId('credential-test-id').value.trim();
  const targetUrl = byId('credential-test-url').value.trim();
  state.lastCredentialTestContext = {
    credentialId: credentialId,
    targetUrl: targetUrl
  };
  try {
    const result = await withAction('Token check completed. Review the summary below, then connect your AI tool.', async function() {
      return fetchJson('/v1/access/request', {
        method: 'POST',
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          credentialId: credentialId,
          operation: 'http.get',
          targetUrl: targetUrl
        })
      });
    });
    state.lastCredentialTest = result;
    renderCredentials();
  } catch (error) {
    state.lastCredentialTest = null;
    renderCredentialTestError(error instanceof Error ? error.message : String(error));
  }
}

async function handleCredentialContextAction(event) {
  if (!(event.target instanceof Element)) {
    return;
  }
  const button = event.target.closest('[data-credential-context-action]');
  if (!button) {
    return;
  }

  try {
    const credentialId = button.dataset.credentialContextId;
    const action = button.dataset.credentialContextAction;
    if (action === 'open') {
      setBusy(true);
      clearNotice();
      await openCredentialContext(credentialId);
      openEditCredentialModal(state.currentCredentialContext);
      setNotice('info', 'Loaded the token for editing. Secret storage remains separate.');
      setBusy(false);
      return;
    }

    if (action === 'test') {
      state.selectedCredentialId = credentialId;
      byId('credential-test-id').value = credentialId;
      syncCredentialTestDefaults(true);
      openSection('credentials-section');
      setNotice('info', 'Selected token loaded into Test credential.');
      return;
    }

    if (action === 'rename') {
      const nextName = window.prompt('New display name', button.dataset.credentialContextName || '');
      if (!nextName || !nextName.trim()) {
        return;
      }
      const result = await withAction('Credential renamed. Next: verify the MCP-visible record still reads clearly.', async function() {
        return fetchJson('/v1/core/credentials/' + encodeURIComponent(credentialId) + '/context', {
          method: 'PATCH',
          headers: {
            'content-type': 'application/json'
          },
          body: JSON.stringify({ displayName: nextName.trim() })
        });
      });
      state.currentCredentialContext = result.credential;
      state.selectedCredentialId = credentialId;
      renderCredentialContextManager();
      return;
    }

    if (action === 'retag') {
      const nextTags = window.prompt('Comma-separated tags', button.dataset.credentialContextTags || '');
      if (nextTags === null) {
        return;
      }
      const result = await withAction('Credential tags updated. Next: confirm the tags help the agent choose the right record.', async function() {
        return fetchJson('/v1/core/credentials/' + encodeURIComponent(credentialId) + '/context', {
          method: 'PATCH',
          headers: {
            'content-type': 'application/json'
          },
          body: JSON.stringify({ tags: splitList(nextTags) })
        });
      });
      state.currentCredentialContext = result.credential;
      state.selectedCredentialId = credentialId;
      renderCredentialContextManager();
      return;
    }

    if (action === 'status') {
      const result = await withAction(button.dataset.credentialContextStatus === 'disabled'
        ? 'Credential archived. Next: restore it when the agent should use it again.'
        : 'Credential restored. Next: rerun Test Credential if you want to confirm the live path.'
      , async function() {
        return fetchJson('/v1/core/credentials/' + encodeURIComponent(credentialId) + '/context', {
          method: 'PATCH',
          headers: {
            'content-type': 'application/json'
          },
          body: JSON.stringify({ status: button.dataset.credentialContextStatus })
        });
      });
      state.currentCredentialContext = result.credential;
      state.selectedCredentialId = credentialId;
      renderCredentialContextManager();
      return;
    }

    if (action === 'delete') {
      const confirmed = window.confirm('Delete "' + (button.dataset.credentialContextName || credentialId) + '" permanently? This removes the token metadata and its local secret material.');
      if (!confirmed) {
        return;
      }
      await withAction('Token deleted.', async function() {
        return fetchJson('/v1/core/credentials/' + encodeURIComponent(credentialId), {
          method: 'DELETE'
        });
      });
      if (state.selectedCredentialId === credentialId) {
        state.selectedCredentialId = '';
        state.currentCredentialContext = null;
      }
      if (state.lastCreatedCredentialId === credentialId) {
        state.lastCreatedCredentialId = '';
      }
      if (state.lastCredentialTestContext?.credentialId === credentialId) {
        state.lastCredentialTest = null;
        state.lastCredentialTestContext = null;
      }
      closeDialog('credential-modal');
      renderCredentialContextManager();
      return;
    }
  } catch (error) {
    setBusy(false);
    setNotice('error', error instanceof Error ? error.message : String(error));
  }
}

async function handleCredentialContextSave(event) {
  event.preventDefault();
  if (!state.selectedCredentialId) {
    setNotice('error', 'Select a credential before updating its context.');
    return;
  }
  const payload = serializeCredentialContextForm();
  const assessment = credentialContextAssessment(payload);
  if (assessment.errors.length) {
    renderContextPreview(
      'credential-context-preview',
      'credential-context-preview-warnings',
      payload,
      state.selectedCredentialId,
    );
    setNotice('error', assessment.errors[0]);
    return;
  }

  const result = await withAction('Credential context updated. Next: rerun Test Credential if you changed domains or operations.', async function() {
    return fetchJson('/v1/core/credentials/' + encodeURIComponent(state.selectedCredentialId) + '/context', {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
  });
  state.currentCredentialContext = result.credential;
  renderCredentialContextManager();
}

async function handleMcpConnectionCheck(event) {
  event.preventDefault();
  const clientId = byId('connect-client-id').value.trim();
  const clientSecret = byId('connect-client-secret').value;
  if (!clientId || !clientSecret) {
    setNotice('error', 'Client ID and client secret are required to mint a remote MCP token.');
    return;
  }

  setBusy(true);
  clearNotice();

  try {
    const tokenResponse = await fetch(state.baseUrl.replace(/\/$/, '') + '/oauth/token', {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
        scope: 'catalog:read broker:use mcp:use',
        resource: state.baseUrl.replace(/\/$/, '') + '/mcp'
      })
    });
    const tokenPayload = await tokenResponse.json().catch(function() {
      return { error: 'Unable to parse token response.' };
    });
    if (!tokenResponse.ok) {
      throw new Error(tokenPayload.error || 'Failed to mint MCP token.');
    }

    state.mcpToken = tokenPayload.access_token;

    const checkResult = await fetchJson('/v1/core/mcp/check', {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify({ token: state.mcpToken })
    });

    state.lastMcpConnection = {
      transport: 'http',
      tokenIssued: true,
      tokenScopes: tokenPayload.scope || 'catalog:read broker:use mcp:use',
      tokenType: tokenPayload.token_type || 'Bearer',
      verification: checkResult
    };
    setNotice('info', 'HTTP MCP token minted and verified. Next: export the token, restart the client, and try the first prompt below.');
    renderConnect();
    setBusy(false);
  } catch (error) {
    setBusy(false);
    setNotice('error', error instanceof Error ? error.message : String(error));
  }
}

async function handleCreateTenant(event) {
  event.preventDefault();
  await withAction('Tenant created.', async function() {
    return fetchJson('/v1/tenants', {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        tenantId: byId('new-tenant-id').value.trim(),
        displayName: byId('new-tenant-name').value.trim(),
        description: byId('new-tenant-description').value.trim() || undefined,
        status: byId('new-tenant-status').value
      })
    });
  });
  byId('tenant-form').reset();
}

async function handleCreateClient(event) {
  event.preventDefault();
  const payload = serializeAuthClientForm();
  const result = await withAction('OAuth client created.', async function() {
    return fetchJson('/v1/auth/clients', {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
  });
  state.lastClientSecret = result;
  renderAuthClients();
  byId('auth-client-form').reset();
}

async function handleBackupExport() {
  const result = await withAction('Backup exported.', async function() {
    return fetchJson('/v1/system/backups/export', { method: 'POST' });
  });
  state.lastBackup = result;
  byId('backup-json').value = prettyJson(result.backup);
  renderBackups();
}

async function handleBackupInspect() {
  try {
    const backup = JSON.parse(byId('backup-json').value || '{}');
    const result = await withAction('Backup inspected.', async function() {
      return fetchJson('/v1/system/backups/inspect', {
        method: 'POST',
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify({ backup: backup })
      });
    });
    state.lastBackup = result;
    renderBackups();
  } catch (error) {
    if (!(error instanceof Error) || !/Unexpected token|JSON/.test(error.message)) {
      return;
    }
    setNotice('error', 'Backup JSON is invalid.');
  }
}

async function handleBackupRestore() {
  if (!window.confirm('Restore the pasted backup payload into the current tenant scope or global instance?')) {
    return;
  }

  try {
    const backup = JSON.parse(byId('backup-json').value || '{}');
    const result = await withAction('Backup restore completed.', async function() {
      return fetchJson('/v1/system/backups/restore', {
        method: 'POST',
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify({ confirm: true, backup: backup })
      });
    });
    state.lastBackup = result;
    renderBackups();
  } catch (error) {
    if (!(error instanceof Error) || !/Unexpected token|JSON/.test(error.message)) {
      return;
    }
    setNotice('error', 'Backup JSON is invalid.');
  }
}

async function downloadBackup() {
  if (!state.lastBackup || !state.lastBackup.backup) {
    setNotice('warning', 'Export a backup before downloading.');
    return;
  }
  const blob = new Blob([prettyJson(state.lastBackup.backup)], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'keylore-backup.json';
  link.click();
  URL.revokeObjectURL(link.href);
}

async function handleTenantAction(event) {
  if (!(event.target instanceof Element)) {
    return;
  }
  const button = event.target.closest('[data-tenant-action]');
  if (!button) {
    return;
  }
  await withAction('Tenant updated.', async function() {
    return fetchJson('/v1/tenants/' + encodeURIComponent(button.dataset.tenantId), {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify({ status: button.dataset.nextStatus })
    });
  });
}

async function handleClientAction(event) {
  if (!(event.target instanceof Element)) {
    return;
  }
  const button = event.target.closest('[data-client-action]');
  if (!button) {
    return;
  }
  const action = button.dataset.clientAction;
  const clientId = encodeURIComponent(button.dataset.clientId);
  if (action === 'rotate') {
    const newSecret = window.prompt('Optional new secret. Leave empty to generate one automatically.', '');
    const result = await withAction('Client secret rotated.', async function() {
      return fetchJson('/v1/auth/clients/' + clientId + '/rotate-secret', {
        method: 'POST',
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify(newSecret ? { clientSecret: newSecret } : {})
      });
    });
    state.lastClientSecret = result;
    renderAuthClients();
    return;
  }
  await withAction('Client status updated.', async function() {
    return fetchJson('/v1/auth/clients/' + clientId + '/' + action, {
      method: 'POST'
    });
  });
}

async function handleApprovalAction(event) {
  if (!(event.target instanceof Element)) {
    return;
  }
  const button = event.target.closest('[data-approval-action]');
  if (!button) {
    return;
  }
  const note = window.prompt('Optional review note', '') || undefined;
  await withAction('Approval review submitted.', async function() {
    return fetchJson('/v1/approvals/' + encodeURIComponent(button.dataset.approvalId) + '/' + button.dataset.approvalAction, {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify(note ? { note: note } : {})
    });
  });
}

async function handleBreakGlassAction(event) {
  if (!(event.target instanceof Element)) {
    return;
  }
  const button = event.target.closest('[data-breakglass-action]');
  if (!button) {
    return;
  }
  const note = window.prompt('Optional review note', '') || undefined;
  await withAction('Break-glass review submitted.', async function() {
    return fetchJson('/v1/break-glass/' + encodeURIComponent(button.dataset.breakglassId) + '/' + button.dataset.breakglassAction, {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify(note ? { note: note } : {})
    });
  });
}

function bindNavigation() {
  document.querySelectorAll('.nav-button').forEach(function(button) {
    button.addEventListener('click', function() {
      document.querySelectorAll('.nav-button').forEach(function(node) {
        node.classList.remove('is-active');
      });
      button.classList.add('is-active');
      openSection(button.dataset.section);
    });
  });
}

function openSection(sectionId) {
  const target = byId(sectionId);
  if (target) {
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

async function initialize() {
  loadPersistedSession();
  bindNavigation();
  byId('base-url').value = state.baseUrl;
  byId('resource').value = state.resource;
  byId('scope-input').value = [
    'catalog:read',
    'catalog:write',
    'admin:read',
    'admin:write',
    'auth:read',
    'auth:write',
    'audit:read',
    'approval:read',
    'approval:review',
    'system:read',
    'system:write',
    'backup:read',
    'backup:write',
    'breakglass:read',
    'breakglass:review',
    'breakglass:request',
    'broker:use',
    'mcp:use'
  ].join(' ');

  byId('login-form').addEventListener('submit', handleLogin);
  const localQuickstartButton = byId('local-login-submit');
  if (localQuickstartButton) {
    localQuickstartButton.addEventListener('click', handleLocalQuickstartLogin);
  }
  byId('open-credential-modal').addEventListener('click', openCreateCredentialModal);
  byId('credential-form').addEventListener('submit', handleCreateCredential);
  byId('credential-test-form').addEventListener('submit', handleCredentialTest);
  byId('connect-form').addEventListener('submit', handleMcpConnectionCheck);
  byId('credential-template').addEventListener('change', applyCredentialTemplate);
  byId('credential-name').addEventListener('input', function() {
    syncCredentialIdFromName(false);
  });
  byId('credential-id').addEventListener('input', function() {
    state.credentialIdManuallyEdited = true;
    renderCredentialPreview();
  });
  byId('credential-storage').addEventListener('change', syncCredentialSourceFields);
  byId('credential-form').addEventListener('input', renderCredentialPreview);
  byId('credential-form').addEventListener('change', renderCredentialPreview);
  byId('credential-test-id').addEventListener('change', function() {
    syncCredentialTestDefaults(true);
  });
  byId('connect-tabs').addEventListener('click', handleConnectTabClick);
  byId('connect-section').addEventListener('click', handleCopyAction);
  byId('connect-section').addEventListener('click', handleApplyToolSetup);
  byId('tenant-form').addEventListener('submit', handleCreateTenant);
  byId('auth-client-form').addEventListener('submit', handleCreateClient);
  byId('refresh-dashboard').addEventListener('click', refreshDashboard);
  byId('logout').addEventListener('click', function() {
    clearSession();
    setNotice('info', 'Session cleared.');
  });
  byId('tenant-list').addEventListener('click', handleTenantAction);
  byId('auth-client-list').addEventListener('click', handleClientAction);
  byId('credential-list').addEventListener('click', handleCredentialContextAction);
  byId('approval-list').addEventListener('click', handleApprovalAction);
  byId('breakglass-list').addEventListener('click', handleBreakGlassAction);
  byId('backup-export').addEventListener('click', handleBackupExport);
  byId('backup-inspect').addEventListener('click', handleBackupInspect);
  byId('backup-restore').addEventListener('click', handleBackupRestore);
  byId('backup-download').addEventListener('click', downloadBackup);
  byId('advanced-toggle').addEventListener('click', function() {
    state.advancedVisible = !state.advancedVisible;
    persistSession();
    renderAdvancedMode();
    if (state.advancedVisible) {
      openSection('overview-section');
    }
  });
  document.body.addEventListener('click', function(event) {
    if (!(event.target instanceof Element)) {
      return;
    }
    const toastClose = event.target.closest('[data-toast-close]');
    if (toastClose) {
      const toastId = toastClose.getAttribute('data-toast-close');
      document.querySelector('[data-toast-id="' + toastId + '"]')?.remove();
      return;
    }
    const closeButton = event.target.closest('[data-dialog-close]');
    if (closeButton) {
      closeDialog(closeButton.getAttribute('data-dialog-close'));
      return;
    }
    const button = event.target.closest('[data-nav-target]');
    if (!button) {
      return;
    }
    openSection(button.dataset.navTarget);
  });
  byId('run-maintenance').addEventListener('click', function() {
    withAction('Maintenance run completed.', function() {
      return fetchJson('/v1/system/maintenance/run', { method: 'POST' });
    });
  });
  byId('flush-traces').addEventListener('click', function() {
    withAction('Trace exporter flushed.', function() {
      return fetchJson('/v1/system/trace-exporter/flush', { method: 'POST' });
    });
  });

  if (state.token) {
    byId('pasted-token').value = state.token;
    renderAll();
    setNotice('info', 'Restored the previous operator session.');
    await refreshDashboard();
  } else {
    renderAll();
    populateLoginDefaults(false);
    applyCredentialTemplate();
    syncCredentialSourceFields();
    renderCredentialPreview();
    if (state.localQuickstartEnabled) {
      setNotice('info', 'Starting local quickstart session...');
      await handleLocalQuickstartLogin();
    }
  }
}

window.addEventListener('DOMContentLoaded', initialize);
`;

export function renderAdminPage(app: Pick<KeyLoreApp, "config">): string {
  const stdioEntryPath = resolveLocalStdioEntryPath();
  const config = {
    version: app.config.version,
    baseUrl: app.config.publicBaseUrl,
    localQuickstartEnabled: app.config.localQuickstartEnabled,
    localAdminBootstrap: app.config.localAdminBootstrap,
    stdioEntryPath,
    stdioAvailable: fs.existsSync(stdioEntryPath),
  };

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>KeyLore Admin</title>
    <style>${adminStyles}</style>
  </head>
  <body>
    <div class="page-shell">
      <aside class="sidebar">
        <p class="eyebrow">KeyLore Control Plane</p>
        <h1 class="brand">KeyLore<br />Admin</h1>
        <p class="brand-subtitle">Start with one short path: save a token, tell the AI when to use it, test it, and connect your tool. Everything technical stays out of the way unless you ask for it.</p>
        <p class="sidebar-section-label">Start Here</p>
        <nav class="nav-group">
          <button class="nav-button is-active" data-section="credentials-section" type="button">Save Token</button>
          <button class="nav-button" data-section="connect-section" type="button">Connect AI Tool</button>
        </nav>
        <p class="sidebar-section-label">More Options</p>
        <div class="nav-group" style="margin-top: 0;">
          <button class="button-secondary" id="advanced-toggle" type="button">Show advanced controls</button>
        </div>
        <nav id="advanced-nav" class="nav-group advanced-nav" hidden>
          <button class="nav-button" data-section="overview-section" type="button">Overview</button>
          <button class="nav-button" data-section="tenants-section" type="button">Tenants</button>
          <button class="nav-button" data-section="clients-section" type="button">OAuth Clients</button>
          <button class="nav-button" data-section="approvals-section" type="button">Approvals</button>
          <button class="nav-button" data-section="breakglass-section" type="button">Break Glass</button>
          <button class="nav-button" data-section="backups-section" type="button">Backups</button>
          <button class="nav-button" data-section="audit-section" type="button">Audit</button>
          <button class="nav-button" data-section="system-section" type="button">System</button>
        </nav>
        <p class="helper-copy">Use local quickstart for the shortest path. Advanced mode keeps the full operator console available later without crowding first-run setup.</p>
      </aside>
      <main class="content">
        <section class="hero">
          <div>
            <span class="eyebrow">Core Mode</span>
            <h1>Save a token. Teach the AI when to use it. Keep the secret hidden.</h1>
            <p class="hero-copy">KeyLore is now centered on one beginner-friendly workflow: save a token, describe it in plain language, test it safely, and connect Codex, Gemini, or Claude without putting the raw secret into model-visible context.</p>
          </div>
          <div class="hero-meta">
            <div class="meta-card">
              <span class="meta-label">Release</span>
              <span class="meta-value mono">${config.version}</span>
            </div>
            <div class="meta-card">
              <span class="meta-label">Base URL</span>
              <span class="meta-value mono">${config.baseUrl}</span>
            </div>
          </div>
        </section>

        <div id="notice" class="notice"></div>
        <div id="toast-console" class="toast-console" aria-live="polite" aria-atomic="false"></div>

        <section id="login-panel" class="panel" style="margin-top: 24px;">
          <div class="section-heading">
            <div>
              <h2>Start here</h2>
              <p>For most local users, one click is enough. Manual sign-in is still available when you need it.</p>
            </div>
          </div>
          ${
            app.config.localQuickstartEnabled
              ? `<div class="panel-footnote" style="margin-bottom: 16px;">Local quickstart is enabled on this loopback development instance. KeyLore will try to open a local session automatically. If that fails, use the fallback button or the manual sign-in form below.</div>
          <div class="form-actions" style="margin-bottom: 16px;">
            <button class="button-secondary" id="local-login-submit" type="button" data-busy-label="Opening local session..." data-idle-label="Start working locally">Start working locally</button>
          </div>
          <details class="disclosure">
            <summary>Manual sign-in options</summary>`
              : ""
          }
          <form id="login-form" class="form-grid">
            <div class="field">
              <label for="base-url">Base URL</label>
              <input id="base-url" type="url" required />
            </div>
            <div class="field">
              <label for="resource">Protected Resource</label>
              <input id="resource" type="url" required />
            </div>
            <div class="field">
              <label for="client-id">Client ID</label>
              <input id="client-id" type="text" placeholder="keylore-admin-local" />
            </div>
            <div class="field">
              <label for="client-secret">Client Secret</label>
              <input id="client-secret" type="password" placeholder="operator secret" />
            </div>
            <div class="field-wide">
              <label for="scope-input">Scopes</label>
              <textarea id="scope-input"></textarea>
            </div>
            <div class="field-wide">
              <label for="pasted-token">Optional Existing Bearer Token</label>
              <textarea id="pasted-token" placeholder="Paste a bearer token here to skip token minting."></textarea>
            </div>
            <div class="form-actions field-wide">
              <button class="button" id="login-submit" type="submit" data-busy-label="Opening session..." data-idle-label="Open operator session">Open operator session</button>
            </div>
          </form>
          ${app.config.localQuickstartEnabled ? '</details>' : ''}
        </section>

        <div id="dashboard" class="dashboard" hidden>
          <div class="utility-shell" aria-hidden="true">
            <button class="button-secondary" id="refresh-dashboard" type="button" data-busy-label="Refreshing..." data-idle-label="Refresh everything">Refresh everything</button>
            <button class="button-danger" id="logout" type="button">Clear session</button>
            <span id="session-status" class="state-warning">Not connected</span>
            <span id="session-client-id">anonymous token</span>
            <span id="session-tenant">global operator</span>
            <span id="session-scopes">not loaded</span>
          </div>
          <section id="quick-start-section" class="panel">
            <div class="section-heading">
              <div>
                <h2>Quick start</h2>
                <p>The shortest path is add token, test token, then connect your AI tool.</p>
              </div>
            </div>
            <div id="core-journey"></div>
            <div id="advanced-summary" class="advanced-summary" style="margin-top:18px;"></div>
          </section>

          <section id="credentials-section" class="panel">
            <div class="section-heading">
              <div>
                <h2>Your tokens</h2>
                <p>All saved tokens live here. Add one, edit it in a popup, test it, or remove it.</p>
              </div>
            </div>
            <div class="panel">
              <div class="token-toolbar">
                <div>
                  <h2 style="font-size:1.4rem;">Saved tokens</h2>
                  <p>All tokens are listed together here, including examples. Edit or delete any row directly.</p>
                </div>
                <button class="button" id="open-credential-modal" type="button">Add token</button>
              </div>
              <div id="credential-list"></div>
            </div>
            <div class="panel" style="margin-top:18px;">
              <div class="section-heading">
                <div>
                  <h2 style="font-size:1.4rem;">Test credential</h2>
                  <p>Run a real safe check. KeyLore will make an <code>http.get</code> call with the selected token and URL, without exposing the raw secret.</p>
                </div>
              </div>
              <form id="credential-test-form" class="form-grid">
                <div class="field"><label for="credential-test-id">Token to check</label><select id="credential-test-id"></select></div>
                <div class="field-wide"><label for="credential-test-url">URL to call with this token</label><input id="credential-test-url" type="url" placeholder="https://api.github.com/rate_limit" required /></div>
                <div class="panel-footnote field-wide" style="margin-top:-4px;">Success means the token, the target domain, and KeyLore policy all allowed the request.</div>
                <div class="form-actions field-wide"><button class="button-secondary" type="submit" data-busy-label="Testing credential..." data-idle-label="Check this token">Check this token</button></div>
              </form>
              <div id="credential-test-result" style="margin-top: 18px;"></div>
            </div>
          </section>

          <dialog id="credential-modal" class="modal">
            <div class="modal-card">
              <div class="modal-header">
                <div>
                  <h2 id="credential-modal-title" style="margin:0;">Add token</h2>
                  <p id="credential-modal-copy" class="panel-footnote" style="margin-top:8px;">Paste the token, add the human and AI context, and save it into KeyLore.</p>
                </div>
                <button class="button-secondary" type="button" data-dialog-close="credential-modal">Close</button>
              </div>
              <div class="modal-body">
                <form id="credential-form" class="form-grid">
                  <div class="field-wide"><label for="credential-template">What is this token for?</label><select id="credential-template"><option value="github-readonly">GitHub read-only</option><option value="github-write">GitHub write-capable</option><option value="npm-readonly">npm read-only</option><option value="internal-service">Internal service token</option><option value="generic-bearer">Generic bearer API</option></select></div>
                  <div class="field"><label for="credential-name">Name shown in KeyLore</label><input id="credential-name" type="text" required /></div>
                  <div class="field"><label for="credential-id">Token key</label><input id="credential-id" type="text" required placeholder="github-read-only-token-local" /></div>
                  <div class="field-wide panel-footnote" style="margin-top:-4px;">This is the unique key for the token. It appears in the saved-token list and is what you change if KeyLore says a token key already exists.</div>
                  <div class="field"><label for="credential-domains">Where can it be used?</label><textarea id="credential-domains" placeholder="api.github.com"></textarea></div>
                  <div id="credential-secret-field" class="field-wide"><label id="credential-secret-label" for="credential-secret">Paste token</label><textarea id="credential-secret" placeholder="Paste the raw token here. KeyLore stores it outside the searchable metadata catalogue."></textarea></div>
                  <div class="field-wide"><label for="credential-user-context">Explain this token for people</label><textarea id="credential-user-context" placeholder="Example: Primary read-only GitHub token for routine repository metadata lookups."></textarea></div>
                  <div class="field-wide"><label for="credential-llm-context">Tell the AI when to use this token</label><textarea id="credential-llm-context" placeholder="Example: Use this for GitHub repository metadata, issues, and pull requests. Do not use it for write actions."></textarea></div>
                  <div class="field-wide">
                    <label for="credential-guidance">Writing help</label>
                    <div id="credential-guidance"></div>
                  </div>
                  <div class="field-wide">
                    <label for="credential-mcp-preview">What the AI will see</label>
                    <div id="credential-preview-warnings" style="margin-bottom: 12px;"></div>
                    <div id="credential-mcp-preview"></div>
                  </div>
                  <details class="disclosure field-wide">
                    <summary>Advanced token settings</summary>
                    <div class="form-grid">
                      <div class="field"><label for="credential-storage">Where to store the token</label><select id="credential-storage"><option value="local">Local encrypted store</option><option value="env">Environment reference</option></select></div>
                      <div class="field"><label for="credential-service">Service name</label><input id="credential-service" type="text" required /></div>
                      <div class="field"><label for="credential-sensitivity">Risk level</label><select id="credential-sensitivity"><option value="moderate">moderate</option><option value="high">high</option><option value="critical">critical</option></select></div>
                      <div class="field"><label for="credential-operations">Allow writes?</label><select id="credential-operations"><option value="http.get">No, read only</option><option value="http.get,http.post">Yes, allow controlled writes</option></select></div>
                      <div class="field"><label for="credential-tags">Tags</label><input id="credential-tags" type="text" placeholder="github,readonly" /></div>
                      <div id="credential-env-ref-field" class="field-wide" hidden><label for="credential-env-ref">Environment variable name</label><input id="credential-env-ref" type="text" placeholder="KEYLORE_SECRET_GITHUB_READONLY" /></div>
                    </div>
                  </details>
                  <div class="form-actions field-wide"><button class="button" id="credential-submit" type="submit" data-busy-label="Saving token..." data-idle-label="Save token">Save token</button></div>
                </form>
              </div>
            </div>
          </dialog>

          <section id="connect-section" class="panel">
            <div class="section-heading">
              <div>
                <h2>Connect your AI tool</h2>
                <p>Follow the tool-specific steps below. Each one tells you where to put the config, what to restart, and what to try first.</p>
              </div>
            </div>
            <div id="connect-tabs" class="tab-row" role="tablist" aria-label="AI tool setup tabs">
              <button class="tab-button" type="button" data-connect-tab="codex" role="tab" aria-selected="true">Codex</button>
              <button class="tab-button" type="button" data-connect-tab="gemini" role="tab" aria-selected="false">Gemini CLI</button>
              <button class="tab-button" type="button" data-connect-tab="claude" role="tab" aria-selected="false">Claude CLI</button>
            </div>
            <div class="panel-grid">
              <div class="span-12 code-stack" data-connect-panel="codex">
                <div class="panel">
                  <div class="section-heading"><div><h2 style="font-size:1.4rem;">Codex</h2><p>Recommended for local use.</p></div></div>
                  <ol class="panel-footnote">
                    <li>Open or create <span class="mono">~/.codex/config.toml</span>.</li>
                    <li>Paste the snippet below into that file under the top-level <span class="mono">mcp_servers</span> section.</li>
                    <li>Save the file, then restart Codex.</li>
                    <li>Use the first prompt after restart, or run <span class="mono">/mcp</span> inside Codex to confirm KeyLore is available.</li>
                  </ol>
                  <div class="snippet-stack">
                    <div class="snippet-box">
                      <button class="copy-glyph" type="button" data-copy-target="codex-stdio-snippet" data-copy-label="Codex setup snippet" aria-label="Copy Codex setup snippet">⧉</button>
                      <textarea id="codex-stdio-snippet" style="width:100%; min-height: 130px;"></textarea>
                    </div>
                  </div>
                  <div class="panel-actions" style="margin-top:16px;">
                    <button class="button-secondary" type="button" data-apply-tool="codex">Apply to my Codex settings</button>
                  </div>
                </div>
              </div>
              <div class="span-12 code-stack" data-connect-panel="gemini" hidden>
                <div class="panel">
                  <div class="section-heading"><div><h2 style="font-size:1.4rem;">Gemini CLI</h2><p>Recommended for local use.</p></div></div>
                  <ol class="panel-footnote">
                    <li>Open <span class="mono">~/.gemini/settings.json</span>.</li>
                    <li>Merge the snippet below into the <span class="mono">mcpServers</span> object. If the file is empty, paste the whole snippet.</li>
                    <li>Save the file, then restart Gemini CLI.</li>
                    <li>Run <span class="mono">gemini mcp list</span> if you want to confirm KeyLore is connected, then use the first prompt below.</li>
                  </ol>
                  <div class="snippet-stack">
                    <div class="snippet-box">
                      <button class="copy-glyph" type="button" data-copy-target="gemini-stdio-snippet" data-copy-label="Gemini setup snippet" aria-label="Copy Gemini setup snippet">⧉</button>
                      <textarea id="gemini-stdio-snippet" style="width:100%; min-height: 170px;"></textarea>
                    </div>
                  </div>
                  <div class="panel-actions" style="margin-top:16px;">
                    <button class="button-secondary" type="button" data-apply-tool="gemini">Apply to my Gemini settings</button>
                  </div>
                </div>
              </div>
              <div class="span-12 code-stack" data-connect-panel="claude" hidden>
                <div class="panel">
                  <div class="section-heading"><div><h2 style="font-size:1.4rem;">Claude CLI</h2><p>Recommended for local use.</p></div></div>
                  <ol class="panel-footnote">
                    <li>Run the command below in your shell. It adds KeyLore to Claude's MCP config for you.</li>
                    <li>Confirm the server appears with <span class="mono">claude mcp list</span>.</li>
                    <li>Start or restart Claude CLI.</li>
                    <li>Use the first prompt after restart.</li>
                  </ol>
                  <div class="snippet-stack">
                    <div class="snippet-box">
                      <button class="copy-glyph" type="button" data-copy-target="claude-stdio-snippet" data-copy-label="Claude setup command" aria-label="Copy Claude setup command">⧉</button>
                      <textarea id="claude-stdio-snippet" style="width:100%; min-height: 160px;"></textarea>
                    </div>
                  </div>
                  <div class="panel-actions" style="margin-top:16px;">
                    <button class="button-secondary" type="button" data-apply-tool="claude">Apply to my Claude settings</button>
                  </div>
                </div>
              </div>
              <div class="span-12 panel">
                <div class="section-heading">
                  <div>
                    <h2 style="font-size:1.4rem;">First prompt to try</h2>
                    <p>Use the same prompt after connecting any supported tool.</p>
                  </div>
                </div>
                <div class="snippet-box">
                  <button class="copy-glyph" type="button" data-copy-target="shared-first-prompt" data-copy-label="Shared first prompt" aria-label="Copy shared first prompt">⧉</button>
                  <textarea id="shared-first-prompt" style="width:100%; min-height: 130px;"></textarea>
                </div>
              </div>
              <div class="span-12">
                <details class="panel disclosure">
                  <summary>Remote or advanced connection options</summary>
                  <div class="panel-grid" style="margin-top: 16px;">
                    <div class="span-4 code-stack">
                      <div class="panel">
                        <div class="section-heading"><div><h2 style="font-size:1.4rem;">Codex HTTP</h2></div></div>
                        <div class="snippet-box">
                          <button class="copy-glyph" type="button" data-copy-target="codex-http-snippet" data-copy-label="Codex HTTP snippet" aria-label="Copy Codex HTTP snippet">⧉</button>
                          <textarea id="codex-http-snippet" style="width:100%; min-height: 110px;"></textarea>
                        </div>
                      </div>
                      <div class="panel">
                        <div class="section-heading"><div><h2 style="font-size:1.4rem;">Gemini HTTP</h2></div></div>
                        <div class="snippet-box">
                          <button class="copy-glyph" type="button" data-copy-target="gemini-http-snippet" data-copy-label="Gemini HTTP snippet" aria-label="Copy Gemini HTTP snippet">⧉</button>
                          <textarea id="gemini-http-snippet" style="width:100%; min-height: 190px;"></textarea>
                        </div>
                      </div>
                      <div class="panel">
                        <div class="section-heading"><div><h2 style="font-size:1.4rem;">Claude HTTP</h2></div></div>
                        <div class="snippet-box">
                          <button class="copy-glyph" type="button" data-copy-target="claude-http-snippet" data-copy-label="Claude HTTP snippet" aria-label="Copy Claude HTTP snippet">⧉</button>
                          <textarea id="claude-http-snippet" style="width:100%; min-height: 170px;"></textarea>
                        </div>
                      </div>
                    </div>
                    <div class="span-4 code-stack">
                      <div class="panel">
                        <div class="section-heading"><div><h2 style="font-size:1.4rem;">Generic HTTP</h2></div></div>
                        <div class="snippet-box">
                          <button class="copy-glyph" type="button" data-copy-target="generic-http-snippet" data-copy-label="Generic HTTP snippet" aria-label="Copy generic HTTP snippet">⧉</button>
                          <textarea id="generic-http-snippet" style="width:100%; min-height: 90px;"></textarea>
                        </div>
                      </div>
                    </div>
                    <div class="span-4 panel">
                      <div class="section-heading">
                        <div>
                          <h2 style="font-size:1.4rem;">HTTP MCP token and check</h2>
                          <p>Use this only when you want a remote bearer-token connection to <code>/mcp</code>.</p>
                        </div>
                      </div>
                      <form id="connect-form" class="form-grid">
                        <div class="field"><label for="connect-client-id">Client ID</label><input id="connect-client-id" type="text" placeholder="keylore-admin-local" /></div>
                        <div class="field"><label for="connect-client-secret">Client Secret</label><input id="connect-client-secret" type="password" placeholder="operator secret" /></div>
                        <div class="field-wide"><label for="mcp-token-export">Export command</label><div class="snippet-box"><button class="copy-glyph" type="button" data-copy-target="mcp-token-export" data-copy-label="MCP export command" aria-label="Copy MCP export command">⧉</button><textarea id="mcp-token-export" style="width:100%; min-height: 90px;"></textarea></div></div>
                        <div class="form-actions field-wide"><button class="button-secondary" type="submit" data-busy-label="Checking MCP..." data-idle-label="Mint token and verify HTTP MCP">Mint token and verify HTTP MCP</button></div>
                      </form>
                      <div id="connect-result" style="margin-top: 18px;"></div>
                    </div>
                  </div>
                </details>
              </div>
            </div>
          </section>

          <div id="advanced-shell" class="advanced-shell" hidden>
            <section id="overview-section" class="panel">
              <div class="section-heading">
                <div>
                  <h2>Overview</h2>
                  <p>Current session status, health, and last operator response.</p>
                </div>
              </div>
              <div id="overview-metrics" class="metric-grid" style="margin-top: 18px;"></div>
              <div class="panel-grid" style="margin-top: 18px;">
                <div class="panel span-6"><div class="section-heading"><div><h2 style="font-size:1.4rem;">Ready</h2></div></div><div id="overview-ready"></div></div>
                <div class="panel span-6"><div class="section-heading"><div><h2 style="font-size:1.4rem;">Last Response</h2></div></div><div id="overview-last-response"></div></div>
              </div>
            </section>

            <section id="tenants-section" class="panel">
              <div class="section-heading">
                <div>
                  <h2>Tenants</h2>
                  <p>Create tenants and toggle their status inside the existing admin contract.</p>
                </div>
              </div>
              <div class="panel-grid">
                <div class="span-5 panel">
                  <form id="tenant-form" class="form-grid">
                    <div class="field"><label for="new-tenant-id">Tenant ID</label><input id="new-tenant-id" type="text" required /></div>
                    <div class="field"><label for="new-tenant-name">Display Name</label><input id="new-tenant-name" type="text" required /></div>
                    <div class="field-wide"><label for="new-tenant-description">Description</label><textarea id="new-tenant-description"></textarea></div>
                    <div class="field"><label for="new-tenant-status">Status</label><select id="new-tenant-status"><option value="active">active</option><option value="disabled">disabled</option></select></div>
                    <div class="form-actions field-wide"><button class="button" type="submit" data-busy-label="Creating tenant..." data-idle-label="Create tenant">Create tenant</button></div>
                  </form>
                </div>
                <div class="span-7 panel"><div id="tenant-list"></div></div>
              </div>
            </section>

            <section id="clients-section" class="panel">
              <div class="section-heading">
                <div>
                  <h2>OAuth Clients</h2>
                  <p>Create, toggle, and rotate operator or tenant clients without exposing secrets twice.</p>
                </div>
              </div>
              <div class="panel-grid">
                <div class="span-5 panel">
                  <form id="auth-client-form" class="form-grid">
                    <div class="field"><label for="new-client-id">Client ID</label><input id="new-client-id" type="text" required /></div>
                    <div class="field"><label for="new-client-name">Display Name</label><input id="new-client-name" type="text" required /></div>
                    <div class="field"><label for="new-client-tenant">Tenant ID</label><input id="new-client-tenant" type="text" value="default" /></div>
                    <div class="field"><label for="new-client-auth-method">Auth Method</label><select id="new-client-auth-method"><option value="client_secret_basic">client_secret_basic</option><option value="client_secret_post">client_secret_post</option><option value="none">none</option></select></div>
                    <div class="field-wide"><label for="new-client-roles">Roles</label><textarea id="new-client-roles">consumer</textarea></div>
                    <div class="field-wide"><label for="new-client-scopes">Allowed Scopes</label><textarea id="new-client-scopes">catalog:read</textarea></div>
                    <div class="field-wide"><label for="new-client-grants">Grant Types</label><textarea id="new-client-grants">client_credentials</textarea></div>
                    <div class="field-wide"><label for="new-client-redirects">Redirect URIs</label><textarea id="new-client-redirects" placeholder="Needed for authorization_code clients."></textarea></div>
                    <div class="field-wide"><label for="new-client-secret">Optional Fixed Secret</label><input id="new-client-secret" type="password" placeholder="Leave empty to generate one automatically." /></div>
                    <div class="form-actions field-wide"><button class="button" type="submit" data-busy-label="Creating client..." data-idle-label="Create OAuth client">Create OAuth client</button></div>
                  </form>
                </div>
                <div class="span-7 code-stack">
                  <div class="panel"><div class="section-heading"><div><h2 style="font-size:1.4rem;">Client Inventory</h2></div></div><div id="auth-client-list"></div></div>
                  <div class="panel"><div class="section-heading"><div><h2 style="font-size:1.4rem;">One-Time Secret Output</h2></div></div><div id="issued-secret"></div></div>
                </div>
              </div>
            </section>

            <section id="approvals-section" class="panel">
              <div class="section-heading">
                <div>
                  <h2>Approvals</h2>
                  <p>Work the review queue without dropping back to the CLI.</p>
                </div>
              </div>
              <div id="approval-list" class="list-stack"></div>
            </section>

            <section id="breakglass-section" class="panel">
              <div class="section-heading">
                <div>
                  <h2>Break Glass</h2>
                  <p>Monitor and review emergency-access requests with the same quorum rules enforced by the API.</p>
                </div>
              </div>
              <div id="breakglass-list" class="list-stack"></div>
            </section>

            <section id="backups-section" class="panel">
              <div class="section-heading">
                <div>
                  <h2>Backups</h2>
                  <p>Export, inspect, and restore logical backups inside the current tenant or global operator scope.</p>
                </div>
              </div>
              <div class="panel-grid">
                <div class="span-5 panel">
                  <div class="panel-actions">
                    <button class="button" id="backup-export" type="button" data-busy-label="Exporting..." data-idle-label="Export backup">Export backup</button>
                    <button class="button-secondary" id="backup-download" type="button">Download last export</button>
                  </div>
                  <div class="panel-actions">
                    <button class="button-secondary" id="backup-inspect" type="button" data-busy-label="Inspecting..." data-idle-label="Inspect pasted backup">Inspect pasted backup</button>
                    <button class="button-danger" id="backup-restore" type="button" data-busy-label="Restoring..." data-idle-label="Restore pasted backup">Restore pasted backup</button>
                  </div>
                  <p class="panel-footnote">Tenant-scoped operators still get tenant-scoped export and restore behavior. Foreign-tenant restore payloads are rejected server-side.</p>
                </div>
                <div class="span-7 panel"><div class="section-heading"><div><h2 style="font-size:1.4rem;">Backup Summary</h2></div></div><div id="backup-summary"></div></div>
                <div class="span-12 panel"><div class="section-heading"><div><h2 style="font-size:1.4rem;">Backup JSON</h2></div></div><textarea id="backup-json" style="width:100%; min-height: 260px;"></textarea></div>
              </div>
            </section>

            <section id="audit-section" class="panel">
              <div class="section-heading">
                <div>
                  <h2>Audit</h2>
                  <p>Recent broker, auth, and operator events in reverse chronological order.</p>
                </div>
              </div>
              <div id="audit-list"></div>
            </section>

            <section id="system-section" class="panel">
              <div class="section-heading">
                <div>
                  <h2>System</h2>
                  <p>Maintenance state, adapters, trace exporter status, traces, and rotation runs.</p>
                </div>
                <div class="toolbar">
                  <button class="button-secondary" id="run-maintenance" type="button" data-busy-label="Running maintenance..." data-idle-label="Run maintenance">Run maintenance</button>
                  <button class="button-secondary" id="flush-traces" type="button" data-busy-label="Flushing..." data-idle-label="Flush trace exporter">Flush trace exporter</button>
                </div>
              </div>
              <div class="panel-grid">
                <div class="span-6 panel"><div class="section-heading"><div><h2 style="font-size:1.4rem;">Maintenance</h2></div></div><div id="maintenance-status"></div></div>
                <div class="span-6 panel"><div class="section-heading"><div><h2 style="font-size:1.4rem;">Trace Exporter</h2></div></div><div id="trace-exporter-status"></div></div>
                <div class="span-6 panel"><div class="section-heading"><div><h2 style="font-size:1.4rem;">Adapters</h2></div></div><div id="adapter-health"></div></div>
                <div class="span-6 panel"><div class="section-heading"><div><h2 style="font-size:1.4rem;">Recent Traces</h2></div></div><div id="recent-traces"></div></div>
                <div class="span-12 panel"><div class="section-heading"><div><h2 style="font-size:1.4rem;">Rotation Runs</h2></div></div><div id="rotation-list"></div></div>
              </div>
            </section>
          </div>
        </div>
      </main>
    </div>

    <script>window.__KEYLORE_ADMIN_CONFIG__ = ${JSON.stringify(config)};</script>
    <script type="module">${adminApp}</script>
  </body>
</html>`;
}
