import {
  ColumnDef,
  KanbanCardDisplayConfig,
  KanbanCardTemplate,
  KanbanViewConfig,
  TableViewConfig,
} from "../../types";

export const DEFAULT_KANBAN_TEMPLATE: KanbanCardTemplate = "task";
export const DEFAULT_SHOW_FIELD_LABELS = false;

const TEMPLATE_DEFAULT_FIELD_LIMIT: Record<KanbanCardTemplate, number> = {
  compact: 0,
  task: 2,
  detail: 4,
};

const TASK_PRIORITY_TYPES = new Set(["select", "multiSelect"]);

export const KANBAN_CARD_SUPPORTED_FIELD_TYPES = new Set([
  "text",
  "number",
  "date",
  "select",
  "multiSelect",
  "checkbox",
  "star",
  "progress",
  "link",
]);

export interface ResolveKanbanCardDisplayParams {
  columns: ColumnDef[];
  viewConfig: Pick<TableViewConfig, "columnOrder">;
  kanbanConfig?: KanbanViewConfig;
  primaryColumnId?: string;
  groupColumnId?: string;
  /** 完成列判定：由调用方传入字段能力查询（值为布尔的列可作看板「完成」列） */
  isBooleanColumn: (column: ColumnDef) => boolean;
}

export interface ResolvedKanbanCardDisplay {
  template: KanbanCardTemplate;
  doneColumnId?: string;
  visibleFieldIds: string[];
  showFieldLabels: boolean;
  candidateFields: ColumnDef[];
}

const normalizeTemplate = (template?: KanbanCardDisplayConfig["template"]): KanbanCardTemplate => {
  if (template === "compact" || template === "task" || template === "detail") {
    return template;
  }
  return DEFAULT_KANBAN_TEMPLATE;
};

const getOrderedColumns = (columns: ColumnDef[], columnOrder: string[]): ColumnDef[] => {
  const columnMap = new Map(columns.map(column => [column.id, column]));
  const orderedColumns: ColumnDef[] = [];
  const usedColumnIds = new Set<string>();

  columnOrder.forEach(columnId => {
    const column = columnMap.get(columnId);
    if (!column || usedColumnIds.has(column.id)) return;
    orderedColumns.push(column);
    usedColumnIds.add(column.id);
  });

  columns.forEach(column => {
    if (usedColumnIds.has(column.id)) return;
    orderedColumns.push(column);
  });

  return orderedColumns;
};

const resolveDoneColumnId = (
  orderedColumns: ColumnDef[],
  preferredDoneColumnId: string | undefined,
  isBooleanColumn: (column: ColumnDef) => boolean
): string | undefined => {
  if (preferredDoneColumnId) {
    const doneColumn = orderedColumns.find(
      column => column.id === preferredDoneColumnId && isBooleanColumn(column) && !column.hidden
    );
    if (doneColumn) {
      return doneColumn.id;
    }
  }

  return orderedColumns.find(column => isBooleanColumn(column) && !column.hidden)?.id;
};

const sortByTaskPriority = (columns: ColumnDef[]): ColumnDef[] => {
  const prioritized = columns.filter(column => TASK_PRIORITY_TYPES.has(column.type));
  const others = columns.filter(column => !TASK_PRIORITY_TYPES.has(column.type));
  return [...prioritized, ...others];
};

const getTemplateDefaultFieldIds = (
  template: KanbanCardTemplate,
  candidates: ColumnDef[]
): string[] => {
  if (template === "compact") {
    return [];
  }

  const maxCount = TEMPLATE_DEFAULT_FIELD_LIMIT[template];
  const source = template === "task" ? sortByTaskPriority(candidates) : candidates;
  return source.slice(0, maxCount).map(column => column.id);
};

const getCandidateFields = ({
  orderedColumns,
  excludedColumnIds,
}: {
  orderedColumns: ColumnDef[];
  excludedColumnIds: Set<string>;
}): ColumnDef[] => {
  return orderedColumns.filter(column => {
    if (column.hidden) return false;
    if (excludedColumnIds.has(column.id)) return false;
    return KANBAN_CARD_SUPPORTED_FIELD_TYPES.has(column.type);
  });
};

const normalizeVisibleFieldIds = (
  inputIds: string[] | undefined,
  candidateFields: ColumnDef[]
): string[] => {
  if (!inputIds || inputIds.length === 0) return [];

  const candidateIds = new Set(candidateFields.map(field => field.id));
  const selectedSet = new Set(inputIds.filter(id => candidateIds.has(id)));
  return candidateFields.map(field => field.id).filter(fieldId => selectedSet.has(fieldId));
};

export const resolveKanbanCardDisplay = ({
  columns,
  viewConfig,
  kanbanConfig,
  primaryColumnId,
  groupColumnId,
  isBooleanColumn,
}: ResolveKanbanCardDisplayParams): ResolvedKanbanCardDisplay => {
  const cardDisplay = kanbanConfig?.cardDisplay;
  const template = normalizeTemplate(cardDisplay?.template);
  const orderedColumns = getOrderedColumns(columns, viewConfig.columnOrder || []);
  const doneColumnId = resolveDoneColumnId(
    orderedColumns,
    cardDisplay?.doneColumnId,
    isBooleanColumn
  );

  const excludedColumnIds = new Set<string>();
  if (primaryColumnId) excludedColumnIds.add(primaryColumnId);
  if (groupColumnId) excludedColumnIds.add(groupColumnId);
  if (doneColumnId) excludedColumnIds.add(doneColumnId);

  const candidateFields = getCandidateFields({
    orderedColumns,
    excludedColumnIds,
  });
  const configuredVisibleFieldIds = normalizeVisibleFieldIds(
    cardDisplay?.visibleFieldIds,
    candidateFields
  );

  const visibleFieldIds =
    template === "compact"
      ? []
      : configuredVisibleFieldIds.length > 0
        ? configuredVisibleFieldIds
        : getTemplateDefaultFieldIds(template, candidateFields);

  return {
    template,
    doneColumnId,
    visibleFieldIds,
    showFieldLabels: cardDisplay?.showFieldLabels ?? DEFAULT_SHOW_FIELD_LABELS,
    candidateFields,
  };
};

export const getTemplateDefaultCardDisplay = ({
  template,
  columns,
  viewConfig,
  groupColumnId,
  primaryColumnId,
  doneColumnId,
}: {
  template: KanbanCardTemplate;
  columns: ColumnDef[];
  viewConfig: Pick<TableViewConfig, "columnOrder">;
  groupColumnId?: string;
  primaryColumnId?: string;
  doneColumnId?: string;
}): { template: KanbanCardTemplate; visibleFieldIds: string[] } => {
  const orderedColumns = getOrderedColumns(columns, viewConfig.columnOrder || []);
  const excludedColumnIds = new Set<string>();
  if (primaryColumnId) excludedColumnIds.add(primaryColumnId);
  if (groupColumnId) excludedColumnIds.add(groupColumnId);
  if (doneColumnId) excludedColumnIds.add(doneColumnId);

  const candidateFields = getCandidateFields({
    orderedColumns,
    excludedColumnIds,
  });
  return {
    template,
    visibleFieldIds: getTemplateDefaultFieldIds(template, candidateFields),
  };
};
