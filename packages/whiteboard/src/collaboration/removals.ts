import type { WhiteboardModelCommand, WhiteboardParent } from "@tau/collaboration";
import { authorElement } from "./projection";
import type { CanvasBinding } from "./binding";

/** 删除集合来自存储子树，并计入本批已经发生的结构变更。 */
export function observeRemovals(
  binding: CanvasBinding,
  commands: readonly WhiteboardModelCommand[],
  pending: readonly WhiteboardModelCommand[] = []
): (ids: readonly string[]) => string[] {
  const parents = new Map<string, WhiteboardParent>();
  const added = new Map<string, Set<string>>();
  const created = new Set<string>();
  const removed = new Set<string>();
  const observe = (command: WhiteboardModelCommand) => {
    if (command.type === "remove_nodes") {
      command.ids.forEach(id => removed.add(id));
      return;
    }
    if (command.type !== "create" && command.type !== "move_node") return;
    const id = command.id;
    if (id === undefined) return;
    if (command.type === "create") created.add(id);
    parents.set(id, command.parent);
    if (command.parent.kind === "element") {
      const children = added.get(command.parent.id) ?? new Set<string>();
      children.add(id);
      added.set(command.parent.id, children);
    }
  };
  pending.forEach(observe);
  let cursor = 0;
  return ids => {
    while (cursor < commands.length) observe(commands[cursor++]);
    const result = new Set<string>();
    const visit = (id: string) => {
      if (result.has(id)) return;
      const node = authorElement(binding, id);
      if (!node && !created.has(id)) throw new Error("删除目标不在协作模型中");
      result.add(id);
      const children = new Set([
        ...(node?.children.map(child => child.id) ?? []),
        ...(added.get(id) ?? []),
      ]);
      for (const child of children) {
        const parent = parents.get(child);
        if (removed.has(child) || (parent && (parent.kind !== "element" || parent.id !== id)))
          continue;
        visit(child);
      }
    };
    ids.forEach(visit);
    return [...result];
  };
}
