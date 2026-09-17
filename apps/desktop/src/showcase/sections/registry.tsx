/**
 * 档案清单 —— 新增组件档案时在此追加一行（侧栏分组与导航随之更新）。
 */

import type { ComponentType } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Bell,
  CalendarDays,
  LayoutGrid,
  LoaderCircle,
  MessageSquare,
  Palette,
  PanelTop,
  Ruler,
} from "lucide-react";

import IconButtonSection from "./IconButtonSection";
import PanelSection from "./PanelSection";
import ToastSection from "./ToastSection";
import TooltipSection from "./TooltipSection";
import LoadingSection from "./LoadingSection";
import HeatmapSection from "./HeatmapSection";
import TokenSection from "./TokenSection";
import ScaleSection from "./ScaleSection";

export interface SectionMeta {
  key: string;
  label: string;
  group: string;
  icon: LucideIcon;
  component: ComponentType;
}

export const SECTIONS: SectionMeta[] = [
  {
    key: "iconbutton",
    label: "IconButton",
    group: "基础件",
    icon: LayoutGrid,
    component: IconButtonSection,
  },
  { key: "panel", label: "Panel 族", group: "基础件", icon: PanelTop, component: PanelSection },
  { key: "toast", label: "Toast", group: "反馈", icon: Bell, component: ToastSection },
  {
    key: "tooltip",
    label: "Tooltip",
    group: "反馈",
    icon: MessageSquare,
    component: TooltipSection,
  },
  {
    key: "loading",
    label: "Spinner · Loading",
    group: "反馈",
    icon: LoaderCircle,
    component: LoadingSection,
  },
  {
    key: "heatmap",
    label: "YearHeatmap",
    group: "数据展示",
    icon: CalendarDays,
    component: HeatmapSection,
  },
  { key: "token", label: "Token 色板", group: "设计基底", icon: Palette, component: TokenSection },
  { key: "scale", label: "尺度与动效", group: "设计基底", icon: Ruler, component: ScaleSection },
];

export type SectionKey = (typeof SECTIONS)[number]["key"];

export const SECTION_GROUPS: { label: string; items: SectionMeta[] }[] = [
  { label: "基础件", items: SECTIONS.filter(s => s.group === "基础件") },
  { label: "反馈", items: SECTIONS.filter(s => s.group === "反馈") },
  { label: "数据展示", items: SECTIONS.filter(s => s.group === "数据展示") },
  { label: "设计基底", items: SECTIONS.filter(s => s.group === "设计基底") },
];
