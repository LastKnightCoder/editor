import * as Y from "yjs";
import type { ContentNode } from "./protocol";
import {
  NODE_CONTRACT_PROPERTY,
  CONTENT_CONTRACT_VERSION,
  validateContentContracts,
  type ContentContract,
  type DataContract,
  type ContentContractDictionary,
} from "@tau/db-schema/content-contracts";
import { setSharedValue, sharedValueEquals } from "./shared-values";
import {
  createNodeTreeHistory,
  preserveNodeInitialization,
  NodeTreeHistory,
  type NodeTreeHistoryOptions,
} from "./node-tree-history";
import { NODE_TREE_LIMITS } from "./model-limits";
import { TextSegments } from "./text-segments";

export interface NodePlacement {
  parent: string | null;
  token: string;
  split?: { after: string; node: string; source: string; segment: string };
  order?: { after: string; before?: string };
}

interface NodeReference {
  node: string;
  token: string;
}

export interface TreeSpan {
  value: string | { node: string };
  attributes?: Record<string, unknown>;
  offset: number;
  length: number;
  source: string | null;
  segment?: string;
}

interface Routing {
  parents: Map<string, string | null>;
  recovered: Set<string>;
}

const NODE_LIMIT = NODE_TREE_LIMITS.nodes;
const DEPTH_LIMIT = NODE_TREE_LIMITS.depth;
const ROOT_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const isNodePool = (name: string) =>
  name === "node-tree:nodes" || /^node-tree:roots:[A-Za-z0-9][A-Za-z0-9._-]*:nodes$/.test(name);

export interface NodeTreeOptions {
  rootId?: string;
}
const own = (value: object, key: string) => Object.prototype.hasOwnProperty.call(value, key);

/** 内容保留在节点池；移动只改位置引用，不能删除并复制共享文本。 */
export class NodeTree {
  readonly rootId: string;
  private disposed = false;
  private cleanups: (() => void)[] = [];
  readonly nodes: Y.Map<Y.Map<unknown>>;
  readonly root: Y.XmlText;
  readonly contracts: Y.Map<DataContract>;
  readonly creations: Y.Map<boolean>;
  readonly segments: TextSegments;
  private cachedRouting?: Routing;
  private snapshots = new Map<string, ContentNode>();
  private rootSnapshot?: readonly ContentNode[];
  private changes = new WeakMap<Y.Transaction, { structural: boolean; nodes: Set<string> }>();

  constructor(
    readonly doc: Y.Doc,
    options: NodeTreeOptions = {}
  ) {
    this.rootId = options.rootId === undefined ? "content" : options.rootId;
    if (
      doc.isDestroyed ||
      typeof this.rootId !== "string" ||
      !ROOT_ID.test(this.rootId) ||
      this.rootId.length > NODE_TREE_LIMITS.rootIdLength
    )
      throw new Error("富文本根作用域无效");
    const prefix = this.rootId === "content" ? "node-tree" : `node-tree:roots:${this.rootId}`;
    if (
      !doc.share.has(`${prefix}:nodes`) &&
      [...doc.share.keys()].filter(isNodePool).length >= NODE_TREE_LIMITS.roots
    )
      throw new Error("富文本根数量超过预算");
    this.nodes = doc.getMap(`${prefix}:nodes`);
    this.root = doc.get(`${prefix}:root`, Y.XmlText);
    this.contracts = doc.getMap("node-tree:contracts");
    this.creations = doc.getMap(`${prefix}:creations`);
    this.segments = new TextSegments(
      doc.getMap(`${prefix}:segments`),
      id => this.record(id),
      id => this.content(id),
      id => this.mergedOwner(id),
      id => this.mergeTarget(id)?.target
    );
    const onNodes: Parameters<typeof this.nodes.observeDeep>[0] = (events, transaction) => {
      const changes = this.changeSet(transaction);
      for (const event of events) {
        const [id, field] = event.path;
        if (typeof id !== "string") {
          changes.structural = true;
          continue;
        }
        changes.nodes.add(id);
        if (field === "content") {
          this.segments.clearRanges();
          const ranges: { start: number; end: number }[] = [];
          let offset = 0;
          if (event instanceof Y.YTextEvent)
            for (const part of event.delta) {
              if (part.retain) {
                if (part.attributes) ranges.push({ start: offset, end: offset + part.retain });
                offset += part.retain;
              }
              if (part.delete) ranges.push({ start: offset - 1, end: offset + 1 });
              if (part.insert !== undefined) {
                const length = typeof part.insert === "string" ? part.insert.length : 1;
                ranges.push({ start: offset, end: offset + length });
                offset += length;
              }
            }
          for (const owner of this.segments.owners(
            id,
            event instanceof Y.YTextEvent ? ranges : undefined
          ))
            changes.nodes.add(owner);
        }
        if (field !== "properties" && field !== "content" && field !== "fields")
          changes.structural = true;
        if (
          field === "content" &&
          event instanceof Y.YTextEvent &&
          event.delta.some(part => part.insert !== undefined && typeof part.insert !== "string")
        )
          changes.structural = true;
      }
      this.invalidate(changes);
    };
    this.nodes.observeDeep(onNodes);
    this.cleanups.push(() => this.nodes.unobserveDeep(onNodes));
    const onStructure = (_event: unknown, transaction: Y.Transaction) => {
      const changes = this.changeSet(transaction);
      changes.structural = true;
      this.invalidate(changes);
    };
    for (const type of [this.root, this.contracts, this.creations]) {
      type.observe(onStructure);
      this.cleanups.push(() => type.unobserve(onStructure));
    }
    this.segments.records.observeDeep(onStructure);
    this.cleanups.push(() => this.segments.records.unobserveDeep(onStructure));
    this.cleanups.push(() => this.segments.dispose());
    doc.on("destroy", this.dispose);
    this.cleanups.push(() => doc.off("destroy", this.dispose));
  }

