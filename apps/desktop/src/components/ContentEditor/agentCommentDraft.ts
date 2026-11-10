import { create } from "zustand";
import type { MentionRef } from "@tau/shared";
import type { EntityType } from "@/services/content-editing";

export interface AgentCommentTarget {
  contentId: number;
  entityType: Extract<EntityType, MentionRef["entityType"]>;
  entityId: number;
}

/** 划词「交给 Agent」的草稿：选中的原文与它在屏幕上的位置（评论框锚在这里） */
export interface AgentCommentDraft {
  key: string;
  quote: string;
  rect: { left: number; top: number; width: number; height: number };
}

export const useAgentCommentDraft = create<{ draft: AgentCommentDraft | null }>(() => ({
  draft: null,
}));
