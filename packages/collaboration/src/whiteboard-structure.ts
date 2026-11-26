import type {
  WhiteboardElementSnapshot,
  WhiteboardParent,
  WhiteboardSnapshot,
  WhiteboardAnchor,
  WhiteboardGeometry,
} from "./whiteboard-types";
import { whiteboardParentKey, sameWhiteboardParent } from "./whiteboard-projection";

/** 已验证且没有恢复节点的结构索引。草稿只复制发生变化的兄弟列表。 */
export class WhiteboardStructure {
  readonly nodes = new Map<string, WhiteboardElementSnapshot>();
  readonly parents = new Map<string, WhiteboardParent>();
  readonly roots = new Set<string>();
  readonly references = new Set<string>();
  private pendingNodes = new Map<string, WhiteboardElementSnapshot>();
  constructor(
    public snapshot: WhiteboardSnapshot,
    public revision: number
  ) {
    const visit = (nodes: readonly WhiteboardElementSnapshot[], parent: WhiteboardParent) => {
      for (const node of nodes) {
        this.nodes.set(node.id, node);
        this.parents.set(node.id, parent);
        Object.values(node.fieldBindings.data).forEach(root => this.roots.add(root));
        if (node.fieldBindings.body) this.roots.add(node.fieldBindings.body.rootId);
        visit(node.children, { kind: "element", id: node.id });
      }
    };
    for (const page of snapshot.pages) visit(page.children, { kind: "page", id: page.id });
  }

  updateGeometries(
    values: readonly { id: string; geometry: WhiteboardGeometry }[],
    revision: number
  ) {
    const geometries = new Map(values.map(value => [value.id, value.geometry]));
    const dirty = new Set<string>(),
      pages = new Set<string>();
    for (const { id } of values) {
      dirty.add(id);
      let parent = this.parents.get(id);
      while (parent?.kind === "element" && !dirty.has(parent.id)) {
        dirty.add(parent.id);
        parent = this.parents.get(parent.id);
      }
      if (parent?.kind === "page") pages.add(parent.id);
    }
    const patch = (node: WhiteboardElementSnapshot): WhiteboardElementSnapshot => {
      if (!dirty.has(node.id)) return node;
      const geometry = geometries.get(node.id);
      const children = node.children.length
        ? Object.freeze(node.children.map(patch))
        : node.children;
      const next = Object.freeze({
        ...node,
        ...(geometry
          ? { geometry: Object.isFrozen(geometry) ? geometry : Object.freeze({ ...geometry }) }
          : {}),
        children,
      });
      this.pendingNodes.set(node.id, next);
      return next;
    };
    this.snapshot = Object.freeze({
      ...this.snapshot,
      pages: Object.freeze(
        this.snapshot.pages.map(page =>
          pages.has(page.id)
            ? Object.freeze({ ...page, children: Object.freeze(page.children.map(patch)) })
            : page
        )
      ),
    });
    this.revision = revision;
  }

  flushGeometryIndex() {
    this.pendingNodes.forEach((node, id) => this.nodes.set(id, node));
    this.pendingNodes.clear();
  }
}

