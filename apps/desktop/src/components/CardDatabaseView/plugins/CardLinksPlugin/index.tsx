import { CellPlugin } from "@/components/Database/types";
import { Link2 } from "lucide-react";
import Renderer from "./components/Renderer";
import { CardLinksPluginConfig } from "./types";

const CardLinksPlugin: CellPlugin<CardLinksPluginConfig> = {
  type: "card-links",
  name: "卡片链接",
  editable: false, // 无编辑器模式，通过渲染器直接操作
  Renderer: Renderer as any,
  Icon: ({ className }) => <Link2 className={className} strokeWidth={1.75} />,

  beforeSave: (value: number[]) => {
    if (!Array.isArray(value)) return [];
    // 过滤出有效的卡片 ID（数字）
    return value.filter(id => typeof id === "number" && id > 0);
  },

  afterLoad: (value: number[]) => {
    if (!Array.isArray(value)) return [];
    return value.filter(id => typeof id === "number" && id > 0);
  },

  getGroupKey: (row, column) => {
    const value = row[column.id];
    if (!Array.isArray(value) || value.length === 0) return "无链接";
    return `${value.length} 个链接`;
  },

  sort: params => {
    const { a, b, direction } = params;
    if (!Array.isArray(a) || !Array.isArray(b)) return 0;

    const aLength = a.length;
    const bLength = b.length;

    return direction === "asc" ? aLength - bLength : bLength - aLength;
  },

  filters: [
    {
      operator: "有链接",
      label: "有链接",
      filter: (_filterValue, row, column) => {
        const cellValue = row[column.id];
        return Array.isArray(cellValue) && cellValue.length > 0;
      },
    },
    {
      operator: "无链接",
      label: "无链接",
      filter: (_filterValue, row, column) => {
        const cellValue = row[column.id];
        return !Array.isArray(cellValue) || cellValue.length === 0;
      },
    },
  ],
};

export default CardLinksPlugin;