  get isDisposed(): boolean {
    return this.disposed || this.doc.isDestroyed;
  }

  private assertActive(): void {
    if (this.isDisposed) throw new Error("富文本文档根已释放");
  }

  readonly dispose = (): void => {
    if (this.disposed) return;
    this.disposed = true;
    this.cleanups.splice(0).forEach(cleanup => cleanup());
    this.cachedRouting = undefined;
    this.rootSnapshot = undefined;
    this.snapshots.clear();
  };

  createUndoManager(options: NodeTreeHistoryOptions): NodeTreeHistory {
    this.assertActive();
    return createNodeTreeHistory(
      [this.nodes, this.root, this.creations, this.segments.records],
      options
    );
  }

  attachUndoManager(history: NodeTreeHistory): void {
    this.assertActive();
    if (!(history instanceof NodeTreeHistory)) throw new Error("节点池必须使用公共历史入口");
    history.assertActive(this.doc);
    history.attach([this.nodes, this.root, this.creations, this.segments.records]);
  }

  isDeleted(id: string): boolean {
    const record = this.record(id);
    const creation = record.get("creation");
    const deletions = record.get("deletions");
    if (typeof creation !== "string" || !(deletions instanceof Y.Map))
      throw new Error("节点可见性状态无效");
    const merge = this.mergeTarget(id);
    const retained = merge && this.mergedOwner(id) === id ? merge.deletion : undefined;
    return (
      this.creations.get(creation) !== true || [...deletions.keys()].some(key => key !== retained)
    );
  }

  private mergeTarget(id: string): { target: string; deletion: string } | undefined {
    const value = this.record(id).get("mergeTarget") as
      | { target: string; deletion: string }
      | undefined;
    if (
      value &&
      (typeof value.target !== "string" ||
        typeof value.deletion !== "string" ||
        !this.nodes.has(value.target))
    )
      throw new Error("合并归属无效");
    return value;
  }

  private mergedOwner(id: string): string {
    const path: string[] = [];
    let current = id;
    for (;;) {
      const cycle = path.indexOf(current);
      if (cycle >= 0) return path.slice(cycle).sort()[0];
      path.push(current);
      const target = this.mergeTarget(current)?.target;
      if (!target) return current;
      current = target;
    }
  }

  async installContracts(dictionary: ContentContractDictionary, origin: unknown): Promise<void> {
    this.assertActive();
    for (let attempt = 0; attempt < 3; attempt++) {
      const current = structuredClone(this.contracts.toJSON());
      for (const [id, contract] of Object.entries(dictionary)) {
        if (Object.hasOwn(current, id) && !sharedValueEquals(current[id], contract))
          throw new Error("已有契约不能修改");
      }
      const verified = await validateContentContracts({ ...current, ...dictionary });
      this.assertActive();
      if (!sharedValueEquals(current, this.contracts.toJSON())) continue;
      this.doc.transact(() => {
        for (const [id, contract] of Object.entries(verified))
          if (!this.contracts.has(id)) this.contracts.set(id, structuredClone(contract));
      }, origin);
      return;
    }
    throw new Error("契约目录已变化，请重新加载");
  }

  contract(id: string): ContentContract | undefined {
    return this.nodeContract(this.properties(id).toJSON());
  }

  private nodeContract(node: Record<string, unknown>): ContentContract | undefined {
    const id = node[NODE_CONTRACT_PROPERTY];
    if (id === undefined) return undefined;
    const contract = typeof id === "string" ? this.contracts.get(id) : undefined;
    if (
      !contract ||
      contract.format !== CONTENT_CONTRACT_VERSION ||
      contract.domain !== "editor-node" ||
      contract.type !== node.type
    )
      throw new Error("节点契约缺失或类型不匹配");
    return contract;
  }

  fields(id: string): Y.Map<unknown> {
    const fields = this.record(id).get("fields");
    if (!(fields instanceof Y.Map)) throw new Error("节点共享字段无效");
    return fields;
  }

  textField(id: string, field: string): Y.Text {
    if (!this.contract(id)?.textFields.includes(field)) throw new Error("字段未声明文本协作语义");
    const text = this.fields(id).get(field);
    if (!(text instanceof Y.Text)) throw new Error("共享文本字段无效");
    return text;
  }

