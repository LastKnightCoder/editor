import * as Y from "yjs";
import type { WhiteboardModel } from "./whiteboard-model";
import { WhiteboardStructureDraft, type WhiteboardStructure } from "./whiteboard-structure";
import { WHITEBOARD_LIMITS } from "./model-limits";
import { sameWhiteboardParent, whiteboardParentKey } from "./whiteboard-projection";
import type {
  WhiteboardElementSnapshot,
  WhiteboardGeometry,
  WhiteboardModelCommand,
  WhiteboardParent,
  WhiteboardPlacement,
} from "./whiteboard-types";

interface PreparedUpdateContext {
  model: WhiteboardModel;
  base: WhiteboardStructure;
  proof: { revision: number; rootCount: number; upperBytes: number };
  revision(): number;
  active(): void;
  element(id: string): WhiteboardElementSnapshot;
  accept(upperBytes?: number): void;
  invalidate(): void;
}

/** 可信宿主合入已验证候选；不接收外部快照，也不作为远端接纳入口。 */
export function capturePreparedUpdate(
  context: PreparedUpdateContext,
  input: readonly WhiteboardModelCommand[]
) {
  const { model, base, proof } = context,
    doc = model.doc;
  const created = new Set(
    input.flatMap(command => (command.type === "create" && command.id ? [command.id] : []))
  );
  if (
    !input.length ||
    input.some(command => {
      if (command.type === "create") {
        const contract = model.contracts.get(command.contractId);
        return (
          !command.id ||
          command.parent.kind !== "page" ||
          command.body !== undefined ||
          contract?.domain !== "whiteboard-element" ||
          contract.structure.text !== "none"
        );
      }
      if (command.type === "set_node")
        return Object.keys(command.patch).length !== 1 || !command.patch.geometry;
      if (command.type === "edit_text") return !created.has(command.id) || command.field === null;
      return !["move_node", "remove_nodes", "upgrade_column"].includes(command.type);
    })
  )
    return;
  const commands = structuredClone(input);
  const finalGeometries = new Map(
    commands.flatMap(command =>
      command.type === "set_node" && command.patch.geometry
        ? [[command.id, command.patch.geometry] as const]
        : []
    )
  );
  let consumed = false;
  return (write: () => void, origin: unknown) => {
    context.active();
    if (consumed) throw new Error("候选交接只能结算一次");
    consumed = true;
    if (
      doc.gc ||
      doc._transaction ||
      doc._transactionCleanups.length ||
      doc.store.pendingStructs ||
      doc.store.pendingDs
    )
      throw new Error("候选交接基线已失效");
    let expectedState: Uint8Array | undefined,
      expectedDeletes = "",
      transaction: Y.Transaction | undefined;
    let isolated = false,
      deltaBytes = 0,
      validWrites = false;
    const deletionKey = (tx: Y.Transaction) =>
      JSON.stringify([...Y.mergeDeleteSets([tx.deleteSet]).clients]);
    // 覆盖同一字段也会推进时钟，不能只比较字段集合。
    const verify = (tx: Y.Transaction) => {
      if (tx !== transaction || !expectedState) return;
      const state = Y.encodeStateVector(doc);
      isolated =
        validWrites &&
        state.length === expectedState.length &&
        state.every((value, i) => value === expectedState?.[i]) &&
        deletionKey(tx) === expectedDeletes;
    };
    const measure = (update: Uint8Array) => {
      deltaBytes += update.byteLength;
    };
    const allowed = new Map<object, Set<string | null> | null>();
    const permit = (type: object | undefined, key: string | null) => {
      if (!type) return;
      const fields = allowed.get(type) ?? new Set<string | null>();
      fields.add(key);
      allowed.set(type, fields);
    };
    for (const command of commands) {
      if (command.type === "move_node") {
        permit(model.elements.get(command.id), "placement");
        permit(model.orders.get(whiteboardParentKey(command.parent)), null);
      } else if (command.type === "set_node") permit(model.elements.get(command.id), "geometry");
      else if (command.type === "upgrade_column")
        permit(model.elements.get(command.id), "identity");
      else if (command.type === "remove_nodes")
        for (const id of command.ids) {
          const deletions = model.elements.get(id)?.get("deletions");
          if (deletions instanceof Y.Map) allowed.set(deletions, null);
        }
      else if (command.type === "create") {
        permit(model.elements, command.id ?? "");
        permit(model.orders.get(whiteboardParentKey(command.parent)), null);
      }
    }
    doc.on("afterTransaction", verify);
    doc.on("update", measure);
    try {
      doc.transact(tx => {
        if (
          tx.changed.size ||
          tx.deleteSet.clients.size ||
          context.revision() !== proof.revision ||
          doc.share.size !== proof.rootCount
        )
          throw new Error("候选交接基线已失效");
        transaction = tx;
        write();
        const initialized = new Set<object>();
        for (const id of created) {
          const record = model.elements.get(id);
          if (!record) continue;
          initialized.add(record);
          permit(model.creations, String(record.get("creation")));
          const key = whiteboardParentKey({ kind: "element", id });
          permit(model.orders, key);
          const order = model.orders.get(key);
          if (order) initialized.add(order);
          const bindings = record.get(
            "fieldBindings"
          ) as WhiteboardElementSnapshot["fieldBindings"];
          for (const root of Object.values(bindings.data)) {
            permit(model.strings, root);
            const text = model.strings.get(root);
            if (text) initialized.add(text);
          }
        }
        const newType = (type: object) => {
          for (
            let current: unknown = type;
            current instanceof Y.AbstractType;
            current = current._item?.parent
          )
            if (initialized.has(current)) return true;
          return false;
        };
        validWrites = [...tx.changed].every(([type, keys]) => {
          if (newType(type)) return true;
          const fields = allowed.get(type);
          return fields === null || Boolean(fields && [...keys].every(key => fields.has(key)));
        });
        expectedState = Y.encodeStateVector(doc);
        expectedDeletes = deletionKey(tx);
      }, origin);
    } finally {
      doc.off("afterTransaction", verify);
      doc.off("update", measure);
    }
    if (
      isolated &&
      context.revision() === proof.revision &&
      doc.share.size === proof.rootCount &&
      deltaBytes === 0
    )
      return { isolated: true, snapshot: true, capacity: true };
    isolated &&=
      context.revision() === proof.revision + 1 &&
      doc.share.size === proof.rootCount &&
      !doc.store.pendingStructs &&
      !doc.store.pendingDs;
    if (!isolated) {
      context.invalidate();
      return { isolated: false, snapshot: false, capacity: false };
    }
    try {
      const draft = new WhiteboardStructureDraft(base),
        affected = new Map<string, WhiteboardParent>();
      const remember = (parent: WhiteboardParent) =>
        affected.set(whiteboardParentKey(parent), parent);
      for (const command of commands) {
        if (command.type === "create" && command.id) {
          draft.create(context.element(command.id), command.parent, command);
          remember(command.parent);
          remember({ kind: "element", id: command.id });
        } else if (command.type === "move_node") {
          remember(draft.parent(command.id));
          remember(command.parent);
          draft.move(command.id, command.parent, command);
        } else if (command.type === "remove_nodes") {
          command.ids.forEach(id => remember(draft.parent(id)));
          draft.remove(command.ids);
        } else if (command.type === "set_node" && command.patch.geometry) {
          const geometry = model.elements.get(command.id)?.get("geometry") as
            | WhiteboardGeometry
            | undefined;
          const expected = finalGeometries.get(command.id);
          if (
            !geometry ||
            !expected ||
            (["x", "y", "width", "height", "rotation"] as const).some(
              key => geometry[key] !== expected[key]
            )
          )
            throw new Error("候选几何与意图不一致");
          draft.patch(command.id, { geometry: Object.freeze({ ...command.patch.geometry }) });
        } else if (command.type === "upgrade_column") {
          draft.patch(command.id, { contractId: command.contractId });
        }
      }
      if (draft.hasOrphans()) throw new Error("候选包含未处理的子元素");
      const references: string[] = [];
      for (const parent of affected.values()) {
        const order = model.orders.get(whiteboardParentKey(parent));
        if (!order) throw new Error("候选顺序根缺失");
        const entries = order.toArray();
        entries.forEach(ref => references.push(`${ref.id}:${ref.token}`));
        if (parent.kind === "element" && draft.removed.has(parent.id)) continue;
        const actual: string[] = [];
        for (const ref of entries) {
          const record = model.elements.get(ref.id),
            placement = record?.get("placement") as WhiteboardPlacement | undefined;
          if (
            record &&
            placement?.token === ref.token &&
            sameWhiteboardParent(placement.parent, parent) &&
            (record.get("deletions") as Y.Map<unknown>).size === 0 &&
            model.creations.get(String(record.get("creation"))) === true
          )
            actual.push(ref.id);
        }
        const expected = draft.children(parent);
        if (actual.length !== expected.length || actual.some((id, i) => id !== expected[i]))
          throw new Error("候选归属与意图不一致");
      }
      const next = draft.finish(context.revision());
      next.commit();
      references.forEach(reference => base.references.add(reference));
      // 与本机结构入口相同，先证明保守余量，再按真实增量收紧。
      const allowance = commands.reduce(
        (sum, command) => sum + (command.type === "remove_nodes" ? command.ids.length : 1) * 1024,
        0
      );
      const conservative = proof.upperBytes + deltaBytes + allowance;
      const capacity = conservative <= WHITEBOARD_LIMITS.documentBytes;
      context.accept(
        capacity ? Math.min(conservative, proof.upperBytes + deltaBytes + 64) : undefined
      );
      return { isolated: true, snapshot: true, capacity };
    } catch (error) {
      context.invalidate();
      console.warn("候选无法交接增量证明，读取真实状态", error);
      return { isolated: false, snapshot: false, capacity: false };
    }
  };
}
