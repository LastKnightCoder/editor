import * as Y from "yjs";
import { preserveNodeInitialization } from "./node-tree-history";

export interface SegmentReference {
  segment: string;
  token: string;
}
type FlowReference = SegmentReference | { merge: string; token: string };

interface SegmentPlacement {
  parent: string;
  token: string;
}
export interface TextSegment {
  id: string;
  source: string;
  start: number;
  end: number;
  reference: SegmentReference;
}

/** 分界标记保留原文字身份；归属变化与初始化分开进入历史。 */
export class TextSegments {
  private index?: { children: Map<string, SegmentReference[]>; sources: Map<string, string[]> };
  private rangeCache = new Map<string, Map<string, { start: number; end: number }>>();
  private readonly invalidateIndex = () => {
    this.index = undefined;
    this.clearRanges();
  };
  constructor(
    readonly records: Y.Map<Y.Map<unknown>>,
    private readonly node: (id: string) => Y.Map<unknown>,
    private readonly content: (id: string) => Y.XmlText,
    private readonly owner: (id: string) => string,
    private readonly mergeTarget: (id: string) => string | undefined
  ) {
    records.observeDeep(this.invalidateIndex);
  }

  dispose(): void {
    this.records.unobserveDeep(this.invalidateIndex);
    this.invalidateIndex();
  }
  clearRanges(): void {
    this.rangeCache.clear();
  }

  private getIndex() {
    if (this.index) return this.index;
    const children = new Map<string, SegmentReference[]>(),
      sources = new Map<string, string[]>();
    for (const [id, record] of this.records) {
      const base = record.get("base") as { parentSegment?: string; token: string };
      if (base.parentSegment) {
        const entries = children.get(base.parentSegment) ?? [];
        entries.push({ segment: id, token: base.token });
        children.set(base.parentSegment, entries);
      }
      const source = this.source(id),
        ids = sources.get(source) ?? [];
      ids.push(id);
      sources.set(source, ids);
    }
    return (this.index = { children, sources });
  }

  owners(source: string, changes?: readonly { start: number; end: number }[]): Set<string> {
    const ranges = changes && this.ranges(source);
    return new Set(
      (this.getIndex().sources.get(source) ?? [])
        .filter(id => {
          const range = ranges?.get(id);
          return (
            !changes ||
            (range &&
              changes.some(change => change.start <= range.end && change.end >= range.start))
          );
        })
        .map(id => this.placement(id).parent)
    );
  }

  flow(id: string): Y.Array<FlowReference> {
    const flow = this.node(id).get("flow");
    if (!(flow instanceof Y.Array)) throw new Error("正文片段序列无效");
    return flow;
  }

  initialize(id: string): void {
    this.invalidateIndex();
    this.node(id).set("flow", new Y.Array<FlowReference>());
    const token = crypto.randomUUID();
    const record = new Y.Map<unknown>();
    record.set("source", id);
    record.set("base", { parent: id, token });
    this.records.set(id, record);
    this.flow(id).push([{ segment: id, token }]);
  }

  placement(id: string): SegmentPlacement {
    const visited = new Set<string>();
    let current = id;
    let token: string | undefined;
    while (!visited.has(current)) {
      visited.add(current);
      const record = this.records.get(current);
      const value = (record?.get("placement") ?? record?.get("base")) as
        | { parent?: string; parentSegment?: string; token?: string }
        | undefined;
      if (!value || typeof value.token !== "string") throw new Error("正文片段归属无效");
      token ??= value.token;
      if (typeof value.parent === "string") return { parent: this.owner(value.parent), token };
      if (typeof value.parentSegment !== "string") throw new Error("正文片段继承无效");
      current = value.parentSegment;
    }
    throw new Error("正文片段归属循环");
  }

  source(id: string): string {
    const source = this.records.get(id)?.get("source");
    if (typeof source !== "string") throw new Error("正文片段来源无效");
    return source;
  }

  ranges(source: string): Map<string, { start: number; end: number }> {
    const cached = this.rangeCache.get(source);
    if (cached) return cached;
    const ranges = new Map<string, { start: number; end: number }>();
    let id = source,
      start = 0,
      offset = 0;
    for (const delta of this.content(source).toDelta()) {
      const value = delta.insert;
      if (value && typeof value === "object" && typeof value.cut === "string") {
        if (this.source(value.cut) !== source || ranges.has(value.cut))
          throw new Error("正文片段分界无效");
        ranges.set(id, { start, end: offset });
        id = value.cut;
        start = offset + 1;
      }
      offset += typeof value === "string" ? value.length : 1;
    }
    ranges.set(id, { start, end: offset });
    this.rangeCache.set(source, ranges);
    return ranges;
  }

  list(parent: string, includeInactive = false): TextSegment[] {
    const ranges = new Map<string, ReturnType<TextSegments["ranges"]>>();
    const range = (id: string) => {
      const source = this.source(id);
      if (!ranges.has(source)) ranges.set(source, this.ranges(source));
      const value = ranges.get(source)!.get(id);
      if (!value) throw new Error("正文片段缺少分界");
      return { source, ...value };
    };
    const children = this.getIndex().children;
    const result: TextSegment[] = [];
    const visited = new Set<string>();
    const visit = (ref: SegmentReference) => {
      if (visited.has(ref.token)) return;
      visited.add(ref.token);
      const placement = this.placement(ref.segment);
      if (!includeInactive && (placement.parent !== parent || placement.token !== ref.token))
        return;
      result.push({ id: ref.segment, reference: ref, ...range(ref.segment) });
      const next = (children.get(ref.segment) ?? []).filter(
        child => includeInactive || !this.records.get(child.segment)!.has("placement")
      );
      next.sort((a, b) => range(a.segment).start - range(b.segment).start);
      next.forEach(visit);
    };
    const flows = new Set<string>();
    const visitFlow = (id: string) => {
      if (flows.has(id)) return;
      flows.add(id);
      for (const ref of this.flow(id).toArray()) {
        if ("merge" in ref) {
          if (this.mergeTarget(ref.merge) === id) visitFlow(ref.merge);
        } else visit(ref);
      }
    };
    visitFlow(parent);
    return result;
  }

  cut(segment: TextSegment, at: number, transaction: Y.Transaction): string {
    this.invalidateIndex();
    if (at < segment.start || at > segment.end) throw new Error("正文分界超出片段");
    const id = crypto.randomUUID(),
      token = crypto.randomUUID();
    const client = transaction.doc.clientID,
      clock = Y.getState(transaction.doc.store, client);
    const record = new Y.Map<unknown>();
    record.set("source", segment.source);
    record.set("base", { parentSegment: segment.id, token });
    this.records.set(id, record);
    this.content(segment.source).insertEmbed(at, { cut: id });
    preserveNodeInitialization(transaction, {
      client,
      clock,
      len: Y.getState(transaction.doc.store, client) - clock,
    });
    return id;
  }

  move(ids: readonly string[], parent: string): void {
    const refs = ids.map(id => ({ segment: id, token: crypto.randomUUID() }));
    this.flow(parent).push(refs);
    for (const ref of refs)
      this.records.get(ref.segment)!.set("placement", { parent, token: ref.token });
  }

  merge(source: string, target: string): void {
    this.flow(target).push([{ merge: source, token: crypto.randomUUID() }]);
  }
}
