import Database from "better-sqlite3";
import { basename } from "node:path";
import type { PluginEntityRef, PluginLink } from "@tau/plugins";
import type { PluginEntityScope } from "@/types/plugin-entities";
import { writeAsPlugin } from "../domain-event-origin";
import { accessPluginRef } from "./plugin-refs";
import { adoptPluginData } from "./plugin-records";
import { LINK_COLUMNS as COLUMNS, type LinkRow } from "./plugin-link-rows";

/** 一个来源最多的关联数 */
const MAX_LINKS = 1000;
const MAX_DATA = 4 * 1024;
const LINK_ID = /^[A-Za-z0-9-]{1,64}$/;

function toLink(row: LinkRow): PluginLink {
  let data: PluginLink["data"] = {};
  try {
    const parsed = JSON.parse(row.data);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) data = parsed;
  } catch {
    // 损坏的 JSON 按空对象返回
  }
  return {
    id: row.id,
    from: String(row.from_id),
    to: { kind: row.to_kind, id: row.to_id } as PluginEntityRef,
    role: row.role,
    data,
    createdAt: row.create_time,
  };
}

/**
 * 插件关联（context.links）：来源只能是本插件的实体，目标须是插件能看到的引用（与 describe 同一规则）。
 * 关联的增删改计入来源实体的 entity.updated 事件。来源实体删除时，出边随实体快照进入「最近删除」。
 */
export default class PluginLinkTable {
  static getListenEvents() {
    return {
      "plugin-links:add": this.add.bind(this),
      "plugin-links:list": this.list.bind(this),
      "plugin-links:remove": this.remove.bind(this),
      "plugin-links:reorder": this.reorder.bind(this),
    };
  }

  private static assertScope(db: Database.Database, scope: PluginEntityScope) {
    if (basename(db.name).replace(/\.db$/, "") !== scope.databaseName.replace(/\.db$/, ""))
      throw new Error("数据库已切换，请重新读取");
    if (typeof scope.pluginId !== "string" || !scope.pluginId) throw new Error("插件 ID 无效");
    adoptPluginData(db, scope.pluginId);
  }

  private static assertOwnEntity(db: Database.Database, pluginId: string, from: number) {
    const owned = db
      .prepare("SELECT 1 FROM plugin_entities WHERE id = ? AND plugin_id = ?")
      .get(from, pluginId);
    if (!owned) throw new Error("内容不存在");
  }

  static add(
    db: Database.Database,
    request: PluginEntityScope & {
      id: string;
      from: number;
      to: { kind: string; id: string };
      role: string;
      data: Record<string, unknown>;
      readable: boolean;
    }
  ): PluginLink {
    this.assertScope(db, request);
    if (typeof request.id !== "string" || !LINK_ID.test(request.id))
      throw new Error("关联 ID 无效");
    if (typeof request.role !== "string" || request.role.length > 128) throw new Error("角色无效");
    const data = JSON.stringify(request.data ?? {});
    if (data.length > MAX_DATA) throw new Error("data 超过 4 KB");
    return writeAsPlugin(request.pluginId, () =>
      db.transaction(() => {
        this.assertOwnEntity(db, request.pluginId, request.from);
        const { kind, id } = request.to;
        const existing = db
          .prepare(
            `SELECT ${COLUMNS} FROM plugin_links
             WHERE from_id = ? AND to_kind = ? AND to_id = ? AND role = ?`
          )
          .get(request.from, kind, id, request.role) as LinkRow | undefined;
        if (existing) return toLink(existing);
        const access = accessPluginRef(
          db,
          request.pluginId,
          { kind, id },
          request.readable === true
        );
        if (access.status === "denied")
          throw new Error("不能关联这项内容：请先让用户选择它，或申请读取权限");
        if (access.status !== "ok") throw new Error("要关联的内容不存在");
        const { count } = db
          .prepare("SELECT COUNT(*) AS count FROM plugin_links WHERE from_id = ?")
          .get(request.from) as { count: number };
        if (count >= MAX_LINKS) throw new Error(`一项内容最多 ${MAX_LINKS} 条关联`);
        const { last } = db
          .prepare(
            "SELECT MAX(sort_index) AS last FROM plugin_links WHERE from_id = ? AND role = ?"
          )
          .get(request.from, request.role) as { last: number | null };
        db.prepare(
          `INSERT INTO plugin_links (${COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          request.id,
          request.pluginId,
          request.from,
          kind,
          id,
          access.located.createdAt,
          request.role,
          (last ?? -1) + 1,
          data,
          Date.now()
        );
        return toLink(
          db.prepare(`SELECT ${COLUMNS} FROM plugin_links WHERE id = ?`).get(request.id) as LinkRow
        );
      })()
    );
  }

  static list(
    db: Database.Database,
    request: PluginEntityScope & { from: number; role?: string }
  ): PluginLink[] {
    this.assertScope(db, request);
    this.assertOwnEntity(db, request.pluginId, request.from);
    const byRole = typeof request.role === "string";
    return (
      db
        .prepare(
          `SELECT ${COLUMNS} FROM plugin_links WHERE from_id = ? ${byRole ? "AND role = ?" : ""}
           ORDER BY role, sort_index, id`
        )
        .all(request.from, ...(byRole ? [request.role] : [])) as LinkRow[]
    ).map(toLink);
  }

  static remove(db: Database.Database, request: PluginEntityScope & { id: string }): void {
    this.assertScope(db, request);
    writeAsPlugin(request.pluginId, () =>
      db
        .prepare("DELETE FROM plugin_links WHERE id = ? AND plugin_id = ?")
        .run(request.id, request.pluginId)
    );
  }

  /** ids 须恰好是来源在同一角色下的全部关联 */
  static reorder(
    db: Database.Database,
    request: PluginEntityScope & { from: number; ids: string[] }
  ): void {
    this.assertScope(db, request);
    if (!Array.isArray(request.ids) || !request.ids.length) throw new Error("ids 无效");
    writeAsPlugin(request.pluginId, () =>
      db.transaction(() => {
        this.assertOwnEntity(db, request.pluginId, request.from);
        const marks = request.ids.map(() => "?").join(", ");
        const rows = db
          .prepare(`SELECT id, role FROM plugin_links WHERE from_id = ? AND id IN (${marks})`)
          .all(request.from, ...request.ids) as Array<{ id: string; role: string }>;
        const roles = new Set(rows.map(row => row.role));
        if (rows.length !== request.ids.length || roles.size !== 1)
          throw new Error("ids 须是同一来源、同一角色的关联");
        const [role] = roles;
        const { total } = db
          .prepare("SELECT COUNT(*) AS total FROM plugin_links WHERE from_id = ? AND role = ?")
          .get(request.from, role) as { total: number };
        if (total !== rows.length) throw new Error("ids 须包含这一角色的全部关联");
        const update = db.prepare("UPDATE plugin_links SET sort_index = ? WHERE id = ?");
        request.ids.forEach((id, index) => update.run(index, id));
      })()
    );
  }
}
