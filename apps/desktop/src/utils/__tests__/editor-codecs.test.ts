import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

import { createMarkdownProcessor } from "@tau/markdown";
import { textFormattingCodec } from "@tau/editor/extensions/text-formatting/markdown";
import { desktopCodecComposition as editorMarkdownCodecs } from "../markdown.ts";

/** 内置扩展 codec 的处理器：宿主同样按「editor 列表 + 自己的业务 codec」合成 */
const md = createMarkdownProcessor({
  codecs: editorMarkdownCodecs,
  textCodecs: [textFormattingCodec],
});

describe("内置扩展 codec 覆盖", () => {
  it("类型不重复、覆盖完整（原内置序列化器 + void 表的并集）", () => {
    const types = editorMarkdownCodecs.map(codec => codec.type);
    expect(new Set(types).size).toBe(types.length);

    // @tau/markdown 框架化（P8）前的内置清单；搬空后这里守「没有悄悄少搬一个」
    for (const type of [
      "paragraph",
      "header",
      "link",
      "code-block",
      "blockquote",
      "image",
      "inline-image",
      "block-math",
      "inline-math",
      "bulleted-list",
      "numbered-list",
      "list-item",
      "table",
      "table-row",
      "table-cell",
      "callout",
      "detail",
      "divide-line",
      "video",
      "audio",
      "check-list",
      "check-list-item",
      "highlight-block",
      "front-matter",
      "emoji",
      "annotation",
      "styled-text",
      "kbd",
      "underline",
    ]) {
      expect(types).toContain(type);
    }
  });
});

