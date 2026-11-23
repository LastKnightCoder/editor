// 白板画布与协同模型的绑定门面：字段、生命周期装配与同步透传存根；
// 实现按域拆在 collaboration/ 各文件，跨域调用一律经 binding 派发（保持方法解析经过实例）。
import * as Y from "yjs";
import {
  WhiteboardModel,
  bytesToBase64,
  base64ToBytes,
  type NodeTreeHistory,
  type WhiteboardModelCommand,
} from "@tau/collaboration";
import type { NodeTreeDocumentOptions, NodeTreeEditor } from "@tau/editor-collab";
import type { EditorTextField } from "@tau/editor/source-contracts";
import type { EditorDocument } from "@tau/editor";
import type { WhiteboardAuthorBridge } from "../extensions/authorTypes";
import { resolveBoardAccess } from "../extensions/access";
import type Board from "../Board";
import type { BoardElement } from "../types/element";
import type { Operation } from "../types/operation";
import type { WhiteboardDocumentBinding } from "../document";
import type { WhiteboardContractCatalog, WhiteboardContractEntry } from "./catalog";
import {
  project,
  refresh,
  flattenModel,
  flatten,
  measureElement,
  refreshLayout,
} from "./projection";
import {
  isBlocked,
  assertWritable,
  supportsElement,
  resolveElementDefinition,
} from "./element-access";
import {
  splitHistory,
  submit,
  appendStroke,
  cancelStroke,
  linkEntity,
  unlinkEntity,
  setPresentations,
} from "./commands";
import { beginGesture, isRealtimeGesture, endGesture } from "./gesture";
import { apply, commitPreview, geometryKeys } from "./operations";
import {
  createContentCopy,
  pages,
  duplicatePage,
  exportTransfer,
  exportFile,
  importTransfer,
} from "./transfer";
import { beginConditional, receiveDocument, finishConditional } from "./conditional";
import { createAuthorBridge } from "./author-bridge";
import { pageTitle, textField, textDocument, flushInputs } from "./text-fields";

import type { WhiteboardCanvasType } from "./types";
export type { WhiteboardCanvasType } from "./types";

export interface WhiteboardBindingOptions {
  pageId: string;
  documentId?: string;
  createContentCopy?: (elementId: string) => Promise<number>;
  readResource?: (reference: string) => Promise<{ name: string; mime: string; bytes: Uint8Array }>;
  uploadResource?: (file: { name: string; mime: string; bytes: Uint8Array }) => Promise<string>;
  importResource?: (reference: string, sourceDocumentId: string) => Promise<string>;
  referenceEntity?: (
    kind: import("@tau/db-schema/content-identities").ContentEntityKind,
    id: number
  ) => Promise<import("@tau/db-schema/content-identities").ContentEntityReference>;
  resolveEntity?: (
    reference: import("@tau/db-schema/content-identities").ContentEntityReference
  ) => Promise<number | null>;
  canWrite?: () => boolean;
  coalesceLocalGesture?: () => boolean;
  catalog?: WhiteboardContractCatalog;
  canEditContract?: (entry: WhiteboardContractEntry) => boolean;
  types: Readonly<Record<string, WhiteboardCanvasType>>;
  editorVersions?: NodeTreeDocumentOptions["versions"];
  preparedContracts?: readonly (
    | import("@tau/db-schema/content-contracts").PreparedWhiteboardContract
    | import("@tau/db-schema/content-contracts").PreparedContentContract
  )[];
}

export function getWhiteboardDocument(
  api: import("../extensions/api").WhiteboardAPI
): WhiteboardDocumentBinding | undefined {
  try {
    return resolveBoardAccess(api).document;
  } catch {
    return undefined;
  }
}
export function createWhiteboardBinding(model: WhiteboardModel, options: WhiteboardBindingOptions) {
  return new CanvasBinding(model, options);
}

