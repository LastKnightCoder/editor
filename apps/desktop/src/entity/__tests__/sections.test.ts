import { describe, expect, it } from "vitest";
import type { Descendant } from "slate";
import { splitSections } from "../sections";
import { mainEmbeddingFingerprint } from "../chunk-version";

const paragraph = (text: string): Descendant => ({
  type: "paragraph",
  children: [{ type: "formatted", text }],
});
const header = (text: string, level: 1 | 2 = 1): Descendant => ({
  type: "header",
  level,
  children: [{ type: "formatted", text }],
});

describe("主内容按节切块", () => {
  it("代码正文不因 Slate 文本叶子为空而被当作短节", () => {
    const code: Descendant = {
      type: "code-block",
      uuid: "section-code-fixture",
      code: "const value = 1;\n".repeat(10),
      language: "javascript",
      children: [{ type: "formatted", text: "" }],
    };
    expect(
      splitSections([header("代码观点"), code, header("下一节"), paragraph("正文".repeat(80))], "")
    ).toHaveLength(2);
  });
  it("无标题短文与卡片保持整篇", () => {
    expect(splitSections([paragraph("短文")], "标题")).toHaveLength(1);
    expect(splitSections([paragraph("观点".repeat(2000))], "", true)).toHaveLength(1);
  });
  it("重复的最高级标题断节，保留祖先路径与块位置", () => {
    const result = splitSections(
      [
        header("总论"),
        header("第一节", 2),
        paragraph("第一观点".repeat(30)),
        header("第二节", 2),
        paragraph("第二观点".repeat(30)),
      ],
      "文章"
    );
    expect(result).toHaveLength(2);
    expect(result[1]).toMatchObject({ headingPath: "总论 › 第二节", blockStart: 3, blockEnd: 4 });
    expect(result[1].embeddingText.startsWith("文章 › 总论 › 第二节\n\n")).toBe(true);
  });
  it("短节并入下一节且不丢正文", () => {
    const result = splitSections(
      [header("短节"), paragraph("开头"), header("长节"), paragraph("正文".repeat(60))],
      ""
    );
    expect(result).toHaveLength(1);
    expect(result[0].text).toContain("短节");
    expect(result[0].text).toContain("长节");
    expect(result[0]).toMatchObject({ blockStart: 0, blockEnd: 3 });
  });
  it("长节切分后保留块映射与标题路径", () => {
    const result = splitSections(
      [
        header("长节"),
        paragraph("甲".repeat(1000)),
        paragraph("乙".repeat(1000)),
        header("次节"),
        paragraph("丙".repeat(100)),
      ],
      ""
    );
    expect(result.length).toBeGreaterThan(2);
    expect(result[1].headingPath).toBe("长节");
    expect(result.at(-1)).toMatchObject({ blockStart: 3, blockEnd: 4 });
  });
  it("切块版本与模型指纹共同确定主内容指纹", () => {
    expect(mainEmbeddingFingerprint("旧模型")).not.toBe("旧模型");
    expect(mainEmbeddingFingerprint("旧模型")).not.toBe(mainEmbeddingFingerprint("新模型"));
    expect(JSON.parse(mainEmbeddingFingerprint("模型")).mainChunkVersion).toBe(1);
  });
});
