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
  margin: 20px 0 0;
  padding: 14px 16px;
  border-radius: 16px;
  border: 1px solid var(--line);
}

.notice.is-visible {
  display: block;
}

.notice.is-info {
  background: rgba(19, 93, 74, 0.08);
  color: var(--accent);
}

.notice.is-error {
  background: rgba(143, 45, 35, 0.09);
  color: var(--danger);
}

.notice.is-warning {
  background: rgba(157, 75, 20, 0.1);
  color: var(--warning);
}

.dashboard {
  display: grid;
  gap: 24px;
  margin-top: 24px;
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

.field-wide textarea {
  min-height: 116px;
  resize: vertical;
  font-family: var(--font-mono);
  font-size: 0.9rem;
  line-height: 1.5;
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

  .metric-grid,
  .form-grid {
    grid-template-columns: 1fr;
  }
}
`;

const adminApp = String.raw`
const config = window.__KEYLORE_ADMIN_CONFIG__;
const state = {
  baseUrl: config.baseUrl,
  resource: config.baseUrl.replace(/\/$/, '') + '/v1',
  localAdminBootstrap: config.localAdminBootstrap || null,
  token: '',
  sessionClientId: '',
  sessionScopes: '',
  sessionTenantId: '',
  busy: false,
  data: {},
  lastBackup: null,
  lastClientSecret: null,
  lastResponse: null
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

function setNotice(kind, message) {
  const node = byId('notice');
  node.className = 'notice is-visible is-' + kind;
  node.textContent = message;
}

function clearNotice() {
  const node = byId('notice');
  node.className = 'notice';
  node.textContent = '';
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
    sessionTenantId: state.sessionTenantId
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
  localStorage.removeItem(storageKey);
  syncSessionFields();
  renderAll();
}

function syncSessionFields() {
  byId('base-url').value = state.baseUrl;
  byId('resource').value = state.resource;
  byId('session-token').value = state.token;
  byId('session-client-id').textContent = state.sessionClientId || 'anonymous token';
  byId('session-scopes').textContent = state.sessionScopes || 'not loaded';
  byId('session-tenant').textContent = state.sessionTenantId || 'global operator';
  byId('session-status').textContent = state.token ? 'Session active' : 'Not connected';
  byId('session-status').className = state.token ? 'state-active' : 'state-warning';
  byId('login-panel').hidden = !!state.token;
  byId('dashboard').hidden = !state.token;
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
  const tenantCount = state.data.tenants && state.data.tenants.ok ? state.data.tenants.data.tenants.length : 0;
  const clientCount = state.data.authClients && state.data.authClients.ok ? state.data.authClients.data.clients.length : 0;
  const pendingApprovals = state.data.approvals && state.data.approvals.ok
    ? state.data.approvals.data.approvals.filter(function(item) { return item.status === 'pending'; }).length
    : 0;
  const activeBreakGlass = state.data.breakGlass && state.data.breakGlass.ok
    ? state.data.breakGlass.data.requests.filter(function(item) { return item.status === 'active'; }).length
    : 0;

  byId('overview-metrics').innerHTML = [
    '<article class="metric-card"><span>Credentials</span><strong>' + escapeHtml(String(ready ? ready.credentials : 'n/a')) + '</strong></article>',
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
  renderAll();
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
  populateLoginDefaults(true);
  byId('pasted-token').value = '';
  await handleLogin();
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
      const target = byId(button.dataset.section);
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });
}

async function initialize() {
  loadPersistedSession();
  bindNavigation();
  byId('base-url').value = state.baseUrl;
  byId('resource').value = state.resource;
  byId('scope-input').value = [
    'catalog:read',
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
  byId('tenant-form').addEventListener('submit', handleCreateTenant);
  byId('auth-client-form').addEventListener('submit', handleCreateClient);
  byId('refresh-dashboard').addEventListener('click', refreshDashboard);
  byId('logout').addEventListener('click', function() {
    clearSession();
    setNotice('info', 'Session cleared.');
  });
  byId('tenant-list').addEventListener('click', handleTenantAction);
  byId('auth-client-list').addEventListener('click', handleClientAction);
  byId('approval-list').addEventListener('click', handleApprovalAction);
  byId('breakglass-list').addEventListener('click', handleBreakGlassAction);
  byId('backup-export').addEventListener('click', handleBackupExport);
  byId('backup-inspect').addEventListener('click', handleBackupInspect);
  byId('backup-restore').addEventListener('click', handleBackupRestore);
  byId('backup-download').addEventListener('click', downloadBackup);
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
    if (state.localAdminBootstrap) {
      setNotice('info', 'Local quickstart is enabled. Use the shortcut to open an admin session immediately.');
    }
  }
}

window.addEventListener('DOMContentLoaded', initialize);
`;

export function renderAdminPage(app: Pick<KeyLoreApp, "config">): string {
  const config = {
    version: app.config.version,
    baseUrl: app.config.publicBaseUrl,
    localAdminBootstrap: app.config.localAdminBootstrap,
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
        <p class="brand-subtitle">A thin operator interface over the frozen REST contract. It stays inside the existing deployment path and never surfaces secret values.</p>
        <nav class="nav-group">
          <button class="nav-button is-active" data-section="overview-section" type="button">Overview</button>
          <button class="nav-button" data-section="tenants-section" type="button">Tenants</button>
          <button class="nav-button" data-section="clients-section" type="button">OAuth Clients</button>
          <button class="nav-button" data-section="approvals-section" type="button">Approvals</button>
          <button class="nav-button" data-section="breakglass-section" type="button">Break Glass</button>
          <button class="nav-button" data-section="backups-section" type="button">Backups</button>
          <button class="nav-button" data-section="audit-section" type="button">Audit</button>
          <button class="nav-button" data-section="system-section" type="button">System</button>
        </nav>
        <p class="helper-copy">Use an existing operator OAuth client with the client credentials flow, or paste an already minted bearer token. The UI reuses the current REST scopes and role checks as-is.</p>
      </aside>
      <main class="content">
        <section class="hero">
          <div>
            <span class="eyebrow">Minimal Admin UI Beta Scope</span>
            <h1>Operate the broker without leaving the release contract.</h1>
            <p class="hero-copy">This UI is intentionally narrow: session bootstrap, tenant and client administration, review queues, backups, audit, and system status. It wraps existing endpoints rather than inventing new backend behavior.</p>
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

        <section id="login-panel" class="panel" style="margin-top: 24px;">
          <div class="section-heading">
            <div>
              <h2>Session</h2>
              <p>Mint an operator token with existing OAuth clients or paste a bearer token directly.</p>
            </div>
          </div>
          ${
            app.config.localAdminBootstrap
              ? `<div class="panel-footnote" style="margin-bottom: 16px;">Local quickstart is enabled on this loopback development instance. Use the shortcut below to open the built-in admin session without editing any configuration.</div>
          <div class="form-actions" style="margin-bottom: 16px;">
            <button class="button-secondary" id="local-login-submit" type="button" data-busy-label="Opening local session..." data-idle-label="Use local admin quickstart">Use local admin quickstart</button>
          </div>`
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
        </section>

        <div id="dashboard" class="dashboard" hidden>
          <section id="overview-section" class="panel">
            <div class="section-heading">
              <div>
                <h2>Overview</h2>
                <p>Current session status, health, and last operator response.</p>
              </div>
              <div class="toolbar">
                <button class="button-secondary" id="refresh-dashboard" type="button" data-busy-label="Refreshing..." data-idle-label="Refresh everything">Refresh everything</button>
                <button class="button-danger" id="logout" type="button">Clear session</button>
              </div>
            </div>
            <div class="session-line">
              <span id="session-status" class="state-warning">Not connected</span>
              <span class="pill"><strong>Client</strong> <span id="session-client-id">anonymous token</span></span>
              <span class="pill"><strong>Tenant</strong> <span id="session-tenant">global operator</span></span>
              <span class="pill"><strong>Scopes</strong> <span id="session-scopes">not loaded</span></span>
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
      </main>
    </div>

    <script>window.__KEYLORE_ADMIN_CONFIG__ = ${JSON.stringify(config)};</script>
    <script type="module">${adminApp}</script>
  </body>
</html>`;
}
