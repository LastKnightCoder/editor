import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import type { Descendant } from "slate";

import { desktopLocaleSource } from "@/app/i18n/runtime";
import ChatInputArea, { type ChatInputAreaHandle } from "../ChatInputArea";
import { ChatInputArea as SharedChatInputArea } from "@tau/shared";

const uploadFileMock = vi.hoisted(() => vi.fn(async (file: File) => `/saved/${file.name}`));
const copyFileToLocalMock = vi.hoisted(() =>
  vi.fn(async (_file: File, name: string) => `~/resources/${name}`)
);

vi.mock("@/utils/resouce", () => ({ copyFileToLocal: copyFileToLocalMock }));

vi.mock("@/commands", () => ({
  convertFileSrc: vi.fn(async (path: string) => `file://${path}`),
  getHomeDir: vi.fn(async () => "/home/test"),
  isDirectory: async () => false,
}));

vi.mock("@/features/mcp/components/McpQuickPanel", () => ({
  McpQuickPanel: () => null,
}));

vi.mock("@/hooks/useEmbeddingConfig", () => ({
  default: () => ({
    providerType: "openai",
    model: "text-embedding-3-small",
    distance: 0.5,
    dimensions: 1536,
  }),
}));

vi.mock("@/utils/search", () => ({
  getAllIndexResults: vi.fn(async () => []),
  searchContent: vi.fn(async () => []),
}));

vi.mock("@/utils/flashcard", () => ({
  extractPlainText: vi.fn(() => ""),
}));

vi.mock("@/hooks/useTheme", () => ({
  default: () => ({
    theme: "light",
    isDark: false,
  }),
}));

vi.mock("@/utils/markdown", () => ({
  getMarkdown: (value: Descendant[]) =>
    value
      .map((node: any) =>
        (node.children || []).map((child: any) => child.text || child.contentTitle || "").join("")
      )
      .join("\n"),
  importFromMarkdown: (markdown: string) =>
    markdown.includes(":content-link[测试卡片]")
      ? [
          {
            type: "paragraph",
            children: [
              { type: "formatted", text: "请看 " },
              {
                type: "content-link",
                refId: 42,
                contentId: 301,
                contentType: "card",
                contentTitle: "测试卡片",
                children: [{ type: "formatted", text: "测试卡片" }],
              },
            ],
          },
        ]
      : [
          {
            type: "paragraph",
            children: [{ type: "formatted", text: markdown }],
          },
        ],
}));

vi.mock("@/editor-extensions", () => ({
  contentLinkExtension: { type: "content-link" },
  skillRefExtension: { type: "skill-ref" },
}));

vi.mock("@/editor-extensions/skill-ref/SkillPickerPanel", () => ({
  SkillPickerPanel: () => null,
}));

const wrapContentLinkMock = vi.hoisted(() => vi.fn());
const insertTextMock = vi.hoisted(() => vi.fn());

vi.mock("@/editor-extensions/content-link/components/utils", () => ({
  wrapContentLink: wrapContentLinkMock,
}));

let capturedHotkeyConfigs: Array<{
  hotKey: string | string[];
  action: (editor: unknown, event: React.KeyboardEvent<HTMLDivElement>) => void;
}> = [];

