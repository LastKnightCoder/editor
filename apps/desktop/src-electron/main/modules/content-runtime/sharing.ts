import type { IpcMainInvokeEvent } from "electron";
import type * as Y from "yjs";
import type {
  CollaborationSession,
  ContentSessionSnapshot,
  ContentSessionTarget,
  ScopedContentResult,
  ScopedContentSubmission,
  SourceBinding,
} from "@tau/collaboration";
import type { RuntimeSession } from "../collaboration/types";
import type { PreparedSharedReplacement } from "../collaboration/shared-content-replacement";
import type { ScopedWriteOptions } from "./agent/suggestion-service";
import type { ContentDatabase } from ".";

export type ContentOpenContext = IpcMainInvokeEvent | ContentDatabase;

export interface PreparedContentShare {
  documentId: string;
  baselineId: string;
  state: string;
  revision: string;
  serverUrl: string;
}

export type PublishedContentShare = Pick<
  PreparedContentShare,
  "documentId" | "baselineId" | "serverUrl"
> & { epoch: number };

export interface SharedContentBridge {
  open(
    event: ContentOpenContext,
    target: ContentSessionTarget,
    check: () => void
  ): Promise<ContentSessionSnapshot>;
  find(id: string): RuntimeSession | undefined;
  findContent(workspaceId: string, contentId: number): RuntimeSession | undefined;
  readAgentState(session: RuntimeSession): Promise<Uint8Array>;
  submitAgentEdit(
    session: RuntimeSession,
    request: ScopedContentSubmission,
    updateHash: string,
    check: () => void,
    options: ScopedWriteOptions
  ): Promise<ScopedContentResult>;
  broadcastPresence(documentId: string, update: Uint8Array): void;
  removeWindowViews(id: number): void;
}

export interface LocalContentSharingAccess {
  connectSharing(bridge: SharedContentBridge): () => void;
  open(event: ContentOpenContext, target: ContentSessionTarget): Promise<ContentSessionSnapshot>;
  resumeLocalOpen: SharedContentBridge["open"];
  getSession(id: string): RuntimeSession;
  find(id: string): RuntimeSession | undefined;
  prepareShare(session: RuntimeSession): Promise<void>;
  pendingShare(id: string): PreparedContentShare | null;
  rememberShare(id: string, value: PreparedContentShare): void;
  cancelShare(session: RuntimeSession): void;
  save(session: RuntimeSession): Promise<void>;
  finishPublishedShare(
    id: string,
    source: SourceBinding,
    published: PublishedContentShare
  ): Promise<void>;
  stageDemotion(info: CollaborationSession, doc: Y.Doc): void;
  restoreDemotion(context: ContentDatabase, id: string): RuntimeSession | undefined;
  presenceSnapshot(session: RuntimeSession): Uint8Array;
  scheduleSuggestionValidation(
    workspaceId: string,
    contentId: number,
    document: () => Y.Doc | undefined
  ): void;
}

export interface SharedSessionEffects {
  attach(session: RuntimeSession): void;
  broadcastState(): void;
  flushResources(): void;
  preserveOwnerImages(session: RuntimeSession): Promise<void>;
  retryReplacement(
    session: RuntimeSession,
    intentHash: string,
    checkScope: () => void,
    onAccepted?: () => void
  ): Promise<boolean>;
  submitReplacement(
    session: RuntimeSession,
    prepared: PreparedSharedReplacement,
    checkRevision: () => void,
    checkScope: () => void,
    onAccepted?: () => void
  ): Promise<void>;
  scheduleSuggestionValidation: LocalContentSharingAccess["scheduleSuggestionValidation"];
}
