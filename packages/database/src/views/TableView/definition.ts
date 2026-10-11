import { Table2 } from "lucide-react";
import TableView from ".";
import type { DatabaseViewDefinition } from "../types";

/** 表格视图：无必需列、无专属配置，投影走通用 groupBy */
export const tableViewDefinition: DatabaseViewDefinition = {
  type: "table",
  name: "表格",
  icon: Table2,
  Component: TableView,
};
