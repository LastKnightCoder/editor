import { beforeEach, describe, expect, it, vi } from "vitest";
import { importFromMarkdown } from "@/utils/markdown";
import {
  applyContentEditProposal,
  createPendingContentEditReview,
  createContentEditProposal,
  getContentEditReviewSessionStore,
  restoreContentCheckpoint,
  setConversationContentWritePermission,
  submitContentEditReviewDecisionByExecution,
  shouldAutoApplyContentProposal,
  useContentEditReviewSessionStore,
  useContentEditReviewStore,
} from "../review-session";
import { createContentSnapshot } from "../snapshot";

const cacheFiles = new Map<string, unknown>();
let currentContent = importFromMarkdown("hello world");

vi.mock("@/commands/cache", () => ({
  writeCacheFile: vi.fn(async (filePath: string, data: unknown) => {
    cacheFiles.set(filePath, data);
  }),
  readCacheFile: vi.fn(async (filePath: string) => cacheFiles.get(filePath)),
  cacheFileExists: vi.fn(async (filePath: string) => cacheFiles.has(filePath)),
}));

vi.mock("../resolver", () => ({
  resolveContentTarget: vi.fn(async () => ({
    contentId: 1,
    source: "active-session",
  })),
  loadSnapshotForContent: vi.fn(async () => ({
    snapshot: createContentSnapshot(currentContent, "active-session"),
    source: "active-session",
  })),
}));

vi.mock("../persist", () => ({
  persistContentFromMarkdown: vi.fn(async ({ contentId, markdown }) => {
    currentContent = importFromMarkdown(markdown);
    return {
      updated: {
        id: contentId,
        updateTime: Date.now(),
        count: markdown.length,
      },
      content: currentContent,
    };
  }),
  persistContentValue: vi.fn(async ({ contentId, content }) => {
    currentContent = content;
    return {
      updated: {
        id: contentId,
        updateTime: Date.now(),
        count: JSON.stringify(content).length,
      },
      content,
    };
  }),
}));

vi.mock("../active-editor-session", () => ({
  getActiveEditingSessionByContentId: vi.fn(() => ({
    id: "session-1",
    selection: null,
  })),
  updateActiveEditingSessionContent: vi.fn(),
}));