// 宿主组件只验证自身逻辑，不渲染真实编辑器，kit 也不必真实构造
vi.mock("@/services/editorKit", () => ({
  createDesktopKit: () => ({}),
  getContentKit: () => ({}),
  getDescriptionKit: () => ({}),
  getMarkdownFileKit: () => ({}),
  getSkillFileKit: () => ({}),
  getFlashcardKit: () => ({}),
  getArrowLabelKit: () => ({}),
}));
vi.mock("@tau/editor", () => {
  const MockEditor = forwardRef<
    {
      focus: () => void;
      getEditor: () => { insertText: (text: string) => void };
      isFocus: () => boolean;
      deselect: () => void;
    },
    {
      initValue?: Descendant[];
      onChange?: (value: Descendant[]) => void;
      className?: string;
      hotkeyConfigs?: Array<{
        hotKey: string | string[];
        action: (editor: unknown, event: React.KeyboardEvent<HTMLDivElement>) => void;
      }>;
    }
  >(({ initValue = [], className, hotkeyConfigs = [] }, ref) => {
    const [value, setValue] = useState<Descendant[]>(initValue);

    capturedHotkeyConfigs = hotkeyConfigs;

    useEffect(() => {
      setValue(initValue);
    }, [initValue]);

    useImperativeHandle(ref, () => ({
      focus: () => undefined,
      getEditor: () => ({ insertText: insertTextMock }),
      isFocus: () => true,
      deselect: () => undefined,
    }));

    const renderedText = value
      .map((node: any) =>
        (node.children || []).map((child: any) => child.contentTitle || child.text || "").join("")
      )
      .join("\n");

    return (
      <div data-testid="chat-editor" className={className}>
        {renderedText}
      </div>
    );
  });

  return {
    Editor: MockEditor,
  };
});

let root: Root | null = null;
let container: HTMLDivElement | null = null;

const renderChatInputArea = async (ref: React.RefObject<ChatInputAreaHandle | null>) => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(<ChatInputArea ref={ref} />);
  });
};

