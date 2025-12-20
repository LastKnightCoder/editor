import { Edit3, Trash2, Download } from "lucide-react";
import { Transforms } from "slate";

import {
  ContextMenuItem,
  BuildMenuParams,
} from "../../../components/EditorContextMenu/types";
import type { ChartElement } from "../../../types";

// 用于存储图表操作的 Map
export const chartActionsMap = new WeakMap<
  ChartElement,
  {
    openEditor: () => void;
  }
>();

function downloadCsv(data: Record<string, string | number>[]) {
  if (!data.length) return;
  const keys = Object.keys(data[0]);
  const csv = [
    keys.join(","),
    ...data.map((row) => keys.map((k) => row[k] ?? "").join(",")),
  ].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "chart-data.csv";
  a.click();
  URL.revokeObjectURL(url);
}

export function buildChartMenuItems(
  params: BuildMenuParams<ChartElement>,
): ContextMenuItem[] {
  const { element, editor, path } = params;

  return [
    {
      key: "edit",
      label: "编辑图表",
      icon: <Edit3 size={16} />,
      onSelect: () => {
        const actions = chartActionsMap.get(element);
        actions?.openEditor();
      },
    },
    {
      key: "download",
      label: "下载 CSV",
      icon: <Download size={16} />,
      onSelect: () => {
        downloadCsv(element.data);
      },
    },
    {
      key: "delete",
      label: "删除图表",
      icon: <Trash2 size={16} />,
      danger: true,
      onSelect: () => {
        Transforms.removeNodes(editor, { at: path });
      },
    },
  ];
}
