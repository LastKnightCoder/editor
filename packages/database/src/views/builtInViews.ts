import type { DatabaseViewDefinition } from "./types";
import { tableViewDefinition } from "./TableView/definition";
import { galleryViewDefinition } from "./GalleryView/definition";
import { calendarViewDefinition } from "./CalendarView/definition";
import { kanbanViewDefinition } from "./KanbanView/definition";

/**
 * 内置四视图定义：与扩展视图走同一注册路径（D-130），顺序即创建弹窗与类型下拉的展示顺序。
 * 本模块是唯一聚合视图组件与定义的地方，只被扩展装配（extensions.ts）与测试引用，
 * 视图组件自身只 import ./types 的类型，不形成环。
 */
export const builtInViewDefinitions: readonly DatabaseViewDefinition[] = [
  tableViewDefinition,
  galleryViewDefinition,
  calendarViewDefinition,
  kanbanViewDefinition,
];
