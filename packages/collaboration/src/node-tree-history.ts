import * as Y from "yjs";

interface InitializationRange {
  client: number;
  clock: number;
  len: number;
}

const initializations = new WeakMap<Y.Transaction, InitializationRange[]>();

/** 初始化结构不参与撤销，创建可见性仍由同一事务中的独立记录控制。 */
export function preserveNodeInitialization(
  transaction: Y.Transaction,
  range: InitializationRange
): void {
  const ranges = initializations.get(transaction) ?? [];
  ranges.push(range);
  initializations.set(transaction, ranges);
}

/** 宿主在隔离候选组装大批导入时，随正式增量转交初始化保护范围。 */
export function nodeInitializationRanges(
  transaction: Y.Transaction
): readonly InitializationRange[] {
  return initializations.get(transaction) ?? [];
}

export interface NodeTreeHistoryOptions {
  trackedOrigins: Set<unknown>;
  captureTimeout?: number;
  beforeChange?: (history: NodeTreeHistory, direction: "undo" | "redo") => void;
}

function checkedScope(scope: ConstructorParameters<typeof Y.UndoManager>[0]) {
  const types = Array.isArray(scope) ? scope : [scope];
  if (!types.length) throw new Error("历史作用域不能为空");
  const doc = types[0] instanceof Y.Doc ? undefined : types[0].doc;
  if (
    !doc ||
    doc.isDestroyed ||
    types.some(type => type instanceof Y.Doc || !type.doc || type.doc !== doc)
  )
    throw new Error("历史需要同一份存活 Y.Doc 的显式共享类型");
  return types.filter((type): type is Exclude<typeof type, Y.Doc> => !(type instanceof Y.Doc));
}

export class NodeTreeHistory extends Y.UndoManager {
  readonly identity = crypto.randomUUID();
  private closed = false;
  private origins = new Map<unknown, { count: number; keep: boolean }>();
  private activeStackItem?: Y.UndoManager["undoStack"][number];
  private beforeChange?: NodeTreeHistoryOptions["beforeChange"];

  constructor(
    scope: ConstructorParameters<typeof Y.UndoManager>[0],
    options: NodeTreeHistoryOptions
  ) {
    const types = checkedScope(scope);
    let transaction: Y.Transaction | undefined;
    let canDelete = (_item: Y.Item) => true;
    super(types, {
      ...options,
      trackedOrigins: new Set(options.trackedOrigins),
      deleteFilter: item => canDelete(item),
      captureTransaction(current) {
        transaction = current;
        return true;
      },
    });
    canDelete = item => this.canDeleteDuringHistory(item);
    this.beforeChange = options.beforeChange;
    const filter = ({ stackItem }: { stackItem: Y.UndoManager["undoStack"][number] }) => {
      if (!transaction) return;
      const ranges = initializations.get(transaction) ?? [];
      // 按捕获时的作用域裁剪，后续挂入新根不能追溯撤销原本不属于它的编辑。
      stackItem.insertions = excludeRanges(this.inScope(transaction, stackItem.insertions), ranges);
      stackItem.deletions = excludeRanges(this.inScope(transaction, stackItem.deletions), ranges);
      if (!stackItem.insertions.clients.size && !stackItem.deletions.clients.size)
        for (const stack of [this.undoStack, this.redoStack])
          if (stack.at(-1) === stackItem) stack.pop();
    };
    this.on("stack-item-added", filter);
    this.on("stack-item-updated", filter);
  }

  get isDisposed(): boolean {
    return this.closed;
  }

  assertActive(doc = this.doc): void {
    if (this.closed || this.doc.isDestroyed) throw new Error("文档历史已释放");
    if (doc !== this.doc) throw new Error("不能注入另一份 Y.Doc 的历史");
  }

  attach(scope: ConstructorParameters<typeof Y.UndoManager>[0]): void {
    this.assertActive();
    const types = checkedScope(scope);
    for (const type of types) {
      const doc = type instanceof Y.Doc ? type : type.doc;
      if (!doc) throw new Error("历史作用域尚未连接文档");
      this.assertActive(doc);
    }
    this.addToScope(types);
  }

