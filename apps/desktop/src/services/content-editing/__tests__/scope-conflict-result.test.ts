import { expect, it, vi } from "vitest";
import { applyContentEditProposal, useContentEditReviewStore } from "../review-session";
import type { ContentSuggestion } from "@/types/content-suggestion";
import type { ContentEditProposalRecord } from "../types";

const commands = vi.hoisted(() => ({ list: vi.fn(), accept: vi.fn() }));
vi.mock("@/commands/cache", () => ({ readCacheFile: async () => ({ markdown: "提案" }) }));
vi.mock("@/commands/content", () => ({
  listContentSuggestions: commands.list,
  acceptContentSuggestions: commands.accept,
}));
vi.mock("@/services/command-context", () => ({ bindDatabaseCommands: (value: unknown) => value }));

it("范围冲突的逐条结果携带可重读的稳定块 ID", async () => {
  const proposal = {
    proposalId: "proposal",
    contentId: 7,
    databaseName: "library",
    proposalFilePath: "proposal.json",
    suggestions: true,
    status: "pending_review",
  } as ContentEditProposalRecord;
  useContentEditReviewStore.getState().upsertProposal(proposal);
  const item = {
    id: "suggestion",
    status: "pending",
    beforeText: "旧文",
    afterText: "新文",
    edit: { kind: "text", blockId: "stable-block" },
  } as ContentSuggestion;
  commands.list
    .mockResolvedValueOnce([item])
    .mockResolvedValueOnce([{ ...item, status: "expired", error: "原文已变化" }]);
  expect(await applyContentEditProposal({ proposalId: proposal.proposalId })).toMatchObject({
    success: false,
    errorCode: "SCOPE_CONFLICT",
    items: [{ id: item.id, blockId: "stable-block", status: "expired" }],
  });
});
