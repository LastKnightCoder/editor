import { WhiteboardPresentations } from "./whiteboard-presentation";
import { isContentEntityReference } from "@tau/db-schema/content-identities";
import * as Y from "yjs";
import {
  CONTENT_CONTRACT_VERSION,
  assertPreparedContract,
  contentContractChecks,
  type PreparedWhiteboardContract,
  type PreparedContentContract,
  validateContentContracts,
  type ContentContractDictionary,
  type DataContract,
  type WhiteboardElementContract,
} from "@tau/db-schema/content-contracts";
import { NodeTree } from "./node-tree";
import {
  createNodeTreeHistory,
  preserveNodeInitialization,
  nodeInitializationRanges,
  NodeTreeHistory,
  type NodeTreeHistoryOptions,
} from "./node-tree-history";
import { WHITEBOARD_LIMITS, assertWhiteboardBudget } from "./model-limits";
import { assertWhiteboardDataPatch, assertWhiteboardJson } from "./whiteboard-contract";
import { sharedValueEquals } from "./shared-values";
import {
  canContainWhiteboardElement,
  projectWhiteboardRouting,
  sameWhiteboardParent,
  whiteboardParentKey,
  type WhiteboardRouting,
} from "./whiteboard-projection";
import type {
  WhiteboardAnchor,
  WhiteboardElementSnapshot,
  WhiteboardFieldBindings,
  WhiteboardGeometry,
  WhiteboardModelCommand,
  WhiteboardParent,
  WhiteboardPlacement,
  WhiteboardReference,
  WhiteboardSnapshot,
  WhiteboardTextEdit,
} from "./whiteboard-types";

const PROFILE = "whiteboard-w1-v1";
const remoteOrigin = Object.freeze({ kind: "whiteboard-remote" });
const identifier = (value: unknown): value is string =>
  typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value);
const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).length;
const uuid = () => crypto.randomUUID();
const nodePool = (name: string) =>
  name === "node-tree:nodes" || /^node-tree:roots:[A-Za-z0-9][A-Za-z0-9._-]*:nodes$/.test(name);
function keys(value: unknown, allowed: readonly string[]): void {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value)) ||
    Reflect.ownKeys(value).some(key => typeof key !== "string" || !allowed.includes(key))
  )
    throw new Error("白板命令包含无效属性");
}
function id(value: unknown): asserts value is string {
  if (!identifier(value)) throw new Error("白板身份无效");
}
function geometry(value: WhiteboardGeometry): void {
  keys(value, ["x", "y", "width", "height", "rotation"]);
  if (
    [value.x, value.y, value.width, value.height, value.rotation].some(
      number => typeof number !== "number" || !Number.isFinite(number)
    ) ||
    value.width < 0 ||
    value.height < 0
  )
    throw new Error("白板几何无效");
}
function frozen<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.values(value).forEach(frozen);
    Object.freeze(value);
  }
  return value;
}
interface PlannedCommand {
  command: WhiteboardModelCommand;
  id: string;
  token: string;
  creation: string;
  roots: Record<string, string>;
  bodyRoot: string;
}

/** 纯协作模型；宿主负责权限、耐久会话和插件版本保护，模型不连接画布。 */
export class WhiteboardModel {
  readonly presentations: WhiteboardPresentations;
  readonly pages: Y.Map<Y.Map<unknown>>;
  readonly pageOrder: Y.Array<WhiteboardReference>;
  readonly elements: Y.Map<Y.Map<unknown>>;
  readonly orders: Y.Map<Y.Array<WhiteboardReference>>;
  readonly strings: Y.Map<Y.Text>;
  readonly creations: Y.Map<boolean>;
  readonly contracts: Y.Map<DataContract>;
  readonly title: Y.Text;
  private readonly meta: Y.Map<unknown>;
  private readonly trees = new Map<string, NodeTree>();
  private readonly histories = new Set<NodeTreeHistory>();
  private disposed = false;
  private revision = 0;
  private pending?: Uint8Array;
  private queuedBytes = 0;
  private incoming: Promise<unknown> = Promise.resolve();
  private readonly changed = () => {
    this.revision++;
  };