describe("桌面端 ChatInputArea Editor 输入", () => {
  afterEach(async () => {
    await act(async () => desktopLocaleSource.setLocale("zh-CN"));
    uploadFileMock.mockClear();
    copyFileToLocalMock.mockClear();
    capturedHotkeyConfigs = [];
    wrapContentLinkMock.mockReset();
    insertTextMock.mockReset();
    if (root) {
      await act(async () => {
        root?.unmount();
      });
    }
    root = null;
    container?.remove();
    container = null;
    vi.unstubAllGlobals();
  });

  it.each(["desktop", "shared"])(
    "%s 选择图片和 PDF 后保留附件引用，清空草稿移除附件",
    async variant => {
      vi.stubGlobal(
        "ResizeObserver",
        class {
          observe() {}
          unobserve() {}
          disconnect() {}
        }
      );
      const ref = { current: null } as React.RefObject<ChatInputAreaHandle | null>;
      container = document.createElement("div");
      document.body.appendChild(container);
      root = createRoot(container);
      await act(async () => {
        root?.render(
          variant === "desktop" ? (
            <ChatInputArea ref={ref} isSupportImage isSupportFile />
          ) : (
            <SharedChatInputArea
              ref={ref}
              isSupportImage
              isSupportFile
              services={{
                uploadFile: uploadFileMock,
                convertFileSrc: async path => `file://${path}`,
                getHomeDir: async () => "/home/test",
              }}
            />
          )
        );
      });
      const directory = variant === "desktop" ? "/original" : "/saved";
      vi.stubGlobal("electron", { getPathForFile: (file: File) => `/original/${file.name}` });
      for (const [selector, name, type] of [
        ['input[accept*="image/png"]', "image.png", "image/png"],
        [
          variant === "desktop" ? 'input[accept="*/*"]' : 'input[accept="application/pdf"]',
          "document.pdf",
          "application/pdf",
        ],
      ]) {
        const input = container.querySelector<HTMLInputElement>(selector);
        if (!input) throw new Error("缺少文件选择入口");
        Object.defineProperty(input, "files", {
          configurable: true,
          value: [new File(["附件"], name, { type })],
        });
        await act(async () => {
          input.dispatchEvent(new Event("change", { bubbles: true }));
        });
      }
      expect(ref.current?.getValue()).toEqual([
        { type: "image", image: `file://${directory}/image.png`, path: `${directory}/image.png` },
        { type: "file", file: `${directory}/document.pdf`, fileName: "document.pdf" },
      ]);
      expect(copyFileToLocalMock).not.toHaveBeenCalled();
      await act(async () => ref.current?.clear());
      expect(ref.current?.getValue()).toEqual([]);
    }
  );

  it("外部拖入的文件保留原路径，剪贴板截图每张只添加一次并独立保存", async () => {
    const ref = { current: null } as React.RefObject<ChatInputAreaHandle | null>;
    await renderChatInputArea(ref);
    await act(async () => root?.render(<ChatInputArea ref={ref} isSupportFile isSupportImage />));
    const editor = container?.querySelector('[data-testid="chat-editor"]');
    if (!editor) throw new Error("缺少输入框");
    const pdf = new File(["文件"], "笔记.pdf", { type: "application/pdf" });
    const photo = new File(["图片"], "原图.png", { type: "image/png" });
    const screenshot = new File(["截图"], "image.png", { type: "image/png" });
    vi.stubGlobal("electron", {
      getPathForFile: (file: File) => (file === screenshot ? "" : `/original/${file.name}`),
    });
    const dispatchFiles = async (kind: "drop" | "paste", files: File[]) => {
      const event = new Event(kind, { bubbles: true, cancelable: true });
      Object.defineProperty(event, kind === "drop" ? "dataTransfer" : "clipboardData", {
        value: {
          types: ["Files"],
          files,
          items: files.map(file => ({ kind: "file", getAsFile: () => file })),
        },
      });
      await act(async () => {
        editor.dispatchEvent(event);
      });
      expect(event.defaultPrevented).toBe(true);
    };
    await dispatchFiles("drop", [pdf, photo]);
    await dispatchFiles("paste", [photo, screenshot, screenshot]);
    const items = ref.current?.getValue() ?? [];
    expect(items.slice(0, 3)).toEqual([
      { type: "file", file: "/original/笔记.pdf", fileName: "笔记.pdf" },
      ...Array(2).fill({
        type: "image",
        path: "/original/原图.png",
        image: "file:///original/原图.png",
      }),
    ]);
    const savedPaths = items.slice(3).map(item => (item.type === "image" ? item.path : undefined));
    expect(savedPaths).toEqual([
      expect.stringMatching(/^\/home\/test\/resources\//),
      expect.stringMatching(/^\/home\/test\/resources\//),
    ]);
    expect(savedPaths[0]).not.toBe(savedPaths[1]);
    expect(copyFileToLocalMock.mock.calls.map(([file]) => file)).toEqual([screenshot, screenshot]);
  });

  it("换语不替换编辑器或丢草稿，也不重启在途附件保存与发送", async () => {
    const ref = { current: null } as React.RefObject<ChatInputAreaHandle | null>;
    const send = vi.fn();
    const think = vi.fn();
    await renderChatInputArea(ref);
    await act(async () =>
      root?.render(
        <ChatInputArea
          ref={ref}
          isSupportImage
          onPressEnter={send}
          thinkingLevel="high"
          onThinkingLevelChange={think}
        />
      )
    );
    await act(async () => ref.current?.setValue("用户草稿 :content[id]"));
    const editor = container?.querySelector('[data-testid="chat-editor"]');
    if (!editor) throw new Error("missing editor boundary");
    let finish!: (path: string) => void;
    copyFileToLocalMock.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          finish = resolve;
        })
    );
    vi.stubGlobal("electron", { getPathForFile: () => "" });
    const screenshot = new File(["截图"], "image.png", { type: "image/png" });
    const paste = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(paste, "clipboardData", { value: { files: [screenshot] } });
    await act(async () => editor.dispatchEvent(paste));
    for (const locale of ["en-US", "zh-TW"] as const) {
      await act(async () => desktopLocaleSource.setLocale(locale));
      expect(container?.querySelector('[data-testid="chat-editor"]')).toBe(editor);
      expect(ref.current?.getValue()).toEqual([
        { type: "text", text: "用户草稿 :content[id]", mentions: [] },
      ]);
      expect(copyFileToLocalMock).toHaveBeenCalledTimes(1);
      expect(send).not.toHaveBeenCalled();
      expect(think).not.toHaveBeenCalled();
    }
    await act(async () => finish("~/resources/screenshot.png"));
    const expected = [
      {
        type: "image",
        path: "/home/test/resources/screenshot.png",
        image: "file:///home/test/resources/screenshot.png",
      },
      { type: "text", text: "用户草稿 :content[id]", mentions: [] },
    ];
    expect(ref.current?.getValue()).toEqual(expected);
    await act(async () => desktopLocaleSource.setLocale("zh-CN"));
    expect(ref.current?.getValue()).toEqual(expected);
    expect(copyFileToLocalMock).toHaveBeenCalledTimes(1);
    const submit = capturedHotkeyConfigs.find(config => config.hotKey === "mod+enter");
    if (!submit) throw new Error("missing submit hotkey");
    submit.action({}, { preventDefault: () => undefined } as React.KeyboardEvent<HTMLDivElement>);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("应使用 Editor 承载正文输入，并避免向用户展示 raw content-link markup", async () => {
    const ref = {
      current: null,
    } as React.RefObject<ChatInputAreaHandle | null>;
    await renderChatInputArea(ref);

    await act(async () => {
      ref.current?.setValue(
        '请看 :content-link[测试卡片]{refId=42 contentId=301 contentType=card title="测试卡片"}'
      );
    });

    const editor = container?.querySelector('[data-testid="chat-editor"]') as HTMLElement | null;

    expect(editor).toBeTruthy();
    expect(editor?.textContent).toContain("测试卡片");
    expect(editor?.textContent).not.toContain(":content-link[");
  });

  it.each([false, true])("紧凑模式 %s 只展示模型选择，不展示代理或工作目录", async compact => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root?.render(
        <ChatInputArea
          compact={compact}
          currentModelName="测试模型"
          modelGroups={[
            {
              key: "provider",
              label: "服务商",
              children: [{ key: "provider::model", label: "测试模型" }],
            },
          ]}
          onModelSelect={vi.fn()}
        />
      );
    });
    expect(container?.textContent).toContain("测试模型");
    expect(container?.textContent).not.toMatch(/本地代理|Codex|临时目录|工作区/);
    expect(container?.querySelector('[aria-label^="代理："]')).toBeNull();
  });

  it("应使用 mod+enter 发送，并保留 Enter 用于编辑器换行", async () => {
    const onPressEnter = vi.fn();
    const ref = {
      current: null,
    } as React.RefObject<ChatInputAreaHandle | null>;

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root?.render(<ChatInputArea ref={ref} onPressEnter={onPressEnter} />);
    });

    const plainEnterHotkey = capturedHotkeyConfigs.find(config => config.hotKey === "enter");
    const modEnterHotkey = capturedHotkeyConfigs.find(config => config.hotKey === "mod+enter");

    expect(plainEnterHotkey).toBeUndefined();
    expect(modEnterHotkey).toBeTruthy();

    const preventDefault = vi.fn();
    modEnterHotkey?.action({}, {
      preventDefault,
    } as unknown as React.KeyboardEvent<HTMLDivElement>);

    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(onPressEnter).toHaveBeenCalledTimes(1);
  });

  it("应通过 ref 将拖入内容追加为 content-link 引用", async () => {
    const ref = {
      current: null,
    } as React.RefObject<ChatInputAreaHandle | null>;
    await renderChatInputArea(ref);

    await act(async () => {
      ref.current?.appendMention?.({
        entityType: "project-item",
        entityId: 42,
        contentId: 301,
        title: "项目文档",
        previewText: "项目摘要",
      });
    });

    expect(wrapContentLinkMock).toHaveBeenCalledWith(
      expect.anything(),
      301,
      "project-item",
      "项目文档",
      42,
      "项目文档"
    );
    expect(insertTextMock).toHaveBeenCalledWith(" ");
  });
});
