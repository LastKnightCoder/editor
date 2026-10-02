import { describe, expect, it } from "vitest";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkSectionReference from "../remark-section-reference";

describe("对话命中节引用", () => {
  it("仅 ref 带块位置，content-link 不扩协议，代码不解析", () => {
    const processor = unified().use(remarkParse).use(remarkSectionReference);
    const result = processor.runSync(
      processor.parse(
        ":ref[节]{id=1 type=article block=4} :content-link[旧链接]{refId=2 contentType=card block=8}\n\n`:ref[代码]{id=1 type=article block=9}`"
      )
    );
    const serialized = JSON.stringify(result);
    expect(serialized).toContain('"data-block":4');
    expect(serialized).not.toContain('"data-block":8');
    expect(serialized).not.toContain('"data-block":9');
  });
});