  constructor(readonly doc: Y.Doc) {
    if (doc.isDestroyed) throw new Error("白板文档已释放");
    this.meta = doc.getMap("whiteboard:meta");
    this.pages = doc.getMap("whiteboard:pages");
    this.pageOrder = doc.getArray("whiteboard:page-order");
    this.elements = doc.getMap("whiteboard:elements");
    this.orders = doc.getMap("whiteboard:orders");
    this.strings = doc.getMap("whiteboard:strings");
    this.creations = doc.getMap("whiteboard:creations");
    this.presentations = new WhiteboardPresentations(doc, this.creations);
    this.contracts = doc.getMap("node-tree:contracts");
    this.title = doc.getText("whiteboard:title");
    // 空文档只建立本机类型，协议标记随首次命令发布。
    if (this.meta.has("profile") && this.meta.get("profile") !== PROFILE)
      throw new Error("白板模型格式不支持");
    doc.on("afterTransaction", this.changed);
    doc.on("destroy", this.dispose);
  }
  private active(): void {
    if (this.disposed || this.doc.isDestroyed) throw new Error("白板文档已释放");
  }
  readonly dispose = (): void => {
    if (this.disposed) return;
    this.disposed = true;
    this.doc.off("afterTransaction", this.changed);
    this.doc.off("destroy", this.dispose);
    this.trees.forEach(tree => tree.dispose());
    this.trees.clear();
    this.histories.clear();
    this.pending = undefined;
  };
  private record(pool: Y.Map<Y.Map<unknown>>, target: string): Y.Map<unknown> {
    this.active();
    id(target);
    const record = pool.get(target);
    if (!(record instanceof Y.Map)) throw new Error("白板目标不存在");
    return record;
  }
  private visible(record: Y.Map<unknown>): boolean {
    const creation = record.get("creation"),
      deletions = record.get("deletions");
    if (typeof creation !== "string" || !(deletions instanceof Y.Map))
      throw new Error("白板可见性状态无效");
    id(creation);
    for (const [deletion, value] of deletions) {
      id(deletion);
      if (value !== true) throw new Error("白板删除标记无效");
    }
    return this.creations.get(creation) === true && deletions.size === 0;
  }
  private live(pool: Y.Map<Y.Map<unknown>>, target: string): Y.Map<unknown> {
    const record = this.record(pool, target);
    if (!this.visible(record)) throw new Error("白板目标已删除");
    return record;
  }
  private contract(record: Y.Map<unknown>): WhiteboardElementContract {
    const identity = record.get("identity") as { type: string; contractId: string } | undefined;
    const contract = identity && this.contracts.get(identity.contractId);
    if (
      !contract ||
      contract.format !== CONTENT_CONTRACT_VERSION ||
      contract.domain !== "whiteboard-element" ||
      contract.type !== identity?.type
    )
      throw new Error("白板元素契约无效");
    return contract;
  }
  private bindings(record: Y.Map<unknown>): WhiteboardFieldBindings {
    const bindings = record.get("fieldBindings") as WhiteboardFieldBindings;
    if (!bindings || !bindings.data) throw new Error("白板文字绑定无效");
    return bindings;
  }
  private root(rootId: string): NodeTree {
    let tree = this.trees.get(rootId);
    if (!tree) {
      tree = new NodeTree(this.doc, { rootId });
      this.trees.set(rootId, tree);
      for (const history of this.histories) {
        if (history.isDisposed) this.histories.delete(history);
        else tree.attachUndoManager(history);
      }
    }
    return tree;
  }
  private attachRoots(): void {
    for (const record of this.elements.values()) {
      const body = this.bindings(record).body;
      if (body?.mode === "richtext") this.root(body.rootId);
    }
  }
  createUndoManager(options: NodeTreeHistoryOptions): NodeTreeHistory {
    this.active();
    const history = createNodeTreeHistory(
      [
        this.presentations.records,
        this.presentations.order,
        this.pages,
        this.pageOrder,
        this.elements,
        this.orders,
        this.strings,
        this.creations,
        this.title,
      ],
      options
    );
    this.attachUndoManager(history);
    return history;
  }
  attachUndoManager(history: NodeTreeHistory): void {
    this.active();
    if (!(history instanceof NodeTreeHistory)) throw new Error("白板必须使用公共历史入口");
    history.assertActive(this.doc);
    history.attach([
      this.presentations.records,
      this.presentations.order,
      this.pages,
      this.pageOrder,
      this.elements,
      this.orders,
      this.strings,
      this.creations,
      this.title,
    ]);
    this.histories.add(history);
    this.attachRoots();
    for (const tree of this.trees.values()) tree.attachUndoManager(history);
  }
  /** 返回宿主内部共享根；插件只能经后续文本绑定接入，不能直接访问 Yjs。 */
  text(target: string, field: string | null = null): Y.Text {
    const bindings = this.bindings(this.live(this.elements, target));
    const rootId =
      field === null
        ? bindings.body?.mode === "plain"
          ? bindings.body.rootId
          : undefined
        : bindings.data[field];
    const text = rootId && this.strings.get(rootId);
    if (!(text instanceof Y.Text)) throw new Error("白板字符串字段未声明");
    return text;
  }
  richText(target: string): NodeTree {
    const body = this.bindings(this.live(this.elements, target)).body;
    if (body?.mode !== "richtext") throw new Error("白板富文本槽未声明");
    return this.root(body.rootId);
  }

  async installContracts(dictionary: ContentContractDictionary): Promise<void> {
    this.active();
    const input = structuredClone(dictionary);
    for (let attempt = 0; attempt < 3; attempt++) {
      const current = this.contracts.toJSON();
      for (const [key, value] of Object.entries(input))
        if (this.contracts.has(key) && !sharedValueEquals(current[key], value))
          throw new Error("已有契约不能修改");
      const checked = await validateContentContracts({ ...current, ...input });
      this.active();
      if (!sharedValueEquals(current, this.contracts.toJSON())) continue;
      const trial = this.clone();
      try {
        trial.doc.transact(() => {
          for (const [key, value] of Object.entries(checked))
            if (!trial.contracts.has(key)) trial.contracts.set(key, value);
        });
        trial.assertBudget();
      } finally {
        trial.dispose();
        trial.doc.destroy();
      }
      this.doc.transact(() => {
        for (const [key, value] of Object.entries(checked))
          if (!this.contracts.has(key)) this.contracts.set(key, structuredClone(value));
      }, remoteOrigin);
      return;
    }
    throw new Error("契约目录已变化，请重试");
  }

  private clone(useLocalClient = true): WhiteboardModel {
    const doc = new Y.Doc({ gc: false });
    Y.applyUpdate(doc, Y.encodeStateAsUpdate(this.doc));
    // 空共享根不进入 Yjs 编码，但已保留的根仍占用本机准入额度。
    for (const name of [...this.doc.share.keys()].filter(nodePool)) doc.getMap(name);
    if (useLocalClient) doc.clientID = this.doc.clientID;
    return new WhiteboardModel(doc);
  }
  /** 可信绑定在隔离候选执行写操作；不能把闭包交给插件或在其中产生外部副作用。 */
  preflight(write: (candidate: WhiteboardModel) => void): void {
    this.active();
    const candidate = this.clone();
    try {
      write(candidate);
      candidate.validateState();
    } finally {
      candidate.dispose();
      candidate.doc.destroy();
    }
  }

