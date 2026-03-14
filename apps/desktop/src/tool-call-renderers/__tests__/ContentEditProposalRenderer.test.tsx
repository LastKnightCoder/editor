import { App } from "antd";
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

vi.mock("@tau/editor/src", () => ({
  Editor: ({ initValue }: { initValue: unknown }) => (
    <div data-testid="editor-preview">{JSON.stringify(initValue)}</div>
  ),
}));

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
(globalThis as any).ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

const createExecution = (
  overrides: Partial<ToolCallExecutionState> = {},
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

const createProposalRecord = (): ContentEditProposalRecord => ({
  proposalId: "proposal-1",
  conversationKey: "main-chat:1",
  contentId: 1,
  sourceToolName: "replace_content_by_text",
  status: "pending_review",
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
    root.render(<App>{node}</App>);
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
      rawInput:
        '{"toolName":"replace_content_by_text","proposalId":"proposal-1"}',
      proposalId: proposal.proposalId,
      payload,
    });

    const { root, container } = await mount(
      <ContentEditProposalRenderer
        execution={createExecution()}
        isDark={false}
        parsedInput={null}
        renderDefault={() => <div>fallback</div>}
      />,
    );

    expect(container.textContent).toContain("请确认这次修改");
    expect(
      container.querySelector('[data-testid="editor-preview"]'),
    ).toBeTruthy();
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
      rawInput:
        '{"toolName":"replace_content_by_text","proposalId":"proposal-1"}',
      proposalId: proposal.proposalId,
      payload,
    });

    const { root, container } = await mount(
      <ContentEditProposalRenderer
        execution={createExecution()}
        isDark={false}
        parsedInput={null}
        renderDefault={() => <div>fallback</div>}
      />,
    );

    const openFeedbackButton = Array.from(
      container.querySelectorAll("button"),
    ).find((button) => button.textContent?.includes("提修改意见"));
    expect(openFeedbackButton).toBeTruthy();
    await act(async () => {
      openFeedbackButton?.dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });

    const textarea = container.querySelector("textarea") as HTMLTextAreaElement;
    expect(textarea).toBeTruthy();
    const setValue = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value",
    )?.set;
    await act(async () => {
      setValue?.call(textarea, "第二段更自然一些");
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });

    const submitButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("提交修改意见"),
    );
    expect(submitButton).toBeTruthy();
    await act(async () => {
      submitButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const updated =
      useContentEditReviewSessionStore.getState().records[session.sessionId];
    expect(updated?.status).toBe("submitted");
    expect(updated?.decision?.action).toBe("feedback");
    expect(updated?.decision?.feedback).toBe("第二段更自然一些");

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
      rawInput:
        '{"toolName":"replace_content_by_text","proposalId":"proposal-1"}',
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
      />,
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
      />,
    );

    expect(
      container.querySelector('[data-testid="editor-preview"]'),
    ).toBeTruthy();
    expect(container.querySelector('[aria-label="撤销这次应用"]')).toBeTruthy();

    await unmount(root, container);
  });
});
