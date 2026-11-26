// @vitest-environment node
import { expect, it } from "vitest";
import { createI18nRuntime, createLocaleStore } from "@tau/i18n";
import { toolMessages } from "../../tools.messages";
import { dayLabel, formatDayRange, formatEventRange } from "../format";

it.each(["zh-CN", "zh-TW", "en-US"])("短日期查询在 %s 直接使用短模式，不从译文拆词", locale => {
  const runtime = createI18nRuntime({ localeSource: createLocaleStore(locale) });
  const context = { locale, t: runtime.get(toolMessages).t, now: new Date(2026, 0, 1) };
  expect(formatDayRange("2026-12-15", "2026-12-15", context)).toBe(
    dayLabel(new Date(2026, 11, 15), { ...context, weekday: false })
  );
  runtime.dispose();
});

it.each(["zh-CN", "zh-TW", "en-US"])("全天输入和包含末日的结果在 %s 表示同一范围", locale => {
  const runtime = createI18nRuntime({ localeSource: createLocaleStore(locale) });
  const context = { locale, t: runtime.get(toolMessages).t, now: new Date(2026, 0, 1) };
  for (const [start, exclusive, inclusive] of [
    ["2026-11-07", "2026-11-08", "2026-11-07"],
    ["2026-11-07", "2026-11-10", "2026-11-09"],
    ["2026-12-31", "2027-01-02", "2027-01-01"],
  ])
    expect(formatEventRange(start, exclusive, true, { ...context, endExclusive: true })).toBe(
      formatEventRange(start, inclusive, true, context)
    );
  runtime.dispose();
});
