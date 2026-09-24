import { useEffect, useState } from "react";

export function useNow(dataVersion: unknown) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => setNow(Date.now()), [dataVersion]);
  return now;
}