export class WhiteboardStructureDraft {
  readonly changed = new Map<string, WhiteboardElementSnapshot>();
  readonly parents = new Map<string, WhiteboardParent>();
  readonly removed = new Set<string>();
  private lists = new Map<string, string[]>();
  private dirty = new Set<string>();
  private dirtyPages = new Set<string>();
  constructor(readonly base: WhiteboardStructure) {
    base.flushGeometryIndex();
  }
  node(id: string) {
    const node = !this.removed.has(id) && (this.changed.get(id) ?? this.base.nodes.get(id));
    if (!node) throw new Error("白板目标已删除或不存在");
    return node;
  }
  parent(id: string): WhiteboardParent {
    const parent = this.parents.get(id) ?? this.base.parents.get(id);
    if (!parent || this.removed.has(id)) throw new Error("白板父级不存在");
    return parent;
  }
  children(parent: WhiteboardParent): readonly string[] {
    return (
      this.lists.get(whiteboardParentKey(parent)) ??
      (parent.kind === "page"
        ? (this.base.snapshot.pages.find(page => page.id === parent.id)?.children ?? [])
        : this.node(parent.id).children
      ).map(node => node.id)
    );
  }
  private list(parent: WhiteboardParent) {
    const key = whiteboardParentKey(parent);
    let list = this.lists.get(key);
    if (!list) {
      list = [...this.children(parent)];
      this.lists.set(key, list);
    }
    return list;
  }
  private mark(parent: WhiteboardParent) {
    while (parent.kind === "element") {
      this.dirty.add(parent.id);
      parent = this.parent(parent.id);
    }
    this.dirtyPages.add(parent.id);
  }
  destination(parent: WhiteboardParent, moving?: string): { page: string; depth: number } {
    let current = parent,
      depth = 0;
    while (current.kind === "element") {
      if (current.id === moving) throw new Error("白板移动形成循环");
      this.node(current.id);
      depth++;
      current = this.parent(current.id);
    }
    if (!this.base.snapshot.pages.some(page => page.id === current.id))
      throw new Error("白板目标页面不存在");
    return { page: current.id, depth };
  }
  height(id: string): number {
    const children = this.children({ kind: "element", id });
    return children.length ? 1 + Math.max(...children.map(child => this.height(child))) : 1;
  }
  anchor(parent: WhiteboardParent, anchor: WhiteboardAnchor, moving?: string) {
    if (anchor.beforeId !== undefined && anchor.afterId !== undefined)
      throw new Error("白板锚点互斥");
    const target = anchor.beforeId ?? anchor.afterId;
    if (target === undefined) return;
    if (target === moving) throw new Error("白板锚点不能是自身");
    this.node(target);
    if (!sameWhiteboardParent(this.parent(target), parent)) throw new Error("白板锚点不在目标父级");
  }
  private insert(id: string, parent: WhiteboardParent, anchor: WhiteboardAnchor) {
    const list = this.list(parent),
      target = anchor.beforeId ?? anchor.afterId;
    const at =
      target === undefined
        ? list.length
        : list.indexOf(target) + (anchor.afterId === undefined ? 0 : 1);
    if (at < 0) throw new Error("白板锚点失效");
    list.splice(at, 0, id);
    this.parents.set(id, parent);
    this.mark(parent);
  }
  create(node: WhiteboardElementSnapshot, parent: WhiteboardParent, anchor: WhiteboardAnchor) {
    this.anchor(parent, anchor);
    this.changed.set(node.id, node);
    this.dirty.add(node.id);
    this.insert(node.id, parent, anchor);
  }
  move(id: string, parent: WhiteboardParent, anchor: WhiteboardAnchor) {
    this.anchor(parent, anchor, id);
    const previous = this.parent(id);
    const list = this.list(previous),
      at = list.indexOf(id);
    if (at < 0) throw new Error("白板移动目标不在原父级");
    list.splice(at, 1);
    this.mark(previous);
    this.insert(id, parent, anchor);
  }
  patch(id: string, patch: Partial<WhiteboardElementSnapshot>) {
    this.changed.set(id, Object.freeze({ ...this.node(id), ...patch }));
    this.dirty.add(id);
    this.mark(this.parent(id));
  }
  remove(ids: readonly string[]) {
    for (const id of ids) {
      const parent = this.parent(id),
        list = this.list(parent);
      const at = list.indexOf(id);
      if (at < 0) throw new Error("白板删除目标不在原父级");
      list.splice(at, 1);
      this.mark(parent);
    }
    ids.forEach(id => this.removed.add(id));
  }
  hasOrphans() {
    for (const id of this.removed)
      if (this.childrenOfRemoved(id).some(child => !this.removed.has(child))) return true;
    return false;
  }
  private childrenOfRemoved(id: string) {
    return (
      this.lists.get(whiteboardParentKey({ kind: "element", id })) ??
      (this.changed.get(id) ?? this.base.nodes.get(id))?.children.map(node => node.id) ??
      []
    );
  }
  finish(revision: number) {
    const rebuilt = new Map<string, WhiteboardElementSnapshot>();
    const build = (id: string): WhiteboardElementSnapshot => {
      const old = this.node(id);
      if (!this.dirty.has(id)) return old;
      const children =
        old.children.length || this.lists.has(whiteboardParentKey({ kind: "element", id }))
          ? this.children({ kind: "element", id }).map(build)
          : old.children;
      const node =
        children.length === old.children.length &&
        children.every((child, index) => child === old.children[index])
          ? old
          : Object.freeze({ ...old, children: Object.freeze(children) });
      rebuilt.set(id, node);
      return node;
    };
    const snapshot = Object.freeze({
      ...this.base.snapshot,
      pages: Object.freeze(
        this.base.snapshot.pages.map(page =>
          this.dirtyPages.has(page.id)
            ? Object.freeze({
                ...page,
                children: Object.freeze(this.children({ kind: "page", id: page.id }).map(build)),
              })
            : page
        )
      ),
    });
    return {
      snapshot,
      commit: () => {
        this.removed.forEach(id => {
          this.base.nodes.delete(id);
          this.base.parents.delete(id);
        });
        rebuilt.forEach((node, id) => this.base.nodes.set(id, node));
        this.changed.forEach(node =>
          Object.values(node.fieldBindings.data).forEach(root => this.base.roots.add(root))
        );
        this.parents.forEach((parent, id) => {
          if (!this.removed.has(id)) this.base.parents.set(id, parent);
        });
        this.base.snapshot = snapshot;
        this.base.revision = revision;
      },
    };
  }
}