export class CanvasBinding implements WhiteboardDocumentBinding {
  presenceVersion(): string | undefined {
    const encoded = bytesToBase64(Y.encodeStateVector(this.model.doc));
    return encoded.length <= 4096 ? encoded : undefined;
  }
  hasPresenceVersion(version: string): boolean {
    try {
      const local = Y.decodeStateVector(Y.encodeStateVector(this.model.doc));
      return [...Y.decodeStateVector(base64ToBytes(version))].every(
        ([id, clock]) => (local.get(id) ?? 0) >= clock
      );
    } catch {
      return true;
    }
  }
  readonly history: NodeTreeHistory;
  readonly origin = {};
  board?: Board;
  closed = false;
  page: string;
  gesture = false;
  gestureHistory?: NodeTreeHistory;
  streamingGesture = false;
  coalescingGesture = false;
  gestureTimer?: ReturnType<typeof setTimeout>;
  gestureWindowStart?: number;
  gestureCaptureTimeout?: number;
  pending: WhiteboardModelCommand[] = [];
  pendingFeedback: { id: string; patch: Record<string, unknown> }[] = [];
  readonly feedback = new Map<string, Record<string, unknown>>();
  writing = false;
  receiving = false;
  validating = false;
  conditional?: { id: string; update: Uint8Array; buffered: Uint8Array[] };
  completedConditions = new Set<string>();
  group?: string;
  readonly documents = new Map<string, EditorDocument>();
  readonly editors = new Set<NodeTreeEditor>();
  readonly fields = new Set<EditorTextField>();
  readonly localEntities = new Map<string, { key: string; id: number | null }>();
  readonly measurements = new Map<
    string,
    { width: number; height: number; baseWidth: number; baseHeight: number }
  >();
  readonly projections = new Map<string, BoardElement>();
  readonly author: WhiteboardAuthorBridge = createAuthorBridge(this);

  constructor(
    readonly model: WhiteboardModel,
    readonly options: WhiteboardBindingOptions
  ) {
    const reserved = new Set(["id", "type", "children", "name", "data", "style", ...geometryKeys]);
    for (const [type, codec] of Object.entries(options.types)) {
      const contract =
        model.contracts.get(codec.contractId) ??
        options.preparedContracts?.find(entry => entry.id === codec.contractId)?.contract;
      const fields = [
        ...(codec?.dataProperties ?? []),
        ...(codec?.transientProperties ?? []),
        ...(codec.bodyProperty ? [codec.bodyProperty] : []),
      ];
      if (
        !contract ||
        contract.domain !== "whiteboard-element" ||
        contract.type !== type ||
        new Set(fields).size !== fields.length ||
        fields.some(field => reserved.has(field)) ||
        (codec.bodyProperty && contract.structure.text === "none")
      )
        throw new Error("画布字段映射与契约不匹配或覆盖结构属性");
    }
    this.options = {
      ...options,
      types: Object.fromEntries(
        Object.entries(options.types).map(([type, codec]) => [
          type,
          {
            ...codec,
            dataProperties: [...(codec.dataProperties ?? [])],
            transientProperties: [...(codec.transientProperties ?? [])],
          },
        ])
      ),
    };
    this.page = options.pageId;
    this.history = model.createUndoManager({
      trackedOrigins: new Set([this.origin]),
      beforeChange: (history, direction) => {
        assertWritable(this, false);
        this.board?.interactions.cancel();
        this.endGesture(false);
        this.splitHistory();
        model.preflightHistory(history, direction);
      },
    });
  }
  isBlocked(): boolean {
    return isBlocked(this);
  }
  get pageId() {
    return this.page;
  }
  connect(board: Board): () => void {
    if (this.board || this.closed) throw new Error("白板绑定不能复用到另一视图");
    this.board = board;
    this.model.doc.on("beforeObserverCalls", this.invalidateChangedSnapshot);
    this.model.doc.on("afterTransaction", this.changed);
    this.model.doc.on("destroy", this.disconnect);
    try {
      if (this.options.coalesceLocalGesture) this.model.prepareLocalTranslations();
      refresh(this);
    } catch (error) {
      this.disconnect();
      throw error;
    }
    return this.disconnect;
  }
  private readonly disconnect = () => {
    if (this.closed) return;
    this.closed = true;
    this.board?.interactions.cancel();
    this.endGesture(false);
    this.invalidateSnapshot();
    this.model.doc.off("beforeObserverCalls", this.invalidateChangedSnapshot);
    this.model.doc.off("afterTransaction", this.changed);
    this.model.doc.off("destroy", this.disconnect);
    for (const editor of this.editors) editor.disposeNodeTree();
    this.fields.forEach(field => field.dispose());
    this.fields.clear();
    this.editors.clear();
    this.documents.clear();
    this.projections.clear();
    this.pending = [];
    this.history.destroy();
    this.board = undefined;
  };
  private snapshot?: ReturnType<WhiteboardModel["read"]>;
  private readonly invalidateChangedSnapshot = (transaction: Y.Transaction) => {
    if (transaction.changed.size || transaction.deleteSet.clients.size) this.invalidateSnapshot();
  };
  private readonly invalidateSnapshot = () => {
    this.snapshot = undefined;
    this.lastStrokeChildren = undefined;
  };

