import { act } from "react";
import type { ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ContentEditProposalRenderer from "../ContentEditProposalRenderer";
import type { ToolCallExecutionState } from "@/types";
import {
  useContentEditReviewSessionStore,
  useContentEditReviewStore,
} from "@/services/content-editing";
import type {
  ContentEditProposalRecord,
  ContentEditRendererPayload,
} from "@/services/content-editing";

// 宿主组件只验证自身逻辑，不渲染真实编辑器，kit 也不必真实构造
vi.mock("@/services/editorKit", () => ({
  getDesktopKit: () => ({}),
  getDesktopBareKit: () => ({}),
}));
vi.mock("@tau/editor/src", () => ({
  Editor: ({ initValue }: { initValue: unknown }) => (
    <div data-testid="editor-preview">{JSON.stringify(initValue)}</div>
  ),
}));

(globalThis as any).ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

const createExecution = (
  overrides: Partial<ToolCallExecutionState> = {}
): ToolCallExecutionState => ({
  toolCallId: "content-edit-call-1",
  toolName: "replace_content_by_text",
  status: "pending",
  input: '{"toolName":"replace_content_by_text","proposalId":"proposal-1"}',
  timestamp: Date.now(),
  ...overrides,
});

const createPayload = (): ContentEditRendererPayload => ({
  kind: "content-edit-proposal",
  proposalId: "proposal-1",
  conversationKey: "main-chat:1",
  contentId: 1,
  sourceToolName: "replace_content_by_text",
  status: "pending_review",
  beforeMarkdown: "hello world",
  beforeHash: "before",
  afterHash: "after",
  snapshotId: "snapshot-1",
  diffSummary: {
    patchCount: 1,
    insertedChars: 3,
    deletedChars: 1,
    changePreviews: [
      {
        operationId: "replace-world",
        op: "replace",
        beforeTextPreview: "world",
        afterTextPreview: "tau",
        charDelta: -2,
      },
    ],
  },
  patches: [
    {
      operationId: "replace-world",
      op: "replace",
      start: 6,
      end: 11,
      beforeText: "world",
      afterText: "tau",
      charDelta: -2,
    },
  ],
  currentPermission: "review_required",
  targetSource: "active-session",
  createdAt: Date.now(),
  updatedAt: Date.now(),
  proposedMarkdown: "# 标题\n\nhello tau",
});

const createLongPayload = (): ContentEditRendererPayload => ({
  ...createPayload(),
  beforeMarkdown: ["第一段", "第二段", "第三段", "第四段", "第五段"].join("\n\n"),
  proposedMarkdown: ["第一段", "第二段", "第三段（已改）", "第四段", "第五段"].join("\n\n"),
  diffSummary: {
    patchCount: 1,
    insertedChars: 3,
    deletedChars: 0,
    changePreviews: [
      {
        operationId: "rewrite-middle",
        op: "replace",
        beforeTextPreview: "第三段",
        afterTextPreview: "第三段（已改）",
        charDelta: 3,
      },
    ],
  },
  patches: [
    {
      operationId: "rewrite-middle",
      op: "replace",
      start: 0,
      end: ["第一段", "第二段", "第三段", "第四段", "第五段"].join("\n\n").length,
      beforeText: ["第一段", "第二段", "第三段", "第四段", "第五段"].join("\n\n"),
      afterText: ["第一段", "第二段", "第三段（已改）", "第四段", "第五段"].join("\n\n"),
      charDelta: 3,
    },
  ],
});

const createProposalRecord = (): ContentEditProposalRecord => ({
  proposalId: "proposal-1",
  conversationKey: "main-chat:1",
  contentId: 1,
  sourceToolName: "replace_content_by_text",
  status: "pending_review",
  beforeMarkdown: "hello world",
  beforeHash: "before",
  afterHash: "after",
  snapshotId: "snapshot-1",
  snapshotSource: "active-session",
  targetSource: "active-session",
  proposalFilePath: "content-edit/proposals/proposal-1.json",
  diffSummary: createPayload().diffSummary,
  patches: createPayload().patches,
  createdAt: Date.now(),
  updatedAt: Date.now(),
  feedbackHistory: [],
});

const mount = async (node: ReactNode) => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(node);
  });
  return { root, container };
};

const unmount = async (root: Root, container: HTMLElement) => {
  await act(async () => {
    root.unmount();
  });
  container.remove();
};

const resetStores = () => {
  useContentEditReviewStore.setState({
    proposals: {},
    checkpoints: {},
    permissions: {},
  });
  useContentEditReviewSessionStore.setState({
    records: {},
  });
  localStorage.removeItem("content-edit-review-session");
  localStorage.removeItem("content-edit-review-tool-session");
};

