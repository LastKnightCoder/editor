import { describe, expect, it } from "vitest";
import { splitDocSegments } from "./segments.ts";

describe("splitDocSegments", () => {
  it("按示意行切开正文，属性原样带出", () => {
    const segments = splitDocSegments(
      '## 待办\n\n正文\n\n::demo{name="todos" caption="勾选一条试试"}\n\n## 下一节\n'
    );
    expect(segments).toEqual([
      { kind: "markdown", markdown: "## 待办\n\n正文" },
      { kind: "demo", name: "todos", caption: "勾选一条试试" },
      { kind: "markdown", markdown: "## 下一节" },
    ]);
  });

  it("代码块里的示意写法不切开", () => {
    const markdown = '```md\n::demo{name="todos"}\n```';
    expect(splitDocSegments(markdown)).toEqual([{ kind: "markdown", markdown }]);
  });

  it("缺少 name 直接报错", () => {
    expect(() => splitDocSegments('::demo{caption="x"}')).toThrow("缺少 name");
  });
});
