export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly body: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

/** Status 0 means the request never reached the server. */
export function isNetworkError(err: unknown): boolean {
  return err instanceof ApiError && err.status === 0;
}

export async function api<T = unknown>(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method: init.method ?? (init.body === undefined ? 'GET' : 'POST'),
      headers: init.body === undefined ? undefined : { 'content-type': 'application/json' },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      credentials: 'same-origin',
      cache: 'no-store',
    });
  } catch {
    throw new ApiError(0, 'Could not reach the server.');
  }
  if (res.status === 204) return undefined as T;
  let body: Record<string, unknown> = {};
  try {
    body = (await res.json()) as Record<string, unknown>;
  } catch {
    // Non-JSON (e.g. proxy error page).
  }
  if (!res.ok) {
    const message = typeof body.error === 'string' ? body.error : `Request failed (${res.status}).`;
    throw new ApiError(res.status, message, body);
  }
  return body as T;
}
