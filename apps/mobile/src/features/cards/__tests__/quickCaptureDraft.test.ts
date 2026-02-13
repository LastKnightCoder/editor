import { beforeEach, describe, expect, it } from "vitest";
import type { Descendant } from "slate";
import {
  clearQuickCaptureDraft,
  hasQuickCaptureDraft,
  readQuickCaptureDraft,
  writeQuickCaptureDraft,
} from "../quickCaptureDraft";

const NON_EMPTY_CONTENT = [
  {
    type: "paragraph",
    children: [{ type: "formatted", text: "quick capture content" }],
  },
] as unknown as Descendant[];

describe("quickCaptureDraft", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("可写入并恢复草稿", () => {
    writeQuickCaptureDraft(NON_EMPTY_CONTENT);

    expect(hasQuickCaptureDraft()).toBe(true);
    expect(readQuickCaptureDraft()).toEqual(NON_EMPTY_CONTENT);
  });

  it("空内容不会保留草稿", () => {
    writeQuickCaptureDraft([
      {
        type: "paragraph",
        children: [{ type: "formatted", text: "" }],
      },
    ] as unknown as Descendant[]);

    expect(hasQuickCaptureDraft()).toBe(false);
    expect(readQuickCaptureDraft()).toBeNull();
  });

  it("clearQuickCaptureDraft 会清空草稿", () => {
    writeQuickCaptureDraft(NON_EMPTY_CONTENT);
    expect(hasQuickCaptureDraft()).toBe(true);

    clearQuickCaptureDraft();

    expect(hasQuickCaptureDraft()).toBe(false);
    expect(readQuickCaptureDraft()).toBeNull();
  });

  it("损坏的草稿 JSON 会被安全忽略", () => {
    localStorage.setItem("tau-mobile-quick-capture-draft-v1", "{bad-json}");
    expect(readQuickCaptureDraft()).toBeNull();
    expect(hasQuickCaptureDraft()).toBe(false);
  });
});
