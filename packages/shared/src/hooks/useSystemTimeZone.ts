import { useSyncExternalStore } from "react";

const read = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
function subscribe(refresh: () => void) {
  window.addEventListener("focus", refresh);
  document.addEventListener("visibilitychange", refresh);
  return () => {
    window.removeEventListener("focus", refresh);
    document.removeEventListener("visibilitychange", refresh);
  };
}

export function useSystemTimeZone() {
  return useSyncExternalStore(subscribe, read, read);
}
