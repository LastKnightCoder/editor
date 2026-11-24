import { exportWhiteboardTransfer, prepareWhiteboardTransfer } from "@tau/collaboration";
import type { BoardElement } from "../types/element";
import { flatten, refresh } from "./projection";
import { assertWritable, canEditElement } from "./element-access";
import { enterGroup } from "./commands";
import type { CanvasBinding } from "./binding";

export function createContentCopy(binding: CanvasBinding, id: string): Promise<number> {
  assertWritable(binding);
  if (!canEditElement(binding, id) || !binding.options.createContentCopy)
    throw new Error("无法复制此正文");
  return binding.options.createContentCopy(id);
}

export function pages(binding: CanvasBinding) {
  return binding.model.read().pages.map(page => ({ id: page.id, title: page.title }));
}

export async function duplicatePage(binding: CanvasBinding, pageId: string): Promise<string> {
  assertWritable(binding);
  const bundle = binding.exportTransfer();
  const page = bundle.pages.find(page => page.id === pageId);
  if (!page) throw new Error("原页面不存在");
  const ids = flatten(page.elements as unknown as BoardElement[]).map(node => node.id);
  const selected = ids.length
    ? binding.exportTransfer(ids)
    : { ...bundle, resources: [], presentations: [] };
  selected.pages = [{ ...page, title: `${page.title} 副本` }];
  const [created] = await binding.importTransfer(selected, true);
  if (!created) throw new Error("复制页面失败");
  console.info("[whiteboard-edit] 复制页面完成", {
    documentId: binding.options.documentId,
    pageId,
    createdPageId: created,
  });
  return created;
}

export function exportTransfer(binding: CanvasBinding, ids?: readonly string[]) {
  return exportWhiteboardTransfer(
    binding.model,
    binding.options.documentId ?? String(binding.model.doc.getMap("meta").get("documentId") ?? ""),
    ids
  );
}

export async function exportFile(binding: CanvasBinding, ids?: readonly string[]): Promise<Blob> {
  const bundle = binding.exportTransfer(ids);
  const assets: NonNullable<typeof bundle.assets> = [];
  let bytes = 0;
  for (const reference of bundle.resources.filter(ref => ref.startsWith("tau-collab-"))) {
    if (!binding.options.readResource) throw new Error("资源不可读取，未生成不完整白板包");
    const file = await binding.options.readResource(reference);
    bytes += file.bytes.byteLength;
    if (bytes > 16 * 1024 * 1024) throw new Error("资源包超过 16 MiB 导出预算");
    let binary = "";
    for (let at = 0; at < file.bytes.length; at += 8192)
      binary += String.fromCharCode(...file.bytes.subarray(at, at + 8192));
    assets.push({ reference, name: file.name, mime: file.mime, base64: btoa(binary) });
  }
  return new Blob([JSON.stringify({ ...bundle, assets })], { type: "application/json" });
}

export async function importTransfer(
  binding: CanvasBinding,
  bundle: import("@tau/collaboration").WhiteboardTransfer,
  allPages = false
): Promise<readonly string[]> {
  const board = assertWritable(binding),
    valid = board.captureSubmission();
  const page = binding.page;
  const plan = await prepareWhiteboardTransfer(binding.model, bundle, {
    ...(allPages ? {} : { pageId: page }),
    targetDocumentId:
      binding.options.documentId ??
      String(binding.model.doc.getMap("meta").get("documentId") ?? ""),
    knownContractIds: new Set(Object.values(binding.options.types).map(type => type.contractId)),
    importResource: async (reference, source) => {
      const file = bundle.assets?.find(file => file.reference === reference);
      if (file && binding.options.uploadResource) {
        if (
          file.base64.length > 24 * 1024 * 1024 ||
          typeof file.name !== "string" ||
          typeof file.mime !== "string"
        )
          throw new Error("资源包格式或预算无效");
        const binary = atob(file.base64),
          bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
        return binding.options.uploadResource({ name: file.name, mime: file.mime, bytes });
      }
      if (!binding.options.importResource) throw new Error("资源尚未取得源与目标文档权限");
      return binding.options.importResource(reference, source);
    },
  });
  if (!valid() || binding.page !== page) throw new Error("导入目标已变化，原内容未改变");
  assertWritable(binding);
  enterGroup(binding);
  binding.writing = true;
  try {
    binding.model.submitChunks(plan.commands, binding.origin, plan.prepared, plan.initialBodies);
  } finally {
    binding.writing = false;
    refresh(binding);
  }
  console.info("[whiteboard-edit] 批量导入完成", {
    documentId: binding.options.documentId,
    pageId: page,
    allPages,
    commands: plan.commands.length,
    elements: plan.ids.size,
    richTextBodies: plan.initialBodies.length,
  });
  if (!allPages) {
    const ids = new Set(
      bundle.pages.flatMap(page => page.elements).map(node => plan.ids.get(node.id))
    );
    board.apply(
      {
        type: "set_selection",
        properties: board.selection,
        newProperties: {
          selectedElements: board.children.filter(node => ids.has(node.id)),
          selectArea: null,
        },
      },
      false
    );
  }
  return plan.commands.flatMap(command =>
    command.type === "create_page" && command.id ? [command.id] : []
  );
}
