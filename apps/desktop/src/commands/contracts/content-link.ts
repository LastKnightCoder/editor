import { command } from "@tau/rpc";
import type { EntityRef } from "@/entity/ref";
import type { ContentLinksOfContent } from "@/types/content-link";

/**
 * 正文显式连接命令契约。主进程注册在 database.ts 通用包装层（tables 模式），
 * add/remove 单事务写入（无向边单行，天然原子双边）。
 */
export const contentLinkCommands = {
  add: command<[EntityRef, EntityRef], boolean>("content-links:add"),
  remove: command<[EntityRef, EntityRef], boolean>("content-links:remove"),
  listByContentIds: command<[number[]], ContentLinksOfContent[]>(
    "content-links:list-by-content-ids"
  ),
};
