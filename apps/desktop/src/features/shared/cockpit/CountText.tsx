import { Fragment } from "react";
import { useCockpitI18n } from "./i18n";

export function CountText({
  count,
  format,
}: {
  count: number;
  format: (count: number, amount: string) => string;
}) {
  const { locale } = useCockpitI18n();
  return format(count, "\uFFFC")
    .split("\uFFFC")
    .map((part, index) => (
      <Fragment key={index}>
        {index > 0 && <b className="text-ink-1 font-semibold">{count.toLocaleString(locale)}</b>}
        {part}
      </Fragment>
    ));
}
