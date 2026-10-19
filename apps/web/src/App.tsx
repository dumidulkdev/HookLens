import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  ArrowUpRight,
  Check,
  Clock3,
  Code2,
  Copy,
  ListFilter,
  Plus,
  Radio,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Webhook,
  X,
} from 'lucide-react';
import { API_URL } from './api';
import type { RequestDetail, RequestSummary } from './api';
import { useInspector } from './use-inspector';

const TABS = ['Overview', 'Headers', 'Query', 'Body'] as const;
type Tab = (typeof TABS)[number];
type BodyMode = 'formatted' | 'raw' | 'base64';

const time = (value: string) => new Date(value).toLocaleTimeString([], { hour12: false });
const fullTime = (value: string) => new Date(value).toLocaleString();
const pretty = (value: unknown) => JSON.stringify(value, null, 2);

function formatBody(text: string): string {
  try {
    return pretty(JSON.parse(text));
  } catch {
    return text;
  }
}

function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!copied && !failed) return;
    const timer = setTimeout(() => {
      setCopied(false);
      setFailed(false);
    }, 2000);
    return () => clearTimeout(timer);
  }, [copied, failed]);

  return (
    <button
      className="button secondary compact"
      onClick={() => {
        void navigator.clipboard
          .writeText(text)
          .then(() => setCopied(true))
          .catch(() => setFailed(true));
      }}
      aria-label={`${label} to clipboard`}
    >
      {copied ? <Check size={14} /> : <Copy size={14} />}
      <span>{copied ? 'Copied' : failed ? 'Copy manually' : label}</span>
    </button>
  );
}

function ConnectionStatus({ connection }: { connection: string }) {
  const tone = connection === 'Live' ? 'live' : connection === 'Connecting' || connection === 'Authorizing'
    ? 'pending'
    : connection === 'Offline'
      ? 'offline'
      : 'warning';
  const label = connection === 'Authorizing' ? 'Authorizing' : connection;

  return (
    <span className={`connection ${tone}`} role="status">
      <span className="status-dot" /> {label}
    </span>
  );
}

function EndpointPanel({
  endpoint,
  connection,
}: {
  endpoint: ReturnType<typeof useInspector>['endpoint'];
  connection: string;
}) {
  const curl = endpoint
    ? `curl -X POST '${endpoint.webhookUrl}' -H 'Content-Type: application/json' --data-binary '{"event":"hello","source":"hooklens"}'`
    : '';

  return (
    <section className="endpoint-panel" aria-label="Webhook endpoint">
      <div className="endpoint-heading">
        <div className="endpoint-label">
          <Radio size={15} />
          <span>Endpoint</span>
        </div>
        {endpoint ? <ConnectionStatus connection={connection} /> : <span className="connection offline">No endpoint</span>}
      </div>
      <div className="endpoint-row">
        <span className="any-method">ANY</span>
        <code className={`endpoint-url ${endpoint ? 'active' : ''}`}>
          {endpoint?.webhookUrl ?? 'Generate an endpoint to start receiving requests'}
        </code>
        {endpoint && <CopyButton text={endpoint.webhookUrl} label="Copy URL" />}
        {!endpoint && <span className="expiry-hint">Endpoints expire after 24 hours</span>}
      </div>
      {endpoint && (
        <div className="endpoint-footer">
          <span className="expiry"><Clock3 size={14} /> Expires {fullTime(endpoint.expiresAt)}</span>
          <span className="retention">256 KiB per request <span aria-hidden="true">·</span> 100 requests retained</span>
          <div className="curl-command">
            <Code2 size={14} />
            <code>{curl}</code>
            <CopyButton text={curl} label="Copy curl" />
          </div>
        </div>
      )}
    </section>
  );
}

