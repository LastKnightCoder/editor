import * as Y from "yjs";
import {
  ASSET_PREFIX,
  WhiteboardModel,
  createWhiteboardBaseline,
  exportWhiteboardTransfer,
} from "@tau/collaboration";
import type { CollaborationAssetService } from "../collaboration/asset-service";
import { mapTransferResources } from "./transitions";

/**
 * close：作者结束共享；leave：成员退出；detach：共享已结束或权限已撤销后只保全本机已有内容。
 * 三种方式都把白板留在本机，改为不带共享身份的本机文档。
 */
export type WhiteboardUnshareMode = "close" | "leave" | "detach";
export interface WhiteboardUnshareJob {
  operationId: string;
  mode: WhiteboardUnshareMode;
  serverUrl: string;
  roomId: string;
  /** 已确认的远端修订；结束共享以它为条件，避免丢掉此后到达的他人编辑。 */
  revision?: string;
  candidate?: string;
  /** 固定候选对应的本机修订，重试不得采用后来写入的内容作为安装前提。 */
  sourceHash?: string;
  missing: string[];
  /** 服务端已关闭房间或已退出，只能继续本机安装。 */
  remoteDone?: boolean;
}

/**
 * 从本机副本与远端确认合并出本机候选：托管资产在仍有权限时下载并转存为本机引用；
 * detach 只使用已缓存的文件，取不到的引用原样保留并记为缺失，不伪造完整副本。
 */
export async function prepareUnshareCandidate(
  input: {
    local: Uint8Array;
    confirmed?: Uint8Array;
    documentId: string;
    roomId: string;
    serverUrl: string;
    mode: WhiteboardUnshareMode;
  },
  assets: CollaborationAssetService
): Promise<{ candidate: Uint8Array; missing: string[] }> {
  const doc = new Y.Doc({ gc: false });
  Y.applyUpdate(doc, input.local);
  if (input.confirmed) Y.applyUpdate(doc, input.confirmed);
  const model = new WhiteboardModel(doc);
  try {
    const snapshot = model.read();
    if (snapshot.recovery.length || snapshot.pages.some(page => page.recovery.length))
      throw new Error("白板恢复区还有待确认归属的元素，请先处理后再结束共享");
    const bundle = exportWhiteboardTransfer(model, input.documentId);
    const mappings: Record<string, string> = {},
      missing: string[] = [];
    for (const reference of bundle.resources) {
      if (!reference.startsWith("tau-collab-")) continue;
      const hosted = reference.startsWith(ASSET_PREFIX);
      try {
        const file = await assets.readTransferFile(
          hosted && input.mode !== "detach" ? input.serverUrl : "",
          input.roomId,
          reference
        );
        mappings[reference] = await assets.keepLocalFile(input.documentId, file);
      } catch (error) {
        if (hosted && input.mode !== "detach")
          throw new Error(
            `图片下载失败，共享没有结束，白板内容保持不变：${error instanceof Error ? error.message : String(error)}`
          );
        missing.push(reference);
      }
    }
    const candidate = await createWhiteboardBaseline(mapTransferResources(bundle, mappings));
    try {
      return { candidate: Y.encodeStateAsUpdate(candidate), missing };
    } finally {
      candidate.destroy();
    }
  } finally {
    model.dispose();
    doc.destroy();
  }
}