  private changeSet(transaction: Y.Transaction) {
    let changes = this.changes.get(transaction);
    if (!changes) {
      changes = { structural: false, nodes: new Set<string>() };
      this.changes.set(transaction, changes);
    }
    return changes;
  }

  transactionChanges(transaction: Y.Transaction) {
    return this.changes.get(transaction);
  }

  private invalidate(changes: { structural: boolean; nodes: Set<string> }) {
    this.segments.clearRanges();
    this.rootSnapshot = undefined;
    if (changes.structural) {
      this.cachedRouting = undefined;
      this.snapshots.clear();
      return;
    }
    const parents = this.routing().parents;
    for (const id of changes.nodes) {
      let current: string | null = id;
      while (current !== null) {
        this.snapshots.delete(current);
        current = parents.get(current) ?? null;
      }
    }
  }

  record(id: string): Y.Map<unknown> {
    this.assertActive();
    const record = this.nodes.get(id);
    if (!(record instanceof Y.Map)) throw new Error("节点身份不存在");
    return record;
  }

  content(parent: string | null): Y.XmlText {
    this.assertActive();
    if (parent === null) return this.root;
    const content = this.record(parent).get("content");
    if (!(content instanceof Y.XmlText)) throw new Error("节点正文无效");
    return content;
  }

  properties(id: string): Y.Map<unknown> {
    const properties = this.record(id).get("properties");
    if (!(properties instanceof Y.Map)) throw new Error("节点属性无效");
    return properties;
  }

  placement(id: string): NodePlacement {
    const value = this.record(id).get("placement") as NodePlacement | undefined;
    if (
      !value ||
      typeof value.token !== "string" ||
      (value.parent !== null && typeof value.parent !== "string")
    )
      throw new Error("节点位置无效");
    return value;
  }

  private routing(): Routing {
    if (this.cachedRouting) return this.cachedRouting;
    const parents = new Map<string, string | null>();
    const recovered = new Set<string>();
    if (this.nodes.size > NODE_LIMIT) throw new Error("节点数量超过限制");
    for (const id of this.nodes.keys()) {
      if (this.isDeleted(id)) continue;
      const parent = this.placement(id).parent;
      parents.set(id, parent === null ? null : this.mergedOwner(parent));
    }
    for (const [id, parent] of parents) {
      if (parent !== null && !parents.has(parent)) {
        parents.set(id, null);
        recovered.add(id);
      }
    }
    const visited = new Set<string>();
    for (const id of parents.keys()) {
      const path: string[] = [];
      const positions = new Map<string, number>();
      let current: string | null = id;
      while (current !== null && parents.has(current) && !visited.has(current)) {
        const cycle = positions.get(current);
        if (cycle !== undefined) {
          // 并发把父子互相移入时，在投影中确定性断开一条边，不改写共享数据。
          const root = path.slice(cycle).sort()[0];
          parents.set(root, null);
          recovered.add(root);
          break;
        }
        positions.set(current, path.length);
        path.push(current);
        current = parents.get(current)!;
      }
      for (const entry of path) visited.add(entry);
    }
    const depths = new Map<string, number>();
    for (const id of parents.keys()) {
      const path: string[] = [];
      let current: string | null = id;
      while (current !== null && !depths.has(current)) {
        path.push(current);
        current = parents.get(current) ?? null;
      }
      let depth = current === null ? 0 : (depths.get(current) ?? 0);
      for (const node of path.reverse()) {
        if (++depth > DEPTH_LIMIT) {
          parents.set(node, null);
          recovered.add(node);
          depth = 1;
        }
        depths.set(node, depth);
      }
    }
    return (this.cachedRouting = { parents, recovered });
  }

  private assertDepth(parent: string | null, height: number, routing = this.routing()): void {
    let depth = height;
    for (let current = parent; current !== null; current = routing.parents.get(current) ?? null) {
      if (!routing.parents.has(current)) throw new Error("目标父节点不可用");
      if (++depth > DEPTH_LIMIT) throw new Error("正文层级超过限制");
    }
    if (depth > DEPTH_LIMIT) throw new Error("正文层级超过限制");
  }

  spans(parent: string | null): TreeSpan[] {
    return this.readSpans(parent, this.routing());
  }

