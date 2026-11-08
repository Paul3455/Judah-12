export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  get isOffline() {
    return this.code === 'network' || this.status === 0;
  }

  fieldErrors() {
    return this.details?.fields || null;
  }
}

let refreshPromise = null;

async function refreshSession() {
  if (refreshPromise) return refreshPromise;
  const attempt = (async () => {
    try {
      const response = await fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' });
      return response.ok;
    } catch {
      return false;
    }
  })();
  refreshPromise = attempt;
  attempt.finally(() => {
    if (refreshPromise === attempt) refreshPromise = null;
  });
  return attempt;
}

async function request(path, { method = 'GET', body, retry = true } = {}) {
  let response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      credentials: 'include',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'network', 'No connection. Check your network and try again.', null);
  }

  if (response.status === 401 && retry && !path.startsWith('/auth/login') && !path.startsWith('/auth/refresh')) {
    const refreshed = await refreshSession();
    if (refreshed) return request(path, { method, body, retry: false });
  }

  if (response.status === 204) return null;

  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json') ? await response.json().catch(() => null) : null;

  if (!response.ok) {
    const error = payload?.error || {};
    throw new ApiError(
      response.status,
      error.code || 'request_failed',
      error.message || `Request failed (${response.status}).`,
      error.details,
    );
  }
  return payload;
}

export const api = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: 'POST', body }),
  patch: (path, body) => request(path, { method: 'PATCH', body }),
  put: (path, body) => request(path, { method: 'PUT', body }),
  del: (path) => request(path, { method: 'DELETE' }),
};

/** Downloads an export through the browser so httpOnly cookies are sent. */
export function downloadFile(path, filename) {
  const anchor = document.createElement('a');
  anchor.href = `/api${path}`;
  if (filename) anchor.download = filename;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

export function toQueryString(params = {}) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') search.set(key, value);
  }
  const query = search.toString();
  return query ? `?${query}` : '';
}
