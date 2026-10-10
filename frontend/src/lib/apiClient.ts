import { ApiError, type ApiEnvelopeBase, type ApiFailure, type ApiSuccess } from '../types/api';

const BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? 'http://localhost:4000/api/v1';

const TOKEN_STORAGE_KEY = 'klassy.token';

export function getStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setStoredToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_STORAGE_KEY, token);
    else localStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch {
    // localStorage no disponible (modo privado, etc.) - la sesion simplemente no persiste.
  }
}

/** Emitido cuando el servidor responde 401: quien consuma esto debe cerrar la sesion local. */
export const UNAUTHORIZED_EVENT = 'klassy:unauthorized';

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | undefined | null>;
}

function buildUrl(path: string, query?: RequestOptions['query']): string {
  // En Docker BASE_URL es relativa ('/api/v1', nginx la reenvia al backend): se resuelve contra el origen de la pagina.
  const url = new URL(`${BASE_URL}${path}`, window.location.origin);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, String(value));
      }
    }
  }
  return url.toString();
}

/**
 * Ejecuta la peticion y devuelve el envoltorio COMPLETO ({success, data, ...}),
 * no solo `data` — asi cada llamador puede leer tambien `count`, `token` o
 * `user` cuando el endpoint los expone (ej. /auth/login).
 */
async function request<TEnvelope extends ApiEnvelopeBase>(
  path: string,
  options: RequestOptions = {}
): Promise<TEnvelope> {
  const token = getStoredToken();

  const res = await fetch(buildUrl(path, options.query), {
    method: options.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  let json: TEnvelope | ApiFailure | undefined;
  try {
    json = await res.json();
  } catch {
    // respuesta sin cuerpo (poco comun en esta API, pero no debe explotar el cliente)
  }

  if (!res.ok || !json || json.success !== true) {
    const message = json && 'message' in json ? json.message : `Error ${res.status}`;
    if (res.status === 401) {
      window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    }
    throw new ApiError(res.status, message, json && 'details' in json ? json.details : undefined);
  }

  return json;
}

/**
 * Como `request`, pero para `multipart/form-data` (carga de archivos): no
 * serializa el body a JSON ni fuerza el Content-Type (el navegador pone el
 * boundary correcto al mandar un FormData).
 */
async function uploadRequest<TEnvelope extends ApiEnvelopeBase>(path: string, formData: FormData): Promise<TEnvelope> {
  const token = getStoredToken();

  const res = await fetch(buildUrl(path), {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: formData,
  });

  let json: TEnvelope | ApiFailure | undefined;
  try {
    json = await res.json();
  } catch {
    // respuesta sin cuerpo
  }

  if (!res.ok || !json || json.success !== true) {
    const message = json && 'message' in json ? json.message : `Error ${res.status}`;
    if (res.status === 401) {
      window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    }
    throw new ApiError(res.status, message, json && 'details' in json ? json.details : undefined);
  }

  return json;
}

/**
 * Descarga un archivo binario (PDF, imagen) de una ruta autenticada y
 * devuelve un blob URL listo para <a href>/<img src> o window.open. A
 * diferencia de `request`, nunca intenta parsear la respuesta como JSON.
 * Con `method: 'POST'` envía las credenciales en el cuerpo, no en la URL (sitio público).
 */
async function downloadBlob(
  path: string,
  options: { method?: 'GET' | 'POST'; body?: unknown } = {}
): Promise<{ url: string; blob: Blob }> {
  const token = getStoredToken();

  const res = await fetch(buildUrl(path), {
    method: options.method ?? 'GET',
    headers: {
      ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  if (!res.ok) {
    if (res.status === 401) window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    let message = `Error ${res.status}`;
    let details: unknown;
    try {
      const json = (await res.json()) as ApiFailure;
      if (json?.message) message = json.message;
      if (json && 'details' in json) details = json.details;
    } catch {
      // respuesta binaria de error sin cuerpo JSON (poco comun)
    }
    throw new ApiError(res.status, message, details);
  }

  const blob = await res.blob();
  return { url: URL.createObjectURL(blob), blob };
}

/**
 * Helpers "data-only": la forma mas comun (GET lista/detalle, POST/PATCH que
 * devuelven `data`). Usa `request` directamente para endpoints con forma
 * distinta (ej. /auth/login, que trae `token` y `user` junto a `data`).
 */
export const api = {
  get: async <T>(path: string, query?: RequestOptions['query']): Promise<T> => {
    const res = await request<ApiSuccess<T>>(path, { method: 'GET', query });
    return res.data;
  },
  post: async <T>(path: string, body?: unknown): Promise<T> => {
    const res = await request<ApiSuccess<T>>(path, { method: 'POST', body });
    return res.data;
  },
  patch: async <T>(path: string, body?: unknown): Promise<T> => {
    const res = await request<ApiSuccess<T>>(path, { method: 'PATCH', body });
    return res.data;
  },
  put: async <T>(path: string, body?: unknown): Promise<T> => {
    const res = await request<ApiSuccess<T>>(path, { method: 'PUT', body });
    return res.data;
  },
  delete: async <T>(path: string): Promise<T> => {
    const res = await request<ApiSuccess<T>>(path, { method: 'DELETE' });
    return res.data;
  },
  upload: async <T>(path: string, formData: FormData): Promise<T> => {
    const res = await uploadRequest<ApiSuccess<T>>(path, formData);
    return res.data;
  },
  downloadBlob,
  raw: request,
};
