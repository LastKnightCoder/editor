import { createEditor, Descendant, Editor, Transforms } from "slate";
import { afterEach, describe, expect, it, vi } from "vitest";

import { withNormalizedCopy as withCopyContributions } from "../withNormalizedCopy";
import { createEditorKit } from "../../kit/EditorKit";
import { standardExtensions } from "../../../../../editor-extensions/standard";
import { createCircuitBreaker } from "../../kit/extensionGuard";

const assembly = createEditorKit({ extensions: standardExtensions }).assembly;
const report = vi.fn();
afterEach(() => {
  expect(report).not.toHaveBeenCalled();
  report.mockClear();
});
const withNormalizedCopy = (editor: Editor) =>
  withCopyContributions(
    editor,
    assembly.copyPolicies,
    createCircuitBreaker(() => ({
      report,
    }))
  );

const createParagraph = (text: string) => ({
  type: "paragraph" as const,
  children: [{ text }],
});

const createCodeBlock = (code: string) => ({
  type: "code-block" as const,
  code,
  language: "ts",
  uuid: "code-block-1",
  children: [{ text: code }],
});

const selectRange = (
  editor: ReturnType<typeof createEditor>,
  anchor: { path: number[]; offset: number },
  focus: { path: number[]; offset: number }
) => {
  Transforms.select(editor, { anchor, focus });
};

