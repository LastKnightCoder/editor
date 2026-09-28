import { App } from "antd";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import type { Descendant } from "slate";

import ChatInputArea, { type ChatInputAreaHandle } from "../ChatInputArea";
import { ChatInputArea as SharedChatInputArea } from "@tau/shared";

const uploadFileMock = vi.hoisted(() => vi.fn(async (file: File) => `/saved/${file.name}`));

vi.mock("@/hooks/useUploadResource", () => ({ default: () => uploadFileMock }));

vi.mock("@/commands", () => ({
  convertFileSrc: vi.fn(async (path: string) => `file://${path}`),
  getHomeDir: vi.fn(async () => "/home/test"),
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
  getDesktopKit: () => ({}),
  getDesktopBareKit: () => ({}),
}));
vi.mock("@tau/editor/src", () => {
  const MockEditor = forwardRef<
    {
      focus: () => void;
      setEditorValue: (nodes: Descendant[]) => void;
      getEditor: () => { insertText: (text: string) => void };
      isFocus: () => boolean;
      deselect: () => void;
      scrollHeaderIntoView: () => void;
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
  >(({ initValue = [], onChange, className, hotkeyConfigs = [] }, ref) => {
    const [value, setValue] = useState<Descendant[]>(initValue);

    capturedHotkeyConfigs = hotkeyConfigs;

    useEffect(() => {
      setValue(initValue);
    }, [initValue]);

    useImperativeHandle(ref, () => ({
      focus: () => undefined,
      setEditorValue: (nodes: Descendant[]) => {
        setValue(nodes);
        onChange?.(nodes);
      },
      getEditor: () => ({ insertText: insertTextMock }),
      isFocus: () => true,
      deselect: () => undefined,
      scrollHeaderIntoView: () => undefined,
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
    root?.render(
      <App>
        <ChatInputArea ref={ref} />
      </App>
    );
  });
};

describe("桌面端 ChatInputArea Editor 输入", () => {
  afterEach(async () => {
    uploadFileMock.mockClear();
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
    "%s 上传图片和 PDF 不依赖资源登记，清空只移除输入附件",
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
          <App>
            {variant === "desktop" ? (
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
            )}
          </App>
        );
      });
      for (const [accept, name, type] of [
        ["image/png, image/jpeg, image/webp", "image.png", "image/png"],
        ["application/pdf", "document.pdf", "application/pdf"],
      ]) {
        const input = container.querySelector<HTMLInputElement>(
          `input[type="file"][accept="${accept}"]`
        );
        expect(input).toBeTruthy();
        Object.defineProperty(input, "files", {
          configurable: true,
          value: [new File(["附件"], name, { type })],
        });
        await act(async () => {
          input?.dispatchEvent(new Event("change", { bubbles: true }));
        });
        await vi.waitFor(async () => {
          await act(async () => {});
          expect(ref.current?.getValue()).toEqual(
            expect.arrayContaining([
              expect.objectContaining(
                type === "image/png" ? { path: `/saved/${name}` } : { file: `/saved/${name}` }
              ),
            ])
          );
        });
      }
      expect(ref.current?.getValue()).toEqual([
        { type: "image", image: "file:///saved/image.png", path: "/saved/image.png" },
        { type: "file", file: "/saved/document.pdf", fileName: "document.pdf" },
      ]);
      expect(uploadFileMock).toHaveBeenCalledTimes(2);
      await act(async () => ref.current?.clear());
      expect(ref.current?.getValue()).toEqual([]);
    }
  );

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

  it("应限制编辑器区域高度，并允许长内容在输入区内部滚动", async () => {
    const ref = {
      current: null,
    } as React.RefObject<ChatInputAreaHandle | null>;
    await renderChatInputArea(ref);

    const editor = container?.querySelector('[data-testid="chat-editor"]') as HTMLElement | null;

    // 编辑器裁剪拖拽手柄溢出；外层限高并内部滚动（D-048 Tailwind 化）
    expect(editor?.className).toContain("overflow-hidden");
    expect(editor?.parentElement?.className).toContain("max-h-[min(240px,34vh)]");
    expect(editor?.parentElement?.className).toContain("overflow-y-auto");
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
      root?.render(
        <App>
          <ChatInputArea ref={ref} onPressEnter={onPressEnter} />
        </App>
      );
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
