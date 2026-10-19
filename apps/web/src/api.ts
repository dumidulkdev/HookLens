export const API_URL =
  (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:3000';

export interface Endpoint {
  id: string;
  webhookUrl: string;
  managementToken: string;
  expiresAt: string;
}
export interface RequestSummary {
  id: string;
  endpointId: string;
  method: string;
  contentType: string | null;
  receivedAt: string;
  sourceIp: string | null;
}
export interface RequestDetail extends RequestSummary {
  headers: Record<string, unknown>;
  query: Record<string, unknown>;
  bodyBase64: string;
  bodyText: string | null;
  bodySize: number;
}
export interface RequestPage {
  items: RequestSummary[];
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
}
export interface DeletedEvent {
  endpointId: string;
  requestIds: string[];
  cleared: boolean;
}
export interface ExpiredEvent {
  endpointId: string;
  reason: 'expired' | 'deleted';
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function api<T>(
  path: string,
  endpoint?: Endpoint,
  options: RequestInit = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  if (endpoint) headers.set('Authorization', `Bearer ${endpoint.managementToken}`);
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, { ...options, headers, cache: 'no-store' });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error;
    throw new Error('Cannot reach the API. Check that the backend is running.', { cause: error });
  }
  if (!response.ok) {
    let message = `Request failed (${response.status}).`;
    try {
      const body = (await response.json()) as { message?: unknown };
      if (typeof body.message === 'string') message = body.message;
      else if (Array.isArray(body.message))
        message = body.message
          .filter((item): item is string => typeof item === 'string')
          .join('. ');
    } catch {
      /* Use the safe fallback for non-JSON errors. */
    }
    throw new ApiError(response.status, message);
  }
  return response.status === 204 ? (undefined as T) : (response.json() as Promise<T>);
}