describe("withNormalizedCopy", () => {
  it("列表项内的部分文本复制时不应带出列表结构", () => {
    let editor = createEditor();
    editor = withNormalizedCopy(editor);
    editor.children = [
      {
        type: "bulleted-list",
        children: [
          {
            type: "list-item",
            children: [createParagraph("hello world")],
          },
        ],
      },
    ] as Descendant[];

    selectRange(editor, { path: [0, 0, 0, 0], offset: 0 }, { path: [0, 0, 0, 0], offset: 5 });

    expect(editor.getFragment()).toEqual([createParagraph("hello")]);
  });

  it("即使完整选中列表项文本也不应带出列表结构", () => {
    let editor = createEditor();
    editor = withNormalizedCopy(editor);
    editor.children = [
      {
        type: "bulleted-list",
        children: [
          {
            type: "list-item",
            children: [createParagraph("first")],
          },
          {
            type: "list-item",
            children: [createParagraph("second")],
          },
        ],
      },
    ] as Descendant[];

    selectRange(editor, { path: [0, 0, 0, 0], offset: 0 }, { path: [0, 0, 0, 0], offset: 5 });

    expect(editor.getFragment()).toEqual([createParagraph("first")]);
  });

  it("完整选中含代码块的复杂列表项时应保留 list-item 结构", () => {
    const codeBlock = createCodeBlock("const answer = 42;");
    let editor = createEditor();
    editor = withNormalizedCopy(editor);
    editor.children = [
      {
        type: "bulleted-list",
        children: [
          {
            type: "list-item",
            children: [createParagraph("intro"), codeBlock],
          },
        ],
      },
    ] as Descendant[];

    selectRange(
      editor,
      { path: [0, 0, 0, 0], offset: 0 },
      { path: [0, 0, 1, 0], offset: codeBlock.children[0].text.length }
    );

    expect(editor.getFragment()).toEqual([
      {
        type: "bulleted-list",
        children: [
          {
            type: "list-item",
            children: [createParagraph("intro"), codeBlock],
          },
        ],
      },
    ]);
  });

  it("完整选中含嵌套列表的复杂列表项时应保留 list-item 结构", () => {
    let editor = createEditor();
    editor = withNormalizedCopy(editor);
    editor.children = [
      {
        type: "bulleted-list",
        children: [
          {
            type: "list-item",
            children: [
              createParagraph("parent"),
              {
                type: "bulleted-list",
                children: [
                  {
                    type: "list-item",
                    children: [createParagraph("child")],
                  },
                ],
              },
            ],
          },
        ],
      },
    ] as Descendant[];

    selectRange(editor, { path: [0, 0, 0, 0], offset: 0 }, { path: [0, 0, 1, 0, 0, 0], offset: 5 });

    expect(editor.getFragment()).toEqual([
      {
        type: "bulleted-list",
        children: [
          {
            type: "list-item",
            children: [
              createParagraph("parent"),
              {
                type: "bulleted-list",
                children: [
                  {
                    type: "list-item",
                    children: [createParagraph("child")],
                  },
                ],
              },
            ],
          },
        ],
      },
    ]);
  });

  it("高亮块内嵌列表时复制部分文本不应带出任意父容器", () => {
    let editor = createEditor();
    editor = withNormalizedCopy(editor);
    editor.children = [
      {
        type: "highlight-block",
        color: "yellow",
        children: [
          {
            type: "bulleted-list",
            children: [
              {
                type: "list-item",
                children: [createParagraph("nested item")],
              },
            ],
          },
        ],
      },
    ] as Descendant[];

    selectRange(editor, { path: [0, 0, 0, 0, 0], offset: 0 }, { path: [0, 0, 0, 0, 0], offset: 6 });

    expect(editor.getFragment()).toEqual([createParagraph("nested")]);
  });

  it("完整选中高亮块文本时保留高亮块结构", () => {
    let editor = createEditor();
    editor = withNormalizedCopy(editor);
    editor.children = [
      {
        type: "highlight-block",
        color: "red",
        children: [createParagraph("hello world")],
      },
    ] as Descendant[];

    selectRange(editor, { path: [0, 0, 0], offset: 0 }, { path: [0, 0, 0], offset: 11 });

    expect(editor.getFragment()).toEqual([
      {
        type: "highlight-block",
        color: "red",
        children: [createParagraph("hello world")],
      },
    ]);
  });

  it("完整选中 callout 时应保留 callout 结构", () => {
    let editor = createEditor();
    editor = withNormalizedCopy(editor);
    editor.children = [
      {
        type: "callout",
        calloutType: "warning",
        title: "注意",
        children: [createParagraph("body")],
      },
    ] as Descendant[];

    selectRange(editor, { path: [0, 0, 0], offset: 0 }, { path: [0, 0, 0], offset: 4 });

    expect(editor.getFragment()).toEqual([
      {
        type: "callout",
        calloutType: "warning",
        title: "注意",
        children: [createParagraph("body")],
      },
    ]);
  });

  it("完整选中 blockquote 时应保留 blockquote 结构", () => {
    let editor = createEditor();
    editor = withNormalizedCopy(editor);
    editor.children = [
      {
        type: "blockquote",
        children: [createParagraph("quoted")],
      },
    ] as Descendant[];

    selectRange(editor, { path: [0, 0, 0], offset: 0 }, { path: [0, 0, 0], offset: 6 });

    expect(editor.getFragment()).toEqual([
      {
        type: "blockquote",
        children: [createParagraph("quoted")],
      },
    ]);
  });

  it("表格单元格内的部分文本复制时应退化为纯内容", () => {
    let editor = createEditor();
    editor = withNormalizedCopy(editor);
    editor.children = [
      {
        type: "table",
        children: [
          {
            type: "table-row",
            children: [{ type: "table-cell", children: [{ text: "hello" }] }],
          },
        ],
      },
    ] as Descendant[];

    selectRange(editor, { path: [0, 0, 0, 0], offset: 1 }, { path: [0, 0, 0, 0], offset: 4 });

    expect(editor.getFragment()).toEqual([{ text: "ell" }]);
  });

  it("完整选中单元格时应保留最小表格结构", () => {
    let editor = createEditor();
    editor = withNormalizedCopy(editor);
    editor.children = [
      {
        type: "table",
        children: [
          {
            type: "table-row",
            children: [
              { type: "table-cell", children: [{ text: "left" }] },
              { type: "table-cell", children: [{ text: "right" }] },
            ],
          },
        ],
      },
    ] as Descendant[];

    selectRange(editor, { path: [0, 0, 0, 0], offset: 0 }, { path: [0, 0, 0, 0], offset: 4 });

    expect(editor.getFragment()).toEqual([
      {
        type: "table",
        children: [
          {
            type: "table-row",
            children: [{ type: "table-cell", children: [{ text: "left" }] }],
          },
        ],
      },
    ]);
  });

  it("完整选中已勾选 checklist 条目时应保留最小 checklist 结构和 checked 状态", () => {
    let editor = createEditor();
    editor = withNormalizedCopy(editor);
    editor.children = [
      {
        type: "check-list",
        children: [
          {
            type: "check-list-item",
            checked: true,
            children: [createParagraph("done")],
          },
          {
            type: "check-list-item",
            checked: false,
            children: [createParagraph("todo")],
          },
        ],
      },
    ] as Descendant[];

    selectRange(editor, { path: [0, 0, 0, 0], offset: 0 }, { path: [0, 0, 0, 0], offset: 4 });

    expect(editor.getFragment()).toEqual([
      {
        type: "check-list",
        children: [
          {
            type: "check-list-item",
            checked: true,
            children: [createParagraph("done")],
          },
        ],
      },
    ]);
  });

  it("完整选中未勾选 checklist 条目时应保留 checked false", () => {
    let editor = createEditor();
    editor = withNormalizedCopy(editor);
    editor.children = [
      {
        type: "check-list",
        children: [
          {
            type: "check-list-item",
            checked: false,
            children: [createParagraph("todo")],
          },
        ],
      },
    ] as Descendant[];

    selectRange(editor, { path: [0, 0, 0, 0], offset: 0 }, { path: [0, 0, 0, 0], offset: 4 });

    expect(editor.getFragment()).toEqual([
      {
        type: "check-list",
        children: [
          {
            type: "check-list-item",
            checked: false,
            children: [createParagraph("todo")],
          },
        ],
      },
    ]);
  });

  it("checklist 条目内的部分文本复制时仍应退化为纯内容", () => {
    let editor = createEditor();
    editor = withNormalizedCopy(editor);
    editor.children = [
      {
        type: "check-list",
        children: [
          {
            type: "check-list-item",
            checked: true,
            children: [createParagraph("done")],
          },
        ],
      },
    ] as Descendant[];

    selectRange(editor, { path: [0, 0, 0, 0], offset: 1 }, { path: [0, 0, 0, 0], offset: 3 });

    expect(editor.getFragment()).toEqual([createParagraph("on")]);
  });

  it("完整复制 contentId 5555 的真实内容时应保留原始结构", () => {
    const content = [
      createParagraph(
        'Content-Disposition 字面意思是"内容的处置方式"，它的语义是：​告诉接收方应该如何对待这段内容。它本质上是一个元数据头，不描述内容，而是描述内容的用途和归属。'
      ),
      createParagraph("它描述的信息取决于作为响应头还是请求头："),
      {
        type: "bulleted-list",
        children: [
          {
            type: "list-item",
            children: [
              createParagraph("响应头：描述接收到内容如何处置，是直接显示还是存储到磁盘中（下载）"),
              createCodeBlock(
                "Content-Disposition: inline\nContent-Disposition: attachment\nContent-Disposition: attachment; filename=\"report.pdf\"\nContent-Disposition: attachment; filename*=UTF-8''%E6%8A%A5%E5%91%8A.pdf"
              ),
              {
                type: "bulleted-list",
                children: [
                  {
                    type: "list-item",
                    children: [
                      {
                        type: "paragraph",
                        disableDrag: false,
                        children: [
                          { type: "formatted", text: "inline", code: true },
                          {
                            type: "formatted",
                            text: "，表示在浏览器中直接显示（默认行为，比如图片和 PDF 预览）",
                          },
                        ],
                      },
                    ],
                  },
                  {
                    type: "list-item",
                    children: [
                      {
                        type: "paragraph",
                        disableDrag: false,
                        children: [
                          { type: "formatted", text: "attachment", code: true },
                          { type: "formatted", text: "：触发下载" },
                        ],
                      },
                      {
                        type: "bulleted-list",
                        children: [
                          {
                            type: "list-item",
                            children: [
                              {
                                type: "paragraph",
                                disableDrag: false,
                                children: [
                                  {
                                    type: "formatted",
                                    text: "filename",
                                    code: true,
                                  },
                                  { type: "formatted", text: "、" },
                                  {
                                    type: "formatted",
                                    text: "filename*",
                                    code: true,
                                  },
                                  {
                                    type: "formatted",
                                    text: "：可以指定下载的默认文件名",
                                  },
                                ],
                              },
                            ],
                          },
                          {
                            type: "list-item",
                            children: [
                              {
                                type: "paragraph",
                                disableDrag: false,
                                children: [
                                  {
                                    type: "formatted",
                                    text: "filename",
                                    code: true,
                                  },
                                  {
                                    type: "formatted",
                                    text: " 是旧语法，只支持 ASCII 字符，",
                                  },
                                  {
                                    type: "formatted",
                                    text: "filename*",
                                    code: true,
                                  },
                                  {
                                    type: "formatted",
                                    text: " 支持任意字符，浏览器优先支持 ",
                                  },
                                  {
                                    type: "formatted",
                                    text: "filename*",
                                    code: true,
                                  },
                                  {
                                    type: "formatted",
                                    text: "，比较旧的浏览器不支持 ",
                                  },
                                  {
                                    type: "formatted",
                                    text: "filename*",
                                    code: true,
                                  },
                                  { type: "formatted", text: "，则会使用 " },
                                  {
                                    type: "formatted",
                                    text: "filename ",
                                    code: true,
                                  },
                                  { type: "formatted", text: "作为回退" },
                                ],
                              },
                            ],
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
              createCodeBlock(
                "HTTP/1.1 200 OK\nContent-Type: application/pdf\nContent-Disposition: attachment; filename=\"fallback.pdf\"; filename*=UTF-8''%E6%8A%A5%E5%91%8A2024.pdf"
              ),
            ],
          },
          {
            type: "list-item",
            children: [
              {
                type: "paragraph",
                disableDrag: false,
                children: [
                  { type: "formatted", text: "请求头：当表单通过 " },
                  {
                    type: "content-link",
                    contentId: 5552,
                    contentType: "card",
                    contentTitle: "",
                    refId: 692,
                    children: [
                      {
                        type: "formatted",
                        text: "multipart/form-data",
                        code: true,
                      },
                    ],
                  },
                  {
                    type: "formatted",
                    text: " 提交数据时，描述这个 part 属于哪个表单字段",
                  },
                ],
              },
              createCodeBlock(
                'Content-Disposition: form-data; name="<字段名>"\nContent-Disposition: form-data; name="<字段名>"; filename="<文件名>"'
              ),
              createParagraph("一个实际表单提交的示例"),
              createCodeBlock(
                'POST /upload HTTP/1.1\nHost: localhost:3000\nContent-Type: multipart/form-data; boundary=----WebKitFormBoundaryABC123\nContent-Length: 348\n\n------WebKitFormBoundaryABC123\nContent-Disposition: form-data; name="username"\n\nalice\n------WebKitFormBoundaryABC123\nContent-Disposition: form-data; name="avatar"; filename="photo.jpg"\nContent-Type: image/jpeg\n\n<binary data of photo.jpg>\n------WebKitFormBoundaryABC123--'
              ),
            ],
          },
        ],
      },
    ] as Descendant[];

    let editor = createEditor();
    editor = withNormalizedCopy(editor);
    editor.children = content;

    Transforms.select(editor, {
      anchor: Editor.start(editor, [0]),
      focus: Editor.end(editor, [2]),
    });

    expect(editor.getFragment()).toEqual(content);
  });
});
