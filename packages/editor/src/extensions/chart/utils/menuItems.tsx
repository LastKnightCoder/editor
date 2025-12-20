import { Edit3, Trash2, Download, Image } from "lucide-react";
import { Transforms } from "slate";

import {
  ContextMenuItem,
  BuildMenuParams,
} from "../../../components/EditorContextMenu/types";
import type { ChartElement } from "../../../types";
import type * as echarts from "echarts";

// 用于存储图表操作的 Map
export const chartActionsMap = new WeakMap<
  ChartElement,
  {
    openEditor: () => void;
    getChartInstance: () => echarts.ECharts | undefined;
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

function downloadImage(instance: echarts.ECharts | undefined) {
  if (!instance) return;
  const url = instance.getDataURL({
    type: "png",
    pixelRatio: 2,
    backgroundColor: "#fff",
  });
  const a = document.createElement("a");
  a.href = url;
  a.download = "chart.png";
  a.click();
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
      key: "download-csv",
      label: "下载 CSV",
      icon: <Download size={16} />,
      onSelect: () => {
        downloadCsv(element.data);
      },
    },
    {
      key: "download-image",
      label: "下载图片",
      icon: <Image size={16} />,
      onSelect: () => {
        const actions = chartActionsMap.get(element);
        const instance = actions?.getChartInstance();
        downloadImage(instance);
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
