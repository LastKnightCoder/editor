import { memo, useEffect, useMemo, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { MdAdd, MdClose } from "react-icons/md";
import { produce } from "immer";

import type {
  CellValue,
  ColumnDef,
  FilterCondition,
  FilterGroup,
  FilterNode,
  FilterLogicOperator,
} from "./types";
import PluginManager from "./PluginManager";
import SimpleDropdown from "./SimpleDropdown";

interface FilterPanelProps {
  columns: ColumnDef[];
  filters: FilterGroup | null;
  pluginManager: PluginManager;
  onChange: (filters: FilterGroup | null) => void;
  onClose?: () => void;
  theme: "light" | "dark";
}

const LOGIC_OPTIONS: Array<{ label: string; value: FilterLogicOperator }> = [
  { label: "与", value: "and" },
  { label: "或", value: "or" },
];

const cloneFilterGroup = (group: FilterGroup | null): FilterGroup | null => {
  return group ? JSON.parse(JSON.stringify(group)) : null;
};

const createEmptyGroup = (): FilterGroup => ({
  id: uuidv4(),
  type: "group",
  logic: "and",
  children: [],
});

const FilterPanel: React.FC<FilterPanelProps> = memo(
  ({ columns, filters, pluginManager, onChange, onClose, theme }) => {
    const filterableColumns = useMemo(() => {
      return columns.filter(
        (column) =>
          (pluginManager.getPlugin(column.type)?.filters ?? []).length,
      );
    }, [columns, pluginManager]);

    const [localFilters, setLocalFilters] = useState<FilterGroup>(() => {
      const cloned = cloneFilterGroup(filters);
      if (cloned) return cloned;
      return createEmptyGroup();
    });

    useEffect(() => {
      const cloned = cloneFilterGroup(filters);
      setLocalFilters(cloned ?? createEmptyGroup());
    }, [filters]);

    const createCondition = (
      column: ColumnDef | undefined,
    ): FilterCondition => {
      const definitions = column
        ? (pluginManager.getPlugin(column.type)?.filters ?? [])
        : [];
      const firstDefinition = definitions[0];
      return {
        id: uuidv4(),
        type: "condition",
        fieldId: column?.id ?? null,
        operator: firstDefinition?.operator ?? null,
        value:
          firstDefinition?.getInitialValue && column
            ? firstDefinition.getInitialValue(column)
            : null,
      };
    };

    const handleAddCondition = (groupId: string) => {
      setLocalFilters((prev) =>
        produce(prev, (draft) => {
          const target = findGroupById(draft, groupId);
          if (!target) return;
          const column = filterableColumns[0];
          target.children.push(createCondition(column));
        }),
      );
    };

    const handleRemoveNode = (groupId: string, nodeId: string) => {
      setLocalFilters((prev) =>
        produce(prev, (draft) => {
          const target = findGroupById(draft, groupId);
          if (!target) return;
          target.children = target.children.filter(
            (child) => child.id !== nodeId,
          );
        }),
      );
    };

    const handleGroupLogicChange = (
      groupId: string,
      logic: FilterLogicOperator,
    ) => {
      setLocalFilters((prev) =>
        produce(prev, (draft) => {
          const target = findGroupById(draft, groupId);
          if (target) {
            target.logic = logic;
          }
        }),
      );
    };

    const handleFieldChange = (conditionId: string, fieldId: string | null) => {
      setLocalFilters((prev) =>
        produce(prev, (draft) => {
          const condition = findConditionById(draft, conditionId);
          if (!condition) return;
          condition.fieldId = fieldId;
          const column = columns.find((col) => col.id === fieldId);
          const definitions = column
            ? (pluginManager.getPlugin(column.type)?.filters ?? [])
            : [];
          condition.operator = definitions[0]?.operator ?? null;
          condition.value =
            definitions[0]?.getInitialValue && column
              ? definitions[0].getInitialValue(column)
              : null;
        }),
      );
    };

    const handleOperatorChange = (
      conditionId: string,
      operator: string | null,
    ) => {
      setLocalFilters((prev) =>
        produce(prev, (draft) => {
          const condition = findConditionById(draft, conditionId);
          if (!condition) return;
          condition.operator = operator;
          const column = columns.find((col) => col.id === condition.fieldId);
          if (!column) return;
          const definitions =
            pluginManager.getPlugin(column.type)?.filters ?? [];
          const definition = definitions.find(
            (item) => item.operator === operator,
          );
          if (definition?.getInitialValue) {
            condition.value = definition.getInitialValue(column);
          } else if (!definition?.requiresValue) {
            condition.value = null;
          }
        }),
      );
    };

    const handleValueChange = (
      conditionId: string,
      value: CellValue | null,
    ) => {
      setLocalFilters((prev) =>
        produce(prev, (draft) => {
          const condition = findConditionById(draft, conditionId);
          if (condition) {
            condition.value = value;
          }
        }),
      );
    };

    const handleConfirm = () => {
      const normalized = normalizeFilters(localFilters);
      onChange(normalized);
      onClose?.();
    };

    const renderNode = (node: FilterNode, parentGroup: FilterGroup) => {
      if (node.type === "group") {
        return renderGroup(node, parentGroup.id);
      }
      return renderCondition(node, parentGroup);
    };

    const renderGroup = (group: FilterGroup, parentId?: string) => {
      return (
        <div
          key={group.id}
          className="rounded-[12px] border border-[rgba(15,23,42,0.1)] dark:border-[rgba(226,232,240,0.1)] px-2 py-2 flex flex-col gap-2"
        >
          <div className="flex items-center gap-2">
            <SimpleDropdown
              items={LOGIC_OPTIONS.map((opt) => ({
                key: opt.value,
                label: opt.label,
              }))}
              onSelect={(value) =>
                handleGroupLogicChange(group.id, value as FilterLogicOperator)
              }
            >
              <div className="px-2 py-1 rounded-[8px] bg-[rgba(255,255,255,0.6)] dark:bg-[rgba(10,15,28,0.4)] border border-transparent hover:border-[rgba(15,23,42,0.15)] dark:hover:border-[rgba(226,232,240,0.15)] cursor-pointer text-[13px]">
                {LOGIC_OPTIONS.find((opt) => opt.value === group.logic)?.label}
              </div>
            </SimpleDropdown>
            {parentId && (
              <button
                type="button"
                className="ml-auto border-none bg-transparent p-1 text-[rgba(15,23,42,0.45)] dark:text-[rgba(226,232,240,0.45)] hover:text-[#ff5f5a] cursor-pointer"
                onClick={() => handleRemoveNode(parentId, group.id)}
              >
                <MdClose className="text-base" />
              </button>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            {group.children.length ? (
              group.children.map((child) => renderNode(child, group))
            ) : (
              <div className="text-[13px] text-center py-4 text-[rgba(15,23,42,0.45)] dark:text-[rgba(226,232,240,0.45)]">
                请添加条件
              </div>
            )}
          </div>
          <button
            type="button"
            className="w-full border-none bg-transparent px-2 py-1.5 rounded-[10px] flex items-center justify-center gap-1 text-[13px] cursor-pointer transition-all hover:bg-[rgba(255,255,255,0.6)] dark:hover:bg-[rgba(148,163,184,0.15)] disabled:opacity-40 disabled:cursor-not-allowed"
            onClick={() => handleAddCondition(group.id)}
            disabled={!filterableColumns.length}
          >
            <MdAdd className="text-base" />
            <span>添加条件</span>
          </button>
        </div>
      );
    };

    const renderCondition = (
      condition: FilterCondition,
      group: FilterGroup,
    ) => {
      const column =
        columns.find((col) => col.id === condition.fieldId) ?? null;
      const definitions = column
        ? (pluginManager.getPlugin(column.type)?.filters ?? [])
        : [];
      const requiresValue = definitions.find(
        (definition) => definition.operator === condition.operator,
      )?.requiresValue;

      return (
        <div
          key={condition.id}
          className="flex flex-col gap-2 rounded-[10px] px-2 py-2 border border-[rgba(15,23,42,0.1)] dark:border-[rgba(226,232,240,0.1)]"
        >
          <div className="flex items-center gap-2">
            <SimpleDropdown
              items={filterableColumns.map((col) => ({
                key: col.id,
                label: col.title,
              }))}
              onSelect={(value) => handleFieldChange(condition.id, value)}
              className="flex-1"
            >
              <div className="flex-1 px-2 py-1.5 rounded-[8px] bg-[rgba(255,255,255,0.6)] dark:bg-[rgba(10,15,28,0.4)] border border-transparent hover:border-[rgba(15,23,42,0.15)] dark:hover:border-[rgba(226,232,240,0.15)] cursor-pointer text-[13px] truncate">
                {column?.title || "选择字段"}
              </div>
            </SimpleDropdown>
            <SimpleDropdown
              items={definitions.map((def) => ({
                key: def.operator,
                label: def.label ?? def.operator,
              }))}
              onSelect={(value) => handleOperatorChange(condition.id, value)}
            >
              <div className="w-20 px-2 py-1.5 rounded-[8px] bg-[rgba(255,255,255,0.6)] dark:bg-[rgba(10,15,28,0.4)] border border-transparent hover:border-[rgba(15,23,42,0.15)] dark:hover:border-[rgba(226,232,240,0.15)] cursor-pointer text-[13px] text-center">
                {definitions.find((d) => d.operator === condition.operator)
                  ?.label ?? "操作"}
              </div>
            </SimpleDropdown>
            <button
              type="button"
              className="border-none bg-transparent p-1 text-[rgba(15,23,42,0.45)] dark:text-[rgba(226,232,240,0.45)] hover:text-[#ff5f5a] cursor-pointer"
              onClick={() => handleRemoveNode(group.id, condition.id)}
            >
              <MdClose className="text-base" />
            </button>
          </div>
          {column && requiresValue !== false && (
            <div className="border border-dashed border-[rgba(15,23,42,0.15)] dark:border-[rgba(226,232,240,0.15)] rounded-[8px] px-2 py-1">
              <FilterValueEditor
                column={column}
                value={condition.value ?? null}
                onChange={(value) => handleValueChange(condition.id, value)}
                pluginManager={pluginManager}
                theme={theme}
              />
            </div>
          )}
        </div>
      );
    };

    return (
      <div className="w-[420px] max-h-[520px] overflow-y-auto text-[rgba(15,23,42,0.95)] dark:text-[rgba(241,245,249,0.95)]">
        <div className="flex flex-col gap-3">
          <div className="px-2">
            <div className="text-xs font-medium text-[rgba(15,23,42,0.55)] dark:text-[rgba(226,232,240,0.55)]">
              筛选
            </div>
            <div className="text-[11px] text-[rgba(15,23,42,0.45)] dark:text-[rgba(226,232,240,0.45)] mt-0.5">
              设置筛选条件以限定表格中的记录
            </div>
          </div>
          {filterableColumns.length === 0 ? (
            <div className="px-3 py-8 text-[13px] text-center text-[rgba(15,23,42,0.45)] dark:text-[rgba(226,232,240,0.45)]">
              当前没有支持筛选的字段
            </div>
          ) : (
            renderGroup(localFilters)
          )}
          <div className="h-px bg-[rgba(15,23,42,0.1)] dark:bg-[rgba(226,232,240,0.1)]" />
          <div className="flex gap-2 px-2">
            <button
              type="button"
              className="flex-1 px-3 py-1.5 rounded-[10px] text-[13px] border-none bg-transparent hover:bg-[rgba(255,255,255,0.6)] dark:hover:bg-[rgba(148,163,184,0.15)] cursor-pointer transition-all"
              onClick={onClose}
            >
              取消
            </button>
            <button
              type="button"
              className="flex-1 px-3 py-1.5 rounded-[10px] text-[13px] border-none bg-[rgba(59,130,246,0.9)] dark:bg-[rgba(59,130,246,0.8)] text-white hover:bg-[rgba(59,130,246,1)] cursor-pointer transition-all"
              onClick={handleConfirm}
            >
              确定
            </button>
          </div>
        </div>
      </div>
    );
  },
);

FilterPanel.displayName = "FilterPanel";

export default FilterPanel;

const findGroupById = (
  group: FilterGroup,
  targetId: string,
): FilterGroup | null => {
  if (group.id === targetId) return group;
  for (const child of group.children) {
    if (child.type === "group") {
      const found = findGroupById(child, targetId);
      if (found) return found;
    }
  }
  return null;
};

const findConditionById = (
  group: FilterGroup,
  conditionId: string,
): FilterCondition | null => {
  for (const child of group.children) {
    if (child.type === "condition" && child.id === conditionId) {
      return child;
    }
    if (child.type === "group") {
      const found = findConditionById(child, conditionId);
      if (found) return found;
    }
  }
  return null;
};

const normalizeFilters = (group: FilterGroup): FilterGroup | null => {
  const normalizedChildren: FilterNode[] = group.children
    .map((child) => {
      if (child.type === "group") {
        return normalizeFilters(child);
      }
      return child;
    })
    .filter((child): child is FilterNode => Boolean(child));

  if (normalizedChildren.length === 0) {
    return null;
  }

  return {
    ...group,
    children: normalizedChildren,
  };
};

interface FilterValueEditorProps {
  column: ColumnDef;
  value: CellValue | null;
  onChange: (value: CellValue | null) => void;
  pluginManager: PluginManager;
  theme: "light" | "dark";
}

const FilterValueEditor: React.FC<FilterValueEditorProps> = memo(
  ({ column, value, onChange, pluginManager, theme }) => {
    const plugin = pluginManager.getPlugin(column.type);

    const handleChange = (nextValue: CellValue) => {
      onChange(nextValue ?? null);
    };

    if (plugin?.Editor) {
      const EditorComponent = plugin.Editor;
      return (
        <div className="h-10">
          <EditorComponent
            value={value ?? null}
            column={column}
            onCellValueChange={handleChange}
            onFinishEdit={() => undefined}
            onColumnChange={() => undefined}
            theme={theme}
            readonly={false}
          />
        </div>
      );
    } else if (plugin?.Renderer) {
      const RendererComponent = plugin.Renderer;
      return (
        <div className="h-10">
          <RendererComponent
            value={value ?? null}
            column={column}
            theme={theme}
            readonly={false}
            onCellValueChange={handleChange}
          />
        </div>
      );
    }

    return (
      <div className="text-[13px] text-[rgba(15,23,42,0.45)] dark:text-[rgba(226,232,240,0.45)]">
        该字段暂无编辑器
      </div>
    );
  },
);

FilterValueEditor.displayName = "FilterValueEditor";