  private readSpans(parent: string | null, routing: Routing): TreeSpan[] {
    const spans: TreeSpan[] = [];
    const raw: (TreeSpan & { reference?: NodeReference })[] = [];
    const pieces =
      parent === null
        ? [{ source: null, start: 0, end: this.root.length, id: undefined }]
        : this.segments.list(parent);
    for (const piece of pieces) {
      let offset = 0;
      for (const delta of this.content(piece.source).toDelta()) {
        const width = typeof delta.insert === "string" ? delta.insert.length : 1;
        const start = Math.max(offset, piece.start),
          end = Math.min(offset + width, piece.end);
        const physical = offset;
        offset += width;
        if (start >= end) continue;
        if (typeof delta.insert === "string") {
          raw.push({
            value: delta.insert.slice(start - physical, end - physical),
            attributes: delta.attributes,
            offset: start,
            length: end - start,
            source: piece.source,
            segment: piece.id,
          });
          continue;
        }
        const ref = delta.insert as NodeReference;
        if (ref && typeof ref.node === "string")
          raw.push({
            value: { node: ref.node },
            offset: start,
            length: 1,
            source: piece.source,
            segment: piece.id,
            reference: ref,
          });
      }
    }
    const groups = new Map<string, typeof raw>();
    const active = new Map<string, (typeof raw)[number]>();
    for (const span of raw) {
      const ref = span.reference;
      if (!ref || !routing.parents.has(ref.node)) continue;
      const placement = this.placement(ref.node);
      const logicalParent = placement.parent === null ? null : this.mergedOwner(placement.parent);
      if (
        placement.token !== ref.token ||
        logicalParent !== parent ||
        routing.parents.get(ref.node) !== parent ||
        routing.recovered.has(ref.node)
      )
        continue;
      active.set(ref.token, span);
      const anchor = placement.split ?? placement.order;
      if (anchor) {
        const entries = groups.get(anchor.after) ?? [];
        entries.push(span);
        groups.set(anchor.after, entries);
      }
    }
    const orders = new Map<string, string[]>();
    for (const entries of groups.values())
      entries.sort((left, right) => {
        const leftPlacement = this.placement(left.reference!.node),
          rightPlacement = this.placement(right.reference!.node);
        if (leftPlacement.order?.before === right.reference!.token) return -1;
        if (rightPlacement.order?.before === left.reference!.token) return 1;
        const a = leftPlacement.split,
          b = rightPlacement.split;
        if (!a || !b) return raw.indexOf(left) - raw.indexOf(right);
        if (!orders.has(a.node))
          orders.set(
            a.node,
            this.segments.list(a.node, true).map(piece => piece.id)
          );
        const order = orders.get(a.node)!;
        return order.indexOf(a.segment) - order.indexOf(b.segment);
      });
    const emitted = new Set<string>();
    const emit = (span: (typeof raw)[number]) => {
      const ref = span.reference;
      if (!ref) {
        spans.push(span);
        return;
      }
      if (emitted.has(ref.token)) return;
      emitted.add(ref.token);
      if (active.has(ref.token)) {
        const { reference: _reference, ...visible } = span;
        spans.push(visible);
      }
      for (const child of groups.get(ref.token) ?? []) emit(child);
    };
    const tokens = new Set(raw.flatMap(span => (span.reference ? [span.reference.token] : [])));
    for (const span of raw) {
      const placement =
        span.reference && active.has(span.reference.token) && this.placement(span.reference.node);
      const anchor = placement && (placement.split ?? placement.order);
      if (!anchor || !tokens.has(anchor.after)) emit(span);
    }
    if (parent === null) {
      for (const id of [...routing.recovered].sort()) {
        spans.push({ value: { node: id }, offset: this.root.length, length: 1, source: null });
      }
    }
    return spans;
  }

  snapshot(): readonly ContentNode[] {
    this.assertActive();
    if (this.rootSnapshot) return this.rootSnapshot;
    const routing = this.routing();
    const visit = (parent: string | null, depth: number): ContentNode[] => {
      if (depth > DEPTH_LIMIT) throw new Error("正文层级超过限制");
      const children: ContentNode[] = [];
      for (const span of this.readSpans(parent, routing)) {
        if (typeof span.value === "string") {
          const previous = children.at(-1);
          const marks = { ...structuredClone(span.attributes), type: "formatted" };
          const previousMarks =
            previous &&
            Object.fromEntries(Object.entries(previous).filter(([key]) => key !== "text"));
          if (
            previous &&
            typeof previous.text === "string" &&
            sharedValueEquals(previousMarks, marks)
          )
            previous.text += span.value;
          else children.push({ ...marks, text: span.value });
        } else {
          const id = span.value.node;
          let node = this.snapshots.get(id);
          if (!node) {
            node = {
              ...structuredClone(this.properties(id).toJSON()),
              ...(this.record(id).get("fields") instanceof Y.Map
                ? structuredClone(this.fields(id).toJSON())
                : {}),
              collabId: id,
              children: visit(id, depth + 1),
            };
            freezeJson(node);
            this.snapshots.set(id, node);
          }
          children.push(node);
        }
      }
      return children.length || parent === null
        ? children
        : [
            {
              ...structuredClone(
                this.record(parent).get("emptyMarks") as Record<string, unknown> | undefined
              ),
              type: "formatted",
              text: "",
            },
          ];
    };
    return (this.rootSnapshot = Object.freeze(visit(null, 0)));
  }

  nodeSnapshot(id: string): ContentNode {
    if (!this.snapshots.has(id)) this.snapshot();
    const node = this.snapshots.get(id);
    if (!node) throw new Error("节点不在可见正文中");
    return node;
  }

  read(): ContentNode[] {
    return structuredClone(this.snapshot()) as ContentNode[];
  }

  physicalOffset(parent: string | null, index: number): number {
    return this.textLocation(parent, index).offset;
  }

