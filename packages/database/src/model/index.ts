/** 字段纯数据子入口（D-137）：零 React / DOM 依赖，主进程与 MCP 只依赖这里 */
export { defineFieldModel, type DatabaseFieldModel } from "./field-model";
export { builtInFieldModels } from "./built-in";
export {
  collectContentRefs,
  diffContentRefs,
  toFieldModelMap,
  type AnyConfigFieldModel,
  type FieldModelRegistry,
} from "./content-refs";
export {
  tableToMarkdown,
  type TableToMarkdownInput,
  type TableToMarkdownResult,
} from "./table-markdown";
export type { CellValue, ColumnDef, RowData, SelectOption } from "../types";
