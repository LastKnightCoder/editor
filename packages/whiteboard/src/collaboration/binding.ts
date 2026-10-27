import { canvasFields } from "./builtins";
import { contentResourceSlots, contentResourceValues } from "@tau/db-schema/content-resources";
import { buildHandwriteElement } from "../extensions/creators/handwrite";
import { resolveBoardAccess } from "../extensions/access";
import type { WhiteboardAuthorBridge, WhiteboardIdCommand } from "../extensions/authorTypes";
import type { WhiteboardContractCatalog, WhiteboardContractEntry } from "./catalog";
import * as Y from "yjs";
import {
  WhiteboardModel,
  bytesToBase64,
  base64ToBytes,
  isSafeResource,
  exportWhiteboardTransfer,
  prepareWhiteboardTransfer,
  type NodeTreeHistory,
  type DocumentOperation,
  type WhiteboardElementSnapshot,
  type WhiteboardModelCommand,
  type WhiteboardAnchor,
  type WhiteboardParent,
  type WhiteboardGeometry,
  type WhiteboardData,
  assertWhiteboardJson,
} from "@tau/collaboration";
import {
  createSharedTextField,
  createNodeTreeDocument,
  type NodeTreeDocumentOptions,
  type NodeTreeEditor,
} from "@tau/editor-collab";
import type { EditorTextField } from "@tau/editor/source-contracts";
import type { EditorDocument } from "@tau/editor";
import type Board from "../Board";
import type { BoardElement } from "../types/element";
import type { Operation } from "../types/operation";
import type { WhiteboardDocumentBinding } from "../document";
import BoardOperations from "../utils/BoardOperations";
import PathUtil from "../utils/PathUtil";
import { ColumnUtil } from "../utils/ColumnUtil";
import { MindUtil } from "../utils/MindUtil";

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
  catalog?: WhiteboardContractCatalog;
  canEditContract?: (entry: WhiteboardContractEntry) => boolean;
  types: Readonly<Record<string, WhiteboardCanvasType>>;
  editorVersions?: NodeTreeDocumentOptions["versions"];
  preparedContracts?: readonly (
    | import("@tau/db-schema/content-contracts").PreparedWhiteboardContract
    | import("@tau/db-schema/content-contracts").PreparedContentContract
  )[];
}
const bodyValue = (node: Record<string, any>, path: string) =>
  path.split(".").reduce((value, key) => value?.[key], node);
const canvasValue = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canvasValue);
  if (value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype)
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .map(([key, item]) => [key, canvasValue(item)])
    );
  return value;
};
const geometryKeys = ["x", "y", "width", "height", "rotation"] as const;
const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const anchorBefore = (id?: string): WhiteboardAnchor => (id === undefined ? {} : { beforeId: id });
const authorSnapshot = (
  node: WhiteboardElementSnapshot
): import("../extensions/authorTypes").WhiteboardElement =>
  Object.freeze({
    id: node.id,
    type: node.type,
    name: node.name,
    style: node.style,
    data: node.data,
    geometry: node.geometry,
    children: Object.freeze(node.children.map(authorSnapshot)),
  });
const flattenModel = (nodes: readonly WhiteboardElementSnapshot[]): WhiteboardElementSnapshot[] =>
  nodes.flatMap(node => [node, ...flattenModel(node.children)]);
const flatten = (nodes: readonly BoardElement[]): BoardElement[] =>
  nodes.flatMap(node => [node, ...flatten(node.children ?? [])]);

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

class CanvasBinding implements WhiteboardDocumentBinding {
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
  private readonly origin = {};
  private board?: Board;
  private closed = false;
  private page: string;
  private gesture = false;
  private gestureCaptureTimeout?: number;
  private pending: WhiteboardModelCommand[] = [];
  private pendingFeedback: { id: string; patch: Record<string, unknown> }[] = [];
  private readonly feedback = new Map<string, Record<string, unknown>>();
  private writing = false;
  private receiving = false;
  private validating = false;
  private conditional?: { id: string; update: Uint8Array; buffered: Uint8Array[] };
  private completedConditions = new Set<string>();
  private group?: string;
  private readonly documents = new Map<string, EditorDocument>();
  private readonly editors = new Set<NodeTreeEditor>();
  private readonly fields = new Set<EditorTextField>();
  private readonly localEntities = new Map<string, { key: string; id: number | null }>();
  private readonly measurements = new Map<
    string,
    { width: number; height: number; baseWidth: number; baseHeight: number }
  >();
  private readonly projections = new Map<string, BoardElement>();

