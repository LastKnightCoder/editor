import * as Y from "yjs";
import {
  WhiteboardModel,
  type DocumentOperation,
  type WhiteboardModelCommand,
} from "@tau/collaboration";
import { refresh } from "./projection";
import { assertWritable, canEditElement } from "./element-access";
import type { CanvasBinding } from "./binding";

/** 宿主条件提案只覆盖文本和用户几何，等待结果期间冻结本视图写入口。 */
export function beginConditional(
  binding: CanvasBinding,
  operationId: string,
  commands: readonly WhiteboardModelCommand[]
): Uint8Array {
  assertWritable(binding, false);
  if (
    binding.completedConditions.has(operationId) ||
    !operationId ||
    commands.some(
      command =>
        command.type !== "edit_text" &&
        command.type !== "edit_title" &&
        command.type !== "edit_page_title" &&
        !(
          command.type === "set_node" && Object.keys(command.patch).every(key => key === "geometry")
        )
    )
  )
    throw new Error("条件提案包含不支持的操作");
  for (const command of commands)
    if (command.type === "edit_text" && !canEditElement(binding, command.id))
      throw new Error("条件提案目标版本不可编辑");
  binding.board?.interactions.cancel();
  binding.endGesture(false);
  const doc = new Y.Doc({ gc: false });
  Y.applyUpdate(doc, Y.encodeStateAsUpdate(binding.model.doc));
  const candidate = new WhiteboardModel(doc),
    vector = Y.encodeStateVector(doc);
  try {
    candidate.submit(commands, null);
    const update = Y.encodeStateAsUpdate(doc, vector);
    binding.conditional = { id: operationId, update, buffered: [] };
    return update.slice();
  } finally {
    candidate.dispose();
    doc.destroy();
  }
}

export async function receiveDocument(binding: CanvasBinding, update: Uint8Array): Promise<void> {
  if (binding.closed) throw new Error("白板视图已释放");
  if (binding.conditional) {
    const bytes = binding.conditional.buffered.reduce((sum, value) => sum + value.byteLength, 0);
    if (bytes + update.byteLength > 8 * 1024 * 1024)
      throw new Error("条件等待期间远端缓冲已满，请保留提案并重连");
    binding.conditional.buffered.push(update.slice());
  } else await binding.model.receive(update);
}

export async function finishConditional(
  binding: CanvasBinding,
  operation: DocumentOperation
): Promise<void> {
  if (binding.closed) throw new Error("白板视图已释放，回执保留给宿主恢复");
  if (binding.completedConditions.has(operation.operationId)) return;
  const pending = binding.conditional;
  if (!pending || pending.id !== operation.operationId)
    throw new Error("条件回执没有对应的本机提案");
  const hash = [
    ...new Uint8Array(await crypto.subtle.digest("SHA-256", Uint8Array.from(pending.update))),
  ]
    .map(x => x.toString(16).padStart(2, "0"))
    .join("");
  if (binding.completedConditions.has(operation.operationId)) return;
  if (hash !== operation.updateHash) throw new Error("条件回执候选不匹配");
  if (operation.state === "PENDING") return;
  if (operation.state === "COMMITTED") {
    if (!operation.receipt) throw new Error("条件回执未确认耐久提交");
    binding.splitHistory();
    binding.writing = true;
    try {
      Y.applyUpdate(binding.model.doc, pending.update, binding.origin);
    } finally {
      binding.writing = false;
      binding.splitHistory();
    }
  }
  binding.completedConditions.add(pending.id);
  binding.conditional = undefined;
  for (const update of pending.buffered) await binding.model.receive(update);
  refresh(binding);
}
