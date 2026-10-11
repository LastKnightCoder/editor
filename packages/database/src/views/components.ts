import type { ComponentType } from "react";
import type { DatabaseViewType } from "../types";
import type { DatabaseViewComponentProps } from "./registry";
import TableView from "./TableView";
import GalleryView from "./GalleryView";
import CalendarView from "./CalendarView";
import KanbanView from "./KanbanView";

/** 视图组件只由根组件消费；视图内部只依赖 registry 元数据，二者分开以免循环依赖 */
const VIEW_COMPONENTS: Record<DatabaseViewType, ComponentType<DatabaseViewComponentProps>> = {
  table: TableView,
  gallery: GalleryView,
  calendar: CalendarView,
  kanban: KanbanView,
};

export function getViewComponent(
  type: string
): ComponentType<DatabaseViewComponentProps> | undefined {
  return Object.hasOwn(VIEW_COMPONENTS, type)
    ? VIEW_COMPONENTS[type as DatabaseViewType]
    : undefined;
}