  textLocation(
    parent: string | null,
    index: number
  ): { source: string | null; offset: number; segment?: string } {
    if (!Number.isSafeInteger(index) || index < 0) throw new Error("正文位置无效");
    let visible = 0;
    for (const span of this.spans(parent)) {
      if (index <= visible + span.length)
        return {
          source: span.source,
          offset: Math.min(this.content(span.source).length, span.offset + index - visible),
          segment: span.segment,
        };
      visible += span.length;
    }
    if (index !== visible) throw new Error("正文位置超出范围");
    const piece = parent === null ? undefined : this.segments.list(parent).at(-1);
    return {
      source: piece?.source ?? parent,
      offset: piece?.end ?? this.content(parent).length,
      segment: piece?.id,
    };
  }

  visibleOffset(parent: string | null, index: number): number {
    let visible = 0;
    for (const span of this.spans(parent)) {
      if (index <= span.offset) break;
      visible += Math.min(span.length, index - span.offset);
    }
    return visible;
  }

  capturePosition(parent: string, index: number): Y.RelativePosition {
    const at = this.textLocation(parent, index);
    return Y.createRelativePositionFromTypeIndex(this.content(at.source), at.offset);
  }

  resolvePosition(position: Y.RelativePosition): { parent: string; offset: number } | null {
    const at = Y.createAbsolutePositionFromRelativePosition(position, this.doc);
    if (!at) return null;
    for (const parent of this.routing().parents.keys()) {
      let visible = 0;
      for (const span of this.spans(parent)) {
        if (
          this.content(span.source) === at.type &&
          at.index >= span.offset &&
          at.index <= span.offset + span.length
        )
          return { parent, offset: visible + at.index - span.offset };
        visible += span.length;
      }
      if (!visible) {
        for (const piece of this.segments.list(parent))
          if (
            this.content(piece.source) === at.type &&
            at.index >= piece.start &&
            at.index <= piece.end
          )
            return { parent, offset: 0 };
      }
    }
    return null;
  }

  private assertStructuralFields(id: string): void {
    const contract = this.contract(id);
    if (contract?.isVoid) throw new Error("原子节点不能默认拆分或合并");
    for (const value of Object.values(this.fields(id).toJSON())) {
      if (value !== "" && value !== null && !(Array.isArray(value) && value.length === 0))
        throw new Error("非空共享字段不能默认拆分或合并");
    }
  }

  splitNode(id: string, index: number, next: ContentNode, origin: unknown): void {
    this.assertStructuralFields(id);
    if (this.properties(id).get(NODE_CONTRACT_PROPERTY) !== next[NODE_CONTRACT_PROPERTY])
      throw new Error("拆分必须保留节点契约");
    const at = this.textLocation(id, index);
    const pieces = this.segments.list(id);
    const part = pieces.findIndex(piece => piece.id === at.segment);
    if (part < 0) throw new Error("拆分位置缺少正文片段");
    const placement = this.placement(id);
    const parent = this.routing().parents.get(id);
    if (parent === undefined) throw new Error("节点不可见");
    let sibling = 0;
    for (const span of this.spans(parent)) {
      sibling += span.length;
      if (typeof span.value !== "string" && span.value.node === id) break;
    }
    const children = this.spans(id).filter(span => typeof span.value !== "string");
    let visible = 0;
    const moved = new Set<string>();
    for (const span of this.spans(id)) {
      if (visible >= index && typeof span.value !== "string") moved.add(span.value.node);
      visible += span.length;
    }
    this.doc.transact(transaction => {
      const target = this.insertNode(next, parent, sibling, origin, true);
      const cut = this.segments.cut(pieces[part], at.offset, transaction);
      this.segments.move([cut, ...pieces.slice(part + 1).map(piece => piece.id)], target);
      this.record(target).set("placement", {
        ...this.placement(target),
        split: { after: placement.token, node: id, source: pieces[part].source, segment: cut },
      });
      for (const span of children) {
        if (typeof span.value !== "string" && moved.has(span.value.node)) {
          const child = span.value.node;
          this.record(child).set("placement", { ...this.placement(child), parent: target });
        }
      }
      this.invalidate({ structural: true, nodes: new Set() });
    }, origin);
  }

  mergeNodes(source: string, target: string, origin: unknown): void {
    if (source === target || this.isDeleted(source) || this.isDeleted(target))
      throw new Error("合并节点无效");
    this.assertStructuralFields(source);
    this.assertStructuralFields(target);
    if (
      this.properties(source).get(NODE_CONTRACT_PROPERTY) !==
      this.properties(target).get(NODE_CONTRACT_PROPERTY)
    )
      throw new Error("不同契约不能默认合并");
    const pieces = this.segments.list(source);
    const children = this.spans(source).flatMap(span =>
      typeof span.value === "string" ? [] : [span.value.node]
    );
    this.doc.transact(() => {
      this.segments.move(
        pieces.map(piece => piece.id),
        target
      );
      this.segments.merge(source, target);
      for (const child of children)
        this.record(child).set("placement", { ...this.placement(child), parent: target });
      const deletion = crypto.randomUUID();
      (this.record(source).get("deletions") as Y.Map<boolean>).set(deletion, true);
      this.record(source).set("mergeTarget", { target, deletion });
      this.invalidate({ structural: true, nodes: new Set() });
    }, origin);
  }

