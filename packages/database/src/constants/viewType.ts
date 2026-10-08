import { CalendarDays, LayoutGrid, SquareKanban, Table2, type LucideIcon } from "lucide-react";
import type { DatabaseViewType } from "../types";

export const VIEW_TYPE_ICON: Record<DatabaseViewType, LucideIcon> = {
  table: Table2,
  gallery: LayoutGrid,
  calendar: CalendarDays,
  kanban: SquareKanban,
};
