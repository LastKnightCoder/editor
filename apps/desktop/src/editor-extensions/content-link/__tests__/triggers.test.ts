import { describe, expect, it } from "vitest";

import { resolveMentionTrigger } from "../triggers";

describe("resolveMentionTrigger", () => {
  it("@ 单字符即触发", () => {
    expect(resolveMentionTrigger("@", "")).toBe("@");
    expect(resolveMentionTrigger("@", "a")).toBe("@");
  });

  it("[ 与 【 需要光标前已有同款括号才成对触发", () => {
    expect(resolveMentionTrigger("[", "[")).toBe("[[");
    expect(resolveMentionTrigger("【", "【")).toBe("【【");
  });

  it("单个 [ 或 【 不触发", () => {
    expect(resolveMentionTrigger("[", "")).toBeNull();
    expect(resolveMentionTrigger("[", "a")).toBeNull();
    expect(resolveMentionTrigger("【", "")).toBeNull();
  });

  it("半角与全角括号混搭不触发", () => {
    expect(resolveMentionTrigger("【", "[")).toBeNull();
    expect(resolveMentionTrigger("[", "【")).toBeNull();
  });

  it("一次送入两个括号字符也能触发", () => {
    expect(resolveMentionTrigger("[[", "")).toBe("[[");
    expect(resolveMentionTrigger("【【", "x")).toBe("【【");
  });

  it("普通字符不触发", () => {
    expect(resolveMentionTrigger("a", "[")).toBeNull();
    expect(resolveMentionTrigger("", "[")).toBeNull();
  });
});
