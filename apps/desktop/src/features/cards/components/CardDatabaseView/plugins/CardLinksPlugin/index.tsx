import { CellPlugin, type CellValue } from "@tau/database";
import { Link2 } from "lucide-react";
import Renderer from "./components/Renderer";
import { CardLinksCellValue, CardLinksPluginConfig } from "./types";

const itemCount = (value: CellValue): number => {
  const cell = value as Partial<CardLinksCellValue> | null | undefined;
  return Array.isArray(cell?.items) ? cell.items.length : 0;
};

const CardLinksPlugin: CellPlugin<CardLinksPluginConfig> = {
  type: "card-links",
  name: "连接",
  editable: false, // 无编辑器模式，通过渲染器直接操作
  Renderer: Renderer as any,
  Icon: ({ className }) => <Link2 className={className} strokeWidth={1.75} />,

  getGroupKey: (row, column) => {
    const count = itemCount(row[column.id]);
    if (count === 0) return "无连接";
    return `${count} 连接`;
  },

  sort: params => {
    const { a, b, direction } = params;
    const diff = itemCount(a) - itemCount(b);
    return direction === "asc" ? diff : -diff;
  },

  filters: [
    {
      // operator 沿用旧值「有链接/无链接」：已保存的视图偏好里存的是它，改键会静默失效
      operator: "有链接",
      label: "有连接",
      filter: (_filterValue, row, column) => itemCount(row[column.id]) > 0,
    },
    {
      operator: "无链接",
      label: "无连接",
      filter: (_filterValue, row, column) => itemCount(row[column.id]) === 0,
    },
  ],
};

export default CardLinksPlugin;
