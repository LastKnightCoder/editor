import { describe, expect, it } from "vitest";
import { resolveResumePosition } from "../usePlaybackResume";

describe("resolveResumePosition", () => {
  it("有效位置原样返回", () => {
    expect(resolveResumePosition("252.4", 728)).toBe(252.4);
  });

  it("开头 / 结尾 5 秒内不续播", () => {
    expect(resolveResumePosition("3", 728)).toBeNull();
    expect(resolveResumePosition("725", 728)).toBeNull();
  });

  it("没有记录、记录损坏或时长未知时不续播", () => {
    expect(resolveResumePosition(null, 728)).toBeNull();
    expect(resolveResumePosition("abc", 728)).toBeNull();
    expect(resolveResumePosition("120", Number.NaN)).toBeNull();
    expect(resolveResumePosition("120", Number.POSITIVE_INFINITY)).toBeNull();
    expect(resolveResumePosition("120", 0)).toBeNull();
  });
});