  /** 历史时钟和 redone 链属于本机状态，不能只复制正文便声称验证了撤销。 */
  preflightHistory(history: NodeTreeHistory, direction: "undo" | "redo"): void {
    history.assertActive(this.doc);
    this.preflight(candidate => {
      candidate.doc.transact(transaction => {
        for (const structs of this.doc.store.clients.values()) {
          for (const item of structs) {
            if (!(item instanceof Y.Item) || !item.redone) continue;
            const copy = Y.getItemCleanStart(transaction, item.id);
            Y.getItemCleanEnd(
              transaction,
              candidate.doc.store,
              Y.createID(item.id.client, item.id.clock + item.length - 1)
            );
            copy.redone = Y.createID(item.redone.client, item.redone.clock);
          }
        }
      });
      const copy = candidate.createUndoManager({
        trackedOrigins: new Set(history.trackedOrigins),
        captureTimeout: 0,
      });
      const cloneStack = (stack: typeof history.undoStack) =>
        stack.map(item => ({
          insertions: structuredClone(item.insertions),
          deletions: structuredClone(item.deletions),
          meta: new Map(item.meta),
        }));
      copy.undoStack = cloneStack(history.undoStack);
      copy.redoStack = cloneStack(history.redoStack);
      try {
        copy[direction]();
      } finally {
        copy.destroy();
      }
    });
  }
  private preparedAdditions(
    prepared: readonly (PreparedWhiteboardContract | PreparedContentContract)[]
  ) {
    const additions = new Map<string, DataContract>();
    for (const entry of prepared) {
      assertPreparedContract(entry);
      const previous = this.contracts.get(entry.id);
      if (previous && !sharedValueEquals(previous, entry.contract))
        throw new Error("已有契约不能修改");
      if (!previous) additions.set(entry.id, entry.contract);
    }
    if (additions.size)
      contentContractChecks({ ...this.contracts.toJSON(), ...Object.fromEntries(additions) });
    return additions;
  }
  withPreparedContracts(
    prepared: readonly (PreparedWhiteboardContract | PreparedContentContract)[],
    write: (model: WhiteboardModel) => void,
    origin: unknown
  ): void {
    this.active();
    if (this.doc.store.pendingStructs || this.doc.store.pendingDs)
      throw new Error("白板缺少先行结构");
    const additions = this.preparedAdditions(prepared);
    this.preflight(candidate => {
      for (const [id, contract] of additions) candidate.contracts.set(id, contract);
      write(candidate);
    });
    this.doc.transact(transaction => {
      const client = this.doc.clientID,
        clock = Y.getState(this.doc.store, client);
      for (const [id, contract] of additions) this.contracts.set(id, contract);
      preserveNodeInitialization(transaction, {
        client,
        clock,
        len: Y.getState(this.doc.store, client) - clock,
      });
      write(this);
    }, origin);
  }
  /** 大批导入分段预检，最终以一个增量进入当前视图历史。 */
  submitChunks(
    commands: readonly WhiteboardModelCommand[],
    origin: unknown,
    prepared: readonly (PreparedWhiteboardContract | PreparedContentContract)[] = [],
    initialBodies: readonly {
      id: string;
      preserveIds?: boolean;
      body: readonly import("./protocol").ContentNode[];
    }[] = []
  ): void {
    this.active();
    if (this.doc.store.pendingStructs || this.doc.store.pendingDs)
      throw new Error("白板缺少先行结构");
    if (!commands.length) throw new Error("白板命令批次为空");
    const revision = this.revision,
      vector = Y.encodeStateVector(this.doc),
      candidate = this.clone();
    const initialClock = Y.getState(this.doc.store, this.doc.clientID);
    const ranges: { client: number; clock: number; len: number }[] = [];
    const remember = (transaction: Y.Transaction) =>
      ranges.push(...nodeInitializationRanges(transaction));
    candidate.doc.on("afterTransaction", remember);
    try {
      let batch: WhiteboardModelCommand[] = [];
      for (const command of commands) {
        if (
          batch.length &&
          (batch.length >= WHITEBOARD_LIMITS.commandsPerBatch ||
            bytes([...batch, command]) > WHITEBOARD_LIMITS.batchBytes)
        ) {
          candidate.submit(batch, origin, prepared);
          batch = [];
        }
        batch.push(command);
      }
      if (batch.length) candidate.submit(batch, origin, prepared);
      const bodyIds = new Set<string>();
      for (const entry of initialBodies) {
        if (this.elements.has(entry.id) || bodyIds.has(entry.id))
          throw new Error("只能初始化本次导入的新正文");
        bodyIds.add(entry.id);
        const tree = candidate.richText(entry.id);
        entry.body.forEach((node, index) =>
          tree.insertNode(node, null, index, origin, entry.preserveIds)
        );
      }
      candidate.validateState();
      const newRoots = new Set(
        [...candidate.doc.share]
          .filter(([name]) => !this.doc.share.has(name))
          .map(([, root]) => root)
      );
      for (const item of candidate.doc.store.clients.get(candidate.doc.clientID) ?? []) {
        if (!(item instanceof Y.Item) || item.id.clock < initialClock) continue;
        let parent: unknown = item.parent;
        while (parent instanceof Y.AbstractType) {
          if (
            newRoots.has(parent) ||
            (parent._item?.id.client === candidate.doc.clientID &&
              parent._item.id.clock >= initialClock)
          ) {
            ranges.push({ client: item.id.client, clock: item.id.clock, len: item.length });
            break;
          }
          parent = parent._item?.parent;
        }
      }
      const update = Y.encodeStateAsUpdate(candidate.doc, vector);
      if (this.revision !== revision) throw new Error("导入期间文档已变化");
      this.doc.transact(transaction => {
        ranges.forEach(range => preserveNodeInitialization(transaction, range));
        Y.applyUpdate(this.doc, update, origin);
      }, origin);
    } finally {
      candidate.doc.off("afterTransaction", remember);
      candidate.dispose();
      candidate.doc.destroy();
    }
  }
  /** 在隔离副本中验证整批及编码大小，失败不改变真实文档或撤销栈。 */
  submit(
    commands: readonly WhiteboardModelCommand[],
    origin: unknown,
    prepared: readonly (PreparedWhiteboardContract | PreparedContentContract)[] = []
  ): { readonly createdIds: readonly string[] } {
    this.active();
    if (this.doc.store.pendingStructs || this.doc.store.pendingDs)
      throw new Error("白板缺少先行结构");
    assertWhiteboardJson(commands, -4);
    if (!Array.isArray(commands) || commands.length === 0) throw new Error("白板命令批次为空");
    assertWhiteboardBudget({ commandsPerBatch: commands.length, batchBytes: bytes(commands) });
    const additions = this.preparedAdditions(prepared);
    const plans = structuredClone(commands).map(command => ({
      command,
      id:
        (command.type === "create" || command.type === "create_page") && command.id !== undefined
          ? command.id
          : uuid(),
      token: uuid(),
      creation: uuid(),
      roots: {} as Record<string, string>,
      bodyRoot: uuid(),
    }));
    for (const plan of plans) {
      if (plan.command.type === "create") {
        const contract =
          this.contracts.get(plan.command.contractId) ?? additions.get(plan.command.contractId);
        if (!contract || contract.domain !== "whiteboard-element")
          throw new Error("白板元素契约无效");
        for (const field of contract.textFields) plan.roots[field] = uuid();
      }
    }
    const trial = this.clone();
    try {
      for (const [id, contract] of additions) trial.contracts.set(id, contract);
      trial.execute(plans, origin);
      trial.validateState();
    } finally {
      trial.dispose();
      trial.doc.destroy();
    }
    this.doc.transact(transaction => {
      const client = this.doc.clientID,
        clock = Y.getState(this.doc.store, client);
      for (const [id, contract] of additions) this.contracts.set(id, contract);
      preserveNodeInitialization(transaction, {
        client,
        clock,
        len: Y.getState(this.doc.store, client) - clock,
      });
      this.execute(plans, origin);
    }, origin);
    return Object.freeze({
      createdIds: Object.freeze(
        plans
          .filter(plan => plan.command.type === "create" || plan.command.type === "create_page")
          .map(plan => plan.id)
      ),
    });
  }
  private execute(plans: readonly PlannedCommand[], origin: unknown): void {
    this.doc.transact(transaction => {
      if (!this.meta.has("profile")) this.meta.set("profile", PROFILE);
      for (const plan of plans) this.executeOne(plan, transaction, origin);
    }, origin);
  }
  private initialize(plan: PlannedCommand, transaction: Y.Transaction, build: () => void): void {
    const client = this.doc.clientID,
      clock = Y.getState(this.doc.store, client);
    build();
    preserveNodeInitialization(transaction, {
      client,
      clock,
      len: Y.getState(this.doc.store, client) - clock,
    });
    this.creations.set(plan.creation, true);
  }
  private baseRecord(creation: string): Y.Map<unknown> {
    const record = new Y.Map<unknown>();
    record.set("creation", creation);
    record.set("deletions", new Y.Map<boolean>());
    return record;
  }
  private order(parent: WhiteboardParent): Y.Array<WhiteboardReference> {
    const order = this.orders.get(whiteboardParentKey(parent));
    if (!(order instanceof Y.Array)) throw new Error("父级顺序根缺失");
    return order;
  }
  private placement(record: Y.Map<unknown>): WhiteboardPlacement {
    const value = record.get("placement") as WhiteboardPlacement;
    if (
      !value ||
      !identifier(value.token) ||
      !identifier(value.fallbackPageId) ||
      !value.parent ||
      !identifier(value.parent.id) ||
      !["page", "element"].includes(value.parent.kind)
    )
      throw new Error("白板位置无效");
    keys(value, ["parent", "token", "fallbackPageId"]);
    keys(value.parent, ["kind", "id"]);
    return value;
  }
  private routing(): WhiteboardRouting {
    const livePages = new Set(
      [...this.pages].filter(([, record]) => this.visible(record)).map(([key]) => key)
    );
    const nodes = new Map(
      [...this.elements]
        .filter(([, record]) => this.visible(record))
        .map(([key, record]) => [
          key,
          { placement: this.placement(record), contract: this.contract(record) },
        ])
    );
    return projectWhiteboardRouting(nodes, livePages);
  }
  private destination(
    parent: WhiteboardParent,
    contract: WhiteboardElementContract,
    moving?: string
  ): string {
    keys(parent, ["kind", "id"]);
    id(parent.id);
    if (parent.kind === "page") {
      this.live(this.pages, parent.id);
      return parent.id;
    }
    if (parent.kind !== "element") throw new Error("白板父级无效");
    const target = this.live(this.elements, parent.id);
    if (!canContainWhiteboardElement(this.contract(target), contract))
      throw new Error("白板收纳规则不允许");
    const routing = this.routing();
    let current: WhiteboardParent | null = parent;
    while (current?.kind === "element") {
      if (current.id === moving) throw new Error("白板移动形成循环");
      current = routing.parents.get(current.id) ?? null;
    }
    let height = 1;
    if (moving) {
      for (const [child, depth] of routing.depths) {
        let ancestor: WhiteboardParent | null = { kind: "element", id: child };
        while (ancestor?.kind === "element" && ancestor.id !== moving)
          ancestor = routing.parents.get(ancestor.id) ?? null;
        if (ancestor?.id === moving)
          height = Math.max(height, depth - routing.depths.get(moving)! + 1);
      }
    }
    if ((routing.depths.get(parent.id) ?? 0) + height > WHITEBOARD_LIMITS.payloadDepth)
      throw new Error("白板逻辑层级超过预算");
    const page = routing.pages.get(parent.id);
    if (!page) throw new Error("先恢复目标容器到有效页面");
    return page;
  }
  private position(
    order: Y.Array<WhiteboardReference>,
    anchor: WhiteboardAnchor,
    parent?: WhiteboardParent,
    moving?: string
  ): number {
    if (anchor.beforeId !== undefined && anchor.afterId !== undefined)
      throw new Error("白板锚点互斥");
    const target = anchor.beforeId ?? anchor.afterId;
    if (target === undefined) return order.length;
    id(target);
    if (target === moving) throw new Error("白板锚点不能是自身");
    const record = this.live(parent ? this.elements : this.pages, target);
    const placement = parent ? this.placement(record) : { token: record.get("placement") };
    if (
      parent &&
      (!sameWhiteboardParent(this.placement(record).parent, parent) ||
        this.routing().recovered.has(target))
    )
      throw new Error("白板锚点不在目标父级");
    const index = order
      .toArray()
      .findIndex(reference => reference.id === target && reference.token === placement.token);
    if (index < 0) throw new Error("白板锚点失效");
    return index + (anchor.afterId !== undefined ? 1 : 0);
  }
  private erase(ids: readonly string[], deletion: string): void {
    if (!Array.isArray(ids) || new Set(ids).size !== ids.length || ids.length === 0)
      throw new Error("删除观察集合无效");
    const records = ids.map(target => this.live(this.elements, target));
    records.forEach(record => (record.get("deletions") as Y.Map<boolean>).set(deletion, true));
  }
  private edit(text: Y.Text, edit: WhiteboardTextEdit): void {
    keys(edit, ["offset", "remove", "text"]);
    if (
      !Number.isSafeInteger(edit.offset) ||
      !Number.isSafeInteger(edit.remove) ||
      edit.offset < 0 ||
      edit.remove < 0 ||
      edit.offset + edit.remove > text.length ||
      typeof edit.text !== "string"
    )
      throw new Error("白板文字编辑无效");
    if (edit.remove) text.delete(edit.offset, edit.remove);
    if (edit.text) text.insert(edit.offset, edit.text);
  }
  private executeOne(plan: PlannedCommand, transaction: Y.Transaction, origin: unknown): void {
    const command = plan.command;
    switch (command.type) {
      case "set_page_sketch": {
        keys(command, ["type", "id", "sketch"]);
        keys(command.sketch, ["mode", "level"]);
        if (
          !["normal", "sketch"].includes(command.sketch.mode) ||
          !["neat", "natural", "loose"].includes(command.sketch.level)
        )
          throw new Error("页面画风无效");
        this.live(this.pages, command.id).set("sketch", structuredClone(command.sketch));
        return;
      }
      case "set_presentation":
        keys(command, ["type", "before", "after"]);
        this.presentations.apply(command.before, command.after, plan.token, transaction);
        return;
      case "create_page": {
        keys(command, ["type", "id", "title", "beforeId", "afterId"]);
        id(plan.id);
        if (this.pages.has(plan.id) || this.elements.has(plan.id))
          throw new Error("白板身份不能复用");
        if (typeof command.title !== "string") throw new Error("白板页名无效");
        const at = this.position(this.pageOrder, command);
        this.initialize(plan, transaction, () => {
          const record = this.baseRecord(plan.creation);
          record.set("title", new Y.Text(command.title));
          record.set("placement", plan.token);
          this.pages.set(plan.id, record);
          this.orders.set(
            whiteboardParentKey({ kind: "page", id: plan.id }),
            new Y.Array<WhiteboardReference>()
          );
          this.pageOrder.insert(at, [{ id: plan.id, token: plan.token }]);
        });
        return;
      }
      case "move_page": {
        keys(command, ["type", "id", "beforeId", "afterId"]);
        const page = this.live(this.pages, command.id),
          at = this.position(this.pageOrder, command, undefined, command.id);
        const client = this.doc.clientID,
          clock = Y.getState(this.doc.store, client);
        this.pageOrder.insert(at, [{ id: command.id, token: plan.token }]);
        preserveNodeInitialization(transaction, {
          client,
          clock,
          len: Y.getState(this.doc.store, client) - clock,
        });
        page.set("placement", plan.token);
        return;
      }
      case "remove_page": {
        keys(command, ["type", "id", "observedElementIds"]);
        const page = this.live(this.pages, command.id);
        if (!Array.isArray(command.observedElementIds)) throw new Error("删除观察集合无效");
        if (command.observedElementIds.length) this.erase(command.observedElementIds, plan.token);
        (page.get("deletions") as Y.Map<boolean>).set(plan.token, true);
        return;
      }
      case "edit_page_title": {
        keys(command, ["type", "id", "edit"]);
        const title = this.live(this.pages, command.id).get("title");
        if (!(title instanceof Y.Text)) throw new Error("页名文字根无效");
        this.edit(title, command.edit);
        return;
      }
      case "edit_title":
        keys(command, ["type", "edit"]);
        this.edit(this.title, command.edit);
        return;
      case "create": {
        keys(command, [
          "type",
          "contractId",
          "id",
          "data",
          "geometry",
          "parent",
          "body",
          "entity",
          "beforeId",
          "afterId",
        ]);
        id(plan.id);
        if (this.elements.has(plan.id) || this.pages.has(plan.id))
          throw new Error("白板身份不能复用");
        const contract = this.contracts.get(command.contractId);
        if (!contract || contract.domain !== "whiteboard-element")
          throw new Error("白板元素契约无效");
        if (
          command.entity !== undefined &&
          (contract.structure.reference !== "entity" || !isContentEntityReference(command.entity))
        )
          throw new Error("白板实体槽无效");
        geometry(command.geometry);
        keys(command.data, Object.keys(command.data));
        assertWhiteboardJson(command.data);
        const ordinary = { ...command.data };
        for (const field of contract.textFields) {
          if (ordinary[field] !== undefined && typeof ordinary[field] !== "string")
            throw new Error("白板文本字段必须是字符串");
          delete ordinary[field];
        }
        assertWhiteboardDataPatch(contract, ordinary);
        if (bytes(command.data) > WHITEBOARD_LIMITS.patchBytes)
          throw new Error("白板初始载荷超过预算");
        const fallbackPageId = this.destination(command.parent, contract);
        const order = this.order(command.parent),
          at = this.position(order, command, command.parent);
        const mode = contract.structure.text;
        if (mode === "none" && command.body !== undefined) throw new Error("白板正文槽未声明");
        if (mode === "plain" && command.body !== undefined && typeof command.body !== "string")
          throw new Error("白板正文类型无效");
        if (mode === "richtext" && command.body !== undefined && !Array.isArray(command.body))
          throw new Error("白板正文类型无效");
        this.initialize(plan, transaction, () => {
          const record = this.baseRecord(plan.creation),
            data = new Y.Map<unknown>();
          const bindings: WhiteboardFieldBindings = {
            data: plan.roots,
            ...(mode === "none" ? {} : { body: { mode, rootId: plan.bodyRoot } }),
          };
          if (command.entity !== undefined) record.set("entity", structuredClone(command.entity));
          record.set("identity", { type: contract.type, contractId: command.contractId });
          record.set("geometry", structuredClone(command.geometry));
          record.set("style", new Y.Map());
          record.set("data", data);
          record.set("fieldBindings", structuredClone(bindings));
          record.set("placement", { parent: command.parent, token: plan.token, fallbackPageId });
          this.elements.set(plan.id, record);
          this.orders.set(
            whiteboardParentKey({ kind: "element", id: plan.id }),
            new Y.Array<WhiteboardReference>()
          );
          for (const [key, value] of Object.entries(ordinary))
            data.set(key, structuredClone(value));
          for (const field of contract.textFields)
            this.strings.set(plan.roots[field], new Y.Text((command.data[field] as string) ?? ""));
          if (mode === "plain")
            this.strings.set(plan.bodyRoot, new Y.Text((command.body as string) ?? ""));
          if (mode === "richtext") {
            const tree = this.root(plan.bodyRoot);
            (
              (command.body as readonly import("./protocol").ContentNode[] | undefined) ?? []
            ).forEach((node, index) => tree.insertNode(node, null, index, origin));
          }
          order.insert(at, [{ id: plan.id, token: plan.token }]);
        });
        return;
      }
      case "move_node": {
        keys(command, ["type", "id", "parent", "beforeId", "afterId"]);
        const record = this.live(this.elements, command.id),
          fallbackPageId = this.destination(command.parent, this.contract(record), command.id);
        const order = this.order(command.parent),
          at = this.position(order, command, command.parent, command.id);
        const client = this.doc.clientID,
          clock = Y.getState(this.doc.store, client);
        order.insert(at, [{ id: command.id, token: plan.token }]);
        preserveNodeInitialization(transaction, {
          client,
          clock,
          len: Y.getState(this.doc.store, client) - clock,
        });
        record.set("placement", { parent: command.parent, token: plan.token, fallbackPageId });
        return;
      }
      case "set_entity": {
        keys(command, ["type", "id", "entity"]);
        const record = this.live(this.elements, command.id);
        if (
          this.contract(record).structure.reference !== "entity" ||
          (command.entity !== null && !isContentEntityReference(command.entity))
        )
          throw new Error("白板实体槽无效");
        if (command.entity === null) record.delete("entity");
        else record.set("entity", structuredClone(command.entity));
        return;
      }
      case "remove_nodes":
        keys(command, ["type", "ids"]);
        this.erase(command.ids, plan.token);
        return;
      case "set_node": {
        keys(command, ["type", "id", "patch"]);
        keys(command.patch, ["name", "geometry", "style"]);
        const record = this.live(this.elements, command.id);
        if (command.patch.name !== undefined) {
          if (typeof command.patch.name !== "string") throw new Error("白板名称无效");
          record.set("name", command.patch.name);
        }
        if (command.patch.geometry !== undefined) {
          geometry(command.patch.geometry);
          record.set("geometry", structuredClone(command.patch.geometry));
        }
        if (command.patch.style !== undefined) {
          keys(command.patch.style, Object.keys(command.patch.style));
          assertWhiteboardJson(command.patch.style);
          const style = record.get("style") as Y.Map<unknown>;
          for (const [key, value] of Object.entries(command.patch.style))
            style.set(key, structuredClone(value));
        }
        if (bytes(command.patch) > WHITEBOARD_LIMITS.patchBytes)
          throw new Error("白板外壳补丁超过预算");
        return;
      }
      case "set_data": {
        keys(command, ["type", "id", "patch", "unset"]);
        const record = this.live(this.elements, command.id);
        assertWhiteboardDataPatch(this.contract(record), command.patch, command.unset);
        const data = record.get("data") as Y.Map<unknown>;
        for (const key of command.unset ?? []) data.delete(key);
        for (const [key, value] of Object.entries(command.patch))
          data.set(key, structuredClone(value));
        return;
      }
      case "edit_text":
        keys(command, ["type", "id", "field", "edit"]);
        this.edit(this.text(command.id, command.field), command.edit);
        return;
      default:
        throw new Error("白板命令类型不支持");
    }
  }

