import { describe, expect, it } from "vitest";
import { parseQuickAdd } from "./quickAdd.ts";

describe("示意快速添加解析", () => {
  it("日期 + 时刻 + 项目识别为截止任务", () => {
    expect(parseQuickAdd("明天 17:00 交周报 #工作")).toMatchObject({
      title: "交周报",
      kind: "deadline",
      bucket: "tomorrow",
      main: "17:00",
      project: "工作",
    });
  });

  it("下午几点换算成 24 小时", () => {
    expect(parseQuickAdd("今天下午3点 评审")?.main).toBe("15:00");
  });

  it("每周几识别为周期任务", () => {
    expect(parseQuickAdd("每周一、四 周会")).toMatchObject({
      title: "周会",
      kind: "recurring",
      sub: "打卡",
    });
  });

  it("没有时间就是普通任务，空输入不解析", () => {
    expect(parseQuickAdd("买牛奶")).toMatchObject({
      kind: "normal",
      bucket: "none",
    });
    expect(parseQuickAdd("   ")).toBeNull();
  });
});