function RequestList({
  items,
  selectedId,
  onSelect,
  loading,
  endpointActive,
  method,
  setMethod,
  connection,
  refresh,
  clear,
  busy,
}: {
  items: RequestSummary[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  loading: boolean;
  endpointActive: boolean;
  method: string;
  setMethod: (method: string) => void;
  connection: string;
  refresh: () => void;
  clear: () => void;
  busy: boolean;
}) {
  return (
    <aside className="request-panel" aria-label="Captured requests">
      <div className="panel-title">
        <h2>Requests <span className="count">{items.length}</span></h2>
        <div className="panel-actions">
          <button className="icon-button" disabled={!endpointActive || loading} onClick={refresh} aria-label="Refresh request history" title="Refresh requests">
            <RefreshCw size={16} />
          </button>
          <button className="icon-button" disabled={!items.length || busy} onClick={clear} aria-label="Clear request history" title="Clear history">
            <Trash2 size={16} />
          </button>
        </div>
      </div>
      <div className="filter-row">
        <ListFilter size={15} />
        <label htmlFor="method-filter">Method</label>
        <select id="method-filter" aria-label="Filter by HTTP method" value={method} onChange={(event) => setMethod(event.target.value)} disabled={!endpointActive}>
          {['ALL', 'GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map((value) => (
            <option key={value} value={value}>{value === 'ALL' ? 'All methods' : value}</option>
          ))}
        </select>
        <span className="sort-label">{loading ? 'Loading…' : 'Newest first'}</span>
      </div>
      <div className="request-list" aria-busy={loading}>
        {items.length ? items.map((item) => (
          <button
            key={item.id}
            className={`request-item ${selectedId === item.id ? 'selected' : ''}`}
            onClick={() => onSelect(item.id)}
            aria-label={`${item.method} request ${item.id}`}
            aria-pressed={selectedId === item.id}
          >
            <span className="request-item-top">
              <span className={`method ${item.method.toLowerCase()}`}>{item.method}</span>
              <time dateTime={item.receivedAt}>{time(item.receivedAt)}</time>
            </span>
            <span className="request-item-type">{item.contentType?.split(';')[0] ?? 'No content type'}</span>
            <code className="request-id">{item.id.slice(0, 8)}…</code>
          </button>
        )) : (
          <div className="list-empty">
            <strong>{loading ? 'Loading requests…' : method !== 'ALL' && endpointActive ? 'No matching requests' : endpointActive ? 'Waiting for requests' : 'No endpoint yet'}</strong>
            <p>
              {endpointActive
                ? method !== 'ALL'
                  ? 'Try another method filter or clear the filter.'
                  : 'Send a request to your endpoint. New captures appear here.'
                : 'Generate an endpoint to start capturing webhook requests.'}
            </p>
            {endpointActive && <span className="waiting"><span className="status-dot" />{connection === 'Live' ? 'Listening for requests' : connection}</span>}
          </div>
        )}
      </div>
      <div className="list-footer"><ShieldCheck size={14} /> Access is limited to this browser tab</div>
    </aside>
  );
}

function EmptyDetail({ endpointActive }: { endpointActive: boolean }) {
  return (
    <div className="detail-empty">
      <h2>{endpointActive ? 'Waiting for the first request' : 'Choose an endpoint to begin'}</h2>
      <p>{endpointActive ? 'Send any HTTP request to your endpoint. Its headers, query parameters, and payload will appear here.' : 'Generate a temporary endpoint, send it a request, and inspect the full delivery.'}</p>
      {endpointActive && <span className="empty-hint"><span className="status-dot" /> New requests appear in the inbox</span>}
    </div>
  );
}