describe("ContentEditProposalRenderer", () => {
  beforeEach(() => {
    resetStores();
    vi.restoreAllMocks();
  });

  it("待审核时应展示完整预览与审阅动作", async () => {
    const payload = createPayload();
    const proposal = createProposalRecord();
    useContentEditReviewStore.setState({
      proposals: {
        [proposal.proposalId]: proposal,
      },
      permissions: {
        [proposal.conversationKey]: "review_required",
      },
    });
    useContentEditReviewSessionStore.getState().createPending({
      toolCallId: "content-edit-call-1",
      toolName: "replace_content_by_text",
      conversationKey: proposal.conversationKey,
      rawInput: '{"toolName":"replace_content_by_text","proposalId":"proposal-1"}',
      proposalId: proposal.proposalId,
      payload,
    });

    const { root, container } = await mount(
      <ContentEditProposalRenderer
        execution={createExecution()}
        isDark={false}
        parsedInput={null}
        renderDefault={() => <div>fallback</div>}
      />
    );

    expect(container.textContent).toContain("请确认这次修改");
    expect(container.querySelector('[data-testid="editor-preview"]')).toBeTruthy();
    expect(container.textContent).toContain("确认应用");
    expect(container.textContent).toContain("提修改意见");
    expect(container.textContent).toContain("拒绝");

    await unmount(root, container);
  });

  it("提交修改意见时应写入 review session 决策", async () => {
    const payload = createPayload();
    const proposal = createProposalRecord();
    useContentEditReviewStore.setState({
      proposals: {
        [proposal.proposalId]: proposal,
      },
      permissions: {
        [proposal.conversationKey]: "review_required",
      },
    });
    const session = useContentEditReviewSessionStore.getState().createPending({
      toolCallId: "content-edit-call-1",
      toolName: "replace_content_by_text",
      conversationKey: proposal.conversationKey,
      rawInput: '{"toolName":"replace_content_by_text","proposalId":"proposal-1"}',
      proposalId: proposal.proposalId,
      payload,
    });

    const { root, container } = await mount(
      <ContentEditProposalRenderer
        execution={createExecution()}
        isDark={false}
        parsedInput={null}
        renderDefault={() => <div>fallback</div>}
      />
    );

    const openFeedbackButton = Array.from(container.querySelectorAll("button")).find(button =>
      button.textContent?.includes("提修改意见")
    );
    expect(openFeedbackButton).toBeTruthy();
    await act(async () => {
      openFeedbackButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const textarea = container.querySelector("textarea") as HTMLTextAreaElement;
    expect(textarea).toBeTruthy();
    expect(textarea.className).toContain("[field-sizing:content]");
    expect(textarea.className).toContain("min-h-28");
    const setValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
    await act(async () => {
      setValue?.call(textarea, "第二段更自然一些");
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });

    const submitButton = Array.from(container.querySelectorAll("button")).find(button =>
      button.textContent?.includes("提交修改意见")
    );
    expect(submitButton).toBeTruthy();
    await act(async () => {
      submitButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const updated = useContentEditReviewSessionStore.getState().records[session.sessionId];
    expect(updated?.status).toBe("submitted");
    expect(updated?.decision?.action).toBe("feedback");
    expect(updated?.decision?.feedback).toBe("第二段更自然一些");

    await unmount(root, container);
  });

  it("点击提修改意见时应滚动并聚焦到意见输入框", async () => {
    const payload = createLongPayload();
    const proposal = createProposalRecord();
    useContentEditReviewStore.setState({
      proposals: {
        [proposal.proposalId]: proposal,
      },
      permissions: {
        [proposal.conversationKey]: "review_required",
      },
    });
    useContentEditReviewSessionStore.getState().createPending({
      toolCallId: "content-edit-call-1",
      toolName: "replace_content_by_text",
      conversationKey: proposal.conversationKey,
      rawInput: '{"toolName":"replace_content_by_text","proposalId":"proposal-1"}',
      proposalId: proposal.proposalId,
      payload,
    });
    const scrollIntoView = vi.fn();
    const focus = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    HTMLTextAreaElement.prototype.focus = focus;

    const { root, container } = await mount(
      <ContentEditProposalRenderer
        execution={createExecution()}
        isDark={false}
        parsedInput={null}
        renderDefault={() => <div>fallback</div>}
      />
    );

    const openFeedbackButton = Array.from(container.querySelectorAll("button")).find(button =>
      button.textContent?.includes("提修改意见")
    );
    expect(openFeedbackButton).toBeTruthy();
    await act(async () => {
      openFeedbackButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await act(async () => {
      await new Promise(resolve => requestAnimationFrame(resolve));
    });

    expect(scrollIntoView).toHaveBeenCalledWith({
      behavior: "smooth",
      block: "nearest",
    });
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });

    await unmount(root, container);
  });

  it("已完成结果应展示简洁状态卡片", async () => {
    const payload = createPayload();
    const proposal = {
      ...createProposalRecord(),
      status: "applied" as const,
      checkpointId: "checkpoint-1",
    };
    useContentEditReviewStore.setState({
      proposals: {
        [proposal.proposalId]: proposal,
      },
      permissions: {
        [proposal.conversationKey]: "review_required",
      },
    });
    useContentEditReviewSessionStore.getState().createPending({
      toolCallId: "content-edit-call-1",
      toolName: "replace_content_by_text",
      conversationKey: proposal.conversationKey,
      rawInput: '{"toolName":"replace_content_by_text","proposalId":"proposal-1"}',
      proposalId: proposal.proposalId,
      payload,
    });

    const { root, container } = await mount(
      <ContentEditProposalRenderer
        execution={createExecution({
          status: "success",
          output: JSON.stringify({
            type: "content-edit-review-result",
            action: "applied",
            submittedAt: Date.now(),
            contentId: 1,
            proposalId: "proposal-1",
            conversationKey: "main-chat:1",
            checkpointId: "checkpoint-1",
            message: "用户已确认应用修改",
            proposal: {
              sourceToolName: "replace_content_by_text",
              proposedMarkdown: "# 标题\n\nhello tau",
              diffSummary: payload.diffSummary,
              patches: payload.patches,
            },
          }),
        })}
        isDark={false}
        parsedInput={null}
        renderDefault={() => <div>fallback</div>}
      />
    );

    expect(container.textContent).toContain("已应用");
    expect(container.textContent).toContain("用户已确认应用修改");
    expect(container.querySelector('[aria-label="撤销这次应用"]')).toBeTruthy();

    await unmount(root, container);
  });

  it("重启后仅凭完成态结果也应恢复统一卡片与撤销入口", async () => {
    const payload = createPayload();
    const proposal = {
      ...createProposalRecord(),
      status: "applied" as const,
      checkpointId: "checkpoint-1",
    };
    useContentEditReviewStore.setState({
      proposals: {
        [proposal.proposalId]: proposal,
      },
      permissions: {
        [proposal.conversationKey]: "review_required",
      },
    });

    const { root, container } = await mount(
      <ContentEditProposalRenderer
        execution={createExecution({
          status: "success",
          output: JSON.stringify({
            type: "content-edit-review-result",
            action: "applied",
            submittedAt: Date.now(),
            contentId: 1,
            proposalId: "proposal-1",
            conversationKey: "main-chat:1",
            checkpointId: "checkpoint-1",
            message: "用户已确认应用修改",
            proposal: {
              sourceToolName: "replace_content_by_text",
              proposedMarkdown: "# 标题\n\nhello tau",
              diffSummary: payload.diffSummary,
              patches: payload.patches,
            },
          }),
        })}
        isDark={false}
        parsedInput={null}
        renderDefault={() => <div>fallback</div>}
      />
    );

    expect(container.querySelector('[data-testid="editor-preview"]')).toBeTruthy();
    expect(container.querySelector('[aria-label="撤销这次应用"]')).toBeTruthy();

    await unmount(root, container);
  });

  it("重启后即使 snapshot-store 丢失，也应依赖持久化 beforeMarkdown 恢复 diff", async () => {
    const proposal = createProposalRecord();
    useContentEditReviewStore.setState({
      proposals: {
        [proposal.proposalId]: proposal,
      },
      permissions: {
        [proposal.conversationKey]: "review_required",
      },
    });

    const { root, container } = await mount(
      <ContentEditProposalRenderer
        execution={createExecution({
          status: "success",
          output: JSON.stringify({
            type: "content-edit-review-result",
            action: "rejected",
            submittedAt: Date.now(),
            contentId: 1,
            proposalId: "proposal-1",
            conversationKey: "main-chat:1",
            message: "用户拒绝了当前修改",
            proposal: {
              sourceToolName: "replace_content_by_text",
              proposedMarkdown: "# 标题\n\nhello tau",
              diffSummary: createPayload().diffSummary,
              patches: createPayload().patches,
            },
          }),
        })}
        isDark={false}
        parsedInput={null}
        renderDefault={() => <div>fallback</div>}
      />
    );

    const preview = container.querySelector('[data-testid="editor-preview"]') as HTMLElement;
    expect(preview.textContent).toContain("world");
    expect(preview.textContent).toContain("tau");

    await unmount(root, container);
  });

  it("改动高亮应默认折叠未改动长文，只保留改动附近上下文", async () => {
    const payload = createLongPayload();
    const proposal = {
      ...createProposalRecord(),
      beforeMarkdown: payload.beforeMarkdown,
      diffSummary: payload.diffSummary,
      patches: payload.patches,
    };
    useContentEditReviewStore.setState({
      proposals: {
        [proposal.proposalId]: proposal,
      },
      permissions: {
        [proposal.conversationKey]: "review_required",
      },
    });
    useContentEditReviewSessionStore.getState().createPending({
      toolCallId: "content-edit-call-1",
      toolName: "replace_content_by_text",
      conversationKey: proposal.conversationKey,
      rawInput: '{"toolName":"replace_content_by_text","proposalId":"proposal-1"}',
      proposalId: proposal.proposalId,
      payload,
    });

    const { root, container } = await mount(
      <ContentEditProposalRenderer
        execution={createExecution()}
        isDark={false}
        parsedInput={null}
        renderDefault={() => <div>fallback</div>}
      />
    );

    const preview = container.querySelector('[data-testid="editor-preview"]') as HTMLElement;
    expect(preview.textContent).toContain("第二段");
    expect(preview.textContent).toContain("第四段");
    expect(preview.textContent).toContain("已折叠未改动内容");
    expect(preview.textContent).not.toContain("第一段");
    expect(preview.textContent).not.toContain("第五段");

    await unmount(root, container);
  });
});