describe("导出：块级", () => {
  const exportOne = (element: unknown) => md.getMarkdown([element as never]).trimEnd();

  it("header", () => {
    expect(
      exportOne({ type: "header", level: 2, children: [{ type: "formatted", text: "标题" }] })
    ).toBe("## 标题");
  });

  it("blockquote", () => {
    expect(
      exportOne({
        type: "blockquote",
        children: [
          { type: "paragraph", children: [{ type: "formatted", text: "引用" }] },
          { type: "paragraph", children: [{ type: "formatted", text: "第二段" }] },
        ],
      })
    ).toBe("> 引用\n> \n> 第二段");
  });

  it("code-block 带语言与高亮行", () => {
    const markdown = exportOne({
      type: "code-block",
      language: "ts",
      code: "const a = 1;",
      highlightLines: "1",
      children: [{ type: "formatted", text: "" }],
    });
    expect(markdown).toContain("```ts {1}\nconst a = 1;\n```");
  });

  it("code-block 魔法移动导出激活步与 smm 元信息", () => {
    const markdown = exportOne({
      type: "code-block",
      language: "ts",
      code: "旧代码",
      magicMove: {
        v: 1,
        activeStep: 1,
        steps: [
          { id: "s1", code: "第一步" },
          { id: "s2", code: "第二步" },
        ],
      },
      children: [{ type: "formatted", text: "" }],
    });
    expect(markdown).toContain("第二步");
    expect(markdown).not.toContain("旧代码");
    expect(markdown).toMatch(/smm=/);
  });

  it("code-block 文件名、换行、关闭行号写进围栏 meta 并能读回", () => {
    const markdown = exportOne({
      type: "code-block",
      language: "ts",
      code: "const a = 1;",
      highlightLines: "1",
      filename: 'api/"user".ts',
      wrap: true,
      lineNumbers: false,
      children: [{ type: "formatted", text: "" }],
    });
    expect(markdown).toContain('```ts title="api/user.ts" wrap noLineNumbers {1}\n');
    expect(md.importFromMarkdown(markdown)[0]).toMatchObject({
      type: "code-block",
      filename: "api/user.ts",
      wrap: true,
      lineNumbers: false,
      highlightLines: "1",
    });
  });

  it("code-block 默认显示行号、不换行时 meta 不多写", () => {
    const markdown = exportOne({
      type: "code-block",
      language: "ts",
      code: "x",
      children: [{ type: "formatted", text: "" }],
    });
    expect(markdown).toContain("```ts\nx\n```");
    const imported = md.importFromMarkdown(markdown)[0] as unknown as Record<string, unknown>;
    expect(imported).not.toHaveProperty("filename");
    expect(imported).not.toHaveProperty("wrap");
    expect(imported).not.toHaveProperty("lineNumbers");
  });

  it("code-block 文件名里的花括号不被当成高亮行", () => {
    const [block] = md.importFromMarkdown('```ts title="{1}.ts"\nx\n```');
    expect(block).toMatchObject({ filename: "{1}.ts" });
    expect(block).not.toHaveProperty("highlightLines");
  });

  it("callout 有标题用标题，没标题用默认标题", () => {
    const titled = exportOne({
      type: "callout",
      calloutType: "tip",
      title: "自定义",
      children: [{ type: "paragraph", children: [{ type: "formatted", text: "内容" }] }],
    });
    expect(titled).toContain(':::tip{ title="自定义"}');
    const untitled = exportOne({
      type: "callout",
      calloutType: "tip",
      title: "",
      children: [{ type: "paragraph", children: [{ type: "formatted", text: "内容" }] }],
    });
    expect(untitled).toContain(":::tip{ title=技巧}");
  });

  it("detail / highlight-block / divide-line / front-matter", () => {
    expect(
      exportOne({
        type: "detail",
        title: "折叠",
        open: true,
        children: [{ type: "paragraph", children: [{ type: "formatted", text: "正文" }] }],
      })
    ).toContain(':::detail{title="折叠" open=true}');
    expect(
      exportOne({
        type: "highlight-block",
        color: "yellow",
        children: [{ type: "paragraph", children: [{ type: "formatted", text: "高亮" }] }],
      })
    ).toBe(":::highlight-block{color=yellow}\n高亮\n:::");
    expect(exportOne({ type: "divide-line", children: [{ type: "formatted", text: "" }] })).toBe(
      "---"
    );
    expect(
      exportOne({
        type: "front-matter",
        value: "title: t",
        children: [{ type: "formatted", text: "" }],
      })
    ).toBe("---\ntitle: t\n---");
  });

  it("image / inline-image", () => {
    expect(
      exportOne({
        type: "image",
        url: "a.png",
        alt: "图",
        children: [{ type: "formatted", text: "" }],
      })
    ).toBe("![图](a.png)");
    expect(
      exportOne({
        type: "image",
        url: "a.png",
        previewUrl: "a-crop.png",
        alt: "裁剪过",
        children: [{ type: "formatted", text: "" }],
      })
    ).toBe("![裁剪过](a-crop.png)");
    expect(
      exportOne({
        type: "inline-image",
        url: "a.png",
        alt: "",
        children: [{ type: "formatted", text: "" }],
      })
    ).toBe("![](a.png)");
  });

  it("block-math / inline-math", () => {
    expect(
      exportOne({ type: "block-math", tex: "E=mc^2", children: [{ type: "formatted", text: "" }] })
    ).toBe("$$\nE=mc^2\n$$");
    expect(
      exportOne({ type: "inline-math", tex: "a", children: [{ type: "formatted", text: "" }] })
    ).toBe("$a$");
  });

  it("无序列表与图标、有序列表", () => {
    const item = (children: unknown[], extra: Record<string, unknown> = {}) => ({
      type: "list-item",
      ...extra,
      children,
    });
    expect(
      exportOne({
        type: "bulleted-list",
        children: [
          item([{ type: "paragraph", children: [{ type: "formatted", text: "甲" }] }], {
            iconType: "emoji",
            icon: "📌",
          }),
          item([{ type: "paragraph", children: [{ type: "formatted", text: "乙" }] }]),
        ],
      })
    ).toBe("- ![](emoji:📌)甲\n- 乙");
    expect(
      exportOne({
        type: "numbered-list",
        children: [item([{ type: "paragraph", children: [{ type: "formatted", text: "一" }] }])],
      })
    ).toBe("1. 一");
  });

  it("table", () => {
    const cell = (text: string) => ({
      type: "table-cell",
      children: [{ type: "formatted", text }],
    });
    const row = (cells: string[]) => ({
      type: "table-row",
      children: cells.map(cell),
    });
    expect(
      exportOne({
        type: "table",
        children: [row(["甲", "乙"]), row(["丙", "丁"])],
      })
    ).toBe("| 甲 | 乙 |\n| --- | --- |\n| 丙 | 丁 |");
  });

  it("check-list 勾选态", () => {
    expect(
      exportOne({
        type: "check-list",
        children: [
          {
            type: "check-list-item",
            checked: true,
            children: [{ type: "formatted", text: "完成" }],
          },
          {
            type: "check-list-item",
            checked: false,
            children: [{ type: "formatted", text: "待办" }],
          },
        ],
      })
    ).toBe("- [x] 完成\n- [ ] 待办");
  });
});