function Inspector({
  detail,
  tab,
  setTab,
  loading,
  onBack,
}: {
  detail: RequestDetail;
  tab: Tab;
  setTab: (tab: Tab) => void;
  loading: boolean;
  onBack: () => void;
}) {
  const [bodyMode, setBodyMode] = useState<BodyMode>('formatted');
  const actualMode = detail.bodyText === null ? 'base64' : bodyMode;
  const body = actualMode === 'base64'
    ? detail.bodyBase64
    : actualMode === 'raw'
      ? (detail.bodyText ?? '')
      : formatBody(detail.bodyText ?? '');

  return (
    <>
      <div className="detail-heading">
        <div className="detail-title">
          <button className="mobile-back" onClick={onBack} aria-label="Back to requests"><ArrowLeft size={16} /></button>
          <span className={`method ${detail.method.toLowerCase()}`}>{detail.method}</span>
          <strong>Request details</strong>
        </div>
        <span className="received-at">{loading ? 'Updating…' : fullTime(detail.receivedAt)}</span>
      </div>
      <div className="tabs" role="tablist" aria-label="Request details">
        {TABS.map((item) => (
          <button key={item} id={`tab-${item.toLowerCase()}`} role="tab" aria-controls="detail-content" aria-selected={tab === item} className={tab === item ? 'active' : ''} onClick={() => setTab(item)}>
            {item}
            {item === 'Headers' && <span>{Object.keys(detail.headers).length}</span>}
            {item === 'Query' && <span>{Object.keys(detail.query).length}</span>}
          </button>
        ))}
      </div>
      <div className="detail-content" id="detail-content" role="tabpanel" aria-labelledby={`tab-${tab.toLowerCase()}`}>
        {tab === 'Overview' && <>
          <div className="section-heading">Request overview</div>
          <dl className="overview">
            {[
              ['Request ID', detail.id],
              ['Received', fullTime(detail.receivedAt)],
              ['Method', detail.method],
              ['Content type', detail.contentType ?? 'Not supplied'],
              ['Source IP', detail.sourceIp ?? 'Unavailable'],
              ['Body size', `${detail.bodySize.toLocaleString()} bytes`],
            ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
          </dl>
          <div className="section-heading payload-heading">Payload preview</div>
          <pre className="code-block">{detail.bodyText === null ? 'Binary or encoded body. Open Body to inspect the exact Base64 bytes.' : formatBody(detail.bodyText) || '(empty body)'}</pre>
        </>}
        {(tab === 'Headers' || tab === 'Query') && <>
          <div className="code-toolbar">
            <span className="section-heading">{tab === 'Headers' ? 'Request headers' : 'Query parameters'}</span>
            <CopyButton text={pretty(tab === 'Headers' ? detail.headers : detail.query)} />
          </div>
          <pre className="code-block">{pretty(tab === 'Headers' ? detail.headers : detail.query)}</pre>
        </>}
        {tab === 'Body' && <>
          <div className="code-toolbar">
            <div className="segmented" aria-label="Body view">
              {(['formatted', 'raw', 'base64'] as const).map((mode) => <button key={mode} className={actualMode === mode ? 'active' : ''} disabled={detail.bodyText === null && mode !== 'base64'} aria-pressed={actualMode === mode} onClick={() => setBodyMode(mode)}>
                {mode === 'base64' ? 'Base64' : mode === 'raw' ? 'Raw text' : 'Formatted'}
              </button>)}
            </div>
            <CopyButton text={body} />
          </div>
          {detail.bodyText === null && <p className="body-note">Binary or non-UTF-8 content. Base64 preserves the received bytes.</p>}
          <pre className="code-block body-code">{body || '(empty body)'}</pre>
          <div className="body-footer">{detail.bodySize.toLocaleString()} bytes <span>·</span> {actualMode === 'base64' ? 'Base64 encoding' : 'UTF-8 text'}</div>
        </>}
      </div>
    </>
  );
}

export default function App() {
  const inspector = useInspector();
  const [tab, setTab] = useState<Tab>('Overview');
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  const { endpoint, items, detail, connection, busy } = inspector;

  useEffect(() => {
    if (!endpoint) setMobileDetailOpen(false);
  }, [endpoint]);

  return (
    <div className="app-shell">
      <header className="site-header">
        <div className="header-inner">
          <a href="/" className="brand" aria-label="HookLens home"><Webhook size={19} /> <span>HookLens</span></a>
          <span className="header-divider" />
          <span className="header-context">Webhook inspector</span>
          <a className="docs-link" href={`${API_URL}/api/docs`} target="_blank" rel="noreferrer">API docs <ArrowUpRight size={13} /></a>
        </div>
      </header>
      <main className="workspace">
        <div className="workspace-heading">
          <div>
            <h1>Webhook inspector</h1>
            <p>Capture and inspect incoming HTTP requests.</p>
          </div>
          <button className="button primary" disabled={busy} onClick={() => { void inspector.generate(); }}>
            <Plus size={16} /> {busy ? 'Creating…' : endpoint ? 'New endpoint' : 'Generate endpoint'}
          </button>
        </div>

        {inspector.error && <div className="error-banner" role="alert"><span>{inspector.error}</span><button onClick={() => inspector.setError(null)} aria-label="Dismiss error"><X size={16} /></button></div>}

        <EndpointPanel endpoint={endpoint} connection={connection} />

        <section className={`inspector-grid ${mobileDetailOpen ? 'mobile-detail-open' : ''}`} aria-label="Request inspector">
          <RequestList
            items={items}
            selectedId={inspector.selectedId}
            onSelect={(id) => { inspector.setSelectedId(id); setMobileDetailOpen(true); }}
            loading={inspector.loading}
            endpointActive={Boolean(endpoint)}
            method={inspector.method}
            setMethod={inspector.setMethod}
            connection={connection}
            refresh={inspector.refresh}
            clear={() => { void inspector.clear(); }}
            busy={busy}
          />
          <section className="detail-panel" aria-label="Selected request details">
            {detail ? <Inspector detail={detail} tab={tab} setTab={setTab} loading={inspector.detailLoading} onBack={() => setMobileDetailOpen(false)} /> : <EmptyDetail endpointActive={Boolean(endpoint)} />}
          </section>
        </section>

        <div className="security-note">
          <ShieldCheck size={15} />
          <p>Access stays in this tab and expires with the endpoint.<br className="mobile-break" /> Use test data; avoid production secrets.</p>
          {endpoint && <button className="text-button danger" disabled={busy} onClick={() => { void inspector.remove(); }}>Delete endpoint</button>}
        </div>
        <footer className="site-footer"><span><Webhook size={14} /> HookLens</span><span>Temporary endpoints · 24 hour expiry</span></footer>
      </main>
    </div>
  );
}
