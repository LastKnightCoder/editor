import type { ColumnElement } from "./types/column";
import type { NodeTranslate } from "./nodes-i18n";
const countKeys: Record<string, Parameters<NodeTranslate>[0]> = {
  richtext: "nodes.column.richtext",
  image: "nodes.column.image",
  video: "nodes.column.video",
  audio: "nodes.column.audio",
  card: "nodes.column.card",
  whiteboard: "nodes.column.whiteboard",
};
export function columnCountLabel(
  column: Pick<ColumnElement, "children">,
  t: NodeTranslate
): string {
  const { children } = column;
  if (!children.length) return t("nodes.column.empty");
  const type = children[0].type;
  const key =
    children.every(child => child.type === type) && Object.hasOwn(countKeys, type)
      ? countKeys[type]
      : "nodes.column.elements";
  return t(key, { count: children.length });
}