  insertNode(
    node: ContentNode,
    parent: string | null,
    index: number,
    origin: unknown,
    preserveIds = false
  ): string {
    const location = this.textLocation(parent, index);
    const order = this.positionOrder(parent, index);
    const ids = new Map<object, string>();
    const allocated = new Set<string>();
    let height = 0;
    let count = [...this.doc.share.keys()]
      .filter(isNodePool)
      .reduce((total, key) => total + this.doc.getMap(key).size, 0);
    const validate = (value: ContentNode, depth: number): void => {
      height = Math.max(height, depth + 1);
      if (depth > DEPTH_LIMIT || ++count > NODE_LIMIT) throw new Error("正文结构超过限制");
      if (
        !value ||
        typeof value !== "object" ||
        Object.getPrototypeOf(value) !== Object.prototype ||
        !Array.isArray(value.children)
      )
        throw new Error("元素节点缺少子节点");
      if (ids.has(value)) throw new Error("节点对象不能出现在多个位置");
      const id =
        preserveIds && typeof value.collabId === "string" ? value.collabId : crypto.randomUUID();
      if (!id || this.nodes.has(id) || allocated.has(id)) throw new Error("节点身份重复");
      allocated.add(id);
      ids.set(value, id);
      assertJson(Object.fromEntries(Object.entries(value).filter(([key]) => key !== "children")));
      const contract = this.nodeContract(value);
      for (const field of contract?.textFields ?? []) {
        if (value[field] !== undefined && typeof value[field] !== "string")
          throw new Error("声明的文本字段必须是字符串");
      }
      for (const child of value.children) {
        if (typeof child.text === "string" && !own(child, "children")) {
          assertJson(child);
          continue;
        }
        validate(child, depth + 1);
      }
    };
    validate(node, 0);
    this.assertDepth(parent, height);
    if (parent !== null && this.isDeleted(parent)) throw new Error("不能写入已删除节点");

    const creation = crypto.randomUUID();
    const insert = (
      value: ContentNode,
      target: string | null,
      at: number,
      source = target
    ): string => {
      const id = ids.get(value)!;
      const record = new Y.Map<unknown>();
      const properties = new Y.Map<unknown>();
      const content = new Y.XmlText();
      const fields = new Y.Map<unknown>();
      const contract = this.nodeContract(value);
      record.set("properties", properties);
      record.set("content", content);
      record.set("fields", fields);
      record.set("creation", creation);
      record.set("deletions", new Y.Map<boolean>());
      this.nodes.set(id, record);
      this.segments.initialize(id);
      for (const [key, entry] of Object.entries(value)) {
        if (key !== "children" && key !== "collabId" && !contract?.textFields.includes(key))
          properties.set(key, structuredClone(entry));
      }
      for (const field of contract?.textFields ?? [])
        setSharedValue(fields, field, value[field] ?? "");
      for (const child of value.children!) {
        if (typeof child.text === "string" && !own(child, "children")) {
          const { text, ...marks } = child;
          if (text) content.insert(content.length, text, marks);
          else if (value.children!.length === 1) record.set("emptyMarks", structuredClone(marks));
        } else insert(child, id, content.length);
      }
      const token = crypto.randomUUID();
      record.set("placement", { parent: target, token });
      this.content(source).insertEmbed(at, { node: id, token });
      return id;
    };
    let result = "";
    this.doc.transact(transaction => {
      const client = this.doc.clientID;
      const clock = Y.getState(this.doc.store, client);
      result = insert(node, parent, location.offset, location.source);
      if (order) this.record(result).set("placement", { ...this.placement(result), order });
      preserveNodeInitialization(transaction, {
        client,
        clock,
        len: Y.getState(this.doc.store, client) - clock,
      });
      this.creations.set(creation, true);
      this.invalidate({ structural: true, nodes: new Set() });
    }, origin);
    return result;
  }

  private positionOrder(
    parent: string | null,
    index: number,
    exclude?: string
  ): NodePlacement["order"] {
    let offset = 0;
    let previous: string | undefined;
    for (const span of this.spans(parent)) {
      if (typeof span.value !== "string" && span.value.node === exclude) continue;
      const next = typeof span.value === "string" ? undefined : span.value.node;
      if (offset === index && previous) {
        const before = next ? this.placement(next) : undefined;
        const after = this.placement(previous);
        if (after.split || after.order || before?.split || before?.order)
          return { after: after.token, ...(before ? { before: before.token } : {}) };
        return undefined;
      }
      previous = next;
      offset += span.length;
    }
    if (offset === index && previous) {
      const after = this.placement(previous);
      if (after.split || after.order) return { after: after.token };
    }
    return undefined;
  }

