import type {
  ContentNode,
  ContentRef,
  PublishedProjectCardListNode,
} from "@tau/plugins/publish-data";
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

/** 固定已发布子文档的卡片快照，不修改原正文，也不带出未发布条目。 */
export function createPublishContentResolver(
  db: Pick<PublishDataSource, "getProjectItemsByIds">,
  targetFor: (identity: string) => ContentRef | undefined
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
    const parentId = node.projectItemId;
    if (typeof parentId !== "number" || !Number.isSafeInteger(parentId) || parentId <= 0)
      throw new Error("项目卡片列表缺少有效的项目条目 ID");
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
    return { type: "project-card-list", items: cards, children: [{ type: "formatted", text: "" }] };
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
