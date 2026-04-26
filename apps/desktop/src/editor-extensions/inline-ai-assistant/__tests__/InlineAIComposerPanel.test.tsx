import { App } from "antd";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { forwardRef, useImperativeHandle } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import InlineAIComposerPanel from "../components/InlineAIComposerPanel";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const mockLoadSkills = vi.fn(async () => undefined);

vi.mock("@/components/BlockCard", () => ({
  default: () => <div data-testid="block-card" />,
}));

vi.mock("@/components/ChatInputArea", () => {
  const MockChatInputArea = forwardRef(
    (
      props: {
        placeholder?: string;
      },
      ref,
    ) => {
      useImperativeHandle(ref, () => ({
        focusEnd: () => undefined,
        clear: () => undefined,
        getValue: () => [],
      }));

      return (
        <div
          data-testid="inline-chat-input"
          data-placeholder={props.placeholder ?? "__default__"}
        />
      );
    },
  );

  return {
    __esModule: true,
    default: MockChatInputArea,
  };
});

vi.mock("@/layouts/ContentLayout/components/ChatSidebar/MessageItem", () => ({
  default: () => <div data-testid="message-item" />,
}));

vi.mock(
  "@/layouts/ContentLayout/components/ChatSidebar/MarkdownContext",
  () => ({
    MarkdownProvider: ({ children }: { children: React.ReactNode }) => (
      <>{children}</>
    ),
    useMarkdownContext: () => ({
      messageMeta: null,
    }),
  }),
);

vi.mock("@/hooks/useLLMConfig", () => ({
  default: () => ({
    providerConfig: null,
    modelConfig: null,
  }),
}));

vi.mock("@/hooks/useTheme", () => ({
  default: () => ({
    isDark: false,
  }),
}));

vi.mock("@/hooks/useThemeColors", () => ({
  default: () => ({
    chatInputBg: "chat-input-bg",
    modalPanelBg: "modal-solid-bg",
    cardBorderClass: "card-border",
  }),
}));

vi.mock("@/stores/useSkillStore", () => ({
  default: (
    selector: (state: {
      skills: never[];
      loadSkills: typeof mockLoadSkills;
    }) => unknown,
  ) =>
    selector({
      skills: [],
      loadSkills: mockLoadSkills,
    }),
}));

vi.mock("@/hooks/useChatLLM", () => ({
  chatLLMStream: vi.fn(),
}));

vi.mock("@/commands", () => ({
  openExternal: vi.fn(),
}));

vi.mock("@/utils/blockRegistry", () => ({
  blockRegistry: {
    isPreviewable: () => false,
    getRenderer: () => null,
  },
}));

vi.mock("@tau/shared", () => ({
  LazySyntaxHighlighter: ({ children }: { children?: React.ReactNode }) => (
    <pre>{children}</pre>
  ),
}));

vi.mock("@/services/content-editing", () => ({
  buildInlineEditorContext: vi.fn(async () => ({
    contentId: 101,
    entityType: "card",
    entityId: 1,
    snapshotId: "snapshot-1",
    snapshotSource: "active-session",
    documentHash: "hash",
    documentLength: 12,
    selection: null,
    selectionRange: null,
    selectedMarkdown: "当前选中的文字",
    selectionBefore: "",
    selectionAfter: "",
    currentBlockMarkdown: "",
    fullDocument: {
      strategy: "full",
      markdown: "当前选中的文字",
      truncated: false,
    },
  })),
  buildInlineContextPrompt: vi.fn(),
}));

vi.mock("@/services/assistantMessageBlocks", () => ({
  applyAssistantReasoningSnapshot: vi.fn(),
  applyAssistantTextSnapshot: vi.fn(),
  applyAssistantToolCallsSnapshot: vi.fn(),
  buildAssistantHistoryMessages: vi.fn(() => []),
  createAssistantMessage: vi.fn(() => ({
    content: "",
    reasoning_content: "",
    tool_executions: [],
    assistant_blocks: [],
  })),
  finalizeAssistantTurn: vi.fn(),
  syncAssistantLegacyFields: vi.fn(),
}));

vi.mock("slate-react", () => ({
  ReactEditor: {
    toDOMNode: () => ({
      getBoundingClientRect: () => ({
        left: 40,
        bottom: 480,
        width: 960,
      }),
    }),
  },
}));

let root: Root | null = null;
let container: HTMLDivElement | null = null;

describe("InlineAIComposerPanel", () => {
  afterEach(async () => {
    if (root) {
      await act(async () => {
        root?.unmount();
      });
    }
    root = null;
    container?.remove();
    container = null;
    vi.clearAllMocks();
  });

  it("应使用实色面板背景，并复用 ChatInputArea 默认 placeholder", async () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <App>
          <InlineAIComposerPanel
            editor={{} as never}
            source="hovering"
            onClose={() => undefined}
          />
        </App>,
      );
    });

    const panelBody = container.querySelector(
      '[data-inline-ai-composer="true"] > div',
    ) as HTMLElement | null;
    const chatInput = container.querySelector(
      '[data-testid="inline-chat-input"]',
    ) as HTMLElement | null;

    expect(panelBody).toBeTruthy();
    expect(panelBody?.className).toContain("modal-solid-bg");
    expect(panelBody?.className).not.toContain("chat-input-bg");
    expect(chatInput?.dataset.placeholder).toBe("__default__");
  });
});
