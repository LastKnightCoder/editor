import { createHash } from "node:crypto";

/**
 * 本机会话的 documentId：由数据库、内容 id 与内容创建时间派生。
 * 结束共享后会话降级回本机，id 回到同一个值（会话身份可往返）。
 */
export const localSessionId = (databaseName: string, contentId: number, contentCreatedAt: number) =>
  `local:${createHash("sha256")
    .update(JSON.stringify([databaseName, contentId, contentCreatedAt]))
    .digest("hex")}`;

/**
 * 解析换身份留下的旧 documentId（升级 / 降级会改会话 id，渲染端换源期间还会用旧 id
 * 发来 flush 与注销）。链式解析，并防住环与超长链。
 */
export function resolveSessionId(aliases: Map<string, string>, id: string, maxHops = 8): string {
  let current = id;
  const seen = new Set<string>([id]);
  for (let hops = 0; hops < maxHops; hops++) {
    const next = aliases.get(current);
    if (!next || seen.has(next)) return current;
    seen.add(next);
    current = next;
  }
  return current;
}
