/**
 * Tinybird Definitions
 *
 * Define your datasources, endpoints, and client here.
 */

import {
  defineDatasource,
  defineEndpoint,
  Tinybird,
  node,
  t,
  p,
  engine,
  type InferRow,
  type InferParams,
  type InferOutputRow,
} from "@tinybirdco/sdk";

// ============================================================================
// Datasources
// ============================================================================

/**
 * Page views datasource - tracks page view events
 */
export const pageViews = defineDatasource("page_views", {
  description: "Page view tracking data",
  schema: {
    timestamp: t.dateTime(),
    session_id: t.string(),
    pathname: t.string(),
    referrer: t.string().nullable(),
  },
  engine: engine.mergeTree({
    sortingKey: ["pathname", "timestamp"],
  }),
});

export type PageViewsRow = InferRow<typeof pageViews>;

// ============================================================================
// Endpoints
// ============================================================================

/**
 * Top pages endpoint - get the most visited pages
 */
export const topPages = defineEndpoint("top_pages", {
  description: "Get the most visited pages",
  params: {
    start_date: p.dateTime().describe("Start of date range"),
    end_date: p.dateTime().describe("End of date range"),
    limit: p.int32().optional(10).describe("Number of results"),
  },
  nodes: [
    node({
      name: "aggregated",
      sql: `
        SELECT
          pathname,
          count() AS views
        FROM page_views
        WHERE timestamp >= {{DateTime(start_date)}}
          AND timestamp <= {{DateTime(end_date)}}
        GROUP BY pathname
        ORDER BY views DESC
        LIMIT {{Int32(limit, 10)}}
      `,
    }),
  ],
  output: {
    pathname: t.string(),
    views: t.uint64(),
  },
});

export type TopPagesParams = InferParams<typeof topPages>;
export type TopPagesOutput = InferOutputRow<typeof topPages>;

/**
 * JSON-param endpoint — end-to-end reproduction of the p.json() serialization bug.
 *
 * `configOverrides` is declared p.json<TShape>(), so the type contract is
 * "an object of shape TShape". Server-side the JSON() template function
 * json.loads() the param, so the wire value MUST be a JSON string.
 *
 * When the SDK is called with an object (`{ foo: 1 }`) it currently sends
 * "[object Object]" (String(value) in api.js query()), which json.loads()
 * rejects. Passing JSON.stringify({ foo: 1 }) as a string succeeds.
 */
export const jsonEcho = defineEndpoint("json_echo", {
  description: "Echo values from a JSON param (repro of the p.json serialization bug)",
  params: {
    configOverrides: p
      .json<{ foo: number }>()
      .optional({ foo: 0 })
      .describe("JSON config object; server json.loads() this via the JSON() template function"),
  },
  nodes: [
    node({
      name: "echo",
      sql: `
        SELECT value
        FROM (
          SELECT 0 AS value
          {% for key, value in JSON(configOverrides, '{}') %}
          UNION ALL SELECT {{ Int32(value) }} AS value
          {% end %}
        )
        WHERE value != 0
        ORDER BY value
      `,
    }),
  ],
  output: {
    value: t.int32(),
  },
});

export type JsonEchoParams = InferParams<typeof jsonEcho>;
export type JsonEchoOutput = InferOutputRow<typeof jsonEcho>;

// ============================================================================
// Client
// ============================================================================

export const tinybird = new Tinybird({
  datasources: { pageViews },
  pipes: { topPages, jsonEcho },
});
