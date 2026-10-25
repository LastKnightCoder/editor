import type Database from "better-sqlite3";
import { ContentIdentityTable } from "../tables/content-identity";

/** 扫描全部页，包括没有白板拥有者的内嵌页与创作页。 */
export function inventoryLegacyWhiteboards(db: Database.Database, bindMissing = false) {
  const library = ContentIdentityTable.library(db);
  if (!library) throw new Error("请先确认并采用同源资料库基线");
  const reference = (kind: "whiteboard" | "whiteboard-content", id: number) => {
    if (
      !bindMissing &&
      !db
        .prepare(
          "SELECT 1 FROM entity_identities WHERE entity_kind=? AND local_id=? AND retired_at IS NULL"
        )
        .get(kind, id)
    )
      throw new Error("旧实体身份尚未登记，请先显式准备完整库基线");
    return ContentIdentityTable.reference(db, kind, id);
  };
  const pages = db
    .prepare("SELECT id,create_time,name,data FROM white_board_contents ORDER BY id")
    .all() as { id: number; create_time: number; name: string; data: string }[];
  const boards = db
    .prepare("SELECT id,create_time,title,white_board_content_ids FROM white_boards ORDER BY id")
    .all() as { id: number; create_time: number; title: string; white_board_content_ids: string }[];
  const owners = new Map<number, number>();
  const boardPages = new Map<number, number[]>();
  for (const board of boards) {
    const ids: unknown = JSON.parse(board.white_board_content_ids);
    if (
      !Array.isArray(ids) ||
      ids.some(id => !Number.isSafeInteger(id)) ||
      new Set(ids).size !== ids.length
    )
      throw new Error("白板页目录无效或重复");
    for (const id of ids as number[]) {
      if (owners.has(id) || !pages.some(page => page.id === id))
        throw new Error("旧白板页归属不明确或实体缺失");
      owners.set(id, board.id);
    }
    boardPages.set(board.id, ids as number[]);
  }
  const entry = (boardId: number | null, title: string, selected: typeof pages) => {
    const identity = reference(
      boardId === null ? "whiteboard-content" : "whiteboard",
      boardId ?? selected[0].id
    );
    return {
      documentId: identity.entityId,
      boardId,
      title,
      pages: selected.map(page => ({
        pageId: reference("whiteboard-content", page.id).entityId,
        contentId: page.id,
        createdAt: page.create_time,
        title: page.name ?? "",
        data: page.data,
      })),
    };
  };
  const managed = new Set(
    (
      db.prepare("SELECT content_id FROM whiteboard_document_pages").all() as {
        content_id: number;
      }[]
    ).map(row => row.content_id)
  );
  return [
    ...boards
      .filter(
        board => !db.prepare("SELECT 1 FROM whiteboard_documents WHERE board_id=?").get(board.id)
      )
      .map(board => {
        const selected = boardPages.get(board.id)!.map(id => pages.find(page => page.id === id)!);
        if (!selected.length || selected.some(page => managed.has(page.id)))
          throw new Error("旧白板目录为空或已被其他文档管理");
        return entry(board.id, board.title ?? "", selected);
      }),
    ...pages
      .filter(page => !owners.has(page.id) && !managed.has(page.id))
      .map(page => entry(null, page.name ?? "", [page])),
  ];
}