  /** index 是移除原位置之后目标父节点中的可见偏移。 */
  moveNode(id: string, parent: string | null, index: number, origin: unknown): void {
    const record = this.record(id);
    if (this.isDeleted(id)) throw new Error("不能移动已删除节点");
    const routing = this.routing();
    const ancestors = new Set<string>();
    let ancestor = parent;
    while (ancestor !== null) {
      if (ancestor === id || ancestors.has(ancestor)) throw new Error("不能把节点移入自己的后代");
      ancestors.add(ancestor);
      if (!routing.parents.has(ancestor)) throw new Error("目标父节点不可用");
      ancestor = routing.parents.get(ancestor)!;
    }
    const spans = this.spans(parent);
    let previous = 0;
    let original: number | undefined;
    for (const span of spans) {
      if (typeof span.value !== "string" && span.value.node === id) original = previous;
      previous += span.length;
    }
    if (original === index && !routing.recovered.has(id)) return;
    const children = new Map<string, string[]>();
    for (const [child, owner] of routing.parents) {
      if (owner !== null) {
        const siblings = children.get(owner) ?? [];
        siblings.push(child);
        children.set(owner, siblings);
      }
    }
    let height = 1;
    const pending: { id: string; depth: number }[] = [{ id, depth: 1 }];
    while (pending.length) {
      const node = pending.pop();
      if (!node) break;
      height = Math.max(height, node.depth);
      for (const child of children.get(node.id) ?? [])
        pending.push({ id: child, depth: node.depth + 1 });
    }
    this.assertDepth(parent, height, routing);
    const adjusted = original !== undefined && index >= original ? index + 1 : index;
    const order = this.positionOrder(parent, index, id);
    this.physicalOffset(parent, adjusted);
    const recover = new Set<string>();
    for (const start of [id, parent]) {
      let current = start;
      while (current !== null) {
        if (current !== id && routing.recovered.has(current)) recover.add(current);
        current = routing.parents.get(current) ?? null;
      }
    }
    // 根部恢复项没有实体位置，放到它后面时只物化必要的前置锚点。
    if (parent === null) {
      let offset = 0;
      for (const span of spans) {
        if (typeof span.value !== "string" && span.value.node === id) continue;
        if (offset >= index) break;
        if (typeof span.value !== "string" && routing.recovered.has(span.value.node))
          recover.add(span.value.node);
        offset += span.length;
      }
    }
    const token = crypto.randomUUID();
    this.doc.transact(transaction => {
      for (const recovered of [...recover].sort()) {
        const recoveryToken = crypto.randomUUID();
        const client = this.doc.clientID,
          clock = Y.getState(this.doc.store, client);
        this.root.insertEmbed(this.root.length, { node: recovered, token: recoveryToken });
        preserveNodeInitialization(transaction, {
          client,
          clock,
          len: Y.getState(this.doc.store, client) - clock,
        });
        this.record(recovered).set("placement", { parent: null, token: recoveryToken });
      }
      this.cachedRouting = undefined;
      const at = this.textLocation(parent, adjusted);
      const client = this.doc.clientID,
        clock = Y.getState(this.doc.store, client);
      this.content(at.source).insertEmbed(at.offset, { node: id, token });
      preserveNodeInitialization(transaction, {
        client,
        clock,
        len: Y.getState(this.doc.store, client) - clock,
      });
      record.set("placement", { parent, token, ...(order ? { order } : {}) });
      this.invalidate({ structural: true, nodes: new Set() });
    }, origin);
  }

  removeNode(id: string, origin: unknown): void {
    this.removeNodes([id], origin);
  }

  /** 只删除调用方观察到的集合，不在接收端重新扩展子树。 */
  removeNodes(ids: readonly string[], origin: unknown): void {
    const targets = [...new Set(ids)].map(id => {
      const deletions = this.record(id).get("deletions");
      if (!(deletions instanceof Y.Map)) throw new Error("节点删除状态无效");
      return deletions as Y.Map<boolean>;
    });
    if (!targets.length) return;
    const deletion = crypto.randomUUID();
    this.doc.transact(() => {
      for (const target of targets) target.set(deletion, true);
      this.invalidate({ structural: true, nodes: new Set() });
    }, origin);
  }

  setProperties(id: string, changes: Record<string, unknown>, origin: unknown): void {
    assertJson(
      Object.fromEntries(Object.entries(changes).filter(([, value]) => value !== undefined))
    );
    if (["children", "collabId", "text", NODE_CONTRACT_PROPERTY].some(key => own(changes, key)))
      throw new Error("不能通过属性补丁修改结构或身份");
    const contract = this.contract(id);
    if (contract?.textFields.some(field => own(changes, field)))
      throw new Error("文本字段必须通过文本绑定或有修订校验的替换修改");
    if (contract && own(changes, "type") && changes.type !== contract.type)
      throw new Error("节点类型必须通过块转换修改");
    const properties = this.properties(id);
    this.doc.transact(() => {
      for (const [key, value] of Object.entries(changes)) {
        if (value === undefined) properties.delete(key);
        else properties.set(key, structuredClone(value));
      }
      this.invalidate({ structural: false, nodes: new Set([id]) });
    }, origin);
  }