describe("导出：行内", () => {
  const exportParagraph = (children: unknown[]) =>
    md.getMarkdown([{ type: "paragraph", children }] as never).trimEnd();

  it("link", () => {
    expect(
      exportParagraph([
        { type: "link", url: "https://a.dev", children: [{ type: "formatted", text: "站点" }] },
      ])
    ).toBe("[站点](https://a.dev)");
  });

  it("styled-text / underline / kbd", () => {
    expect(
      exportParagraph([
        { type: "styled-text", color: "red", children: [{ type: "formatted", text: "红" }] },
      ])
    ).toBe(":styled-text[红]{color=red}");
    expect(
      exportParagraph([
        {
          type: "underline",
          color: "green",
          lineType: "dashed",
          children: [{ type: "formatted", text: "线" }],
        },
      ])
    ).toBe(":underline[线]{color=green lineType=dashed}");
    expect(
      exportParagraph([{ type: "kbd", children: [{ type: "formatted", text: "Ctrl" }] }])
    ).toBe("<kbd>Ctrl</kbd>");
  });

  it("emoji 与 annotation（脚注追加到文末）", () => {
    expect(
      exportParagraph([
        { type: "emoji", nativeEmoji: "📌", children: [{ type: "formatted", text: "" }] },
      ])
    ).toBe("📌");
    const markdown = md
      .getMarkdown([
        {
          type: "paragraph",
          children: [
            { type: "formatted", text: "注" },
            {
              type: "annotation",
              content: "批注内容",
              children: [{ type: "formatted", text: "" }],
            },
          ],
        },
      ] as never)
      .trimEnd();
    expect(markdown).toBe("注[^1]\n\n\n[^1]: 批注内容");
  });
});

describe("导入导出往返（directive 语法）", () => {
  it("audio 的 title 往返保留", () => {
    const markdown = ':::audio{src="a.mp3" title="播客"}\n:::';
    const content = md.importFromMarkdown(markdown);
    expect(content[0]).toMatchObject({ type: "audio", title: "播客" });
    expect(md.getMarkdown(content).trim()).toBe(markdown);
  });

  it("video 属性往返保留", () => {
    const metaInfo = btoa(unescape(encodeURIComponent(JSON.stringify({ site: "bilibili" }))));
    const markdown = `:::video{src="a.mp4" playbackRate="1.5" metaInfo="${metaInfo}" width="480" align="center"}\n:::`;
    const content = md.importFromMarkdown(markdown);
    expect(content[0]).toMatchObject({
      type: "video",
      src: "a.mp4",
      playbackRate: 1.5,
      width: 480,
      align: "center",
    });
    expect(md.getMarkdown(content).trim()).toBe(markdown);
  });

  it("video metaInfo 里的中文标题往返不乱码", () => {
    const meta = { type: "bilibili", bvid: "BV1xx", cid: "1", title: "费曼学习法 · 第 3 讲" };
    const metaInfo = btoa(unescape(encodeURIComponent(JSON.stringify(meta))));
    const markdown = `:::video{src="https://www.bilibili.com/video/BV1xx" metaInfo="${metaInfo}"}\n:::`;
    const content = md.importFromMarkdown(markdown);
    expect(content[0]).toMatchObject({ type: "video", metaInfo: meta });
    expect(md.getMarkdown(content).trim()).toBe(markdown);
  });

  it("callout 类型与标题往返", () => {
    const markdown = ':::warning{ title="注意"}\n内容\n:::';
    const content = md.importFromMarkdown(markdown);
    expect(content[0]).toMatchObject({ type: "callout", calloutType: "warning", title: "注意" });
    expect(md.getMarkdown(content).trim()).toBe(markdown);
  });

  it("underline 支持容器与行内两种写法", () => {
    const inline = md.importFromMarkdown("前 :underline[词]{color=green} 后");
    const inlineParagraph = inline[0] as { children: unknown[] };
    expect(JSON.stringify(inlineParagraph.children)).toContain('"type":"underline"');
    const container = md.importFromMarkdown(":::underline{color=green}\n词\n:::");
    expect(container[0]).toMatchObject({ type: "underline", color: "green" });
  });

  it("styled-text 非法选色回落为 red", () => {
    const content = md.importFromMarkdown(":styled-text[字]{color=pink}");
    const paragraph = content[0] as { children: Array<{ color?: string }> };
    expect(paragraph.children[0]).toMatchObject({ type: "styled-text", color: "red" });
  });

  it("kbd 行内指令导入", () => {
    const content = md.importFromMarkdown(":kbd[Ctrl]");
    const paragraph = content[0] as { children: unknown[] };
    expect(JSON.stringify(paragraph.children)).toContain('"type":"kbd"');
  });

  it("detail / highlight-block 导入", () => {
    expect(md.importFromMarkdown(":::detail{title=折叠 open=true}\n内容\n:::")[0]).toMatchObject({
      type: "detail",
      title: "折叠",
      open: true,
    });
    expect(md.importFromMarkdown(":::highlight-block{color=blue}\n内容\n:::")[0]).toMatchObject({
      type: "highlight-block",
      color: "blue",
    });
  });
});

