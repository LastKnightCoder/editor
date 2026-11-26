import { describe, expect, it } from "vitest";
import { createI18nRuntime, createLocaleStore } from "@tau/i18n";
import { whiteboardMessages } from "../i18n";
import { displayTitle, relativeTime } from "../format";
import { matchTitle, sortItems, titleSearchText, type WhiteboardItem } from "../model";

const now = new Date(2026, 8, 25, 15, 20).getTime();

describe("白板展示与数据语义分离", () => {
  it("经过时间跨分钟、小时和天边界时保持原分档，历史日期才带日历年月", () => {
    for (const locale of ["zh-CN", "zh-TW", "en-US"]) {
      const runtime = createI18nRuntime({ localeSource: createLocaleStore(locale) });
      const { t } = runtime.get(whiteboardMessages);
      const relative = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
      expect(relativeTime(now - 59_999, now, locale, t)).toBe(t("time.now"));
      for (const [elapsed, value, unit] of [
        [60_000, -1, "minute"],
        [3_599_999, -59, "minute"],
        [3_600_000, -1, "hour"],
        [86_399_999, -23, "hour"],
        [86_400_000, -1, "day"],
        [7 * 86_400_000 - 1, -6, "day"],
      ] as const) {
        expect(relativeTime(now - elapsed, now, locale, t)).toBe(relative.format(value, unit));
      }
      const sameYear = new Date(2026, 7, 26).getTime();
      const oldYear = new Date(2025, 0, 2).getTime();
      expect(relativeTime(sameYear, now, locale, t)).toBe(
        new Intl.DateTimeFormat(locale, { month: "long", day: "numeric" }).format(sameYear)
      );
      expect(relativeTime(oldYear, now, locale, t)).toBe(
        new Intl.DateTimeFormat(locale, { year: "numeric", month: "long", day: "numeric" }).format(
          oldYear
        )
      );
      runtime.dispose();
    }
  });

  it("显示语言变化不改变搜索和排序的默认名口径或用户标题", () => {
    const unnamed = { id: 1, title: "" } as WhiteboardItem;
    const named = { id: 2, title: "用户标题" } as WhiteboardItem;
    const items = [unnamed, named];
    const semanticName = titleSearchText(unnamed);
    const ordered = sortItems(items, "title").map(item => item.id);
    const localeSource = createLocaleStore("zh-CN");
    const runtime = createI18nRuntime({ localeSource });
    const { t } = runtime.get(whiteboardMessages);
    const first = displayTitle(unnamed, t);
    localeSource.setLocale("en-US");
    expect(displayTitle(unnamed, t)).not.toBe(first);
    expect(displayTitle(named, t)).toBe(named.title);
    expect(matchTitle(unnamed, semanticName)).toBe(true);
    expect(sortItems(items, "title").map(item => item.id)).toEqual(ordered);
    expect(items.map(item => item.title)).toEqual(["", "用户标题"]);
    runtime.dispose();
  });
});
