/**
 * 档案清单 —— 新增组件档案时在此追加一行（侧栏分组与导航随之更新）。
 */

import type { ComponentType } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Bell,
  BellRing,
  CalendarDays,
  CircleDot,
  Columns3,
  TextCursorInput,
  LayoutGrid,
  ListChecks,
  LoaderCircle,
  MessageSquare,
  MousePointerClick,
  Palette,
  PanelTop,
  RectangleHorizontal,
  Ruler,
  SquareCheck,
  SquarePlus,
  Tag as TagIcon,
  ToggleLeft,
  MessagesSquare,
  TriangleAlert,
  PanelsTopLeft,
  PanelRight,
  Wrench,
} from "lucide-react";

import ButtonSection from "./ButtonSection";
import IconButtonSection from "./IconButtonSection";
import SelectSection from "./SelectSection";
import InputSection from "./InputSection";
import CheckboxSection from "./CheckboxSection";
import SwitchSection from "./SwitchSection";
import RadioSection from "./RadioSection";
import SegmentedSection from "./SegmentedSection";
import DatePickerSection from "./DatePickerSection";
import MenuSection from "./MenuSection";
import DialogSection from "./DialogSection";
import DrawerSection from "./DrawerSection";
import PopoverSection from "./PopoverSection";
import ErrorStateSection from "./ErrorStateSection";
import PanelSection from "./PanelSection";
import ToastSection from "./ToastSection";
import NotificationSection from "./NotificationSection";
import TooltipSection from "./TooltipSection";
import LoadingSection from "./LoadingSection";
import HeatmapSection from "./HeatmapSection";
import TokenSection from "./TokenSection";
import ScaleSection from "./ScaleSection";
import TagSection from "./TagSection";
import ToolCallSection from "./ToolCallSection";
import BlockPreviewSection from "./BlockPreviewSection";

export interface SectionMeta {
  key: string;
  label: string;
  group: string;
  icon: LucideIcon;
  component: ComponentType;
}

export const SECTIONS: SectionMeta[] = [
  {
    key: "button",
    label: "Button",
    group: "基础件",
    icon: RectangleHorizontal,
    component: ButtonSection,
  },
  {
    key: "iconbutton",
    label: "IconButton",
    group: "基础件",
    icon: LayoutGrid,
    component: IconButtonSection,
  },
  { key: "panel", label: "Panel 族", group: "基础件", icon: PanelTop, component: PanelSection },
  { key: "select", label: "Select", group: "基础件", icon: ListChecks, component: SelectSection },
  { key: "input", label: "Input", group: "基础件", icon: TextCursorInput, component: InputSection },
  {
    key: "checkbox",
    label: "Checkbox",
    group: "基础件",
    icon: SquareCheck,
    component: CheckboxSection,
  },
  { key: "switch", label: "Switch", group: "基础件", icon: ToggleLeft, component: SwitchSection },
  { key: "radio", label: "Radio", group: "基础件", icon: CircleDot, component: RadioSection },
  {
    key: "segmented",
    label: "Segmented",
    group: "基础件",
    icon: Columns3,
    component: SegmentedSection,
  },
  { key: "tag", label: "Tag", group: "基础件", icon: TagIcon, component: TagSection },
  {
    key: "datepicker",
    label: "DatePicker",
    group: "基础件",
    icon: CalendarDays,
    component: DatePickerSection,
  },
  {
    key: "menu",
    label: "Menu · ContextMenu",
    group: "基础件",
    icon: MousePointerClick,
    component: MenuSection,
  },
  {
    key: "dialog",
    label: "Dialog · ConfirmDialog",
    group: "基础件",
    icon: SquarePlus,
    component: DialogSection,
  },
  {
    key: "drawer",
    label: "Drawer",
    group: "基础件",
    icon: PanelRight,
    component: DrawerSection,
  },
  {
    key: "popover",
    label: "Popover",
    group: "基础件",
    icon: MessagesSquare,
    component: PopoverSection,
  },
  { key: "toast", label: "Toast", group: "反馈", icon: Bell, component: ToastSection },
  {
    key: "notification",
    label: "Notification",
    group: "反馈",
    icon: BellRing,
    component: NotificationSection,
  },
  {
    key: "tooltip",
    label: "Tooltip",
    group: "反馈",
    icon: MessageSquare,
    component: TooltipSection,
  },
  {
    key: "error-state",
    label: "ErrorState",
    group: "反馈",
    icon: TriangleAlert,
    component: ErrorStateSection,
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
  {
    key: "toolcall",
    label: "对话工具渲染",
    group: "对话",
    icon: Wrench,
    component: ToolCallSection,
  },
  {
    key: "block-preview",
    label: "块预览",
    group: "对话",
    icon: PanelsTopLeft,
    component: BlockPreviewSection,
  },
  { key: "token", label: "Token 色板", group: "设计基底", icon: Palette, component: TokenSection },
  { key: "scale", label: "尺度与动效", group: "设计基底", icon: Ruler, component: ScaleSection },
];

export type SectionKey = (typeof SECTIONS)[number]["key"];

export const SECTION_GROUPS: { label: string; items: SectionMeta[] }[] = [
  { label: "基础件", items: SECTIONS.filter(s => s.group === "基础件") },
  { label: "反馈", items: SECTIONS.filter(s => s.group === "反馈") },
  { label: "数据展示", items: SECTIONS.filter(s => s.group === "数据展示") },
  { label: "对话", items: SECTIONS.filter(s => s.group === "对话") },
  { label: "设计基底", items: SECTIONS.filter(s => s.group === "设计基底") },
];
