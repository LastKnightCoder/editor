import {
  exportWhiteboardTransfer,
  whiteboardTransferResources,
  type WhiteboardModel,
  type WhiteboardTransfer,
} from "@tau/collaboration";
import type { WhiteboardContractCatalog } from "./catalog";

/** 宿主预览整板转换，作者函数只接收业务载荷。 */
export function prepareWhiteboardVersionUpgrade(
  model: WhiteboardModel,
  documentId: string,
  catalog: WhiteboardContractCatalog,
  elementIds: readonly string[]
): WhiteboardTransfer {
  const snapshot = model.read();
  if (snapshot.recovery.length || snapshot.pages.some(page => page.recovery.length))
    throw new Error("请先处理恢复区归属，再转换元素版本");
  const bundle = exportWhiteboardTransfer(model, documentId);
  const selected = new Set(elementIds),
    found = new Set<string>();
  if (!selected.size || selected.size !== elementIds.length) throw new Error("转换范围为空或重复");
  const visit = (
    node: WhiteboardTransfer["pages"][number]["elements"][number]
  ): WhiteboardTransfer["pages"][number]["elements"][number] => {
    let result = node;
    if (selected.has(node.id)) {
      const next = catalog.migrate(node.contractId, node.data);
      const entry = catalog.get(next.contractId)!;
      bundle.contracts = { ...bundle.contracts, [entry.id]: entry.contract };
      result = { ...node, contractId: entry.id, data: next.data as typeof node.data };
      found.add(node.id);
    }
    return { ...result, children: node.children.map(visit) };
  };
  bundle.pages = bundle.pages.map(page => ({ ...page, elements: page.elements.map(visit) }));
  if (found.size !== selected.size) throw new Error("转换目标已删除或不在当前投影");
  bundle.resources = whiteboardTransferResources(bundle);
  return bundle;
}
