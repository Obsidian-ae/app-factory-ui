// Tiny API client for the factory orchestrator's HTTP API (src/api/server.js).
const BASE = import.meta.env.VITE_FACTORY_API_URL || "http://localhost:4100";
const TOKEN_KEY = "factory_operator_token";

function getToken() {
  let token = localStorage.getItem(TOKEN_KEY);
  if (!token) {
    token = window.prompt("Operator token:") || "";
    if (token) localStorage.setItem(TOKEN_KEY, token);
  }
  return token;
}

export async function api(path, opts = {}) {
  const res = await fetch(BASE + path, {
    method: opts.method || "GET",
    headers: {
      "x-admin-token": getToken(),
      ...(opts.body !== undefined ? { "content-type": "application/json" } : {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  if (res.status === 401) {
    // Stored token is wrong/stale — clear it so the next call re-prompts,
    // rather than silently repeating the same failing request forever.
    localStorage.removeItem(TOKEN_KEY);
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error || "Request failed (" + res.status + ")");
  return body;
}
