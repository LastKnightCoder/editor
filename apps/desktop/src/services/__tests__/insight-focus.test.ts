import { afterEach, describe, expect, it, vi } from "vitest";
import type { InsightMark } from "@/types/content-insights";
import { requestInsightFocus, takeInsightFocus } from "../insight-focus";

const focus = () => ({
  ref: { kind: "card" as const, id: 7 },
  mark: {
    id: "m",
    kind: "link",
    block: 0,
    anchor: "片段",
    text: "",
    why: "",
    status: "open",
  } as InsightMark,
  onResolved: () => {},
});

describe("去连接的单处聚焦登记", () => {
  afterEach(() => vi.useRealTimers());

  it("取走只对同一篇生效，取走即清掉", () => {
    requestInsightFocus(focus());
    expect(takeInsightFocus({ kind: "card", id: 8 })).toBeNull();
    expect(takeInsightFocus({ kind: "card", id: 7 })).not.toBeNull();
    expect(takeInsightFocus({ kind: "card", id: 7 })).toBeNull();
  });

  it("登记超过一分钟未被取走即作废（打开失败后不该在之后某次打开时突然单处聚焦）", () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    requestInsightFocus(focus());
    vi.setSystemTime(60_000);
    expect(takeInsightFocus({ kind: "card", id: 7 })).not.toBeNull();
    requestInsightFocus(focus());
    vi.setSystemTime(60_000 + 60_001);
    expect(takeInsightFocus({ kind: "card", id: 7 })).toBeNull();
  });
});
