import { writeCacheFile, readCacheFile } from "@/commands/cache";
import { computeCharDiff } from "@/utils/char-diff";
import type {
  ContentEditCheckpointCachePayload,
  ContentEditProposalCachePayload,
  ContentEditProposalRecord,
  ResolvedContentTarget,
} from "./types";

export const PROPOSAL_CACHE_DIR = "content-edit/proposals";
export const CHECKPOINT_CACHE_DIR = "content-edit/checkpoints";
export const PREVIEW_TEXT_LIMIT = 140;

export const now = () => Date.now();

const clampPreviewText = (value: string) => {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= PREVIEW_TEXT_LIMIT) {
    return normalized;
  }
  return `${normalized.slice(0, PREVIEW_TEXT_LIMIT - 1)}…`;
};

export const createProposalId = () =>
  `proposal_${now()}_${Math.random().toString(36).slice(2, 10)}`;

export const createCheckpointId = () =>
  `checkpoint_${now()}_${Math.random().toString(36).slice(2, 10)}`;

export const buildProposalFilePath = (proposalId: string) =>
  `${PROPOSAL_CACHE_DIR}/${proposalId}.json`;

export const buildCheckpointFilePath = (checkpointId: string) =>
  `${CHECKPOINT_CACHE_DIR}/${checkpointId}.json`;

export const buildConversationKey = (
  conversationKey: string | undefined,
  resolvedTarget: ResolvedContentTarget
) => {
  if (conversationKey?.trim()) {
    return conversationKey.trim();
  }
  return `content-edit:${resolvedTarget.contentId}`;
};

export const buildDiffSummary = (patches: ContentEditProposalRecord["patches"]) => {
  let insertedChars = 0;
  let deletedChars = 0;

  const accumulatePatchDelta = (patch: ContentEditProposalRecord["patches"][number]) => {
    if (patch.op === "insert") {
      insertedChars += patch.afterText.length;
      return;
    }

    if (patch.op === "delete") {
      deletedChars += patch.beforeText.length;
      return;
    }

    const charDiffs = computeCharDiff(patch.beforeText, patch.afterText);
    charDiffs.forEach(diff => {
      if (diff.type === "insert") {
        insertedChars += diff.text.length;
      } else if (diff.type === "delete") {
        deletedChars += diff.text.length;
      }
    });
  };

  const changePreviews = patches.slice(0, 5).map(patch => {
    accumulatePatchDelta(patch);

    return {
      operationId: patch.operationId,
      op: patch.op,
      beforeTextPreview: clampPreviewText(patch.beforeText),
      afterTextPreview: clampPreviewText(patch.afterText),
      charDelta: patch.charDelta,
    };
  });

  patches.slice(5).forEach(patch => {
    accumulatePatchDelta(patch);
  });

  return {
    patchCount: patches.length,
    insertedChars,
    deletedChars,
    changePreviews,
  };
};

export const persistProposalCache = async (
  proposalId: string,
  payload: ContentEditProposalCachePayload
) => {
  const filePath = buildProposalFilePath(proposalId);
  await writeCacheFile(filePath, payload);
  return filePath;
};

export const readProposalCache = async (proposalFilePath: string) => {
  return (await readCacheFile(proposalFilePath)) as ContentEditProposalCachePayload | null;
};

export const persistCheckpointCache = async (
  checkpointId: string,
  payload: ContentEditCheckpointCachePayload
) => {
  const filePath = buildCheckpointFilePath(checkpointId);
  await writeCacheFile(filePath, payload);
  return filePath;
};

export const readCheckpointCache = async (checkpointFilePath: string) => {
  return (await readCacheFile(checkpointFilePath)) as ContentEditCheckpointCachePayload | null;
};

export const stringifySafe = (value: unknown) => {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};
