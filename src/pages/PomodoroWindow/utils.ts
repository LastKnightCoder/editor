export const fmt = (ms: number) => {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const ss = s % 60;
  const mm = Math.floor(m % 60);
  const hh = Math.floor(m / 60);
  return (
    (hh > 0 ? `${hh}:` : "") +
    `${mm.toString().padStart(2, "0")}:${ss.toString().padStart(2, "0")}`
  );
};

export const FIVE_MINUTES_MS = 5 * 60 * 1000;
