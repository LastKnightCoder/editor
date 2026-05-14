const EVENTS_WITHOUT_DATABASE_TRANSACTION = new Set([
  "xiaoyuzhou:parse-url",
  "xiaoyuzhou:fetch-episode",
]);

export function shouldWrapDatabaseEventInTransaction(
  eventName: string,
): boolean {
  return !EVENTS_WITHOUT_DATABASE_TRANSACTION.has(eventName);
}
