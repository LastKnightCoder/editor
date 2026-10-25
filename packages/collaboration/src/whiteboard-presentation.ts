import * as Y from "yjs";
import { preserveNodeInitialization } from "./node-tree-history";
import { assertWhiteboardJson } from "./whiteboard-contract";

import type { WhiteboardPresentation } from "./whiteboard-types";

type Ref = { id: string; token: string };
/** 序列和帧的身份保留，删除只写本次标记，播放进度不进入文档。 */
export class WhiteboardPresentations {
  readonly records: Y.Map<Y.Map<unknown>>;
  readonly order: Y.Array<Ref>;
  constructor(
    readonly doc: Y.Doc,
    private readonly creations: Y.Map<boolean>
  ) {
    this.records = doc.getMap("whiteboard:presentations");
    this.order = doc.getArray("whiteboard:presentation-order");
  }
  private visible(record: Y.Map<unknown>): boolean {
    return (
      this.creations.get(String(record.get("creation"))) === true &&
      !(record.get("deletions") as Y.Map<boolean>).size
    );
  }
  private ordered(pool: Y.Map<Y.Map<unknown>>, order: Y.Array<Ref>): [string, Y.Map<unknown>][] {
    return order.toArray().flatMap(ref => {
      const record = pool.get(ref.id);
      return record && record.get("position") === ref.token && this.visible(record)
        ? [[ref.id, record] as [string, Y.Map<unknown>]]
        : [];
    });
  }
  read(): WhiteboardPresentation[] {
    return this.ordered(this.records, this.order).map(([id, record]) => ({
      id,
      name: String(record.get("name")),
      createTime: Number(record.get("createTime")),
      updateTime: Number(record.get("updateTime")),
      frames: this.ordered(
        record.get("frames") as Y.Map<Y.Map<unknown>>,
        record.get("order") as Y.Array<Ref>
      ).map(([id, frame]) => ({
        id,
        elements: structuredClone(frame.get("elements") as string[]),
      })),
    }));
  }
  apply(
    before: readonly WhiteboardPresentation[],
    after: readonly WhiteboardPresentation[],
    token: string,
    transaction: Y.Transaction
  ): void {
    assertWhiteboardJson([before, after]);
    const ids = new Set<string>();
    for (const sequence of after) {
      if (
        !sequence.id ||
        ids.has(sequence.id) ||
        typeof sequence.name !== "string" ||
        !Number.isFinite(sequence.createTime) ||
        !Number.isFinite(sequence.updateTime)
      )
        throw new Error("演示序列无效");
      ids.add(sequence.id);
      for (const frame of sequence.frames) {
        if (
          !frame.id ||
          ids.has(frame.id) ||
          !Array.isArray(frame.elements) ||
          frame.elements.some(id => typeof id !== "string" || !id)
        )
          throw new Error("演示帧无效");
        ids.add(frame.id);
      }
    }
    let index = 0;
    const add = (
      pool: Y.Map<Y.Map<unknown>>,
      order: Y.Array<Ref>,
      id: string,
      values: Record<string, unknown>,
      beforeId?: string
    ) => {
      if (pool.has(id)) throw new Error("演示身份不能复用");
      const creation = `${token}-${index++}`,
        client = this.doc.clientID,
        clock = Y.getState(this.doc.store, client);
      const record = new Y.Map<unknown>();
      record.set("creation", creation);
      record.set("deletions", new Y.Map<boolean>());
      record.set("position", creation);
      for (const [key, value] of Object.entries(values)) record.set(key, value);
      pool.set(id, record);
      const at = beforeId
        ? order
            .toArray()
            .findIndex(
              ref => ref.id === beforeId && ref.token === pool.get(beforeId)?.get("position")
            )
        : -1;
      order.insert(at < 0 ? order.length : at, [{ id, token: creation }]);
      preserveNodeInitialization(transaction, {
        client,
        clock,
        len: Y.getState(this.doc.store, client) - clock,
      });
      this.creations.set(creation, true);
      return record;
    };
    const erase = (pool: Y.Map<Y.Map<unknown>>, id: string) => {
      const record = pool.get(id);
      if (record) (record.get("deletions") as Y.Map<boolean>).set(token, true);
    };
    for (const old of before)
      if (!after.some(item => item.id === old.id)) erase(this.records, old.id);
    for (const [sequenceIndex, value] of after.entries()) {
      const previous = before.find(item => item.id === value.id);
      const record = previous
        ? this.records.get(value.id)
        : add(
            this.records,
            this.order,
            value.id,
            {
              name: value.name,
              createTime: value.createTime,
              updateTime: value.updateTime,
              frames: new Y.Map(),
              order: new Y.Array(),
            },
            after[sequenceIndex + 1]?.id
          );
      if (!record) throw new Error("演示目标已失效");
      const oldOrder = before.filter(item => after.some(next => next.id === item.id));
      const newOrder = after.filter(item => before.some(old => old.id === item.id));
      if (
        previous &&
        oldOrder.findIndex(item => item.id === value.id) !==
          newOrder.findIndex(item => item.id === value.id)
      ) {
        const position = `${token}-${index++}`,
          next = after[sequenceIndex + 1]?.id;
        const anchor = next
          ? this.order
              .toArray()
              .findIndex(
                ref => ref.id === next && ref.token === this.records.get(next)?.get("position")
              )
          : -1;
        const client = this.doc.clientID,
          clock = Y.getState(this.doc.store, client);
        this.order.insert(anchor < 0 ? this.order.length : anchor, [
          { id: value.id, token: position },
        ]);
        preserveNodeInitialization(transaction, {
          client,
          clock,
          len: Y.getState(this.doc.store, client) - clock,
        });
        record.set("position", position);
      }
      if (previous && previous.name !== value.name) record.set("name", value.name);
      if (previous && previous.updateTime !== value.updateTime)
        record.set("updateTime", value.updateTime);
      const pool = record.get("frames") as Y.Map<Y.Map<unknown>>,
        order = record.get("order") as Y.Array<Ref>;
      for (const old of previous?.frames ?? [])
        if (!value.frames.some(item => item.id === old.id)) erase(pool, old.id);
      for (let at = 0; at < value.frames.length; at++) {
        const frame = value.frames[at],
          oldIndex = previous?.frames.findIndex(item => item.id === frame.id) ?? -1;
        const old = previous?.frames[oldIndex];
        const target = old
          ? pool.get(frame.id)
          : add(pool, order, frame.id, { elements: [...frame.elements] }, value.frames[at + 1]?.id);
        if (!target) throw new Error("演示帧已失效");
        if (old && JSON.stringify(old.elements) !== JSON.stringify(frame.elements))
          target.set("elements", [...frame.elements]);
        const oldFrames = (previous?.frames ?? []).filter(item =>
          value.frames.some(next => next.id === item.id)
        );
        const newFrames = value.frames.filter(item =>
          previous?.frames.some(old => old.id === item.id)
        );
        if (
          old &&
          oldFrames.findIndex(item => item.id === frame.id) !==
            newFrames.findIndex(item => item.id === frame.id)
        ) {
          const position = `${token}-${index++}`;
          const next = value.frames[at + 1]?.id;
          const refs = order.toArray();
          const anchor = next
            ? refs.findIndex(
                ref => ref.id === next && ref.token === pool.get(next)?.get("position")
              )
            : -1;
          const client = this.doc.clientID,
            clock = Y.getState(this.doc.store, client);
          order.insert(anchor < 0 ? order.length : anchor, [{ id: frame.id, token: position }]);
          preserveNodeInitialization(transaction, {
            client,
            clock,
            len: Y.getState(this.doc.store, client) - clock,
          });
          target.set("position", position);
        }
      }
    }
  }
  validate(): void {
    const seen = new Set<string>();
    const check = (pool: Y.Map<Y.Map<unknown>>, order: Y.Array<Ref>, sequence: boolean) => {
      if (!(pool instanceof Y.Map) || !(order instanceof Y.Array) || pool._start || order._map.size)
        throw new Error("演示根格式无效");
      const positions = new Set<string>();
      for (const ref of order.toArray()) {
        if (
          !ref ||
          Object.keys(ref).some(key => !["id", "token"].includes(key)) ||
          !pool.has(ref.id) ||
          typeof ref.token !== "string" ||
          positions.has(`${ref.id}:${ref.token}`)
        )
          throw new Error("演示顺序无效");
        positions.add(`${ref.id}:${ref.token}`);
      }
      for (const [id, record] of pool) {
        const allowed = sequence
          ? [
              "creation",
              "deletions",
              "position",
              "name",
              "createTime",
              "updateTime",
              "frames",
              "order",
            ]
          : ["creation", "deletions", "position", "elements"];
        if (
          !id ||
          id.length > 256 ||
          seen.has(id) ||
          !(record instanceof Y.Map) ||
          record._start ||
          [...record.keys()].some(key => !allowed.includes(key)) ||
          typeof record.get("creation") !== "string" ||
          !positions.has(`${id}:${record.get("position")}`) ||
          !(record.get("deletions") instanceof Y.Map)
        )
          throw new Error("演示记录无效");
        seen.add(id);
        for (const [key, value] of record.get("deletions") as Y.Map<boolean>)
          if (!key || value !== true) throw new Error("演示删除标记无效");
        if (sequence) {
          if (
            typeof record.get("name") !== "string" ||
            !Number.isFinite(record.get("createTime")) ||
            !Number.isFinite(record.get("updateTime"))
          )
            throw new Error("演示属性无效");
          check(
            record.get("frames") as Y.Map<Y.Map<unknown>>,
            record.get("order") as Y.Array<Ref>,
            false
          );
        } else {
          const elements = record.get("elements");
          if (
            !Array.isArray(elements) ||
            new Set(elements).size !== elements.length ||
            elements.some(id => typeof id !== "string" || !id || id.length > 256)
          )
            throw new Error("演示引用无效");
        }
      }
    };
    check(this.records, this.order, true);
  }
  assertStable(previous: WhiteboardPresentations): void {
    const same = (a: unknown, b: unknown) =>
      a instanceof Y.AbstractType &&
      b instanceof Y.AbstractType &&
      a._item?.id.client === b._item?.id.client &&
      a._item?.id.clock === b._item?.id.clock;
    const check = (old: Y.Map<Y.Map<unknown>>, next: Y.Map<Y.Map<unknown>>, sequence: boolean) => {
      for (const [id, record] of old) {
        const current = next.get(id);
        if (
          !current ||
          !same(record, current) ||
          record.get("creation") !== current.get("creation") ||
          !same(record.get("deletions"), current.get("deletions"))
        )
          throw new Error("不能重建演示身份");
        if (sequence) {
          if (
            !same(record.get("frames"), current.get("frames")) ||
            !same(record.get("order"), current.get("order"))
          )
            throw new Error("不能重建演示顺序根");
          check(
            record.get("frames") as Y.Map<Y.Map<unknown>>,
            current.get("frames") as Y.Map<Y.Map<unknown>>,
            false
          );
        }
      }
    };
    check(previous.records, this.records, true);
  }
}
