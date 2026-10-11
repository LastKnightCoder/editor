import { describe, expect, it } from "vitest";
import { directionHint } from "../SortPanel";

describe("directionHint 按值类型映射", () => {
  it("date → 旧→新；number → 0→9；其余（含文本、布尔、未声明）→ A→Z", () => {
    expect(directionHint("date", "asc")).toBe("旧→新");
    expect(directionHint("date", "desc")).toBe("新→旧");
    expect(directionHint("number", "asc")).toBe("0→9");
    expect(directionHint("number", "desc")).toBe("9→0");
    expect(directionHint("text", "asc")).toBe("A→Z");
    expect(directionHint("boolean", "desc")).toBe("Z→A");
    expect(directionHint(null, "asc")).toBe("A→Z");
  });
});
