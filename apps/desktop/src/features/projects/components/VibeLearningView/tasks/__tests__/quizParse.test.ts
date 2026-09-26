import { describe, expect, it } from "vitest";
import { parsePartialQuizPrompts, parseQuizResponse } from "../quizParse";

const full = `\`\`\`json
[
  {"type":"qa","prompt":"什么是梯度下降？","detail":"沿负梯度方向更新参数"},
  {"type":"cloze","prompt":"学习率过大可能导致{{blank:发散}}","detail":""}
]
\`\`\``;

describe("parsePartialQuizPrompts", () => {
  it("只返回已经闭合的题目", () => {
    const partial = `[{"type":"qa","prompt":"第一题"},{"type":"qa","prompt":"第二`;
    expect(parsePartialQuizPrompts(partial)).toEqual(["第一题"]);
  });

  it("忽略字符串里的括号与转义引号", () => {
    const text = `[{"prompt":"含 {花括号} 和 \\"引号\\""}, {"prompt":"b"}]`;
    expect(parsePartialQuizPrompts(text)).toEqual(['含 {花括号} 和 "引号"', "b"]);
  });

  it("填空标记显示为下划线", () => {
    expect(parsePartialQuizPrompts(full)[1]).toBe("学习率过大可能导致____");
  });

  it("还没开始输出数组时为空", () => {
    expect(parsePartialQuizPrompts("好的，下面是题目：")).toEqual([]);
  });
});

describe("parseQuizResponse", () => {
  it("去掉代码块围栏并逐题转换", () => {
    const items = parseQuizResponse(full);
    expect(items).toHaveLength(2);
    expect(items[0].type).toBe("qa");
    expect(items[1].type).toBe("cloze");
    expect(items.every(item => item.selected)).toBe(true);
  });

  it("不是数组时报错", () => {
    expect(() => parseQuizResponse(`{"prompt":"x"}`)).toThrow();
  });
});