  private assertBudget(): void {
    const pools = [...this.doc.share.keys()].filter(nodePool);
    const boundRoots = new Set<string>();
    for (const record of this.elements.values()) {
      const body = this.bindings(record).body;
      if (body?.mode === "richtext") boundRoots.add(body.rootId);
    }
    for (const pool of pools)
      boundRoots.add(
        pool === "node-tree:nodes"
          ? "content"
          : pool.slice("node-tree:roots:".length, -":nodes".length)
      );
    assertWhiteboardBudget({
      pages: this.pages.size,
      elements:
        this.elements.size +
        this.presentations.records.size +
        [...this.presentations.records.values()].reduce(
          (sum, record) => sum + ((record.get("frames") as Y.Map<unknown>)?.size ?? 0),
          0
        ),
      documentBytes: Y.encodeStateAsUpdate(this.doc).byteLength,
      richTextRoots: boundRoots.size,
      richTextNodes: pools.reduce((sum, key) => sum + this.doc.getMap(key).size, 0),
    });
  }
  private validateState(): void {
    if (
      (this.pages.size || this.elements.size || this.meta.has("profile")) &&
      this.meta.get("profile") !== PROFILE
    )
      throw new Error("白板模型格式不支持");
    keys(this.meta.toJSON(), ["profile"]);
    this.assertBudget();
    this.presentations.validate();
    const roots = new Set<string>();
    const stringRoots = new Set<string>();
    const orderKeys = new Set<string>();
    for (const [creation, value] of this.creations) {
      id(creation);
      if (value !== true) throw new Error("白板创建标记无效");
    }
    for (const [pageId, page] of this.pages) {
      id(pageId);
      keys(Object.fromEntries(page), ["title", "placement", "creation", "deletions", "sketch"]);
      if (page.has("sketch")) {
        const sketch = page.get("sketch") as { mode: string; level: string };
        keys(sketch, ["mode", "level"]);
        if (
          !["normal", "sketch"].includes(sketch.mode) ||
          !["neat", "natural", "loose"].includes(sketch.level)
        )
          throw new Error("页面画风无效");
      }
      this.visible(page);
      if (!(page.get("title") instanceof Y.Text) || !identifier(page.get("placement")))
        throw new Error("白板页面格式无效");
      this.order({ kind: "page", id: pageId });
      orderKeys.add(whiteboardParentKey({ kind: "page", id: pageId }));
    }
    for (const [elementId, record] of this.elements) {
      id(elementId);
      keys(Object.fromEntries(record), [
        "identity",
        "placement",
        "geometry",
        "style",
        "data",
        "fieldBindings",
        "entity",
        "creation",
        "deletions",
        "name",
      ]);
      keys(record.get("identity"), ["type", "contractId"]);
      if (record.has("name") && typeof record.get("name") !== "string")
        throw new Error("白板名称无效");
      this.visible(record);
      this.placement(record);
      geometry(record.get("geometry") as WhiteboardGeometry);
      const contract = this.contract(record),
        bindings = this.bindings(record);
      if (
        record.has("entity") &&
        (contract.structure.reference !== "entity" ||
          !isContentEntityReference(record.get("entity")))
      )
        throw new Error("白板实体槽无效");
      keys(bindings, ["data", "body"]);
      keys(bindings.data, contract.textFields);
      if (!(record.get("data") instanceof Y.Map) || !(record.get("style") instanceof Y.Map))
        throw new Error("白板属性根无效");
      const data = Object.fromEntries(record.get("data") as Y.Map<unknown>);
      for (const [key, value] of Object.entries(data))
        assertWhiteboardDataPatch(contract, { [key]: value });
      assertWhiteboardJson(Object.fromEntries(record.get("style") as Y.Map<unknown>));
      for (const field of contract.textFields) {
        const rootId = bindings.data[field];
        id(rootId);
        if (roots.has(rootId) || !(this.strings.get(rootId) instanceof Y.Text))
          throw new Error("白板文字身份重复或缺失");
        roots.add(rootId);
        stringRoots.add(rootId);
      }
      if (contract.structure.text === "none") {
        if (bindings.body) throw new Error("白板正文槽未声明");
      } else {
        const body = bindings.body;
        if (
          !body ||
          body.mode !== contract.structure.text ||
          !identifier(body.rootId) ||
          roots.has(body.rootId)
        )
          throw new Error("白板正文身份无效");
        roots.add(body.rootId);
        keys(body, ["mode", "rootId"]);
        if (body.mode === "plain") {
          if (!(this.strings.get(body.rootId) instanceof Y.Text)) throw new Error("白板正文根缺失");
          stringRoots.add(body.rootId);
        } else this.root(body.rootId).read();
      }
      this.order({ kind: "element", id: elementId });
      orderKeys.add(whiteboardParentKey({ kind: "element", id: elementId }));
    }
    if ([...this.strings.keys()].some(root => !stringRoots.has(root)))
      throw new Error("白板存在未声明的文字根");
    const seen = new Set<string>();
    for (const [parentKey, order] of this.orders) {
      if (!(order instanceof Y.Array) || !orderKeys.has(parentKey))
        throw new Error("白板顺序根无效");
      for (const reference of order.toArray()) {
        keys(reference, ["id", "token"]);
        id(reference.id);
        id(reference.token);
        const unique = `${reference.id}:${reference.token}`;
        if (seen.has(unique) || !this.elements.has(reference.id))
          throw new Error("白板位置引用重复或无目标");
        seen.add(unique);
        const placement = this.placement(this.record(this.elements, reference.id));
        if (
          reference.token === placement.token &&
          parentKey !== whiteboardParentKey(placement.parent)
        )
          throw new Error("白板位置引用父级不符");
      }
    }
    for (const [elementId, record] of this.elements)
      if (!seen.has(`${elementId}:${this.placement(record).token}`))
        throw new Error("白板选定位置缺失");
    const pageSeen = new Set<string>();
    for (const reference of this.pageOrder.toArray()) {
      keys(reference, ["id", "token"]);
      id(reference.id);
      id(reference.token);
      const key = `${reference.id}:${reference.token}`;
      if (pageSeen.has(key) || !this.pages.has(reference.id)) throw new Error("白板页位置引用无效");
      pageSeen.add(key);
    }
    for (const [pageId, record] of this.pages)
      if (!pageSeen.has(`${pageId}:${record.get("placement")}`))
        throw new Error("白板页选定位置缺失");
  }

