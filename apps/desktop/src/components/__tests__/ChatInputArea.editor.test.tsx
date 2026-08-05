import { App } from "antd";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import type { Descendant } from "slate";

import ChatInputArea, { type ChatInputAreaHandle } from "../ChatInputArea";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@/hooks/useUploadResource", () => ({
  default: () => vi.fn(),
}));

vi.mock("@/commands", () => ({
  convertFileSrc: vi.fn(),
  createOrUpdateResource: vi.fn(),
  getHomeDir: vi.fn(),
  decrementResourceRefCount: vi.fn(),
  incrementResourceRefCount: vi.fn(),
}));

vi.mock("@/stores/useMCPManagerModalStore", () => ({
  default: () => vi.fn(),
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
        (node.children || [])
          .map((child: any) => child.text || child.contentTitle || "")
          .join(""),
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
}));

let capturedHotkeyConfigs: Array<{
  hotKey: string | string[];
  action: (editor: unknown, event: React.KeyboardEvent<HTMLDivElement>) => void;
}> = [];

vi.mock("@tau/editor/src", () => {
  const MockEditor = forwardRef<
    {
      focus: () => void;
      setEditorValue: (nodes: Descendant[]) => void;
      getEditor: () => Record<string, never>;
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
        action: (
          editor: unknown,
          event: React.KeyboardEvent<HTMLDivElement>,
        ) => void;
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
      getEditor: () => ({}),
      isFocus: () => true,
      deselect: () => undefined,
      scrollHeaderIntoView: () => undefined,
    }));

    const renderedText = value
      .map((node: any) =>
        (node.children || [])
          .map((child: any) => child.contentTitle || child.text || "")
          .join(""),
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

const renderChatInputArea = async (
  ref: React.RefObject<ChatInputAreaHandle | null>,
) => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(
      <App>
        <ChatInputArea ref={ref} />
      </App>,
    );
  });
};

describe("桌面端 ChatInputArea Editor 输入", () => {
  afterEach(async () => {
    capturedHotkeyConfigs = [];
    if (root) {
      await act(async () => {
        root?.unmount();
      });
    }
    root = null;
    container?.remove();
    container = null;
  });

  it("应使用 Editor 承载正文输入，并避免向用户展示 raw content-link markup", async () => {
    const ref = {
      current: null,
    } as React.RefObject<ChatInputAreaHandle | null>;
    await renderChatInputArea(ref);

    await act(async () => {
      ref.current?.setValue(
        '请看 :content-link[测试卡片]{refId=42 contentId=301 contentType=card title="测试卡片"}',
      );
    });

    const editor = container?.querySelector(
      '[data-testid="chat-editor"]',
    ) as HTMLElement | null;

    expect(editor).toBeTruthy();
    expect(editor?.textContent).toContain("测试卡片");
    expect(editor?.textContent).not.toContain(":content-link[");
  });

  it("应限制编辑器区域高度，并允许长内容在输入区内部滚动", async () => {
    const ref = {
      current: null,
    } as React.RefObject<ChatInputAreaHandle | null>;
    await renderChatInputArea(ref);

    const editor = container?.querySelector(
      '[data-testid="chat-editor"]',
    ) as HTMLElement | null;

    expect(editor?.className).toContain("editorInput");
    expect(editor?.parentElement?.className).toContain("editorScrollContainer");
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
        </App>,
      );
    });

    const plainEnterHotkey = capturedHotkeyConfigs.find(
      (config) => config.hotKey === "enter",
    );
    const modEnterHotkey = capturedHotkeyConfigs.find(
      (config) => config.hotKey === "mod+enter",
    );

    expect(plainEnterHotkey).toBeUndefined();
    expect(modEnterHotkey).toBeTruthy();

    const preventDefault = vi.fn();
    modEnterHotkey?.action({}, {
      preventDefault,
    } as unknown as React.KeyboardEvent<HTMLDivElement>);

    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(onPressEnter).toHaveBeenCalledTimes(1);
  });
});
