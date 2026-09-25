import { describe, expect, it } from "vitest";
import { looksLikeQuestion, matchGroup, parseCapture } from "../capture";

describe("快速收集解析", () => {
  it("取第一个 #分组 作为分组提示，其余为问题", () => {
    expect(parseCapture("IME 为什么会重复字符 #编辑器")).toEqual({
      title: "IME 为什么会重复字符",
      groupHint: "编辑器",
    });
    expect(parseCapture("#读书 系统 1 和直觉的关系")).toEqual({
      title: "系统 1 和直觉的关系",
      groupHint: "读书",
    });
  });

  it("词内井号不算分组记号", () => {
    expect(parseCapture("C# 的 record 是值类型吗")).toEqual({
      title: "C# 的 record 是值类型吗",
      groupHint: null,
    });
  });

  it("分组按全名优先、再按前缀匹配", () => {
    const groups = [{ title: "编辑器" }, { title: "编辑器原理" }, { title: "前端工程" }];
    expect(matchGroup(groups, "编辑器")?.title).toBe("编辑器");
    expect(matchGroup(groups, "前端")?.title).toBe("前端工程");
    expect(matchGroup(groups, "数学")).toBeNull();
  });
  it("像问题的输入：问号结尾或带 #分组", () => {
    expect(looksLikeQuestion("B+ 树为什么适合索引？")).toBe(true);
    expect(looksLikeQuestion("为什么要 2MSL? #网络")).toBe(true);
    expect(looksLikeQuestion("TIME_WAIT #网络")).toBe(true);
    expect(looksLikeQuestion("slate normalize")).toBe(false);
  });
});
