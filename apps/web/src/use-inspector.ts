import { useCallback, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { API_URL, ApiError, api } from './api';
import type {
  DeletedEvent,
  Endpoint,
  ExpiredEvent,
  RequestDetail,
  RequestPage,
  RequestSummary,
} from './api';

const SESSION_KEY = 'hooklens.endpoint';

function restoreSession(): Endpoint | null {
  try {
    const saved = sessionStorage.getItem(SESSION_KEY);
    if (!saved) return null;
    const endpoint = JSON.parse(saved) as Partial<Endpoint> | null;
    if (
      endpoint &&
      typeof endpoint.id === 'string' &&
      typeof endpoint.managementToken === 'string' &&
      /^[A-Za-z0-9_-]{43}$/.test(endpoint.managementToken) &&
      typeof endpoint.webhookUrl === 'string' &&
      typeof endpoint.expiresAt === 'string' &&
      new Date(endpoint.expiresAt).getTime() > Date.now()
    )
      return endpoint as Endpoint;
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* A new endpoint can still be used when session storage is unavailable. */
  }
  return null;
}

export function useInspector() {
  const [endpoint, setEndpoint] = useState<Endpoint | null>(restoreSession);
  const [items, setItems] = useState<RequestSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<RequestDetail | null>(null);
  const [method, setMethod] = useState('ALL');
  const [connection, setConnection] = useState('Offline');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [revision, setRevision] = useState(0);
  const currentEndpoint = useRef(endpoint);
  currentEndpoint.current = endpoint;
  const refresh = useCallback(() => setRevision((value) => value + 1), []);

  const handleError = useCallback((cause: unknown) => {
    if (cause instanceof Error && cause.name === 'AbortError') return;
    setError(cause instanceof Error ? cause.message : 'Something went wrong. Please try again.');
    if (cause instanceof ApiError && [401, 404].includes(cause.status))
      setConnection('Unavailable');
  }, []);

  useEffect(() => {
    try {
      if (endpoint) sessionStorage.setItem(SESSION_KEY, JSON.stringify(endpoint));
      else sessionStorage.removeItem(SESSION_KEY);
    } catch {
      setError('Session storage is unavailable. Access to this endpoint will be lost on reload.');
    }
  }, [endpoint]);

  useEffect(() => {
    if (!endpoint) {
      setConnection('Offline');
      return;
    }
    setConnection('Connecting');
    const socket = io(`${API_URL}/inspector`, { transports: ['websocket'] });
    let active = true;
    socket.on('connect', () => {
      setConnection('Authorizing');
      void socket
        .timeout(5000)
        .emitWithAck('endpoint:subscribe', {
          endpointId: endpoint.id,
          managementToken: endpoint.managementToken,
        })
        .then((ack: { ok: boolean; error?: string }) => {
          if (!active) return;
          if (ack.ok) {
            setConnection('Live');
            refresh();
          } else {
            setConnection('Unavailable');
            setError(ack.error ?? 'Could not subscribe to this endpoint.');
            socket.disconnect();
          }
        })
        .catch(() => {
          if (active) {
            setConnection('Disconnected');
            setError('Live subscription timed out. Try refreshing the page.');
          }
        });
    });
    socket.on('disconnect', () => {
      if (active) setConnection('Disconnected');
    });
    socket.on('connect_error', () => {
      if (active) setConnection('Reconnecting');
    });
    socket.on('request:received', (event: RequestSummary) => {
      if (event.endpointId === endpoint.id) refresh();
    });
    socket.on('request:deleted', (event: DeletedEvent) => {
      if (event.endpointId !== endpoint.id) return;
      if (event.cleared) {
        setItems([]);
        setSelectedId(null);
        setDetail(null);
      }
      refresh();
    });
    socket.on('endpoint:expired', (event: ExpiredEvent) => {
      if (event.endpointId !== endpoint.id) return;
      setEndpoint(null);
      setItems([]);
      setSelectedId(null);
      setDetail(null);
      setError(
        event.reason === 'deleted'
          ? 'This endpoint was deleted.'
          : 'This endpoint has expired. Generate a new one to continue.',
      );
    });
    const expiry = setTimeout(
      () => {
        setEndpoint(null);
        setItems([]);
        setSelectedId(null);
        setDetail(null);
        setError('This endpoint has expired. Generate a new one to continue.');
      },
      Math.max(0, new Date(endpoint.expiresAt).getTime() - Date.now()),
    );
    return () => {
      active = false;
      clearTimeout(expiry);
      socket.disconnect();
    };
  }, [endpoint, refresh]);

  useEffect(() => {
    if (!endpoint) return;
    const abort = new AbortController();
    setLoading(true);
    const filter = method === 'ALL' ? '' : `&method=${method}`;
    void api<RequestPage>(`/api/endpoints/${endpoint.id}/requests?limit=100${filter}`, endpoint, {
      signal: abort.signal,
    })
      .then((page) => {
        if (abort.signal.aborted) return;
        setItems(page.items);
        setSelectedId((current) =>
          page.items.some((item) => item.id === current) ? current : (page.items[0]?.id ?? null),
        );
      })
      .catch(handleError)
      .finally(() => {
        if (!abort.signal.aborted) setLoading(false);
      });
    return () => abort.abort();
  }, [endpoint, method, revision, handleError]);

  useEffect(() => {
    setDetail(null);
    if (!endpoint || !selectedId) return;
    const abort = new AbortController();
    setDetailLoading(true);
    void api<RequestDetail>(`/api/endpoints/${endpoint.id}/requests/${selectedId}`, endpoint, {
      signal: abort.signal,
    })
      .then((data) => {
        if (!abort.signal.aborted) setDetail(data);
      })
      .catch(handleError)
      .finally(() => {
        if (!abort.signal.aborted) setDetailLoading(false);
      });
    return () => abort.abort();
  }, [endpoint, selectedId, revision, handleError]);

  async function generate(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const next = await api<Endpoint>('/api/endpoints', undefined, { method: 'POST' });
      setItems([]);
      setDetail(null);
      setSelectedId(null);
      setMethod('ALL');
      setEndpoint(next);
    } catch (cause) {
      handleError(cause);
    } finally {
      setBusy(false);
    }
  }

  async function clear(): Promise<void> {
    if (!endpoint) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/api/endpoints/${endpoint.id}/requests`, endpoint, { method: 'DELETE' });
      if (currentEndpoint.current?.id === endpoint.id) {
        setItems([]);
        setSelectedId(null);
        setDetail(null);
        refresh();
      }
    } catch (cause) {
      handleError(cause);
    } finally {
      setBusy(false);
    }
  }

  async function remove(): Promise<void> {
    if (!endpoint) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/api/endpoints/${endpoint.id}`, endpoint, { method: 'DELETE' });
      setEndpoint(null);
      setItems([]);
      setSelectedId(null);
      setDetail(null);
    } catch (cause) {
      handleError(cause);
    } finally {
      setBusy(false);
    }
  }

  return {
    endpoint,
    items,
    selectedId,
    setSelectedId,
    detail,
    method,
    setMethod,
    connection,
    error,
    setError,
    busy,
    loading,
    detailLoading,
    generate,
    clear,
    remove,
    refresh,
  };
}