  readSnapshot(): ReturnType<WhiteboardModel["read"]> {
    if (
      !this.board ||
      this.closed ||
      this.model.doc._transaction ||
      this.model.doc._transactionCleanups.length
    )
      return this.model.read();
    return (this.snapshot ??= this.model.read());
  }

  publishBody(before: ReturnType<WhiteboardModel["read"]>, id: string) {
    const board = this.board;
    const page = before.pages.find(entry => entry.id === this.page);
    const at = page?.children.findIndex(node => node.id === id) ?? -1;
    if (!board || !page || at < 0 || board.children[at]?.id !== id) return false;
    const previous = page.children[at];
    if (previous.type !== "richtext" || previous.children.length) return false;
    const node = Object.freeze({ ...previous, body: this.model.richText(id).snapshot() });
    const children = [...page.children];
    children[at] = node;
    this.snapshot = Object.freeze({
      ...before,
      pages: Object.freeze(
        before.pages.map(entry =>
          entry === page ? Object.freeze({ ...page, children: Object.freeze(children) }) : entry
        )
      ),
    });
    const rendered = [...board.children];
    rendered[at] = project(this, node);
    board.publishDocument(rendered, undefined, undefined, {
      previous: board.children[at],
      next: rendered[at],
    });
    return true;
  }

  lastStrokeChildren?: BoardElement[];

