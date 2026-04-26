import { describe, expect, it } from "vitest";
import {
  createThinkTagNormalizer,
  normalizeThinkTaggedText,
} from "../thinkTagNormalizer";

describe("thinkTagNormalizer", () => {
  it("应将完整 think 标签拆分为正文与 reasoning", () => {
    expect(normalizeThinkTaggedText("前文<think>思考</think>后文")).toEqual({
      content: "前文后文",
      reasoning_content: "思考",
    });
  });

  it("应支持多个 think 块并保持顺序拼接", () => {
    expect(
      normalizeThinkTaggedText("A<think>R1</think>B<think>R2</think>C"),
    ).toEqual({
      content: "ABC",
      reasoning_content: "R1R2",
    });
  });

  it("应支持开标签跨 chunk", () => {
    const normalizer = createThinkTagNormalizer();

    expect(normalizer.push("前文<th")).toEqual({
      content: "前文",
      reasoning_content: "",
    });
    expect(normalizer.push("ink>思考</think>后文")).toEqual({
      content: "后文",
      reasoning_content: "思考",
    });
    expect(normalizer.flush()).toEqual({
      content: "",
      reasoning_content: "",
    });
  });

  it("应支持闭标签跨 chunk", () => {
    const normalizer = createThinkTagNormalizer();

    expect(normalizer.push("<think>思考</th")).toEqual({
      content: "",
      reasoning_content: "思考",
    });
    expect(normalizer.push("ink>正文")).toEqual({
      content: "正文",
      reasoning_content: "",
    });
    expect(normalizer.flush()).toEqual({
      content: "",
      reasoning_content: "",
    });
  });

  it("流结束时未闭合的 think 内容应归入 reasoning", () => {
    const normalizer = createThinkTagNormalizer();

    expect(normalizer.push("前文<think>未闭合")).toEqual({
      content: "前文",
      reasoning_content: "未闭合",
    });
    expect(normalizer.flush()).toEqual({
      content: "",
      reasoning_content: "",
    });
  });

  it("reset 后应按新 turn 重新解析", () => {
    const normalizer = createThinkTagNormalizer();

    expect(normalizer.push("<think>第一轮</think>工具后")).toEqual({
      content: "工具后",
      reasoning_content: "第一轮",
    });
    normalizer.reset();
    expect(normalizer.push("<think>第二轮</think>最终答案")).toEqual({
      content: "最终答案",
      reasoning_content: "第二轮",
    });
  });

  it("不完整开标签应作为普通正文保留", () => {
    const normalizer = createThinkTagNormalizer();

    expect(normalizer.push("正文<thi")).toEqual({
      content: "正文",
      reasoning_content: "",
    });
    expect(normalizer.flush()).toEqual({
      content: "<thi",
      reasoning_content: "",
    });
  });
});
