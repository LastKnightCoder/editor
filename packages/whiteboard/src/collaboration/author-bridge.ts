import {
  assertWhiteboardJson,
  isSafeResource,
  type WhiteboardModelCommand,
} from "@tau/collaboration";
import { contentResourceSlots, contentResourceValues } from "@tau/db-schema/content-resources";
import type { WhiteboardAuthorBridge, WhiteboardIdCommand } from "../extensions/authorTypes";
import type { WhiteboardContractEntry } from "./catalog";
import { authorSnapshot, flattenModel, authorElement, refresh } from "./projection";
import { assertWritable, entryInstalled } from "./element-access";
import { enterGroup } from "./commands";
import type { CanvasBinding } from "./binding";

export function createAuthorBridge(binding: CanvasBinding): WhiteboardAuthorBridge {
  return {
    getPageId: () => binding.page,
    canWrite: () => {
      try {
        assertWritable(binding, false);
        return true;
      } catch {
        return false;
      }
    },
    getSnapshot: () => {
      const page = binding.model.read().pages.find(page => page.id === binding.page);
      return Object.freeze({
        pageId: binding.page,
        children: Object.freeze(
          [...(page?.children ?? []), ...(page?.recovery ?? [])].map(authorSnapshot)
        ),
      });
    },
    getElement: id => {
      const node = authorElement(binding, id);
      return node && authorSnapshot(node);
    },
    submit: (owner, commands, historyGroup) => submitAuthor(binding, owner, commands, historyGroup),
    getTextBinding: (owner, id, field) => {
      const entry = authorEntry(binding, owner, id, true);
      if (!entry.contract.textFields.includes(field)) throw new Error("文本字段未声明");
      return binding.textField(id, field, true);
    },
  };
}

export function authorEntry(
  binding: CanvasBinding,
  owner: string,
  id: string,
  read = false
): WhiteboardContractEntry {
  const node = authorElement(binding, id),
    entry = node && binding.options.catalog?.get(node.contractId);
  if (
    !node ||
    !entry ||
    !entryInstalled(binding, entry) ||
    (read
      ? entry.access === "none"
      : entry.access !== "edit" || binding.options.canEditContract?.(entry) === false) ||
    !binding.options.catalog!.owns(owner, entry)
  )
    throw new Error("插件不拥有此版本的内部编辑权限");
  return entry;
}

export function submitAuthor(
  binding: CanvasBinding,
  owner: string,
  input: readonly WhiteboardIdCommand[],
  group?: string
) {
  assertWritable(binding, false);
  binding.validating = true;
  try {
    assertWhiteboardJson(input, -4);
    input = structuredClone(input);
  } finally {
    binding.validating = false;
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
      const entry = binding.options.catalog?.current(command.element.type);
      if (
        !entry ||
        !entryInstalled(binding, entry) ||
        binding.options.canEditContract?.(entry) === false ||
        !binding.options.catalog!.owns(owner, entry)
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
      authorEntry(binding, owner, command.id);
      checked.add(command.id);
      commands.push(command);
    } else if (command.type === "set_node") {
      keys(command, ["type", "id", "patch"]);
      keys(command.patch, ["name", "geometry", "style"]);
      const node = authorElement(binding, command.id);
      if (!node) throw new Error("目标已删除");
      const contract = binding.model.contracts.get(node.contractId);
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
              const node = authorElement(binding, id);
              return node ? flattenModel([node]).map(child => child.id) : [id];
            })
          ),
        ],
      });
    } else throw new Error("作者命令不支持");
  }
  binding.validating = true;
  try {
    binding.model.preflight(candidate => {
      const result = candidate.submit(commands, binding.origin, prepared);
      const nodes = flattenModel([
        ...candidate.read().pages.flatMap(page => [...page.children, ...page.recovery]),
        ...candidate.read().recovery,
      ]);
      for (const id of [...checked, ...result.createdIds]) {
        const node = nodes.find(node => node.id === id),
          entry = node && binding.options.catalog?.get(node.contractId);
        if (node && entry) {
          for (const slot of contentResourceSlots(node.data, entry.contract.resources))
            for (const reference of contentResourceValues(slot))
              if (!isSafeResource(reference)) throw new Error("资源须先交由宿主管理");
          binding.options.catalog!.validate(entry, node.data);
        }
      }
    });
  } finally {
    binding.validating = false;
  }
  if (binding.gesture) {
    binding.board?.interactions.cancel();
    binding.endGesture(false);
  }
  enterGroup(binding, group);
  binding.writing = true;
  try {
    return binding.model.submit(commands, binding.origin, prepared);
  } finally {
    binding.writing = false;
    refresh(binding);
  }
}
