export class ApiClientError extends Error {
  constructor(
    message: string,
    public status: number,
    public code = "REQUEST_FAILED"
  ) {
    super(message);
  }
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body && !(init.body instanceof FormData)) headers.set("Content-Type", "application/json");
  const response = await fetch(path, { ...init, headers, credentials: "same-origin" });
  const body = await response.json().catch(() => null) as { error?: { code?: string; message?: string } } | null;
  if (!response.ok) {
    throw new ApiClientError(
      body?.error?.message ?? `Request failed with status ${response.status}.`,
      response.status,
      body?.error?.code
    );
  }
  return body as T;
}

export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "The request could not be completed.";
}
