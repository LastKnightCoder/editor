import type {
  ContentNode,
  ContentRef,
  PublishedProjectCardListNode,
} from "@tau/plugins/publish-data";
import { isContentEntityReference } from "@tau/db-schema/content-identities";
import type { Descendant } from "slate";
import type { ProjectItem } from "@/types/project";
import type { PublishDataSource } from "./publish-site-generator";

const summaryOf = (nodes: Descendant[]): string => {
  if (!nodes.length) return "";
  const texts: string[] = [];
  const visit = (node: Descendant) => {
    if (node.type === "formatted") texts.push(node.text);
    else if ("children" in node) node.children.forEach(visit);
  };
  nodes.forEach(visit);
  return texts.length ? texts.join("").slice(0, 80) : "空卡片";
};

const emptyList = (): PublishedProjectCardListNode => ({
  type: "project-card-list",
  items: [],
  children: [{ type: "formatted", text: "" }],
});

/** 固定已发布子文档的卡片快照，不修改原正文，也不带出未发布条目。 */
export function createPublishContentResolver(
  db: Pick<PublishDataSource, "getProjectItemsByIds" | "resolveProjectItemId">,
  targetFor: (identity: string) => ContentRef | undefined,
  warn?: (message: string) => void
) {
  const items = new Map<number, ProjectItem | null>();
  const load = (ids: number[]) => {
    const missing = [...new Set(ids)].filter(id => !items.has(id));
    for (let offset = 0; offset < missing.length; offset += 100) {
      const batch = missing.slice(offset, offset + 100);
      const found = new Map(db.getProjectItemsByIds(batch).map(item => [item.id, item]));
      for (const id of batch) items.set(id, found.get(id) ?? null);
    }
  };
  const resolveList = (node: ContentNode): PublishedProjectCardListNode => {
    const reference =
      isContentEntityReference(node.entityRef) && node.entityRef.kind === "project-item"
        ? node.entityRef
        : undefined;
    const legacyId = node.projectItemId;
    const parentId = reference
      ? db.resolveProjectItemId(reference)
      : typeof legacyId === "number" && Number.isSafeInteger(legacyId) && legacyId > 0
        ? legacyId
        : null;
    if (parentId === null) {
      warn?.("项目卡片列表的来源项目条目无效或已删除，已按空列表处理");
      return emptyList();
    }
    load([parentId]);
    const children = (items.get(parentId)?.children ?? []).filter(id =>
      Boolean(targetFor(`project-item:${id}`))
    );
    load(children);
    const cards = children.flatMap(id => {
      const item = items.get(id);
      const target = targetFor(`project-item:${id}`);
      if (!item || !target) return [];
      return [
        {
          id,
          title: item.title || "未命名文档",
          summary: summaryOf(item.content ?? []),
          target,
        },
      ];
    });
    return { ...emptyList(), items: cards };
  };
  const visit = (value: unknown, forSearch: boolean): unknown => {
    if (!value || typeof value !== "object") return value;
    if (Array.isArray(value)) return value.map(item => visit(item, forSearch));
    const node = value as ContentNode;
    if (node.type === "project-card-list" && Array.isArray(node.children)) {
      const list = resolveList(node);
      return forSearch
        ? {
            type: "paragraph",
            children: [
              {
                type: "formatted",
                text: list.items.map(item => `${item.title} ${item.summary}`).join("\n"),
              },
            ],
          }
        : list;
    }
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, visit(item, forSearch)])
    );
  };
  return (nodes: Descendant[] | undefined, forSearch = false): ContentNode[] =>
    visit(nodes ?? [], forSearch) as ContentNode[];
}