const resetReviewStore = () => {
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

const nextTick = () => new Promise(resolve => setTimeout(resolve, 0));

describe("content-editing/review-session", () => {
  beforeEach(() => {
    currentContent = importFromMarkdown("hello world");
    cacheFiles.clear();
    resetReviewStore();
  });

  it("应生成提案、应用提案并建立检查点，再支持恢复", async () => {
    const created = await createContentEditProposal({
      conversationKey: "main-chat:1",
      sourceToolName: "replace_content_by_text",
      operations: [
        {
          id: "replace-world",
          op: "replace",
          locator: {
            kind: "markdown-range",
            start: { line: 0, ch: 6 },
            end: { line: 0, ch: 11 },
          },
          text: "tau",
        },
      ],
    });

    expect(created.success).toBe(true);
    if (!created.success) {
      throw new Error("expected create success");
    }

    const proposalId = created.proposal.proposalId;
    expect(created.proposal.status).toBe("pending_review");
    expect(cacheFiles.size).toBe(1);

    const applied = await applyContentEditProposal({ proposalId });
    expect(applied.success).toBe(true);
    if (!applied.success) {
      throw new Error("expected apply success");
    }

    expect(applied.proposal.status).toBe("applied");
    expect(applied.checkpoint.beforeHash).toBe(
      createContentSnapshot(importFromMarkdown("hello world"), "active-session").hash
    );
    expect(createContentSnapshot(currentContent, "active-session").markdown.trim()).toBe(
      "hello tau"
    );

    const restored = await restoreContentCheckpoint({
      checkpointId: applied.checkpoint.checkpointId,
    });
    expect(restored.success).toBe(true);
    if (!restored.success) {
      throw new Error("expected restore success");
    }

    expect(createContentSnapshot(currentContent, "active-session").markdown.trim()).toBe(
      "hello world"
    );
    expect(restored.proposal?.status).toBe("restored");
  });

  it("应按会话保存写入权限", () => {
    const next = setConversationContentWritePermission({
      conversationKey: "main-chat:9",
      permission: "auto_apply_allowed",
    });

    expect(next).toBe("auto_apply_allowed");
    expect(useContentEditReviewStore.getState().permissions["main-chat:9"]).toBe(
      "auto_apply_allowed"
    );
  });

  it("应创建待审会话，并在用户确认应用后返回结构化工具结果", async () => {
    const created = await createContentEditProposal({
      conversationKey: "main-chat:404",
      sourceToolName: "replace_content_by_text",
      operations: [
        {
          id: "replace-world",
          op: "replace",
          locator: {
            kind: "markdown-range",
            start: { line: 0, ch: 6 },
            end: { line: 0, ch: 11 },
          },
          text: "tau",
        },
      ],
    });

    expect(created.success).toBe(true);
    if (!created.success) {
      throw new Error("expected create success");
    }

    const executionPromise = createPendingContentEditReview({
      context: {
        toolCallId: "tool-call-1",
        toolName: "replace_content_by_text",
        source: "content-edit-tools",
        conversationKey: "main-chat:404",
      },
      proposal: created.proposal,
    });
    await nextTick();

    const session = Object.values(getContentEditReviewSessionStore().records)[0];
    expect(session?.status).toBe("pending");

    const submitResult = submitContentEditReviewDecisionByExecution(
      {
        toolCallId: "tool-call-1",
        timestamp: session.createdAt,
      },
      {
        action: "apply",
        submittedAt: Date.now(),
      }
    );
    expect(submitResult).toBe("resolved");

    const result = await executionPromise;
    expect(JSON.parse(result.content)).toMatchObject({
      type: "content-edit-review-result",
      action: "applied",
      contentId: 1,
    });
    expect(
      useContentEditReviewStore.getState().proposals[created.proposal.proposalId]?.status
    ).toBe("applied");
  });

  it("应在用户提交修改意见后返回 feedback 结果并保留反馈内容", async () => {
    const created = await createContentEditProposal({
      conversationKey: "main-chat:2",
      sourceToolName: "replace_content_by_text",
      operations: [
        {
          id: "replace-world",
          op: "replace",
          locator: {
            kind: "markdown-range",
            start: { line: 0, ch: 6 },
            end: { line: 0, ch: 11 },
          },
          text: "tau",
        },
      ],
    });

    expect(created.success).toBe(true);
    if (!created.success) {
      throw new Error("expected create success");
    }

    const executionPromise = createPendingContentEditReview({
      context: {
        toolCallId: "tool-call-2",
        toolName: "replace_content_by_text",
        source: "content-edit-tools",
        conversationKey: "main-chat:2",
      },
      proposal: created.proposal,
    });
    await nextTick();

    const session = Object.values(getContentEditReviewSessionStore().records).find(
      item => item.toolCallId === "tool-call-2"
    );
    expect(session?.payload.proposedMarkdown?.trim()).toBe("hello tau");

    submitContentEditReviewDecisionByExecution(
      {
        toolCallId: "tool-call-2",
        timestamp: session?.createdAt,
      },
      {
        action: "feedback",
        feedback: "请更简洁一些",
        submittedAt: Date.now(),
      }
    );

    const result = await executionPromise;
    expect(JSON.parse(result.content)).toMatchObject({
      type: "content-edit-review-result",
      action: "feedback",
      feedback: "请更简洁一些",
    });
    expect(
      useContentEditReviewStore.getState().proposals[created.proposal.proposalId]?.feedbackHistory
    ).toContain("请更简洁一些");
  });

  it("反馈修订应强制保持审核模式，即使会话允许自动应用", () => {
    setConversationContentWritePermission({
      conversationKey: "main-chat:1",
      permission: "auto_apply_allowed",
    });

    expect(
      shouldAutoApplyContentProposal({
        conversationKey: "main-chat:1",
      })
    ).toBe(true);

    expect(
      shouldAutoApplyContentProposal({
        conversationKey: "main-chat:1",
        toolContext: {
          flags: {
            forceReview: true,
            feedbackProposalId: "proposal-1",
          },
        },
      })
    ).toBe(false);
  });

  it("replace 场景的 diff summary 应分别累计新增与删除字符", async () => {
    currentContent = importFromMarkdown("hello world");

    const created = await createContentEditProposal({
      conversationKey: "main-chat:summary",
      sourceToolName: "replace_content_by_text",
      operations: [
        {
          id: "replace-world",
          op: "replace",
          locator: {
            kind: "markdown-range",
            start: { line: 0, ch: 6 },
            end: { line: 0, ch: 11 },
          },
          text: "tau note",
        },
      ],
    });

    expect(created.success).toBe(true);
    if (!created.success) {
      throw new Error("expected create success");
    }

    expect(created.proposal.diffSummary.insertedChars).toBe(8);
    expect(created.proposal.diffSummary.deletedChars).toBe(5);
  });
});
