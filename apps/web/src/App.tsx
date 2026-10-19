import { useEffect, useState } from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Braces,
  Check,
  ChevronRight,
  Clock3,
  Copy,
  Code2,
  Inbox,
  ListFilter,
  Plus,
  Radio,
  RefreshCw,
  ShieldCheck,
  Terminal,
  Trash2,
  Webhook,
  X,
} from 'lucide-react';
import { API_URL } from './api';
import type { RequestDetail } from './api';
import { useInspector } from './use-inspector';

const TABS = ['Overview', 'Headers', 'Query', 'Body'] as const;
type Tab = (typeof TABS)[number];
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
      {copied ? <Check size={14} /> : <Copy size={14} />}{' '}
      {copied ? 'Copied' : failed ? 'Select and copy manually' : label}
    </button>
  );
}

function Inspector({
  detail,
  tab,
  setTab,
  loading,
}: {
  detail: RequestDetail;
  tab: Tab;
  setTab: (tab: Tab) => void;
  loading: boolean;
}) {
  const [bodyMode, setBodyMode] = useState<'formatted' | 'raw' | 'base64'>('formatted');
  const actualMode = detail.bodyText === null ? 'base64' : bodyMode;
  const body =
    actualMode === 'base64'
      ? detail.bodyBase64
      : actualMode === 'raw'
        ? (detail.bodyText ?? '')
        : formatBody(detail.bodyText ?? '');
  return (
    <>
      <div className="detail-heading">
        <div className="detail-title">
          <span className={`method ${detail.method.toLowerCase()}`}>{detail.method}</span>
          <strong>Request details</strong>
        </div>
        <span className="muted text-xs">{loading ? 'Updating…' : fullTime(detail.receivedAt)}</span>
      </div>
      <div className="tabs" role="tablist" aria-label="Request details">
        {TABS.map((item) => (
          <button
            key={item}
            role="tab"
            aria-selected={tab === item}
            className={tab === item ? 'active' : ''}
            onClick={() => setTab(item)}
          >
            {item}
            {item === 'Headers' && <span>{Object.keys(detail.headers).length}</span>}
            {item === 'Query' && <span>{Object.keys(detail.query).length}</span>}
          </button>
        ))}
      </div>
      <div className="detail-content" role="tabpanel" aria-label={tab}>
        {tab === 'Overview' && (
          <>
            <div className="section-label">REQUEST OVERVIEW</div>
            <dl className="overview">
              {[
                ['Request ID', detail.id],
                ['Received', fullTime(detail.receivedAt)],
                ['Method', detail.method],
                ['Content type', detail.contentType ?? 'Not supplied'],
                ['Source IP', detail.sourceIp ?? 'Unavailable'],
                ['Body size', `${detail.bodySize.toLocaleString()} bytes`],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
            <div className="section-label mt-7">PAYLOAD PREVIEW</div>
            <pre className="code-block">
              {detail.bodyText === null
                ? 'Binary or encoded body. Open Body to inspect the exact Base64 bytes.'
                : formatBody(detail.bodyText) || '(empty body)'}
            </pre>
          </>
        )}
        {(tab === 'Headers' || tab === 'Query') && (
          <>
            <div className="code-toolbar">
              <span className="section-label">
                {tab === 'Headers' ? 'REQUEST HEADERS' : 'QUERY PARAMETERS'}
              </span>
              <CopyButton text={pretty(tab === 'Headers' ? detail.headers : detail.query)} />
            </div>
            <pre className="code-block">
              {pretty(tab === 'Headers' ? detail.headers : detail.query)}
            </pre>
          </>
        )}
        {tab === 'Body' && (
          <>
            <div className="code-toolbar">
              <div className="segmented" aria-label="Body view">
                {(['formatted', 'raw', 'base64'] as const).map((mode) => (
                  <button
                    key={mode}
                    className={actualMode === mode ? 'active' : ''}
                    disabled={detail.bodyText === null && mode !== 'base64'}
                    onClick={() => setBodyMode(mode)}
                  >
                    {mode === 'base64' ? 'Base64' : mode === 'raw' ? 'Raw text' : 'Formatted'}
                  </button>
                ))}
              </div>
              <CopyButton text={body} />
            </div>
            {detail.bodyText === null && (
              <p className="body-note">
                Binary, encoded, or non-UTF-8 content. Base64 preserves the exact received bytes.
              </p>
            )}
            <pre className="code-block body-code">{body || '(empty body)'}</pre>
            <div className="body-footer">
              {detail.bodySize.toLocaleString()} bytes <span>·</span>{' '}
              {actualMode === 'base64' ? 'Base64 encoding' : 'UTF-8 text'}
            </div>
          </>
        )}
      </div>
    </>
  );
}

export default function App() {
  const inspector = useInspector();
  const [tab, setTab] = useState<Tab>('Overview');
  const { endpoint, items, detail, connection, busy } = inspector;
  const curl = endpoint
    ? `curl -X POST '${endpoint.webhookUrl}' -H 'Content-Type: application/json' --data-binary '{"event":"hello","source":"hooklens"}'`
    : '';

  return (
    <div className="app-shell">
      <header className="site-header">
        <div className="header-inner">
          <a href="/" className="brand" aria-label="HookLens home">
            <span className="brand-icon">
              <Webhook size={21} strokeWidth={1.7} />
            </span>
            HookLens<span className="version">v0.1</span>
          </a>
          <span className="header-subtitle">A little clarity for your webhooks.</span>
          <a
            className="github-link"
            href="https://github.com/"
            target="_blank"
            rel="noreferrer"
            title="GitHub repository placeholder"
          >
            <Code2 size={16} /> GitHub <ArrowUpRight size={12} />
          </a>
        </div>
      </header>
      <main className="workspace">
        <div className="page-heading">
          <div>
            <div className="eyebrow">
              <span className="tiny-square" /> DEVELOPER TOOLS
            </div>
            <h1>Webhook inspector</h1>
            <p>Catch requests. Inspect payloads. Keep building.</p>
          </div>
          <button
            className="button primary"
            disabled={busy}
            onClick={() => {
              void inspector.generate();
            }}
          >
            <Plus size={16} /> {busy ? 'Working…' : endpoint ? 'New webhook' : 'Generate webhook'}
          </button>
        </div>
        {inspector.error && (
          <div className="error-banner" role="alert">
            <span>{inspector.error}</span>
            <button onClick={() => inspector.setError(null)} aria-label="Dismiss error">
              <X size={16} />
            </button>
          </div>
        )}
        <section className="endpoint-card" aria-label="Webhook endpoint">
          <div className="endpoint-top">
            <div className="section-label">
              <Radio size={13} /> YOUR WEBHOOK ENDPOINT
            </div>
            <span className={`connection ${connection === 'Live' ? 'live' : ''}`} role="status">
              <span className="status-dot" /> {endpoint ? connection : 'No active endpoint'}
            </span>
          </div>
          <div className="url-row">
            <span className="any-method">ANY</span>
            <code className={endpoint ? 'url active-url' : 'url'}>
              {endpoint?.webhookUrl ?? 'Generate a unique URL to start listening'}
            </code>
            {endpoint && <CopyButton text={endpoint.webhookUrl} label="Copy URL" />}
          </div>
          <div className="endpoint-meta">
            <span>
              <Clock3 size={13} />
              {endpoint
                ? `Expires ${fullTime(endpoint.expiresAt)}`
                : 'Temporary by design. Each endpoint lasts 24 hours.'}
            </span>
            <span className="retention-note">
              256 KiB per request <span className="separator">/</span> 100 requests retained
            </span>
          </div>
        </section>
        {endpoint && (
          <div className="quickstart">
            <Terminal size={15} />
            <span>Give it a try</span>
            <code>curl -X POST '{endpoint.webhookUrl}' -d 'hello'</code>
            <CopyButton text={curl} label="Copy curl" />
          </div>
        )}
        <section className="inspector-grid" aria-label="Request inspector">
          <aside className="request-panel">
            <div className="panel-title">
              <h2>
                Requests <span className="count">{items.length}</span>
              </h2>
              <div className="panel-actions">
                <button
                  className="icon-button"
                  disabled={!endpoint || inspector.loading}
                  onClick={inspector.refresh}
                  aria-label="Refresh request history"
                  title="Refresh history"
                >
                  <RefreshCw size={14} />
                </button>
                <button
                  className="icon-button"
                  disabled={!items.length || busy}
                  onClick={() => {
                    void inspector.clear();
                  }}
                  aria-label="Clear request history"
                  title="Clear history"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
            <div className="filter-row">
              <ListFilter size={14} />
              <select
                aria-label="Filter by HTTP method"
                value={inspector.method}
                onChange={(event) => inspector.setMethod(event.target.value)}
                disabled={!endpoint}
              >
                {['ALL', 'GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map((method) => (
                  <option key={method} value={method}>
                    {method === 'ALL' ? 'All methods' : method}
                  </option>
                ))}
              </select>
              <span>{inspector.loading ? 'Loading…' : 'Newest first'}</span>
            </div>
            <div
              className="request-list"
              aria-label="Captured requests"
              aria-busy={inspector.loading}
            >
              {items.length ? (
                items.map((item) => (
                  <button
                    key={item.id}
                    className={`request-item ${inspector.selectedId === item.id ? 'selected' : ''}`}
                    onClick={() => inspector.setSelectedId(item.id)}
                    aria-label={`${item.method} request ${item.id}`}
                    aria-pressed={inspector.selectedId === item.id}
                  >
                    <div className="request-item-top">
                      <span className={`method ${item.method.toLowerCase()}`}>{item.method}</span>
                      <time dateTime={item.receivedAt}>{time(item.receivedAt)}</time>
                      <ChevronRight size={13} />
                    </div>
                    <div className="request-item-type">
                      {item.contentType?.split(';')[0] ?? 'No content type'}
                    </div>
                    <code className="request-id">
                      {item.id.slice(0, 8)}
                      <span>…</span>
                    </code>
                  </button>
                ))
              ) : (
                <div className="list-empty">
                  <Inbox size={25} strokeWidth={1.25} />
                  <strong>{inspector.loading ? 'Loading requests…' : 'No requests yet'}</strong>
                  <p>
                    {endpoint
                      ? inspector.method === 'ALL'
                        ? 'Send a request to your webhook URL. It will appear here, live.'
                        : 'No captures match this method.'
                      : 'Your incoming requests will show up here.'}
                  </p>
                  {endpoint && (
                    <span className="waiting">
                      <span className="status-dot" />{' '}
                      {connection === 'Live' ? 'Listening for requests' : 'Waiting for connection'}
                    </span>
                  )}
                </div>
              )}
            </div>
            <div className="list-footer">
              <ShieldCheck size={12} /> Session access only
            </div>
          </aside>
          <div className="detail-panel">
            {detail ? (
              <Inspector
                detail={detail}
                tab={tab}
                setTab={setTab}
                loading={inspector.detailLoading}
              />
            ) : (
              <div className="detail-empty">
                <div className="empty-mark">
                  <Braces size={29} strokeWidth={1.3} />
                </div>
                <span className="empty-kicker">THE DETAILS ARE IN THE REQUEST</span>
                <h2>
                  {inspector.detailLoading && inspector.selectedId
                    ? 'Opening request…'
                    : endpoint
                      ? 'Ready for your first request'
                      : 'Every request, a little clearer.'}
                </h2>
                <p>
                  {endpoint
                    ? 'Send a webhook to your endpoint, then inspect its headers, query parameters, and body right here.'
                    : 'Create a temporary endpoint to see exactly what your services are sending, in real time.'}
                </p>
                <div className="steps">
                  <span>
                    <span>1</span>Generate a URL
                  </span>
                  <ChevronRight size={12} />
                  <span>
                    <span>2</span>Send a request
                  </span>
                  <ChevronRight size={12} />
                  <span>
                    <span>3</span>Inspect it here
                  </span>
                </div>
                {!endpoint && (
                  <button
                    className="text-button"
                    disabled={busy}
                    onClick={() => {
                      void inspector.generate();
                    }}
                  >
                    Create your first webhook <ArrowUpRight size={14} />
                  </button>
                )}
                {endpoint && (
                  <div className="empty-hint">
                    <ArrowDownLeft size={14} /> Your captures appear in the request list
                  </div>
                )}
              </div>
            )}
          </div>
        </section>
        <div className="security-note">
          <ShieldCheck size={15} />
          <p>
            The management token grants access to captured data and is kept in this tab’s session
            storage. Closing the tab removes access. Use temporary test data; never send production
            secrets.
          </p>
          {endpoint && (
            <button
              className="text-button danger"
              disabled={busy}
              onClick={() => {
                void inspector.remove();
              }}
            >
              Delete endpoint
            </button>
          )}
        </div>
        <footer className="site-footer">
          <span>
            <Webhook size={13} /> HookLens <span className="muted">/</span> Built for the in-between
            moments.
          </span>
          <a href={`${API_URL}/api/docs`} target="_blank" rel="noreferrer">
            API documentation <ArrowUpRight size={12} />
          </a>
        </footer>
      </main>
    </div>
  );
}
