import test from "node:test";
import assert from "node:assert/strict";

type FetchCall = {
  method: string;
  url: string;
  body: string | null;
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json"
    }
  });
}

test("auto-release recovers stale handed_off cases even when thread status was never locked", async () => {
  process.env.SUPABASE_URL = "https://supabase.test";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://supabase.test";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-test";
  delete process.env.CRON_SECRET;

  const calls: FetchCall[] = [];
  const originalFetch = global.fetch;

  global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    const url = String(input);
    const body = typeof init?.body === "string" ? init.body : null;

    calls.push({ method, url, body });

    if (url.includes("/rest/v1/conversation_threads") && method === "GET") {
      return jsonResponse([]);
    }

    if (url.includes("/rest/v1/service_cases") && method === "GET") {
      return jsonResponse([
        {
          id: "case-stuck-001",
          thread_id: "thread-open-001",
          updated_at: "2026-04-25T10:00:00.000Z"
        }
      ]);
    }

    if (url.includes("/rest/v1/conversation_messages") && method === "GET") {
      return jsonResponse([]);
    }

    if (
      (url.includes("/rest/v1/conversation_threads") && method === "PATCH") ||
      (url.includes("/rest/v1/admin_handoffs") && method === "PATCH") ||
      (url.includes("/rest/v1/service_cases") && method === "PATCH") ||
      (url.includes("/rest/v1/audit_logs") && method === "POST")
    ) {
      return jsonResponse([]);
    }

    throw new Error(`Unexpected fetch: ${method} ${url}`);
  }) as typeof fetch;

  try {
    const { POST } = await import("./route");
    const response = await POST(new Request("http://localhost/api/admin/auto-release-stale", { method: "POST" }));
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.ok, true);
    assert.equal(payload.released, 1);
    assert.deepEqual(payload.released_thread_ids, ["thread-open-001"]);

    assert.ok(
      calls.some(
        (call) => call.method === "GET" && call.url.includes("/rest/v1/service_cases")
      ),
      "expected auto-release to scan stale handed_off cases too"
    );
    assert.ok(
      calls.some(
        (call) =>
          call.method === "PATCH" &&
          call.url.includes("/rest/v1/service_cases") &&
          call.url.includes("thread_id=eq.thread-open-001") &&
          call.url.includes("lead_status=eq.handed_off")
      ),
      "expected stale handed_off case to be closed"
    );
  } finally {
    global.fetch = originalFetch;
  }
});
