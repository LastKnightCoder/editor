const refreshedOrigins = new Set<string>();
let refreshFailed = false;

export function markCenterStatusRefresh(origin: string) {
  refreshedOrigins.add(origin);
}
export function markCenterStatusFailure() {
  refreshFailed = true;
  refreshedOrigins.clear();
}
export function isCenterStatusStale(origin: string) {
  return refreshFailed && !refreshedOrigins.has(origin);
}
