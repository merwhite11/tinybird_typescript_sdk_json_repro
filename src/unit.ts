/**
 * Unit-level reproduction of the p.json() serialization bug — no token, no
 * network, no deployed pipe required. Matches the minimal repro from the bug
 * report but injects the mock via the SDK's own `fetch` config option instead
 * of clobbering globalThis.fetch.
 *
 * It asserts on the value the SDK actually puts on the wire for a query param:
 *   - object arg           -> "[object Object]"   (the bug: String(value) at api.js:91)
 *   - JSON.stringify(...)   -> '{"foo":1}'          (the correct wire format)
 *
 * Both the low-level createTinybirdApi().query() and the typed client
 * (tinybird.jsonEcho.query) flow through the same String(value) path, so both
 * are exercised here.
 *
 * Run: npm run unit
 */
import { createTinybirdApi, Tinybird } from "@tinybirdco/sdk";
import { pageViews, topPages, jsonEcho } from "../lib/tinybird.ts";

const baseUrl = "https://api.tinybird.co";

// Records every URL the SDK asks fetch to hit, then returns an empty, valid
// query response so .query() resolves without touching the network.
const calls: string[] = [];
const mockFetch = (async (url: string | URL): Promise<Response> => {
  calls.push(url.toString());
  return new Response(JSON.stringify({ meta: [], data: [], rows: 0 }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}) as typeof fetch;

/** Pull the decoded `configOverrides` value out of the last captured request. */
function lastConfigOverrides(): string | null {
  const last = calls.at(-1);
  if (!last) return null;
  return new URL(last).searchParams.get("configOverrides");
}

let failures = 0;
function check(label: string, actual: string | null, expected: string): void {
  const ok = actual === expected;
  if (!ok) failures++;
  console.log(`${ok ? "✅" : "❌"} ${label}`);
  console.log(`     expected configOverrides = ${JSON.stringify(expected)}`);
  console.log(`     actual   configOverrides = ${JSON.stringify(actual)}`);
}

console.log(`Unit repro (mocked fetch, no network) — pipe: json_echo\n`);

// ---------------------------------------------------------------------------
// [1] Low-level API, object arg — the reported bug.
// The type contract (p.json<{foo:number}>()) accepts an object, but the SDK
// serializes it with String(value), producing "[object Object]".
// ---------------------------------------------------------------------------
const api = createTinybirdApi({ token: "x", baseUrl, fetch: mockFetch });
await api.query("json_echo", { configOverrides: { foo: 1 } });
console.log("[1] createTinybirdApi().query('json_echo', { configOverrides: { foo: 1 } })");
// Documents current (buggy) behavior. When the SDK is fixed to JSON.stringify
// JSON params, this expectation should flip to '{"foo":1}'.
check("BUG PRESENT: object is stringified as \"[object Object]\"", lastConfigOverrides(), "[object Object]");

// ---------------------------------------------------------------------------
// [2] Typed client, object arg — same bug, via the interface users write.
// ---------------------------------------------------------------------------
const tinybird = new Tinybird({
  datasources: { pageViews },
  pipes: { topPages, jsonEcho },
  token: "x",
  baseUrl,
  fetch: mockFetch,
});
await tinybird.jsonEcho.query({ configOverrides: { foo: 1 } });
console.log("\n[2] tinybird.jsonEcho.query({ configOverrides: { foo: 1 } })  (typed client)");
check("BUG PRESENT: typed client flows through the same path", lastConfigOverrides(), "[object Object]");

// ---------------------------------------------------------------------------
// [3] Workaround — hand-serialize to the JSON string the server expects.
// ---------------------------------------------------------------------------
await api.query("json_echo", { configOverrides: JSON.stringify({ foo: 1 }) });
console.log("\n[3] createTinybirdApi().query('json_echo', { configOverrides: JSON.stringify({ foo: 1 }) })");
check("WORKAROUND: JSON string reaches the wire intact", lastConfigOverrides(), '{"foo":1}');

console.log(
  `\n${failures === 0 ? "All assertions held." : `${failures} assertion(s) failed.`}` +
    ` If [1]/[2] start failing with actual='{\"foo\":1}', the SDK bug is fixed.`
);

// Exit non-zero only if reality diverged from what we asserted, so this can
// gate CI: today it passes (bug reproduced), and it will start failing the day
// the SDK changes behavior — a signal to update these expectations.
process.exit(failures === 0 ? 0 : 1);