  retainOrigin(origin: unknown): () => void {
    this.assertActive();
    const entry = this.origins.get(origin) ?? { count: 0, keep: this.trackedOrigins.has(origin) };
    entry.count++;
    this.origins.set(origin, entry);
    this.trackedOrigins.add(origin);
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      if (--entry.count === 0) {
        this.origins.delete(origin);
        if (!entry.keep) this.trackedOrigins.delete(origin);
      }
    };
  }

  override undo(): ReturnType<Y.UndoManager["undo"]> {
    this.assertActive();
    this.beforeChange?.(this, "undo");
    this.activeStackItem = this.undoStack.at(-1);
    const prefix = this.undoStack.slice(0, -1);
    this.undoStack = this.undoStack.slice(-1);
    try {
      return super.undo();
    } finally {
      this.undoStack = [...prefix, ...this.undoStack];
      this.activeStackItem = undefined;
    }
  }
  override redo(): ReturnType<Y.UndoManager["redo"]> {
    this.assertActive();
    this.beforeChange?.(this, "redo");
    this.activeStackItem = this.redoStack.at(-1);
    const prefix = this.redoStack.slice(0, -1);
    this.redoStack = this.redoStack.slice(-1);
    try {
      return super.redo();
    } finally {
      this.redoStack = [...prefix, ...this.redoStack];
      this.activeStackItem = undefined;
    }
  }
  private canDeleteDuringHistory(item: Y.Item): boolean {
    const source = this.activeStackItem;
    if (
      !source ||
      item.parentSub === null ||
      !(item.parent instanceof Y.Map) ||
      item.parent._map.get(item.parentSub) !== item
    )
      return true;
    // 旧值因远端竞争无法恢复时，不能再删掉当前值使必需属性变成缺失。
    for (let previous = item.left; previous; previous = previous.left)
      if (Y.isDeleted(source.deletions, previous.id)) return false;
    return true;
  }
  override destroy(): void {
    if (this.closed) return;
    this.closed = true;
    this.origins.clear();
    super.destroy();
  }

  private inScope(transaction: Y.Transaction, source: ReturnType<typeof Y.createDeleteSet>) {
    const result = Y.createDeleteSet();
    Y.iterateDeletedStructs(transaction, source, item => {
      if (
        !(item instanceof Y.Item) ||
        !this.scope.some(
          type =>
            type === transaction.doc || (type instanceof Y.AbstractType && Y.isParentOf(type, item))
        )
      )
        return;
      const ranges = result.clients.get(item.id.client) ?? [];
      ranges.push({ clock: item.id.clock, len: item.length });
      result.clients.set(item.id.client, ranges);
    });
    return result;
  }
}

export function createNodeTreeHistory(
  scope: ConstructorParameters<typeof Y.UndoManager>[0],
  options: NodeTreeHistoryOptions
): NodeTreeHistory {
  return new NodeTreeHistory(scope, options);
}

function excludeRanges(
  source: ReturnType<typeof Y.createDeleteSet>,
  excluded: readonly InitializationRange[]
): ReturnType<typeof Y.createDeleteSet> {
  const result = Y.createDeleteSet();
  for (const [client, intervals] of source.clients) {
    let remaining = intervals.map(interval => ({ clock: interval.clock, len: interval.len }));
    for (const range of excluded) {
      if (range.client !== client) continue;
      const end = range.clock + range.len;
      remaining = remaining.flatMap(interval => {
        const intervalEnd = interval.clock + interval.len;
        if (intervalEnd <= range.clock || interval.clock >= end) return [interval];
        const pieces: { clock: number; len: number }[] = [];
        if (interval.clock < range.clock)
          pieces.push({ clock: interval.clock, len: range.clock - interval.clock });
        if (intervalEnd > end) pieces.push({ clock: end, len: intervalEnd - end });
        return pieces;
      });
    }
    if (remaining.length) result.clients.set(client, remaining);
  }
  return result;
}
