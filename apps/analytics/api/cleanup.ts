import { shanghaiDay, type Env } from "./platform";

export async function cleanup(env: Env): Promise<void> {
  const now = Date.now();
  const day = shanghaiDay(now - 400 * 86400000);
  const statements = [
    env.DB.prepare(
      "DELETE FROM events WHERE rowid IN (SELECT rowid FROM events WHERE received_at<? LIMIT 1000)"
    ).bind(now - 30 * 86400000),
    env.DB.prepare(
      "DELETE FROM sessions WHERE rowid IN (SELECT rowid FROM sessions WHERE last_seen<? LIMIT 1000)"
    ).bind(now - 400 * 86400000),
    env.DB.prepare(
      "DELETE FROM download_receipts WHERE rowid IN (SELECT rowid FROM download_receipts WHERE day<? LIMIT 1000)"
    ).bind(shanghaiDay(now - 7 * 86400000)),
    ...["daily_activity", "daily_events", "daily_downloads"].map(table =>
      env.DB.prepare(
        `DELETE FROM ${table} WHERE rowid IN (SELECT rowid FROM ${table} WHERE day<? LIMIT 1000)`
      ).bind(day)
    ),
  ];
  for (let round = 0; round < 20; round++) {
    const results = await env.DB.batch(statements);
    if (results.every(result => (result.meta.changes ?? 0) < 1000)) return;
  }
  console.warn("analytics_cleanup_backlog");
}
