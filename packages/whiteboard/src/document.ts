import type { WhiteboardAuthorBridge } from "./extensions/authorTypes";
import type { WhiteboardElementDefinition } from "./extensions/api";
import type { EditorDocument } from "@tau/editor";
import type Board from "./Board";
import type { Operation } from "./types/operation";

/** 文档绑定只接管内容与历史；视口和选区仍由画布本机实例管理。 */
export interface WhiteboardDocumentBinding {
  presenceVersion?(): string | undefined;
  hasPresenceVersion?(version: string): boolean;
  isBlocked?(): boolean;
  flushInputs?(): void;
  createContentCopy?(elementId: string): Promise<number>;
  duplicatePage?(pageId: string): Promise<string>;
  pages?(): readonly { id: string; title: string }[];
  moveToPage?(ids: readonly string[], pageId: string): void;
  appendStroke?(
    id: string,
    points: readonly import("./utils/HandwriteUtil").HandwriteInputPoint[],
    style: import("./utils/HandwriteUtil").HandwriteStyle
  ): void;
  cancelStroke?(id: string): void;
  exportFile?(ids?: readonly string[]): Promise<Blob>;
  exportTransfer?(
    ids?: readonly string[]
  ): import("@tau/collaboration/whiteboard-types").WhiteboardTransfer;
  importTransfer?(
    bundle: import("@tau/collaboration/whiteboard-types").WhiteboardTransfer,
    allPages?: boolean
  ): Promise<readonly string[]>;
  linkEntity?(
    elementId: string,
    kind: import("@tau/db-schema/content-identities").ContentEntityKind,
    localId: number
  ): Promise<boolean>;
  unlinkEntity?(elementId: string): void;
  setPresentations?(
    before: readonly import("./types/presentation").PresentationSequence[],
    after: readonly import("./types/presentation").PresentationSequence[]
  ): void;
  revealElements?(ids: readonly string[]): void;
  measureElement?(elementId: string, size: { width: number; height: number }): void;
  refreshLayout?(): void;
  supportsElement?(elementId: string): boolean;
  textField?(
    elementId: string,
    field: string
  ): import("@tau/editor/text-field-contract").EditorTextField;
  readonly author?: WhiteboardAuthorBridge;
  resolveElementDefinition?(
    contractId: string
  ): { element: WhiteboardElementDefinition; access: "read" | "edit" | "none" } | undefined;
  connect(board: Board): () => void;
  apply(operations: Operation[], updateHistory: boolean, historyGroup?: string): boolean;
  commitPreview(operations: Operation[], historyGroup?: string): void;
  beginGesture(): void;
  splitHistory(): void;
  endGesture(commit: boolean): void;
  canUndo(): boolean;
  canRedo(): boolean;
  undo(): void;
  redo(): void;
  textDocument(elementId: string): EditorDocument | undefined;
}