  publishStroke(
    before: ReturnType<WhiteboardModel["read"]>,
    id: string,
    segmentId: string,
    created: boolean
  ) {
    const board = this.board;
    const page = before.pages.find(entry => entry.id === this.page);
    if (
      !board ||
      !page ||
      before.recovery.length ||
      before.pages.some(entry => entry.recovery.length) ||
      page.children.length !== board.children.length ||
      !page.children.every((node, i) => node.id === board.children[i].id)
    )
      return false;
    const at = page.children.findIndex(node => node.id === id);
    if (!created && at < 0) return false;
    // 绑定箭头的几何由整页布局推导；目标笔迹变化时一起重算。
    if (
      flatten(board.children).some(
        node => node.type === "arrow" && (node.source?.bindId === id || node.target?.bindId === id)
      )
    )
      return false;
    const old = page.children[at];
    if (
      old &&
      (old.type !== "handwrite" ||
        old.data.segmented !== true ||
        old.children.some(
          n => n.contractId !== this.options.types["host.whiteboard.stroke-segment"]?.contractId
        ))
    )
      return false;
    const stroke = this.model.readAppendedStroke(id, segmentId, old?.children ?? []);
    const nodes = [...page.children],
      rendered = [...board.children];
    const index = at < 0 ? nodes.length : at;
    nodes[index] = stroke;
    rendered[index] = project(this, stroke);
    this.snapshot = Object.freeze({
      ...before,
      pages: Object.freeze(
        before.pages.map(entry =>
          entry === page ? Object.freeze({ ...page, children: Object.freeze(nodes) }) : entry
        )
      ),
    });
    this.lastStrokeChildren = rendered;
    board.publishDocument(rendered);
    return true;
  }
  private readonly changed = (transaction: Y.Transaction) => {
    if (this.closed || this.writing || transaction.changed.size === 0) return;
    this.invalidateSnapshot();
    const local =
      transaction.origin === this.history || this.history.trackedOrigins.has(transaction.origin);
    if (this.gesture && !local) {
      this.receiving = true;
      try {
        this.board?.interactions.cancel();
        this.endGesture(false);
      } finally {
        this.receiving = false;
      }
    }
    refresh(this);
  };
  createContentCopy(id: string): Promise<number> {
    return createContentCopy(this, id);
  }
  pages() {
    return pages(this);
  }
  duplicatePage(pageId: string): Promise<string> {
    return duplicatePage(this, pageId);
  }
  appendStroke(
    id: string,
    points: readonly import("../utils/HandwriteUtil").HandwriteInputPoint[],
    style: import("../utils/HandwriteUtil").HandwriteStyle
  ): void {
    return appendStroke(this, id, points, style);
  }
  cancelStroke(id: string): void {
    return cancelStroke(this, id);
  }
  exportTransfer(ids?: readonly string[]) {
    return exportTransfer(this, ids);
  }
  exportFile(ids?: readonly string[]): Promise<Blob> {
    return exportFile(this, ids);
  }
  importTransfer(
    bundle: import("@tau/collaboration").WhiteboardTransfer,
    allPages = false
  ): Promise<readonly string[]> {
    return importTransfer(this, bundle, allPages);
  }
  linkEntity(
    id: string,
    kind: import("@tau/db-schema/content-identities").ContentEntityKind,
    localId: number
  ): Promise<boolean> {
    return linkEntity(this, id, kind, localId);
  }
  unlinkEntity(id: string): void {
    return unlinkEntity(this, id);
  }
  setPresentations(
    before: readonly import("../types/presentation").PresentationSequence[],
    after: readonly import("../types/presentation").PresentationSequence[]
  ): void {
    return setPresentations(this, before, after);
  }
  revealElements(ids: readonly string[]): void {
    const page = this.model
      .read()
      .pages.find(page =>
        flattenModel([...page.children, ...page.recovery]).some(node => ids.includes(node.id))
      );
    if (page && page.id !== this.page) this.switchPage(page.id);
  }
  refreshLayout(): void {
    return refreshLayout(this);
  }
  measureElement(id: string, size: { width: number; height: number }): void {
    return measureElement(this, id, size);
  }
  splitHistory(): void {
    return splitHistory(this);
  }
  submit(
    commands: readonly WhiteboardModelCommand[],
    historyGroup?: string,
    extraPrepared: readonly (
      | import("@tau/db-schema/content-contracts").PreparedContentContract
      | import("@tau/db-schema/content-contracts").PreparedWhiteboardContract
    )[] = []
  ) {
    return submit(this, commands, historyGroup, extraPrepared);
  }
  beginConditional(operationId: string, commands: readonly WhiteboardModelCommand[]): Uint8Array {
    return beginConditional(this, operationId, commands);
  }
  receiveDocument(update: Uint8Array): Promise<void> {
    return receiveDocument(this, update);
  }
  finishConditional(operation: import("@tau/collaboration").DocumentOperation): Promise<void> {
    return finishConditional(this, operation);
  }
  supportsElement(id: string): boolean {
    return supportsElement(this, id);
  }
  resolveElementDefinition(contractId: string) {
    return resolveElementDefinition(this, contractId);
  }
  switchPage(pageId: string): void {
    this.flushInputs();
    if (this.closed || !this.model.read().pages.some(page => page.id === pageId))
      throw new Error("目标页面不可用");
    this.board?.interactions.cancel();
    this.endGesture(false);
    this.splitHistory();
    this.page = pageId;
    refresh(this);
  }
  moveToPage(ids: readonly string[], pageId: string): void {
    this.flushInputs();
    const board = assertWritable(this);
    if (ids.some(id => !flatten(board.children).some(node => node.id === id)))
      throw new Error("跨页目标已失效");
    this.submit(ids.map(id => ({ type: "move_node", id, parent: { kind: "page", id: pageId } })));
  }
  beginGesture(options?: { realtime?: boolean }): void {
    return beginGesture(this, options);
  }
  isRealtimeGesture(): boolean {
    return isRealtimeGesture(this);
  }
  endGesture(commit: boolean): void {
    return endGesture(this, commit);
  }
  apply(operations: Operation[], updateHistory: boolean, historyGroup?: string): boolean {
    return apply(this, operations, updateHistory, historyGroup);
  }
  commitPreview(operations: Operation[], historyGroup?: string): void {
    return commitPreview(this, operations, historyGroup);
  }
  flushInputs(): void {
    return flushInputs(this);
  }
  canUndo(): boolean {
    return !this.isBlocked() && this.history.undoStack.length > 0;
  }
  canRedo(): boolean {
    return !this.isBlocked() && this.history.redoStack.length > 0;
  }
  undo(): void {
    this.history.undo();
  }
  redo(): void {
    this.history.redo();
  }

  pageTitle(id: string): EditorTextField {
    return pageTitle(this, id);
  }
  textField(id: string, field: string | null = null, read = false): EditorTextField {
    return textField(this, id, field, read);
  }

  textDocument(id: string): EditorDocument | undefined {
    return textDocument(this, id);
  }
}