  convertNode(
    id: string,
    targetId: string,
    changes: Record<string, unknown>,
    origin: unknown
  ): void {
    const previous = this.contract(id);
    const target = this.contracts.get(targetId);
    if (!previous || !target || target.domain !== "editor-node") throw new Error("缺少块转换契约");
    if (
      previous.type === target.type &&
      targetId !== this.properties(id).get(NODE_CONTRACT_PROPERTY)
    )
      throw new Error("同类型数据版本变化必须通过迁移处理");
    if (
      previous.kind !== target.kind ||
      previous.isVoid !== target.isVoid ||
      !sharedValueEquals(previous.textFields, target.textFields)
    )
      throw new Error("该块转换会改变共享内容结构，不能直接执行");
    const { type, ...attributes } = changes;
    if (type !== undefined && type !== target.type) throw new Error("目标类型与契约不匹配");
    assertJson(
      Object.fromEntries(Object.entries(attributes).filter(([, value]) => value !== undefined))
    );
    if (
      ["children", "collabId", "text", NODE_CONTRACT_PROPERTY, ...target.textFields].some(key =>
        own(attributes, key)
      )
    )
      throw new Error("块转换不能覆盖身份或共享文本");
    this.doc.transact(() => {
      this.properties(id).set("type", target.type);
      this.properties(id).set(NODE_CONTRACT_PROPERTY, targetId);
      this.setProperties(id, attributes, origin);
    }, origin);
  }

  insertText(
    id: string,
    index: number,
    text: string,
    origin: unknown,
    marks?: Record<string, unknown>
  ): void {
    if (typeof text !== "string") throw new Error("文本无效");
    if (marks) assertJson(marks);
    const at = this.textLocation(id, index);
    this.doc.transact(() => {
      const emptyMarks = this.record(id).get("emptyMarks") as Record<string, unknown> | undefined;
      const attributes = marks ?? (this.spans(id).length === 0 ? emptyMarks : undefined);
      this.content(at.source).insert(at.offset, text, attributes);
      this.invalidate({ structural: false, nodes: new Set([id]) });
    }, origin);
  }

  deleteText(id: string, index: number, length: number, origin: unknown): void {
    const ranges = this.textRanges(id, index, length);
    const spans = this.spans(id);
    const last = spans.at(-1);
    this.doc.transact(() => {
      ranges.sort(
        (a, b) => String(a.source).localeCompare(String(b.source)) || b.offset - a.offset
      );
      for (const range of ranges) this.content(range.source).delete(range.offset, range.length);
      if (length && spans.reduce((sum, span) => sum + span.length, 0) === length)
        this.record(id).set("emptyMarks", structuredClone(last?.attributes ?? {}));
      this.invalidate({ structural: false, nodes: new Set([id]) });
    }, origin);
  }

  formatText(
    id: string,
    index: number,
    length: number,
    marks: Record<string, unknown>,
    origin: unknown
  ): void {
    assertJson(marks);
    const ranges = this.textRanges(id, index, length);
    this.doc.transact(() => {
      if (!length && !this.spans(id).length) {
        const attributes = {
          ...(this.record(id).get("emptyMarks") as Record<string, unknown> | undefined),
        };
        for (const [key, value] of Object.entries(marks)) {
          if (value === null) delete attributes[key];
          else attributes[key] = value;
        }
        this.record(id).set("emptyMarks", attributes);
      }
      for (const range of ranges)
        this.content(range.source).format(range.offset, range.length, marks);
      this.invalidate({ structural: false, nodes: new Set([id]) });
    }, origin);
  }

  private textRanges(
    id: string,
    index: number,
    length: number
  ): { source: string | null; offset: number; length: number }[] {
    if (!Number.isSafeInteger(length) || length < 0) throw new Error("文本长度无效");
    this.physicalOffset(id, index);
    this.physicalOffset(id, index + length);
    const ranges: { source: string | null; offset: number; length: number }[] = [];
    let visible = 0;
    for (const span of this.spans(id)) {
      const start = Math.max(index, visible);
      const end = Math.min(index + length, visible + span.length);
      if (start < end) {
        if (typeof span.value !== "string") throw new Error("文本操作不能跨过元素节点");
        ranges.push({
          source: span.source,
          offset: span.offset + start - visible,
          length: end - start,
        });
      }
      visible += span.length;
    }
    return ranges;
  }
}

function freezeJson(value: unknown): void {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return;
  Object.freeze(value);
  for (const entry of Object.values(value)) freezeJson(entry);
}

function assertJson(value: unknown, depth = 0): void {
  if (depth > DEPTH_LIMIT) throw new Error("数据层级超过限制");
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number" && Number.isFinite(value)) return;
  if (Array.isArray(value)) {
    for (const entry of value) assertJson(entry, depth + 1);
    return;
  }
  if (value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    for (const [key, entry] of Object.entries(value)) {
      if (["__proto__", "constructor", "prototype"].includes(key)) throw new Error("数据属性无效");
      assertJson(entry, depth + 1);
    }
    return;
  }
  throw new Error("节点数据必须是有限 JSON");
}
