export function formatSpeechElapsed(ms: number, locale: string) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60).toLocaleString(locale, { useGrouping: false });
  const remainder = (seconds % 60).toLocaleString(locale, {
    minimumIntegerDigits: 2,
    useGrouping: false,
  });
  return `${minutes}:${remainder}`;
}
