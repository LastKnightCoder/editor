import { Download, Edit3, Image as ImageIcon } from "lucide-react";

import type { EditorCommand } from "../../../api/command";
import type { EditorMenuEntry } from "../../../api/menu";
import type { ChartElement } from "../../../types";
import { chartActionsMap, downloadChartCsv, downloadChartImage } from "./actions";

/** 图表块特有的菜单条目（公共条目由内核默认菜单贡献，01 §5.4） */
export const chartCommands: EditorCommand[] = [
  {
    id: "tau.chart.edit",
    title: "编辑图表",
    run: (_editor, ctx) => {
      if (ctx.element?.type !== "chart") return;
      chartActionsMap.get(ctx.element as ChartElement)?.openEditor();
    },
  },
  {
    id: "tau.chart.download-csv",
    title: "下载 CSV",
    run: (_editor, ctx) => {
      if (ctx.element?.type !== "chart") return;
      downloadChartCsv((ctx.element as ChartElement).data);
    },
  },
  {
    id: "tau.chart.download-image",
    title: "下载图片",
    run: (_editor, ctx) => {
      if (ctx.element?.type !== "chart") return;
      const instance = chartActionsMap.get(ctx.element as ChartElement)?.getChartInstance();
      downloadChartImage(instance);
    },
  },
];

export const chartMenuItems: EditorMenuEntry[] = [
  {
    id: "tau.chart.edit",
    title: "编辑图表",
    icon: <Edit3 size={16} />,
    command: "tau.chart.edit",
  },
  {
    id: "tau.chart.download-csv",
    title: "下载 CSV",
    icon: <Download size={16} />,
    command: "tau.chart.download-csv",
  },
  {
    id: "tau.chart.download-image",
    title: "下载图片",
    icon: <ImageIcon size={16} />,
    command: "tau.chart.download-image",
  },
];
