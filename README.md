# framer_json_sdk_2 — Tinybird TS SDK quickstart + p.json() e2e repro

Built from the [TypeScript SDK quickstart](https://www.tinybird.co/docs/forward/quickstarts/typescript-sdk).
Adds a `json_echo` endpoint that reproduces the `p.json()` serialization bug in
`@tinybirdco/sdk` **end-to-end against a real deployed Tinybird branch**.

## Toolchain

- Node via nvm (Node 24 LTS) — `nvm use --lts`
- pnpm via corepack (pnpm 11) — approves esbuild's build in `pnpm-workspace.yaml`
- Run CLI as `pnpm exec tinybird <cmd>` (or `npx tinybird`)

## Resources (`lib/tinybird.ts`)

- `page_views` datasource + `top_pages` endpoint — from the quickstart scaffold.
- `json_echo` endpoint — a `configOverrides: p.json<{ foo: number }>()` param used by
  the server-side `JSON()` template function (which `json.loads()` the value).
  Returns the number of top-level keys.

## The bug

`p.json<TShape>()` types the param as an object, but the SDK serializes query
params with `String(value)` (`node_modules/@tinybirdco/sdk/dist/api/api.js:91`),
turning `{ foo: 1 }` into `"[object Object]"`. Both the typed client
(`tinybird.jsonEcho.query`) and the low-level `createTinybirdApi().query()` flow
through that same line (`client/base.js:300` delegates to `api.js`), so both are affected.

## Run the unit test (no token / no network)

Reproduces the bug at the serialization layer with a mocked `fetch` — asserts
on the exact value the SDK puts on the wire for the `configOverrides` param.
No Tinybird branch or token required:

```bash
pnpm run unit   # src/unit.ts
```

It confirms both the typed client (`tinybird.jsonEcho.query`) and the low-level
`createTinybirdApi().query()` serialize `{ foo: 1 }` to `[object Object]`, while
`JSON.stringify({ foo: 1 })` reaches the wire intact. The process exits non-zero
if reality ever diverges from those expectations — i.e. it will start failing
the day the SDK is fixed, prompting an update to the expected values.

## Deploy + run the e2e test

The endpoint is deployed to a Tinybird **branch** (safe; does not touch production main):

```bash
nvm use --lts
git checkout -b tinybird_json_repro     # a feature branch (build refuses on main)
pnpm exec tinybird build                # deploys json_echo to a same-named Tinybird branch
pnpm run e2e                            # runs src/e2e.ts against that branch
```

`npm run e2e` (`scripts/run-e2e.sh`) pulls the branch token from `tinybird info`
(never printed) and points `src/e2e.ts` at it.

### Observed result

```
[1] typed client, object arg   -> Error parsing JSON: '[object Object]'   (bug)
[2] raw API,     object arg    -> Error parsing JSON: '[object Object]'   (bug)
[3] raw API,     JSON.stringify -> ✅ [{"key_count":1}]                    (workaround)
```

Steps [1]/[2] are the exact server-side error from the bug report; [3] proves the
correct wire format is a JSON string, i.e. the SDK should `JSON.stringify` JSON-typed params.

## Deploy to production instead (optional)

```bash
pnpm exec tinybird deploy   # deploys json_echo to the main workspace
# then run e2e with the main workspace token from .env.local
```

test with curl: 


curl -s -G "https://api.us-west-2.aws.tinybird.co/v0/pipes/json_echo.json" \
  --data-urlencode 'configOverrides=[object Object]' \
  -H "Authorization: Bearer $TB_TOKEN"
echo

curl -s -G "https://api.us-west-2.aws.tinybird.co/v0/pipes/json_echo.json" \
  --data-urlencode 'configOverrides={"foo":1}' \
  -H "Authorization: Bearer $TB_TOKEN"
echo