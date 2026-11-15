import type { ContentNode } from "@tau/collaboration";
import type { ContentContractDictionary } from "@tau/db-schema/content-contracts";

export interface ContentProjectionHead {
  documentId: string;
  revision: string;
  formatVersion: number | null;
}

export type ContentProjectionWrite = {
  documentId: string;
  contracts: ContentContractDictionary;
} & (
  | {
      kind: "blocks";
      expectedRevision: string;
      blocks: ContentNode[];
      order?: readonly string[];
      count: (content: ContentNode[]) => number;
      countRules: string;
    }
  | {
      kind: "snapshot";
      expectedRevision: string | undefined;
      content: ContentNode[];
      count: number;
      changes?: { content: boolean; contracts: boolean };
    }
);

export interface ContentProjectionStore {
  readHead(): ContentProjectionHead;
  commit(write: ContentProjectionWrite): { changed: boolean; writtenBlocks: number };
}
