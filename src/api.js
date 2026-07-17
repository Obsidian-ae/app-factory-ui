// Tiny API client for the factory orchestrator's HTTP API (src/api/server.js).
const BASE = import.meta.env.VITE_FACTORY_API_URL || "http://localhost:4100";

export async function api(path, opts = {}) {
  const res = await fetch(BASE + path, {
    method: opts.method || "GET",
    headers: opts.body !== undefined ? { "content-type": "application/json" } : {},
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error || "Request failed (" + res.status + ")");
  return body;
}
