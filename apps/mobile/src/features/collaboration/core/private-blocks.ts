// 私有块（白板/数据库等）的真身保留在数据持有方本机，云端只存 collaboration-placeholder
// 占位符。本模块负责两端的对应关系：收集占位符/真身、按 collabId 精确恢复。
// 对应关系只认 collabId 标注一种来源：无标注（首次投影未完成）时不做树位置猜测对齐——
// 同类型多块时按位对齐可能静默错位，宁可直接判冲突引导重新发起。
import { PRIVATE_BLOCKS, readSharedContent } from "@tau/collaboration/src/document";
import type { ContentNode } from "@tau/collaboration";
import type * as Y from "yjs";
import * as tauri from "../../../services/tauri";

/** 云端树中的占位符（collabId + 原块类型 label），按 DFS 顺序收集 */
function collectPlaceholders(nodes: ContentNode[], into: { id: string; label: string }[]) {
  for (const node of nodes) {
    if (node.type === "collaboration-placeholder" && typeof node.collabId === "string") {
      into.push({ id: node.collabId, label: String(node.label ?? "") });
    }
    if (Array.isArray(node.children)) collectPlaceholders(node.children, into);
  }
}

export function collectPlaceholderIds(nodes: ContentNode[]): string[] {
  const found: { id: string; label: string }[] = [];
  collectPlaceholders(nodes, found);
  return found.map(item => item.id);
}

/** 本地树中的私有块真身（可能带协作标注 collabId，也可能未标注），按 DFS 顺序收集 */
function collectPrivateBlocks(nodes: ContentNode[], into: { node: ContentNode; collabId?: string }[]) {
  for (const node of nodes) {
    if (PRIVATE_BLOCKS.has(String(node.type ?? ""))) {
      into.push({
        node,
        collabId: typeof node.collabId === "string" ? node.collabId : undefined,
      });
    }
    if (Array.isArray(node.children)) collectPrivateBlocks(node.children, into);
  }
}

/** 发起/复用共享时把剥离出的私有块真身并入会话：剥离 id 全部与云端占位符一致（新发布、
 *  或复用时首次投影已把标注写回本地）才算成功；本地无标注时剥离 id 是全新随机值、
 *  与云端脱节——直接判冲突，由调用方引导结束共享后重新发起。 */
export function mergeSessionPrivateNodes(
  cloudContent: ContentNode[],
  stripped: Map<string, ContentNode>,
  into: Map<string, ContentNode>
): boolean {
  const knownIds = new Set(collectPlaceholderIds(cloudContent));
  if (knownIds.size === 0 && stripped.size === 0) return true;
  if (![...stripped.keys()].every(id => knownIds.has(id))) return false;
  for (const [id, node] of stripped) into.set(id, node);
  return true;
}

/** owner 侧私有块回填：本地内容带 collabId 标注时按 id 恢复；无标注（首次投影未完成）
 *  时留空，由投影侧的占位符防覆盖兜底（绝不拿占位符覆盖本地真身）。
 *  cloudContent 由调用方即时物化提供——读取期间会话可能已被拆除，调用方需复查。 */
export async function restoreOwnerPrivateNodes(
  documentId: string,
  cloudContent: ContentNode[],
  into: Map<string, ContentNode>
) {
  let bindings: Awaited<ReturnType<typeof tauri.collabListBindings>> = [];
  try {
    bindings = await tauri.collabListBindings();
  } catch {
    return;
  }
  const binding = bindings.find(item => item.documentId === documentId);
  if (!binding) return; // 成员侧或未发起：无私有块真身，占位符即正确形态
  const detail = await tauri.getContentDetail(binding.contentId).catch(() => undefined);
  const localContent = Array.isArray(detail?.content) ? (detail.content as ContentNode[]) : [];
  const locals: { node: ContentNode; collabId?: string }[] = [];
  collectPrivateBlocks(localContent, locals);
  if (!locals.length || !locals.every(entry => entry.collabId)) return;
  const known = new Set(collectPlaceholderIds(cloudContent));
  for (const entry of locals) {
    if (known.has(entry.collabId!)) into.set(entry.collabId!, entry.node);
  }
}

/** 云端正文（不含私有块回填），供对齐/回填流程读取 */
export function cloudContentOf(doc: Y.Doc): ContentNode[] {
  return readSharedContent(doc).content;
}