  read(): WhiteboardSnapshot {
    this.active();
    const routing = this.routing();
    const element = (elementId: string): WhiteboardElementSnapshot => {
      const record = this.record(this.elements, elementId),
        contract = this.contract(record),
        bindings = this.bindings(record);
      const data = (record.get("data") as Y.Map<unknown>).toJSON();
      for (const field of contract.textFields)
        data[field] = this.strings.get(bindings.data[field])!.toString();
      const body = bindings.body;
      return {
        id: elementId,
        type: contract.type,
        contractId: (record.get("identity") as { contractId: string }).contractId,
        ...(record.has("name") ? { name: record.get("name") as string } : {}),
        geometry: structuredClone(record.get("geometry") as WhiteboardGeometry),
        style: structuredClone((record.get("style") as Y.Map<unknown>).toJSON()),
        data: structuredClone(data),
        fieldBindings: structuredClone(bindings),
        ...(record.has("entity")
          ? {
              entity: structuredClone(
                record.get("entity")
              ) as import("@tau/db-schema/content-identities").ContentEntityReference,
            }
          : {}),
        ...(body
          ? {
              body:
                body.mode === "plain"
                  ? this.strings.get(body.rootId)!.toString()
                  : structuredClone(this.root(body.rootId).read()),
            }
          : {}),
        children: children({ kind: "element", id: elementId }),
        ...(routing.recovered.has(elementId)
          ? { recoveryReason: routing.recovered.get(elementId) }
          : {}),
      };
    };
    const children = (parent: WhiteboardParent): WhiteboardElementSnapshot[] =>
      this.order(parent)
        .toArray()
        .filter(reference => {
          const selected = routing.parents.get(reference.id),
            record = this.elements.get(reference.id);
          return (
            selected &&
            sameWhiteboardParent(selected, parent) &&
            record &&
            this.placement(record).token === reference.token
          );
        })
        .map(reference => element(reference.id));
    const recovered = (pageId: string | null) =>
      [...routing.recovered.keys()]
        .sort()
        .filter(target => routing.pages.get(target) === pageId)
        .map(element);
    const pages = this.pageOrder
      .toArray()
      .filter(reference => {
        const page = this.pages.get(reference.id);
        return page && this.visible(page) && page.get("placement") === reference.token;
      })
      .map(reference => ({
        id: reference.id,
        title: (this.record(this.pages, reference.id).get("title") as Y.Text).toString(),
        ...(this.record(this.pages, reference.id).has("sketch")
          ? {
              sketch: structuredClone(
                this.record(this.pages, reference.id).get("sketch")
              ) as import("./whiteboard-types").WhiteboardPageSnapshot["sketch"],
            }
          : {}),
        children: children({ kind: "page", id: reference.id }),
        recovery: recovered(reference.id),
      }));
    return frozen({
      title: this.title.toString(),
      pages,
      recovery: recovered(null),
      ...(this.presentations.records.size ? { presentations: this.presentations.read() } : {}),
    });
  }

