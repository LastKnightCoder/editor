export function entityDisplayTime(timestamp: number, locale: string, now: number): string {
  const day = (value: number) => {
    const date = new Date(value);
    date.setHours(0, 0, 0, 0);
    return date.getTime();
  };
  const days = Math.round((day(now) - day(timestamp)) / 86_400_000);
  if (days < 7)
    return new Intl.RelativeTimeFormat(locale, { numeric: days <= 1 ? "auto" : "always" }).format(
      -Math.max(0, days),
      "day"
    );
  const sameYear = new Date(timestamp).getFullYear() === new Date(now).getFullYear();
  return new Intl.DateTimeFormat(locale, {
    year: sameYear ? undefined : "numeric",
    month: "numeric",
    day: sameYear ? "numeric" : undefined,
  }).format(timestamp);
}
