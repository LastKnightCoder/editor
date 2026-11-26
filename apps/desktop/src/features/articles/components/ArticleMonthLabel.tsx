import { useArticlesI18n } from "../i18n";

export function ArticleMonthLabel({
  year,
  month,
  yearClassName = "text-ink-3 ml-0.5 text-[12px] font-normal tabular-nums",
}: {
  year: number;
  month: number;
  yearClassName?: string;
}) {
  const { locale } = useArticlesI18n();
  return new Intl.DateTimeFormat(locale, { year: "numeric", month: "long" })
    .formatToParts(new Date(year, month - 1, 1))
    .map((part, index) =>
      part.type === "year" ? (
        <small key={index} className={yearClassName}>
          {part.value}
        </small>
      ) : (
        part.value
      )
    );
}