// 原 packages/markdown/src/__tests__/source-mode-cursor.test.ts：Markdown 窗口的光标对应
// 需要 code-block / table 的真实序列化器，随 codec 归属迁到编辑器包
describe("源码 ↔ 富文本光标映射", () => {
  const SOURCE = [
    "普通一行文字",
    "",
    "带 **加粗** 的一行",
    "",
    "```ts",
    "const a = 1;",
    "const b = 2;",
    "```",
    "",
    "| 头 A | 头 B |",
    "| --- | --- |",
    "| 甲 | 乙 |",
    "",
  ].join("\n");

  const { content, positionMap } = md.importFromMarkdownWithPositions(SOURCE);
  const slateAt = (line: number, ch: number) => positionMap.markdownToSlate({ line, ch });

  it("普通文本：源码光标落到对应文本节点", () => {
    const point = slateAt(0, 3);
    expect(point).not.toBeNull();
    expect(point!.offset).toBe(3);
  });

  it("加粗文本：光标落在加粗节点内，偏移扣掉 ** 前缀", () => {
    // "带 **加粗** 的一行"：第 4 列是「加」（前面是「带」、空格、两个星号），第 5 列是「粗」
    expect(slateAt(2, 4)!.offset).toBe(0);
    expect(slateAt(2, 5)!.offset).toBe(1);
  });

  it("代码块：源码光标能查到 code 属性映射与块内相对位置", () => {
    const hint = positionMap.getElementPropertyByMarkdown({ line: 5, ch: 6 });
    expect(hint?.mapping.elementType).toBe("code-block");
    expect(hint?.propertyName).toBe("code");
    expect(hint?.relativePos).toEqual({ line: 0, ch: 6 });
  });

  it("表格：光标落到单元格内的文本节点", () => {
    const point = slateAt(11, 3);
    expect(point).not.toBeNull();
    const cellPath = point!.path.slice(0, -1);
    expect(cellPath.length).toBeGreaterThanOrEqual(3);
  });

  it("反向：富文本光标能映射回源码行列", () => {
    const back = positionMap.slateToMarkdown({ path: slateAt(0, 3)!.path, offset: 3 });
    expect(back).toEqual({ line: 0, ch: 3 });
  });

  it("导出方向：代码块的 code 属性映射覆盖块内每一行", () => {
    const exported = md.getMarkdownWithPositions(content);
    const codeBlockPath = content.findIndex(
      node => (node as { type?: string }).type === "code-block"
    );
    const mapping = exported.positionMap.getElementMappingBySlatePath([codeBlockPath]);
    const range = mapping?.propertyMappings?.code;
    expect(range).toBeTruthy();
    expect(range!.mdEndLine - range!.mdStartLine).toBe(1);
  });
});