  /** 服务端校验完整候选，已有记录的物理身份不能被普通更新替换。 */
  async validate(previous?: WhiteboardModel): Promise<void> {
    this.active();
    if (this.doc.store.pendingStructs || this.doc.store.pendingDs)
      throw new Error("MISSING_DEPENDENCIES");
    await validateContentContracts(this.contracts.toJSON());
    this.validateState();
    if (previous) {
      for (const [key, value] of previous.contracts)
        if (!sharedValueEquals(value, this.contracts.get(key)))
          throw new Error("远端不能改写已有契约");
      previous.assertStableRecords(this);
      this.presentations.assertStable(previous.presentations);
    }
  }

  /** 因果缺口保存在有界内存队列；不物化、不记历史，也不冒充耐久接纳。 */
  async receive(update: Uint8Array): Promise<{ status: "applied" | "pending" }> {
    this.active();
    if (!(update instanceof Uint8Array)) throw new Error("白板增量必须是二进制");
    assertWhiteboardBudget({
      documentBytes: this.queuedBytes + (this.pending?.byteLength ?? 0) + update.byteLength,
    });
    const input = new Uint8Array(update);
    this.queuedBytes += input.byteLength;
    const operation = this.incoming
      .then(() => this.receiveNow(input))
      .finally(() => {
        this.queuedBytes -= input.byteLength;
      });
    this.incoming = operation.catch(() => undefined);
    return operation;
  }
  /** 将未接纳的缺依赖材料交还宿主保全；不能在接收仍进行时清空。 */
  takePendingUpdate(): Uint8Array | undefined {
    this.active();
    if (this.queuedBytes) throw new Error("请等待白板接收完成");
    const update = this.pending?.slice();
    this.pending = undefined;
    return update;
  }
  private async receiveNow(update: Uint8Array): Promise<{ status: "applied" | "pending" }> {
    this.active();
    const merged = this.pending ? Y.mergeUpdates([this.pending, update]) : update;
    assertWhiteboardBudget({ documentBytes: merged.byteLength });
    for (let attempt = 0; attempt < 3; attempt++) {
      const revision = this.revision,
        trial = this.clone(false);
      try {
        Y.applyUpdate(trial.doc, merged, remoteOrigin);
        trial.assertBudget();
        if (trial.doc.store.pendingStructs || trial.doc.store.pendingDs) {
          this.pending = merged;
          return { status: "pending" };
        }
        await validateContentContracts(trial.contracts.toJSON());
        this.active();
        if (revision !== this.revision) continue;
        trial.validateState();
        for (const [key, value] of this.contracts)
          if (!sharedValueEquals(value, trial.contracts.get(key)))
            throw new Error("远端不能改写已有契约");
        this.assertStableRecords(trial);
        Y.applyUpdate(this.doc, merged, remoteOrigin);
        this.pending = undefined;
        this.attachRoots();
        return { status: "applied" };
      } finally {
        trial.dispose();
        trial.doc.destroy();
      }
    }
    throw new Error("白板状态已变化，请重试更新");
  }
  private assertStableRecords(candidate: WhiteboardModel): void {
    candidate.presentations.assertStable(this.presentations);
    const same = (left: unknown, right: unknown) =>
      left instanceof Y.AbstractType &&
      right instanceof Y.AbstractType &&
      left.constructor === right.constructor &&
      left._item?.id.client === right._item?.id.client &&
      left._item?.id.clock === right._item?.id.clock;
    for (const [pool, next, fields] of [
      [this.pages, candidate.pages, ["title", "deletions"]],
      [this.elements, candidate.elements, ["data", "style", "deletions"]],
    ] as const)
      for (const [key, record] of pool) {
        const other = next.get(key);
        if (
          !same(record, other) ||
          !other ||
          record.get("creation") !== other.get("creation") ||
          fields.some(field => !same(record.get(field), other.get(field)))
        )
          throw new Error("远端不能重建稳定记录");
        if (
          pool === this.elements &&
          ["identity", "fieldBindings"].some(
            field => !sharedValueEquals(record.get(field), other.get(field))
          )
        )
          throw new Error("远端不能改写元素身份或文字绑定");
      }
    for (const [key, text] of this.strings)
      if (!same(text, candidate.strings.get(key))) throw new Error("远端不能重建文字根");
    for (const [key, order] of this.orders)
      if (!same(order, candidate.orders.get(key))) throw new Error("远端不能重建顺序根");
    for (const name of [...this.doc.share.keys()].filter(nodePool)) {
      const pool = this.doc.getMap<Y.Map<unknown>>(name),
        next = candidate.doc.getMap<Y.Map<unknown>>(name);
      for (const [key, record] of pool) {
        const other = next.get(key);
        if (
          !same(record, other) ||
          !other ||
          ["content", "properties", "fields", "deletions"].some(
            field => !same(record.get(field), other.get(field))
          )
        )
          throw new Error("远端不能重建富文本节点或文字根");
        const fields = record.get("fields") as Y.Map<unknown>,
          nextFields = other.get("fields") as Y.Map<unknown>;
        for (const [field, value] of fields)
          if (value instanceof Y.AbstractType && !same(value, nextFields.get(field)))
            throw new Error("远端不能重建富文本字段根");
      }
    }
  }
}
