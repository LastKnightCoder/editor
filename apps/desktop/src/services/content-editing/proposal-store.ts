import { create } from "zustand";
import { persist } from "zustand/middleware";
import { now } from "./review-session-helpers";
import type { ContentEditCheckpointRecord, ContentEditProposalRecord } from "./types";

interface ContentEditReviewState {
  proposals: Record<string, ContentEditProposalRecord>;
  checkpoints: Record<string, ContentEditCheckpointRecord>;
  upsertProposal: (proposal: ContentEditProposalRecord) => void;
  updateProposal: (
    proposalId: string,
    updater: (current: ContentEditProposalRecord) => ContentEditProposalRecord
  ) => void;
  supersedePendingProposals: (params: {
    conversationKey: string;
    contentId: number;
    excludeProposalId: string;
  }) => void;
  upsertCheckpoint: (checkpoint: ContentEditCheckpointRecord) => void;
  updateCheckpoint: (
    checkpointId: string,
    updater: (current: ContentEditCheckpointRecord) => ContentEditCheckpointRecord
  ) => void;
}

const STORAGE_KEY = "content-edit-review-session";

export const useContentEditReviewStore = create<ContentEditReviewState>()(
  persist(
    (set, get) => ({
      proposals: {},
      checkpoints: {},
      upsertProposal: proposal => {
        set(state => ({
          proposals: {
            ...state.proposals,
            [proposal.proposalId]: proposal,
          },
        }));
      },
      updateProposal: (proposalId, updater) => {
        const current = get().proposals[proposalId];
        if (!current) return;
        const next = updater(current);
        set(state => ({
          proposals: {
            ...state.proposals,
            [proposalId]: next,
          },
        }));
      },
      supersedePendingProposals: ({ conversationKey, contentId, excludeProposalId }) => {
        const proposals = get().proposals;
        const nextProposals = { ...proposals };
        let changed = false;
        Object.values(proposals).forEach(proposal => {
          if (
            proposal.proposalId !== excludeProposalId &&
            proposal.conversationKey === conversationKey &&
            proposal.contentId === contentId &&
            proposal.status === "pending_review"
          ) {
            nextProposals[proposal.proposalId] = {
              ...proposal,
              status: "superseded",
              updatedAt: now(),
            };
            changed = true;
          }
        });
        if (!changed) return;
        set(() => ({
          proposals: nextProposals,
        }));
      },
      upsertCheckpoint: checkpoint => {
        set(state => ({
          checkpoints: {
            ...state.checkpoints,
            [checkpoint.checkpointId]: checkpoint,
          },
        }));
      },
      updateCheckpoint: (checkpointId, updater) => {
        const current = get().checkpoints[checkpointId];
        if (!current) return;
        const next = updater(current);
        set(state => ({
          checkpoints: {
            ...state.checkpoints,
            [checkpointId]: next,
          },
        }));
      },
    }),
    {
      name: STORAGE_KEY,
      version: 1,
    }
  )
);

export const getContentEditProposal = (proposalId: string) =>
  useContentEditReviewStore.getState().proposals[proposalId];

export const getContentEditCheckpoint = (checkpointId: string) =>
  useContentEditReviewStore.getState().checkpoints[checkpointId];