// 原 packages/markdown 框架测试里依赖完整方言的用例，随导入端认领 codec 化迁入
describe("标准语法导入（codec 认领）", () => {
  it("标题与列表导入为结构化节点", () => {
    const result = md.importFromMarkdown("# 标题\n\n- 第一项\n- 第二项");
    expect(result[0]).toMatchObject({ type: "header", level: 1 });
    expect(result[1]).toMatchObject({ type: "bulleted-list" });
  });

  it("保留链接等行内结构", () => {
    const result = md.importFromMarkdown("[OpenAI](https://openai.com)");
    const paragraph = result[0] as { children?: unknown[] };
    expect(result[0]).toMatchObject({ type: "paragraph" });
    expect(paragraph.children?.[0]).toMatchObject({
      type: "link",
      url: "https://openai.com",
    });
  });

  it("customDirective handler 内再次导入不会串用外层的脚注上下文", () => {
    const importFromMarkdown = md.importFromMarkdown;
    const result = importFromMarkdown("外层[^a]\n\n:::wrap\n:::\n\n[^a]: 外层脚注", [], {
      customDirectives: {
        wrap: () => {
          const inner = importFromMarkdown("内层[^a]\n\n[^a]: 内层脚注");
          return inner[0];
        },
      },
    });
    const text = JSON.stringify(result);
    expect(text).toContain("外层脚注");
    expect(text).toContain("内层脚注");
  });
});

describe("代码块语言归一（原 markdown-code-language-normalization）", () => {
  const importBlock = (fence: string) =>
    md.importFromMarkdown("```" + fence + "\nconsole.log(1)\n```")[0] as {
      type: string;
      language: string;
    };

  it("js 与 javascript 归一为 JavaScript", () => {
    expect(importBlock("js")).toMatchObject({ type: "code-block", language: "JavaScript" });
    expect(importBlock("javascript")).toMatchObject({ type: "code-block", language: "JavaScript" });
  });

  it("html 归一为 HTML", () => {
    expect(importBlock("html")).toMatchObject({ type: "code-block", language: "HTML" });
  });

  it("常见语言映射", () => {
    expect(importBlock("ts").language).toBe("TypeScript");
    expect(importBlock("py").language).toBe("Python");
    expect(importBlock("md").language).toBe("Markdown");
  });

  it("未命中字典保留原始语言", () => {
    expect(importBlock("mylang").language).toBe("mylang");
  });
});

describe("Node 原生加载桌面 codec 组合", () => {
  it("headless 入口不带 DOM 与 React", () => {
    // 验证宿主组合与各包 codec 的完整加载链，禁止连带 React/DOM。
    const entryUrl = pathToFileURL(resolve(import.meta.dirname, "../markdown.ts")).href;
    const script = `
      const { desktopMarkdown: md } = await import(${JSON.stringify(entryUrl)});
      const value = md.importFromMarkdown(":::tip{ title=\\"提示\\"}\\n内容\\n:::");
      console.log(
        JSON.stringify([
          typeof document,
          typeof React,
          value[0].type,
          md.getMarkdown(value).trim(),
        ])
      );
    `;
    const output = execFileSync(
      process.execPath,
      // Node < 23.6 需显式开 type stripping，新版本默认开启、带上无害
      ["--experimental-strip-types", "--no-warnings", "--input-type=module", "-e", script],
      { cwd: import.meta.dirname, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
    );
    expect(JSON.parse(output.trim())).toEqual([
      "undefined",
      "undefined",
      "callout",
      ':::tip{ title="提示"}\n内容\n:::',
    ]);
  });
});

describe("插件围栏能力（walker 去类型化）", () => {
  const myDiagramCodec = {
    type: "my-diagram",
    isVoid: true,
    fence: { language: "mylang", property: "source" },
    serializer: {
      isBlock: true,
      toMarkdown: (element: any) => "```mylang\n" + `${element.source}` + "\n```",
    },
  } as const;

  it("第三方 codec 声明 fence 即可接入新围栏语言，导入导出往返", () => {
    const plugin = createMarkdownProcessor({
      codecs: [...editorMarkdownCodecs, myDiagramCodec],
      textCodecs: [textFormattingCodec],
    });
    const markdown = "```mylang\ndiagram A -> B\n```";
    const value = plugin.importFromMarkdown(markdown);
    expect(value[0]).toMatchObject({ type: "my-diagram", source: "diagram A -> B" });
    expect(plugin.getMarkdown(value).trim()).toBe(markdown);
  });

  it("同一围栏语言被两个 codec 认领时建处理器直接报错", () => {
    expect(() =>
      createMarkdownProcessor({
        codecs: [myDiagramCodec, { ...myDiagramCodec, type: "another-diagram" } as never],
      })
    ).toThrow(/mylang/);
  });

  it("没有声明 fence 的处理器里，该围栏落回 code-block 兜底", () => {
    const value = md.importFromMarkdown("```mylang\ndiagram A -> B\n```");
    expect(value[0]).toMatchObject({ type: "code-block", language: "mylang" });
  });
});
