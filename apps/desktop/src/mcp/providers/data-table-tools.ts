import { listDatabaseItems } from "@/commands/database-item";
import { getDataTableDetail } from "@/commands/data-table";
import { getAllProjectItems } from "@/commands/project";
import { bindDatabaseCommands } from "@/services/command-context";
import { builtInFieldModels, tableToMarkdown } from "@tau/database/model";
import { desktopFieldModels } from "@/features/shared/database/desktopFieldModels";
import type { DataTable, ProjectItem } from "@/types";
import type { ToolParameterSchema } from "@/types";
import type { MCPProviderDefinition } from "./types";

/** 只读消费的字段 model 登记：内置 + 桌面私有字段（D-130） */
const dataFieldModels = [...builtInFieldModels, ...desktopFieldModels];

const DEFAULT_MAX_ROWS = 100;
const MAX_ROWS_LIMIT = 500;

const clampMaxRows = (raw: unknown): number => {
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return DEFAULT_MAX_ROWS;
  return Math.min(Math.floor(value), MAX_ROWS_LIMIT);
};

/** 逐表取列数与行数；单表读取失败不阻塞列表，返回 null */
async function loadTableSizes(
  scoped: { getDataTableDetail: typeof getDataTableDetail },
  tableIds: number[]
): Promise<Map<number, Pick<DataTable, "columns" | "rows"> | null>> {
  const entries = await Promise.all(
    [...tableIds].map(async id => {
      try {
        const detail = await scoped.getDataTableDetail(id);
        return [
          id,
          detail.table ? { columns: detail.table.columns, rows: detail.table.rows } : null,
        ] as const;
      } catch {
        return [id, null] as const;
      }
    })
  );
  return new Map(entries);
}

/** 数据表的可读标题：先匹配数据库页面条目，再匹配 refType=data-table 的项目条目 */
function titleOfTable(
  databaseItems: { title: string; dataTableId: number }[],
  projectItems: ProjectItem[],
  tableId: number
): string | null {
  const databaseItem = databaseItems.find(item => item.dataTableId === tableId);
  if (databaseItem) return databaseItem.title;
  return (
    projectItems.find(item => item.refType === "data-table" && item.refId === tableId)?.title ??
    null
  );
}

export const dataTableToolsProvider: MCPProviderDefinition = {
  id: "data-table-tools",
  name: "只读数据表工具",
  description:
    "列出并读取当前库的数据表（数据库页面条目与项目中嵌入的数据表条目），按字段模型把单元格转成纯文本并以 Markdown 表格返回；只读，不修改数据。读取表格内容优先使用这里的工具，而不是直接查询 data_tables 的 JSON 列。",
  defaultEnabled: true,
  tools: () => [
    {
      name: "list_data_tables",
      risk: "read",
      description:
        "列出当前库可读取的数据表：数据库页面条目与项目中 refType=data-table 的嵌入条目，返回条目标题、表 id、列数与行数。读取某张表的内容请接着调用 read_data_table。",
      parameters: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      executor: async (_args, context) => {
        const scoped = bindDatabaseCommands(
          { listDatabaseItems, getAllProjectItems, getDataTableDetail },
          context
        );
        const [databaseItems, projectItems] = await Promise.all([
          scoped.listDatabaseItems(),
          scoped.getAllProjectItems().catch(() => [] as ProjectItem[]),
        ]);
        const embeddedItems = projectItems.filter(item => item.refType === "data-table");
        const tableIds = [
          ...new Set([
            ...databaseItems.map(item => item.dataTableId),
            ...embeddedItems.map(item => item.refId),
          ]),
        ];
        const sizes = await loadTableSizes(scoped, tableIds);

        const toEntry = (
          source: "database-item" | "project-item",
          itemId: number,
          title: string,
          dataTableId: number,
          rowCountFallback: number | null
        ) => {
          const size = sizes.get(dataTableId);
          return {
            source,
            itemId,
            title,
            dataTableId,
            columnCount: size ? size.columns.length : null,
            rowCount: size ? size.rows.length : rowCountFallback,
          };
        };

        return {
          content: JSON.stringify(
            {
              databaseItems: databaseItems.map(item =>
                toEntry("database-item", item.id, item.title, item.dataTableId, item.rowCount)
              ),
              projectItems: embeddedItems.map(item =>
                toEntry("project-item", item.id, item.title, item.refId, null)
              ),
            },
            null,
            2
          ),
        };
      },
    },
    {
      name: "read_data_table",
      risk: "read",
      description:
        "读取一张数据表并转成 Markdown 表格：单元格按字段模型转纯文本，公式列按当前列配置现算，无模型的列在表头标注类型。viewId 可选，只使用该视图的列与行顺序，不应用其筛选与排序规则；需要筛选结果请改用 sql_query。maxRows 默认 100、上限 500，超出截断时返回 truncated 与 totalRows。",
      parameters: {
        type: "object",
        properties: {
          tableId: {
            type: "number",
            description: "数据表 id（list_data_tables 返回的 dataTableId）。",
          },
          viewId: {
            type: "number",
            description: "可选视图 id：只用该视图的列与行顺序，不应用筛选。",
          },
          maxRows: {
            type: "number",
            description: "可选返回行数上限，默认 100，最大 500。",
          },
        } as Record<string, ToolParameterSchema>,
        required: ["tableId"],
        additionalProperties: false,
      },
      executor: async (args, context) => {
        const tableId = Number(args.tableId);
        if (!Number.isInteger(tableId) || tableId <= 0) {
          return { content: "tableId 必须是正整数数据表 id。", isParameterError: true };
        }
        const scoped = bindDatabaseCommands(
          { getDataTableDetail, listDatabaseItems, getAllProjectItems },
          context
        );
        const detail = await scoped.getDataTableDetail(tableId);
        if (!detail.table) {
          return { content: `未找到数据表 tableId=${tableId}，请先用 list_data_tables 核对。` };
        }

        let view = null;
        if (args.viewId !== undefined && args.viewId !== null) {
          const viewId = Number(args.viewId);
          if (!Number.isInteger(viewId) || viewId <= 0) {
            return { content: "viewId 若提供必须是正整数。", isParameterError: true };
          }
          view = detail.views.find(item => item.id === viewId) ?? null;
          if (!view) {
            return {
              content: `数据表 tableId=${tableId} 下不存在视图 viewId=${viewId}。`,
              isParameterError: true,
            };
          }
        }

        const table = detail.table;
        const [databaseItems, projectItems] = await Promise.all([
          scoped.listDatabaseItems().catch(() => []),
          scoped.getAllProjectItems().catch(() => [] as ProjectItem[]),
        ]);

        const maxRows = clampMaxRows(args.maxRows);
        const result = tableToMarkdown({
          columns: table.columns,
          rows: table.rows,
          columnOrder: view?.config?.columnOrder,
          rowOrder: view?.config?.rowOrder,
          models: dataFieldModels,
          maxRows,
        });

        return {
          content: JSON.stringify(
            {
              tableId,
              title: titleOfTable(databaseItems, projectItems, tableId),
              view: view ? { id: view.id, name: view.name, type: view.type } : null,
              columns: table.columns.map(column => ({ title: column.title, type: column.type })),
              totalRows: result.totalRows,
              truncated: result.truncated,
              note: result.truncated
                ? `行数超过上限，仅返回前 ${Math.min(result.totalRows, maxRows)} 行。`
                : null,
              markdown: result.markdown,
            },
            null,
            2
          ),
        };
      },
    },
  ],
};
