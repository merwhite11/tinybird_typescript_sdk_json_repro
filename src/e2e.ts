/**
 * End-to-end reproduction against the REAL deployed `json_echo` endpoint.
 *
 * Requires TINYBIRD_TOKEN + TINYBIRD_URL in the environment (the run script
 * injects the current Tinybird branch token). The endpoint is defined in
 * lib/tinybird.ts and deployed via `tinybird build` (branch) / `tinybird deploy`.
 *
 * Demonstrates:
 *   [1] Typed client with an object arg  -> server rejects "[object Object]"
 *   [2] Raw API with an object arg       -> same bug (both flow through api.js)
 *   [3] Raw API with JSON.stringify(...) -> succeeds (correct wire format)
 *
 * Run: npm run e2e   (see package.json — injects the branch token)
 */
import { createTinybirdApi } from "@tinybirdco/sdk";
import { tinybird } from "../lib/tinybird.ts";

const token = process.env.TINYBIRD_TOKEN;
const baseUrl = process.env.TINYBIRD_URL ?? "https://api.tinybird.co";
if (!token) {
  console.error("Set TINYBIRD_TOKEN (and TINYBIRD_URL). Use `npm run e2e` to inject the branch token.");
  process.exit(1);
}

console.log(`Target: ${baseUrl}  pipe: json_echo\n`);

// [1] Typed client — the SDK interface a user actually writes.
console.log("[1] tinybird.jsonEcho.query({ configOverrides: { foo: 1 } })  (typed client)");
try {
  const res = await tinybird.jsonEcho.query({ configOverrides: { foo: 1 } });
  console.log("    Unexpected success — is the SDK fixed?", JSON.stringify(res.data));
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  console.error("    ❌ Server rejected it (expected):");
  console.error("       " + msg.replace(/\n/g, "\n       "));
  if (msg.includes("[object Object]")) {
    console.error("       ^ confirms the SDK put '[object Object]' on the wire.");
  }
}

const api = createTinybirdApi({ token, baseUrl });

// [2] Raw API with an object — same buggy String(value) path (api.js:91).
console.log("\n[2] api.query('json_echo', { configOverrides: { foo: 1 } })  (raw API, object)");
try {
  const res = await api.query("json_echo", { configOverrides: { foo: 1 } });
  console.log("    Unexpected success:", JSON.stringify(res.data));
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  console.error("    ❌ Server rejected it (expected): " + msg.split("\n")[0]);
}

// [3] Workaround — hand-serialize to the exact bytes json_type()/JSON() wants.
console.log("\n[3] api.query('json_echo', { configOverrides: JSON.stringify({ foo: 1 }) })  (workaround)");
try {
  const res = await api.query<{ key_count: number }>("json_echo", {
    configOverrides: JSON.stringify({ foo: 1 }),
  });
  console.log("    ✅ Success — JSON string parsed server-side. rows:", JSON.stringify(res.data));
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  console.error("    Unexpected failure: " + msg.split("\n")[0]);
}