  constructor(
    readonly model: WhiteboardModel,
    private readonly options: WhiteboardBindingOptions
  ) {
    const reserved = new Set(["id", "type", "children", "name", "data", "style", ...geometryKeys]);
    for (const [type, codec] of Object.entries(options.types)) {
      const contract =
        model.contracts.get(codec.contractId) ??
        options.preparedContracts?.find(entry => entry.id === codec.contractId)?.contract;
      const fields = [
        ...(codec?.dataProperties ?? []),
        ...(codec?.transientProperties ?? []),
        ...(codec?.bodyProperty ? [codec.bodyProperty] : []),
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
        this.assertWritable(false);
        this.board?.interactions.cancel();
        this.endGesture(false);
        this.splitHistory();
        model.preflightHistory(history, direction);
      },
    });
  }
  isBlocked(): boolean {
    return this.closed || !!this.conditional || this.options.canWrite?.() === false;
  }
  get pageId() {
    return this.page;
  }
  private assertWritable(requirePage = true): Board {
    if (
      this.closed ||
      this.conditional ||
      this.validating ||
      this.options.canWrite?.() === false ||
      !this.board ||
      !this.board.captureSubmission()() ||
      (requirePage && !this.model.read().pages.some(page => page.id === this.page))
    )
      throw new Error("白板文档只读、已关闭或页面失效");
    return this.board;
  }
  private canEditElement(id: string): boolean {
    if (
      this.closed ||
      this.conditional ||
      this.validating ||
      this.options.canWrite?.() === false ||
      !this.board?.captureSubmission()()
    )
      return false;
    const node = flatten(this.board.children).find(node => node.id === id);
    const identity = this.model.elements.get(id)?.get("identity") as
      | { contractId: string }
      | undefined;
    if (!node || !identity) return false;
    const entry = this.options.catalog?.get(identity.contractId);
    if (entry)
      return (
        this.entryInstalled(entry) &&
        entry.access === "edit" &&
        this.options.canEditContract?.(entry) !== false
      );
    if (
      this.options.catalog &&
      (this.options.catalog.current(node.type) || !this.board?.extensions?.isHostElement(node.type))
    )
      return false;
    return identity.contractId === this.options.types[node.type]?.contractId;
  }
  connect(board: Board): () => void {
    if (this.board || this.closed) throw new Error("白板绑定不能复用到另一视图");
    this.board = board;
    this.model.doc.on("afterTransaction", this.changed);
    this.model.doc.on("destroy", this.disconnect);
    try {
      this.refresh();
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
  private readonly changed = (transaction: Y.Transaction) => {
    if (this.closed || this.writing) return;
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
    this.refresh();
  };
  private project(node: WhiteboardElementSnapshot): BoardElement {
    const mapped = this.options.types[node.type];
    const type = mapped?.contractId === node.contractId ? mapped : undefined;
    const children = node.children.map(child => this.project(child));
    const next: BoardElement = {
      id: node.id,
      type: node.type,
      contractId: node.contractId,
      dataVersion: this.model.contracts.get(node.contractId)?.dataVersion,
      ...(node.body === undefined ? {} : { body: node.body }),
      ...(node.entity ? { entity: node.entity } : {}),
      ...(type &&
      this.localEntities.get(node.id)?.key === JSON.stringify(node.entity) &&
      this.localEntities.get(node.id)?.id != null
        ? node.entity?.kind === "content"
          ? { contentId: this.localEntities.get(node.id)!.id }
          : node.entity?.kind === "video-note"
            ? { videoNoteId: this.localEntities.get(node.id)!.id }
            : {}
        : {}),
      ...node.geometry,
      ...(type &&
      this.measurements.get(node.id)?.baseWidth === node.geometry.width &&
      this.measurements.get(node.id)?.baseHeight === node.geometry.height
        ? {
            width: this.measurements.get(node.id)!.width,
            height: this.measurements.get(node.id)!.height,
          }
        : {}),
      data: node.data,
      style: node.style,
      ...(node.name === undefined ? {} : { name: node.name }),
      ...(type ? this.feedback.get(node.id) : undefined),
      ...canvasFields(node, type),
      ...(children.length ? { children } : {}),
    };
    if (type && node.type === "handwrite" && node.data.segmented === true) {
      const points = node.children.flatMap(
        segment =>
          (segment.data.points ??
            []) as unknown as import("../utils/HandwriteUtil").HandwriteInputPoint[]
      );
      const value = buildHandwriteElement(
        points,
        node.style as unknown as import("../utils/HandwriteUtil").HandwriteStyle,
        node.id
      );
      if (value) Object.assign(next, { points: value.points, outline: value.outline });
    }
    if (type && node.type === "handwrite")
      next.children = children.filter(
        child =>
          child.contractId !== this.options.types["host.whiteboard.stroke-segment"]?.contractId
      );
    const previous = this.projections.get(node.id);
    if (previous && equal(previous, next)) return previous;
    this.projections.set(node.id, next);
    return next;
  }
  private refresh(): void {
    if (!this.board || this.closed) return;
    const snapshot = this.model.read();
    const page = snapshot.pages.find(page => page.id === this.page);
    const layout = (node: BoardElement, parent?: string): BoardElement => {
      const children = (node.children ?? []).map(child => layout(child, node.type));
      const value = { ...node, ...(node.children ? { children } : {}) };
      if (this.options.types[node.type]?.contractId !== node.contractId) return node;
      if (node.type === "column")
        return ColumnUtil.layoutColumn({
          ...value,
          children,
        } as import("../types/column").ColumnElement);
      if (node.type === "mind-node" && parent !== "mind-node") {
        const initialize = (entry: BoardElement, level: number): BoardElement => ({
          ...entry,
          level,
          actualHeight: entry.height,
          childrenHeight: 0,
          leftChildrenHeight: 0,
          rightChildrenHeight: 0,
          children: (entry.children ?? []).map(child => initialize(child, level + 1)),
        });
        return MindUtil.layout(initialize(value, 1) as import("../types/mind").MindNodeElement);
      }
      return node.children ? value : node;
    };
    let children = [...(page?.children ?? []), ...(page?.recovery ?? [])].map(node =>
      layout(this.project(node))
    );
    for (const node of flattenModel([...(page?.children ?? []), ...(page?.recovery ?? [])])) {
      if (
        !node.entity ||
        !this.options.resolveEntity ||
        !["content", "video-note"].includes(node.entity.kind)
      )
        continue;
      const key = JSON.stringify(node.entity);
      if (this.localEntities.get(node.id)?.key === key) continue;
      this.localEntities.set(node.id, { key, id: null });
      void this.options
        .resolveEntity(node.entity)
        .then(id => {
          if (this.closed || this.localEntities.get(node.id)?.key !== key) return;
          this.localEntities.set(node.id, { key, id });
          this.refresh();
        })
        .catch(() => undefined);
    }
    children = this.resolveArrowBindings(children);
    const retained = new Set(flatten(children).map(node => node.id));
    for (const id of this.projections.keys()) if (!retained.has(id)) this.projections.delete(id);
    this.board.publishDocument(
      children,
      page?.sketch ?? { mode: "normal", level: "natural" },
      structuredClone(
        snapshot.presentations ?? []
      ) as import("../types/presentation").PresentationSequence[]
    );
  }
  private resolveArrowBindings(children: BoardElement[]): BoardElement[] {
    const elements = new Map(flatten(children).map(node => [node.id, node]));
    const connect = (node: BoardElement): BoardElement => {
      if (node.type === "arrow" && this.options.types.arrow?.contractId === node.contractId) {
        const points = [...(node.points ?? [])];
        for (const [key, at] of [
          ["source", 0],
          ["target", points.length - 1],
        ] as const) {
          const end = node[key],
            target = end?.bindId && elements.get(end.bindId);
          const point =
            target && this.board!.getArrowBindPoint(target, end.connectId, end.customOffset);
          if (point && at >= 0) points[at] = point;
        }
        return equal(points, node.points) ? node : { ...node, points };
      }
      return node.children ? { ...node, children: node.children.map(connect) } : node;
    };
    return children.map(connect);
  }
  createContentCopy(id: string): Promise<number> {
    this.assertWritable();
    if (!this.canEditElement(id) || !this.options.createContentCopy)
      throw new Error("无法复制此正文");
    return this.options.createContentCopy(id);
  }
  pages() {
    return this.model.read().pages.map(page => ({ id: page.id, title: page.title }));
  }
  async duplicatePage(pageId: string): Promise<string> {
    this.assertWritable();
    const bundle = this.exportTransfer();
    const page = bundle.pages.find(page => page.id === pageId);
    if (!page) throw new Error("原页面不存在");
    const ids = flatten(page.elements as unknown as BoardElement[]).map(node => node.id);
    const selected = ids.length
      ? this.exportTransfer(ids)
      : { ...bundle, resources: [], presentations: [] };
    selected.pages = [{ ...page, title: `${page.title} 副本` }];
    const [created] = await this.importTransfer(selected, true);
    if (!created) throw new Error("复制页面失败");
    return created;
  }
  appendStroke(
    id: string,
    points: readonly import("../utils/HandwriteUtil").HandwriteInputPoint[],
    style: import("../utils/HandwriteUtil").HandwriteStyle
  ): void {
    this.assertWritable();
    if (!points.length || points.length > 128) throw new Error("笔迹分段超过预算");
    const parent = this.model.elements.get(id),
      contractId = this.options.types.handwrite?.contractId,
      segmentContract = this.options.types["host.whiteboard.stroke-segment"]?.contractId;
    if (!contractId || !segmentContract) throw new Error("笔迹契约未就绪");
    const all = [
      ...(this.authorElement(id)?.children.flatMap(
        segment =>
          segment.data.points as unknown as import("../utils/HandwriteUtil").HandwriteInputPoint[]
      ) ?? []),
      ...points,
    ];
    const stroke = buildHandwriteElement(all, style, id);
    if (!stroke) throw new Error("笔迹首段至少需要两个点");
    const geometry = {
      x: stroke.x,
      y: stroke.y,
      width: stroke.width,
      height: stroke.height,
      rotation: 0,
    };
    const commands: WhiteboardModelCommand[] = [];
    if (!parent)
      commands.push(
        {
          type: "create",
          id,
          contractId,
          data: { segmented: true, points: [], outline: [] },
          geometry,
          parent: { kind: "page", id: this.page },
        },
        { type: "set_node", id, patch: { name: "手写", style: style as unknown as WhiteboardData } }
      );
    else if (
      (parent.get("identity") as { contractId: string }).contractId !== contractId ||
      (parent.get("data") as Y.Map<unknown>).get("segmented") !== true
    )
      throw new Error("笔迹身份冲突");
    if (parent) commands.push({ type: "set_node", id, patch: { geometry } });
    commands.push({
      type: "create",
      contractId: segmentContract,
      data: { points: points as unknown as import("@tau/db-schema/content-contracts").DataJson },
      geometry,
      parent: { kind: "element", id },
    });
    this.enterGroup(`stroke:${id}`);
    this.writing = true;
    try {
      this.model.submit(
        commands,
        this.origin,
        this.options.preparedContracts?.filter(
          entry => entry.id === contractId || entry.id === segmentContract
        )
      );
    } finally {
      this.writing = false;
      this.refresh();
    }
  }
  cancelStroke(id: string): void {
    if (
      this.closed ||
      this.receiving ||
      this.board?.readonly ||
      this.options.canWrite?.() === false
    )
      return;
    const node = this.authorElement(id);
    if (!node) return;
    this.enterGroup(`stroke:${id}`);
    this.writing = true;
    try {
      this.model.submit(
        [{ type: "remove_nodes", ids: flattenModel([node]).map(value => value.id) }],
        this.origin
      );
    } finally {
      this.writing = false;
      this.refresh();
    }
  }
  exportTransfer(ids?: readonly string[]) {
    return exportWhiteboardTransfer(
      this.model,
      this.options.documentId ?? String(this.model.doc.getMap("meta").get("documentId") ?? ""),
      ids
    );
  }
  async exportFile(ids?: readonly string[]): Promise<Blob> {
    const bundle = this.exportTransfer(ids);
    const assets: NonNullable<typeof bundle.assets> = [];
    let bytes = 0;
    for (const reference of bundle.resources.filter(ref => ref.startsWith("tau-collab-"))) {
      if (!this.options.readResource) throw new Error("资源不可读取，未生成不完整白板包");
      const file = await this.options.readResource(reference);
      bytes += file.bytes.byteLength;
      if (bytes > 16 * 1024 * 1024) throw new Error("资源包超过 16 MiB 导出预算");
      let binary = "";
      for (let at = 0; at < file.bytes.length; at += 8192)
        binary += String.fromCharCode(...file.bytes.subarray(at, at + 8192));
      assets.push({ reference, name: file.name, mime: file.mime, base64: btoa(binary) });
    }
    return new Blob([JSON.stringify({ ...bundle, assets })], { type: "application/json" });
  }
  async importTransfer(
    bundle: import("@tau/collaboration").WhiteboardTransfer,
    allPages = false
  ): Promise<readonly string[]> {
    const board = this.assertWritable(),
      valid = board.captureSubmission();
    const page = this.page;
    const plan = await prepareWhiteboardTransfer(this.model, bundle, {
      ...(allPages ? {} : { pageId: page }),
      targetDocumentId:
        this.options.documentId ?? String(this.model.doc.getMap("meta").get("documentId") ?? ""),
      knownContractIds: new Set(Object.values(this.options.types).map(type => type.contractId)),
      importResource: async (reference, source) => {
        const file = bundle.assets?.find(file => file.reference === reference);
        if (file && this.options.uploadResource) {
          if (
            file.base64.length > 24 * 1024 * 1024 ||
            typeof file.name !== "string" ||
            typeof file.mime !== "string"
          )
            throw new Error("资源包格式或预算无效");
          const binary = atob(file.base64),
            bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
          return this.options.uploadResource({ name: file.name, mime: file.mime, bytes });
        }
        if (!this.options.importResource) throw new Error("资源尚未取得源与目标文档权限");
        return this.options.importResource(reference, source);
      },
    });
    if (!valid() || this.page !== page) throw new Error("导入目标已变化，原内容未改变");
    this.assertWritable();
    this.enterGroup();
    this.writing = true;
    try {
      this.model.submitChunks(plan.commands, this.origin, plan.prepared, plan.initialBodies);
    } finally {
      this.writing = false;
      this.refresh();
    }
    if (!allPages) {
      const ids = new Set(
        bundle.pages.flatMap(page => page.elements).map(node => plan.ids.get(node.id))
      );
      board.apply(
        {
          type: "set_selection",
          properties: board.selection,
          newProperties: {
            selectedElements: board.children.filter(node => ids.has(node.id)),
            selectArea: null,
          },
        },
        false
      );
    }
    return plan.commands.flatMap(command =>
      command.type === "create_page" && command.id ? [command.id] : []
    );
  }
  async linkEntity(
    id: string,
    kind: import("@tau/db-schema/content-identities").ContentEntityKind,
    localId: number
  ): Promise<boolean> {
    const board = this.assertWritable(),
      valid = board.captureSubmission(flatten(board.children).find(node => node.id === id));
    if (!this.canEditElement(id) || !this.options.referenceEntity)
      throw new Error("此元素不能建立外部引用");
    const before = JSON.stringify(this.authorElement(id)?.entity);
    const entity = await this.options.referenceEntity(kind, localId);
    if (
      !valid() ||
      !this.canEditElement(id) ||
      JSON.stringify(this.authorElement(id)?.entity) !== before
    )
      return false;
    this.submit([{ type: "set_entity", id, entity }]);
    return true;
  }
  unlinkEntity(id: string): void {
    if (!this.canEditElement(id)) throw new Error("引用目标不可编辑");
    this.submit([{ type: "set_entity", id, entity: null }]);
  }
  setPresentations(
    before: readonly import("../types/presentation").PresentationSequence[],
    after: readonly import("../types/presentation").PresentationSequence[]
  ): void {
    this.submit([{ type: "set_presentation", before, after }]);
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
    this.refresh();
  }
  measureElement(id: string, size: { width: number; height: number }): void {
    if (
      this.closed ||
      !this.supportsElement(id) ||
      !Number.isFinite(size.width) ||
      !Number.isFinite(size.height) ||
      size.width < 0 ||
      size.height < 0
    )
      return;
    const previous = this.measurements.get(id);
    if (
      previous &&
      Math.abs(previous.width - size.width) < 0.01 &&
      Math.abs(previous.height - size.height) < 0.01 &&
      previous.baseWidth === this.authorElement(id)?.geometry.width &&
      previous.baseHeight === this.authorElement(id)?.geometry.height
    )
      return;
    const geometry = this.authorElement(id)!.geometry;
    this.measurements.set(id, { ...size, baseWidth: geometry.width, baseHeight: geometry.height });
    this.refresh();
  }
  splitHistory(): void {
    this.history.stopCapturing();
    this.group = undefined;
  }
  private enterGroup(group?: string): void {
    if (group === undefined || group !== this.group) this.history.stopCapturing();
    this.group = group;
  }
  submit(
    commands: readonly WhiteboardModelCommand[],
    historyGroup?: string,
    extraPrepared: readonly (
      | import("@tau/db-schema/content-contracts").PreparedContentContract
      | import("@tau/db-schema/content-contracts").PreparedWhiteboardContract
    )[] = []
  ) {
    this.assertWritable(false);
    if (this.gesture) {
      this.board?.interactions.cancel();
      this.endGesture(false);
    }
    const bodyContracts = new Set<string>();
    const collect = (nodes: readonly import("@tau/collaboration").ContentNode[]) => {
      for (const node of nodes) {
        if (typeof node.tauContract === "string") bodyContracts.add(node.tauContract);
        if (node.children) collect(node.children);
      }
    };
    for (const command of commands)
      if (command.type === "create" && Array.isArray(command.body)) collect(command.body);
    const prepared = [
      ...extraPrepared,
      ...(this.options.preparedContracts ?? []).filter(entry => bodyContracts.has(entry.id)),
      ...commands.flatMap(command =>
        command.type === "create" && !this.model.contracts.has(command.contractId)
          ? [
              this.options.catalog?.get(command.contractId)?.prepared ??
                this.options.preparedContracts?.find(entry => entry.id === command.contractId),
            ].filter(
              (
                entry
              ): entry is
                | import("@tau/db-schema/content-contracts").PreparedWhiteboardContract
                | import("@tau/db-schema/content-contracts").PreparedContentContract => !!entry
            )
          : []
      ),
    ];
    this.validating = true;
    try {
      this.model.preflight(candidate => {
        const created = candidate.submit(commands, this.origin, prepared).createdIds;
        const touched = new Set([
          ...created,
          ...commands.flatMap(command => (command.type === "set_data" ? [command.id] : [])),
        ]);
        const snapshot = candidate.read();
        for (const node of flattenModel([
          ...snapshot.pages.flatMap(page => [...page.children, ...page.recovery]),
          ...snapshot.recovery,
        ])) {
          const entry = this.options.catalog?.get(node.contractId);
          if (touched.has(node.id)) {
            const contract = candidate.contracts.get(node.contractId)!;
            for (const slot of contentResourceSlots(node.data, contract.resources))
              for (const reference of contentResourceValues(slot))
                if (!isSafeResource(reference))
                  throw new Error("资源须先交由宿主管理，不能写入本机路径或凭据");
          }
          if (touched.has(node.id) && entry?.access === "edit")
            this.options.catalog!.validate(entry, node.data);
        }
      });
    } finally {
      this.validating = false;
    }
    this.enterGroup(historyGroup);
    this.writing = true;
    try {
      return this.model.submit(commands, this.origin, prepared);
    } finally {
      this.writing = false;
      this.refresh();
    }
  }
  /** 宿主条件提案只覆盖文本和用户几何，等待结果期间冻结本视图写入口。 */
  beginConditional(operationId: string, commands: readonly WhiteboardModelCommand[]): Uint8Array {
    this.assertWritable(false);
    if (
      this.completedConditions.has(operationId) ||
      !operationId ||
      commands.some(
        command =>
          command.type !== "edit_text" &&
          command.type !== "edit_title" &&
          command.type !== "edit_page_title" &&
          !(
            command.type === "set_node" &&
            Object.keys(command.patch).every(key => key === "geometry")
          )
      )
    )
      throw new Error("条件提案包含不支持的操作");
    for (const command of commands)
      if (command.type === "edit_text" && !this.canEditElement(command.id))
        throw new Error("条件提案目标版本不可编辑");
    this.board?.interactions.cancel();
    this.endGesture(false);
    const doc = new Y.Doc({ gc: false });
    Y.applyUpdate(doc, Y.encodeStateAsUpdate(this.model.doc));
    const candidate = new WhiteboardModel(doc),
      vector = Y.encodeStateVector(doc);
    try {
      candidate.submit(commands, null);
      const update = Y.encodeStateAsUpdate(doc, vector);
      this.conditional = { id: operationId, update, buffered: [] };
      return update.slice();
    } finally {
      candidate.dispose();
      doc.destroy();
    }
  }
  async receiveDocument(update: Uint8Array): Promise<void> {
    if (this.closed) throw new Error("白板视图已释放");
    if (this.conditional) {
      const bytes = this.conditional.buffered.reduce((sum, value) => sum + value.byteLength, 0);
      if (bytes + update.byteLength > 8 * 1024 * 1024)
        throw new Error("条件等待期间远端缓冲已满，请保留提案并重连");
      this.conditional.buffered.push(update.slice());
    } else await this.model.receive(update);
  }
  async finishConditional(operation: DocumentOperation): Promise<void> {
    if (this.closed) throw new Error("白板视图已释放，回执保留给宿主恢复");
    if (this.completedConditions.has(operation.operationId)) return;
    const pending = this.conditional;
    if (!pending || pending.id !== operation.operationId)
      throw new Error("条件回执没有对应的本机提案");
    const hash = [
      ...new Uint8Array(await crypto.subtle.digest("SHA-256", Uint8Array.from(pending.update))),
    ]
      .map(x => x.toString(16).padStart(2, "0"))
      .join("");
    if (this.completedConditions.has(operation.operationId)) return;
    if (hash !== operation.updateHash) throw new Error("条件回执候选不匹配");
    if (operation.state === "PENDING") return;
    if (operation.state === "COMMITTED") {
      if (!operation.receipt) throw new Error("条件回执未确认耐久提交");
      this.splitHistory();
      this.writing = true;
      try {
        Y.applyUpdate(this.model.doc, pending.update, this.origin);
      } finally {
        this.writing = false;
        this.splitHistory();
      }
    }
    this.completedConditions.add(pending.id);
    this.conditional = undefined;
    for (const update of pending.buffered) await this.model.receive(update);
    this.refresh();
  }
  private entryInstalled(entry: WhiteboardContractEntry): boolean {
    return this.board?.extensions?.authorOfType(entry.contract.type) === entry.contract.owner;
  }
  supportsElement(id: string): boolean {
    const node = this.authorElement(id);
    if (!node) return false;
    const entry = this.options.catalog?.get(node.contractId);
    return entry
      ? this.entryInstalled(entry) && entry.access !== "none"
      : this.options.types[node.type]?.contractId === node.contractId;
  }
  resolveElementDefinition(contractId: string) {
    const entry = this.options.catalog?.get(contractId);
    return entry && this.entryInstalled(entry) ? entry : undefined;
  }
  private authorElement(id: string) {
    const snapshot = this.model.read();
    return flattenModel([
      ...snapshot.pages.flatMap(page => [...page.children, ...page.recovery]),
      ...snapshot.recovery,
    ]).find(node => node.id === id);
  }
  readonly author: WhiteboardAuthorBridge = {
    getPageId: () => this.page,
    canWrite: () => {
      try {
        this.assertWritable(false);
        return true;
      } catch {
        return false;
      }
    },
    getSnapshot: () => {
      const page = this.model.read().pages.find(page => page.id === this.page);
      return Object.freeze({
        pageId: this.page,
        children: Object.freeze(
          [...(page?.children ?? []), ...(page?.recovery ?? [])].map(authorSnapshot)
        ),
      });
    },
    getElement: id => {
      const node = this.authorElement(id);
      return node && authorSnapshot(node);
    },
    submit: (owner, commands, historyGroup) => this.submitAuthor(owner, commands, historyGroup),
    getTextBinding: (owner, id, field) => {
      const entry = this.authorEntry(owner, id, true);
      if (!entry.contract.textFields.includes(field)) throw new Error("文本字段未声明");
      return this.textField(id, field, true);
    },
  };
  private authorEntry(owner: string, id: string, read = false): WhiteboardContractEntry {
    const node = this.authorElement(id),
      entry = node && this.options.catalog?.get(node.contractId);
    if (
      !node ||
      !entry ||
      !this.entryInstalled(entry) ||
      (read
        ? entry.access === "none"
        : entry.access !== "edit" || this.options.canEditContract?.(entry) === false) ||
      !this.options.catalog!.owns(owner, entry)
    )
      throw new Error("插件不拥有此版本的内部编辑权限");
    return entry;
  }
  private submitAuthor(owner: string, input: readonly WhiteboardIdCommand[], group?: string) {
    this.assertWritable(false);
    this.validating = true;
    try {
      assertWhiteboardJson(input, -4);
      input = structuredClone(input);
    } finally {
      this.validating = false;
    }
    const commands: WhiteboardModelCommand[] = [],
      prepared: import("@tau/db-schema/content-contracts").PreparedWhiteboardContract[] = [];
    const checked = new Set<string>();
    const keys = (value: object, allowed: readonly string[]) => {
      if (Object.keys(value).some(key => !allowed.includes(key)))
        throw new Error("作者命令包含宿主保留字段");
    };
    for (const command of input) {
      if (command.type === "create") {
        keys(command, ["type", "element", "parent", "beforeId", "afterId"]);
        keys(command.element, ["type", "data", "geometry"]);
        if (command.beforeId !== undefined && command.afterId !== undefined)
          throw new Error("锚点不能同时声明");
        const entry = this.options.catalog?.current(command.element.type);
        if (
          !entry ||
          !this.entryInstalled(entry) ||
          this.options.canEditContract?.(entry) === false ||
          !this.options.catalog!.owns(owner, entry)
        )
          throw new Error("插件只能创建自己声明的当前版本");
        prepared.push(entry.prepared);
        commands.push({
          type: "create",
          contractId: entry.id,
          data: command.element.data,
          geometry: command.element.geometry,
          parent: command.parent,
          ...(command.beforeId !== undefined
            ? { beforeId: command.beforeId }
            : command.afterId !== undefined
              ? { afterId: command.afterId }
              : {}),
        });
      } else if (command.type === "set_data") {
        this.authorEntry(owner, command.id);
        checked.add(command.id);
        commands.push(command);
      } else if (command.type === "set_node") {
        keys(command, ["type", "id", "patch"]);
        keys(command.patch, ["name", "geometry", "style"]);
        const node = this.authorElement(command.id);
        if (!node) throw new Error("目标已删除");
        const contract = this.model.contracts.get(node.contractId);
        if (
          command.patch.geometry &&
          contract?.domain === "whiteboard-element" &&
          contract.structure.geometry === "opaque" &&
          ["width", "height", "rotation"].some(
            key => command.patch.geometry![key as "width"] !== node.geometry[key as "width"]
          )
        )
          throw new Error("未知几何仅允许平移");
        commands.push(command);
      } else if (command.type === "move_node") commands.push(command);
      else if (command.type === "remove_nodes") {
        keys(command, ["type", "ids"]);
        commands.push({
          type: "remove_nodes",
          ids: [
            ...new Set(
              command.ids.flatMap(id => {
                const node = this.authorElement(id);
                return node ? flattenModel([node]).map(child => child.id) : [id];
              })
            ),
          ],
        });
      } else throw new Error("作者命令不支持");
    }
    this.validating = true;
    try {
      this.model.preflight(candidate => {
        const result = candidate.submit(commands, this.origin, prepared);
        const nodes = flattenModel([
          ...candidate.read().pages.flatMap(page => [...page.children, ...page.recovery]),
          ...candidate.read().recovery,
        ]);
        for (const id of [...checked, ...result.createdIds]) {
          const node = nodes.find(node => node.id === id),
            entry = node && this.options.catalog?.get(node.contractId);
          if (node && entry) {
            for (const slot of contentResourceSlots(node.data, entry.contract.resources))
              for (const reference of contentResourceValues(slot))
                if (!isSafeResource(reference)) throw new Error("资源须先交由宿主管理");
            this.options.catalog!.validate(entry, node.data);
          }
        }
      });
    } finally {
      this.validating = false;
    }
    if (this.gesture) {
      this.board?.interactions.cancel();
      this.endGesture(false);
    }
    this.enterGroup(group);
    this.writing = true;
    try {
      return this.model.submit(commands, this.origin, prepared);
    } finally {
      this.writing = false;
      this.refresh();
    }
  }
  switchPage(pageId: string): void {
    this.flushInputs();
    if (this.closed || !this.model.read().pages.some(page => page.id === pageId))
      throw new Error("目标页面不可用");
    this.board?.interactions.cancel();
    this.endGesture(false);
    this.splitHistory();
    this.page = pageId;
    this.refresh();
  }
  moveToPage(ids: readonly string[], pageId: string): void {
    this.flushInputs();
    const board = this.assertWritable();
    if (ids.some(id => !flatten(board.children).some(node => node.id === id)))
      throw new Error("跨页目标已失效");
    this.submit(ids.map(id => ({ type: "move_node", id, parent: { kind: "page", id: pageId } })));
  }
  private captureFeedback(node: BoardElement, patch: Record<string, unknown>) {
    const codec = this.options.types[node.type];
    if (!codec || (node.contractId && codec.contractId !== node.contractId)) return [];
    const local = Object.fromEntries(
      Object.entries(patch).filter(([key]) => codec.transientProperties?.includes(key))
    );
    return Object.keys(local).length ? [{ id: node.id, patch: local }] : [];
  }
  private applyFeedback(values: readonly { id: string; patch: Record<string, unknown> }[]) {
    for (const { id, patch } of values)
      this.feedback.set(id, { ...this.feedback.get(id), ...patch });
  }
  beginGesture(): void {
    if (this.gesture || this.closed) return;
    this.splitHistory();
    this.pendingFeedback = [];
    this.gesture = true;
    this.gestureCaptureTimeout = this.history.captureTimeout;
    this.history.captureTimeout = Number.POSITIVE_INFINITY;
    this.pending = [];
  }
  endGesture(commit: boolean): void {
    if (!this.gesture) return;
    const pending = this.compact(this.pending),
      feedback = this.pendingFeedback;
    this.pendingFeedback = [];
    this.gesture = false;
    this.pending = [];
    try {
      if (commit && pending.length) this.submit(pending);
      if (commit) this.applyFeedback(feedback);
    } finally {
      this.history.captureTimeout = this.gestureCaptureTimeout ?? 500;
      this.gestureCaptureTimeout = undefined;
      this.splitHistory();
      this.refresh();
    }
  }
  private compact(commands: readonly WhiteboardModelCommand[]): WhiteboardModelCommand[] {
    const result: WhiteboardModelCommand[] = [];
    const patches = new Map<string, Extract<WhiteboardModelCommand, { type: "set_node" }>>();
    for (const command of commands) {
      if (command.type !== "set_node") {
        result.push(command);
        patches.clear();
        continue;
      }
      const previous = patches.get(command.id);
      if (previous)
        previous.patch = {
          ...previous.patch,
          ...command.patch,
          ...(command.patch.style
            ? { style: { ...previous.patch.style, ...command.patch.style } }
            : {}),
        };
      else {
        const copy = { ...command };
        patches.set(command.id, copy);
        result.push(copy);
      }
    }
    return result;
  }
  apply(operations: Operation[], updateHistory: boolean, historyGroup?: string): boolean {
    if (this.closed) return true;
    const content = operations.some(
      op => !["set_selection", "set_viewport", "set_moving"].includes(op.type)
    );
    if (!content) return false;
    this.assertWritable();
    // 派生尺寸/布局只能改变本机投影，不能把 updateHistory=false 当作无历史的共享写入口。
    if (!this.gesture && !updateHistory) {
      for (const operation of operations)
        if (operation.type === "set_node") {
          const node = PathUtil.getElement(this.board!.children, operation.path);
          if (node) this.applyFeedback(this.captureFeedback(node, operation.newProperties));
        }
      return false;
    }
    const { commands, children, feedback } = this.compile(operations);
    if (this.gesture) {
      this.pending = this.compact([...this.pending, ...commands]);
      this.pendingFeedback.push(...feedback);
      this.board!.publishDocument(this.resolveArrowBindings(children));
    } else {
      if (commands.length) this.submit(commands, historyGroup);
      if (feedback.length) {
        this.applyFeedback(feedback);
        this.refresh();
      }
    }
    const local = operations.filter(op =>
      ["set_selection", "set_viewport", "set_moving"].includes(op.type)
    );
    if (local.length) this.board!.apply(local, false);
    return true;
  }
  commitPreview(operations: Operation[], historyGroup?: string): void {
    this.assertWritable();
    const { commands } = this.compile(operations);
    if (this.gesture) this.pending = this.compact([...this.pending, ...commands]);
    else if (commands.length) this.submit(commands, historyGroup);
  }
  flushInputs(): void {
    for (const editor of this.editors) editor.flushNodeTreeInputs();
    for (const field of this.fields) field.flushInputs?.();
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
    const text = this.model.pages.get(id)?.get("title");
    if (!(text instanceof Y.Text) || this.closed) throw new Error("页面文字已失效");
    const handle = createSharedTextField(
      text,
      this.history,
      () =>
        !this.closed &&
        this.options.canWrite?.() !== false &&
        !!this.board?.captureSubmission()() &&
        this.model.read().pages.some(page => page.id === id),
      (changes, origin) => {
        this.assertWritable(false);
        this.enterGroup(`page-title:${id}`);
        this.writing = true;
        try {
          this.model.submit(
            changes.map(edit => ({ type: "edit_page_title", id, edit })),
            origin
          );
        } finally {
          this.writing = false;
          this.refresh();
        }
      },
      false
    );
    this.fields.add(handle);
    return {
      ...handle,
      dispose: () => {
        handle.dispose();
        this.fields.delete(handle);
      },
    };
  }
  textField(id: string, field: string | null = null, read = false): EditorTextField {
    if (read) {
      if (this.closed || !this.board || !this.authorElement(id)) throw new Error("文本目标已失效");
    } else this.assertWritable();
    const handle = createSharedTextField(
      this.model.text(id, field),
      this.history,
      () => this.canEditElement(id),
      (changes, origin) => {
        this.assertWritable();
        if (this.gesture) {
          this.board?.interactions.cancel();
          this.endGesture(false);
        }
        const entry = this.options.catalog?.get(this.authorElement(id)?.contractId ?? "");
        if (entry) {
          this.validating = true;
          try {
            this.model.preflight(candidate => {
              candidate.submit(
                changes.map(edit => ({ type: "edit_text", id, field, edit })),
                origin
              );
              const snapshot = candidate.read();
              const node = flattenModel([
                ...snapshot.pages.flatMap(page => [...page.children, ...page.recovery]),
                ...snapshot.recovery,
              ]).find(node => node.id === id);
              if (node) this.options.catalog!.validate(entry, node.data);
            });
          } finally {
            this.validating = false;
          }
        }
        this.enterGroup(`field:${id}:${field}`);
        this.writing = true;
        try {
          this.model.submit(
            changes.map(edit => ({ type: "edit_text", id, field, edit })),
            origin
          );
        } finally {
          this.writing = false;
          this.refresh();
        }
      },
      false
    );
    this.fields.add(handle);
    return {
      ...handle,
      dispose: () => {
        handle.dispose();
        this.fields.delete(handle);
      },
    };
  }

  textDocument(id: string): EditorDocument | undefined {
    if (this.closed || !this.board) return;
    const element = flatten(this.board.children).find(node => node.id === id);
    if (!element || !this.options.types[element.type]?.bodyProperty) return;
    if (element.type === "richtext" && element.entity?.kind === "content") return;
    const body = this.model.elements.get(id)?.get("fieldBindings") as
      | { body?: { mode: string } }
      | undefined;
    if (body?.body?.mode !== "richtext") return;
    let document = this.documents.get(id);
    if (!document) {
      const tree = this.model.richText(id);
      document = createNodeTreeDocument(tree, {
        history: this.history,
        versions: this.options.editorVersions,
        normalizeOnConnect: false,
        canWrite: () => this.canEditElement(id),
        mutate: (write, origin) => {
          this.assertWritable();
          if (!this.canEditElement(id)) throw new Error("富文本目标已失效");
          if (this.gesture) {
            this.board?.interactions.cancel();
            this.endGesture(false);
          }
          this.enterGroup(`text:${id}`);
          this.writing = true;
          try {
            this.model.withPreparedContracts(
              (this.options.preparedContracts ?? []).filter(
                entry => entry.contract.domain === "editor-node"
              ),
              candidate => write(candidate.richText(id)),
              origin
            );
          } finally {
            this.writing = false;
            this.refresh();
          }
        },
      });
      const install = document.binding!.install;
      document.binding!.install = editor => {
        const bound = install(editor) as NodeTreeEditor;
        this.editors.add(bound);
        return bound;
      };
      this.documents.set(id, document);
    }
    return document;
  }

  private canvasGeometry(node: BoardElement): WhiteboardGeometry {
    if (node.type === "arrow" && Array.isArray(node.points) && node.points.length) {
      const xs = node.points.map((p: { x: number }) => p.x),
        ys = node.points.map((p: { y: number }) => p.y);
      return {
        x: Math.min(...xs),
        y: Math.min(...ys),
        width: Math.max(...xs) - Math.min(...xs),
        height: Math.max(...ys) - Math.min(...ys),
        rotation: node.rotation ?? 0,
      };
    }
    return {
      x: node.x,
      y: node.y,
      width: node.width,
      height: node.height,
      rotation: node.rotation ?? 0,
    };
  }
  private compile(operations: Operation[]): {
    commands: WhiteboardModelCommand[];
    children: BoardElement[];
    feedback: { id: string; patch: Record<string, unknown> }[];
  } {
    const board = this.board!;
    let children = board.children;
    const commands: WhiteboardModelCommand[] = [];
    const feedback: { id: string; patch: Record<string, unknown> }[] = [];
    const parentAt = (path: number[]): WhiteboardParent =>
      path.length === 1
        ? { kind: "page", id: this.page }
        : { kind: "element", id: PathUtil.getElement(children, path.slice(0, -1))!.id };
    const prepared = BoardOperations.applyOperations(
      { children, selection: board.selection, viewPort: board.viewPort, sketch: board.sketch },
      operations
    ).operations;
    const isContent = (op: Operation) =>
      !["set_selection", "set_viewport", "set_moving"].includes(op.type);
    if (prepared.filter(isContent).length !== operations.filter(isContent).length)
      throw new Error("批次包含失效路径或不可执行的内容操作");
    for (const operation of prepared) {
      const old =
        "path" in operation && operation.type !== "insert_node"
          ? PathUtil.getElement(children, operation.path)
          : undefined;
      const next = BoardOperations.applyOperations({ children }, [operation]).data.children;
      if (operation.type === "set_node") {
        if (!old) throw new Error("属性目标已失效");
        commands.push(...this.patch(old, operation.newProperties));
        feedback.push(...this.captureFeedback(old, operation.newProperties));
      } else if (operation.type === "remove_node") {
        if (!old || old.id !== operation.node.id) throw new Error("删除观察目标已失效");
        commands.push({
          type: "remove_nodes",
          ids: flattenModel([this.authorElement(old.id)!]).map(node => node.id),
        });
      } else if (operation.type === "insert_node") {
        const parent = parentAt(operation.path);
        const peers =
          operation.path.length === 1
            ? children
            : (PathUtil.getElement(children, operation.path.slice(0, -1))!.children ?? []);
        const anchor = peers[operation.path.at(-1)!];
        this.creation(operation.node, parent, anchor?.id, commands);
        for (const node of flatten([operation.node]))
          feedback.push(...this.captureFeedback(node, node));
      } else if (operation.type === "move_node") {
        if (!old) throw new Error("移动目标已失效");
        const priorParent =
          operation.path.length > 1
            ? PathUtil.getElement(children, operation.path.slice(0, -1))
            : undefined;
        const takeVisibleGeometry =
          priorParent && ["column", "mind-node"].includes(priorParent.type);
        const locate = (nodes: BoardElement[], parent: WhiteboardParent): boolean => {
          for (let index = 0; index < nodes.length; index++) {
            const node = nodes[index];
            if (node.id === old.id) {
              if (
                takeVisibleGeometry &&
                (parent.kind !== "element" || parent.id !== priorParent.id)
              )
                commands.push({
                  type: "set_node",
                  id: old.id,
                  patch: { geometry: this.canvasGeometry(old) },
                });
              commands.push({
                type: "move_node",
                id: old.id,
                parent,
                ...anchorBefore(nodes[index + 1]?.id),
              });
              return true;
            }
            if (locate(node.children ?? [], { kind: "element", id: node.id })) return true;
          }
          return false;
        };
        if (!locate(next, { kind: "page", id: this.page })) throw new Error("移动结果缺少原身份");
      } else if (operation.type === "set_sketch")
        commands.push({
          type: "set_page_sketch",
          id: this.page,
          sketch: { ...board.sketch, ...operation.newProperties },
        });
      children = next;
    }
    return { commands, children, feedback };
  }
  private bodyContent(value: unknown): unknown {
    if (!Array.isArray(value) || !this.options.editorVersions) return value;
    return value.map(node => {
      if (!node || typeof node !== "object" || !Array.isArray(node.children)) return node;
      const contractId = node.tauContract ?? this.options.editorVersions!.current(node.type)?.id;
      if (!contractId) throw new Error("正文节点尚未声明协作版本");
      return { ...node, tauContract: contractId, children: this.bodyContent(node.children) };
    });
  }
  private creation(
    node: BoardElement,
    parent: WhiteboardParent,
    beforeId: string | undefined,
    commands: WhiteboardModelCommand[]
  ): void {
    const codec = this.options.types[node.type];
    const contractId =
      typeof node.contractId === "string"
        ? node.contractId
        : (codec?.contractId ?? this.options.catalog?.current(node.type)?.id);
    const contract =
      contractId &&
      (this.model.contracts.get(contractId) ??
        this.options.catalog?.get(contractId)?.contract ??
        this.options.preparedContracts?.find(entry => entry.id === contractId)?.contract);
    if (!contract || contract.domain !== "whiteboard-element" || contract.type !== node.type)
      throw new Error("元素类型尚未声明画布契约");
    const data: Record<string, unknown> = { ...(node.data ?? {}) };
    const allowed = new Set([
      "id",
      "contractId",
      "dataVersion",
      "body",
      "entity",
      "type",
      "children",
      "name",
      "data",
      "style",
      ...geometryKeys,
      ...(codec?.dataProperties ?? []),
      ...(codec?.transientProperties ?? []),
      ...(codec?.bodyProperty ? [codec.bodyProperty.split(".")[0]] : []),
    ]);
    if (Object.keys(node).some(key => !allowed.has(key)))
      throw new Error("创建包含未分类的画布属性");
    for (const key of codec?.dataProperties ?? [])
      if (node[key] !== undefined) data[key] = canvasValue(node[key]);
    if (codec?.bodyProperty?.includes(".")) {
      const [head, tail] = codec.bodyProperty.split(".");
      const rest = { ...((data[head] as Record<string, unknown>) ?? {}) };
      delete rest[tail];
      data[head] = rest;
    }
    if (node.type === "video" && (data.metaInfo as { type?: string } | undefined)?.type === "local")
      data.metaInfo = { type: "local" };
    commands.push({
      type: "create",
      id: node.id,
      contractId: contractId as string,
      geometry: this.canvasGeometry(node),
      data: data as WhiteboardData,
      parent,
      ...anchorBefore(beforeId),
      ...(contract.structure.text !== "none"
        ? {
            body: this.bodyContent(
              node.body ??
                (codec?.bodyProperty ? bodyValue(node, codec.bodyProperty) : undefined) ??
                (contract.structure.text === "plain" ? "" : [])
            ) as string | readonly import("@tau/collaboration").ContentNode[],
          }
        : {}),
      ...(node.entity
        ? {
            entity:
              node.entity as import("@tau/db-schema/content-identities").ContentEntityReference,
          }
        : {}),
    });
    if (node.name !== undefined || node.style !== undefined)
      commands.push({
        type: "set_node",
        id: node.id,
        patch: {
          ...(node.name !== undefined ? { name: node.name } : {}),
          ...(node.style ? { style: node.style } : {}),
        },
      });
    for (const child of node.children ?? [])
      this.creation(child, { kind: "element", id: node.id }, undefined, commands);
  }
  private patch(node: BoardElement, patch: Record<string, unknown>): WhiteboardModelCommand[] {
    const codec = this.options.types[node.type];
    const currentContract = this.canEditElement(node.id);
    const commands: WhiteboardModelCommand[] = [],
      data: Record<string, unknown> = {},
      unset = new Set<string>();
    const shell: { name?: string; geometry?: WhiteboardGeometry; style?: WhiteboardData } = {};
    for (const [key, original] of Object.entries(patch)) {
      let value =
        node.type === "video" &&
        key === "metaInfo" &&
        (original as { type?: string })?.type === "local"
          ? { type: "local" }
          : original;
      if (codec?.bodyProperty?.startsWith(`${key}.`)) {
        const leaf = codec.bodyProperty.slice(key.length + 1);
        if (
          !equal(
            bodyValue({ [key]: value }, codec.bodyProperty),
            bodyValue(node, codec.bodyProperty)
          )
        )
          throw new Error("富文本必须通过文档绑定增量编辑");
        value = { ...(value as Record<string, unknown>) };
        delete (value as Record<string, unknown>)[leaf];
      }
      if (codec?.transientProperties?.includes(key)) continue;
      if (key === codec?.bodyProperty) {
        if (!equal(value, node[key])) throw new Error("富文本必须通过文档绑定增量编辑");
        continue;
      }
      if (geometryKeys.includes(key as (typeof geometryKeys)[number])) {
        shell.geometry = {
          ...(this.authorElement(node.id)?.geometry ?? this.canvasGeometry(node)),
          ...Object.fromEntries(
            Object.entries(patch).filter(([field]) =>
              geometryKeys.includes(field as (typeof geometryKeys)[number])
            )
          ),
        } as WhiteboardGeometry;
        continue;
      }
      if (key === "name") {
        if (typeof value !== "string") throw new Error("名称必须是字符串");
        shell.name = value;
        continue;
      }
      if (key === "style") {
        shell.style = value as WhiteboardData;
        continue;
      }
      if (key === "data") {
        if (!currentContract) throw new Error("当前元素契约不支持内部编辑");
        if (!value || typeof value !== "object" || Array.isArray(value))
          throw new Error("数据补丁无效");
        for (const name of new Set([...Object.keys(node.data ?? {}), ...Object.keys(value)])) {
          const entry = (value as Record<string, unknown>)[name];
          if (equal(entry, node.data?.[name])) continue;
          if (entry === undefined) unset.add(name);
          else data[name] = entry;
        }
        continue;
      }
      if (!currentContract || !codec?.dataProperties?.includes(key))
        throw new Error("属性未声明持久归属");
      if (value == null) unset.add(key);
      else data[key] = canvasValue(value);
    }
    if (node.type === "arrow" && Object.hasOwn(data, "points"))
      shell.geometry = this.canvasGeometry({ ...node, points: data.points });
    if (node.type === "handwrite" && node.data?.segmented === true && Object.hasOwn(data, "points"))
      data.segmented = false;
    if (Object.keys(shell).length) commands.push({ type: "set_node", id: node.id, patch: shell });
    if (Object.keys(data).length || unset.size)
      commands.push({
        type: "set_data",
        id: node.id,
        patch: data as WhiteboardData,
        unset: [...unset],
      });
    return commands;
  }
}
