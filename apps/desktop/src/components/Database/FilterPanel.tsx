import { memo, useEffect, useMemo, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { ChevronDown, Plus, X } from "lucide-react";
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
import ColumnIcon from "./ColumnIcon";
import { countFilterConditions } from "./core/filterTree";
import { Button, cn } from "@tau/ui";

interface FilterPanelProps {
  columns: ColumnDef[];
  filters: FilterGroup | null;
  pluginManager: PluginManager;
  onChange: (filters: FilterGroup | null) => void;
  onClose?: () => void;
  theme: "light" | "dark";
}

const LOGIC_SEGMENT_LABEL: Record<FilterLogicOperator, string> = {
  and: "满足全部条件",
  or: "满足任一条件",
};

const NESTED_LOGIC_LABEL: Record<FilterLogicOperator, string> = {
  and: "其中，全部满足",
  or: "其中，任一满足",
};

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
      return columns.filter(column => (pluginManager.getPlugin(column.type)?.filters ?? []).length);
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

    const createCondition = (column: ColumnDef | undefined): FilterCondition => {
      const definitions = column ? (pluginManager.getPlugin(column.type)?.filters ?? []) : [];
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
      setLocalFilters(prev =>
        produce(prev, draft => {
          const target = findGroupById(draft, groupId);
          if (!target) return;
          const column = filterableColumns[0];
          target.children.push(createCondition(column));
        })
      );
    };

    const handleAddGroup = (groupId: string) => {
      setLocalFilters(prev =>
        produce(prev, draft => {
          const target = findGroupById(draft, groupId);
          if (!target) return;
          target.children.push(createEmptyGroup());
        })
      );
    };

    const handleRemoveNode = (groupId: string, nodeId: string) => {
      setLocalFilters(prev =>
        produce(prev, draft => {
          const target = findGroupById(draft, groupId);
          if (!target) return;
          target.children = target.children.filter(child => child.id !== nodeId);
        })
      );
    };

    const handleGroupLogicChange = (groupId: string, logic: FilterLogicOperator) => {
      setLocalFilters(prev =>
        produce(prev, draft => {
          const target = findGroupById(draft, groupId);
          if (target) {
            target.logic = logic;
          }
        })
      );
    };

    const handleFieldChange = (conditionId: string, fieldId: string | null) => {
      setLocalFilters(prev =>
        produce(prev, draft => {
          const condition = findConditionById(draft, conditionId);
          if (!condition) return;
          condition.fieldId = fieldId;
          const column = columns.find(col => col.id === fieldId);
          const definitions = column ? (pluginManager.getPlugin(column.type)?.filters ?? []) : [];
          condition.operator = definitions[0]?.operator ?? null;
          condition.value =
            definitions[0]?.getInitialValue && column
              ? definitions[0].getInitialValue(column)
              : null;
        })
      );
    };

    const handleOperatorChange = (conditionId: string, operator: string | null) => {
      setLocalFilters(prev =>
        produce(prev, draft => {
          const condition = findConditionById(draft, conditionId);
          if (!condition) return;
          condition.operator = operator;
          const column = columns.find(col => col.id === condition.fieldId);
          if (!column) return;
          const definitions = pluginManager.getPlugin(column.type)?.filters ?? [];
          const definition = definitions.find(item => item.operator === operator);
          if (definition?.getInitialValue) {
            condition.value = definition.getInitialValue(column);
          } else if (!definition?.requiresValue) {
            condition.value = null;
          }
        })
      );
    };

    const handleValueChange = (conditionId: string, value: CellValue | null) => {
      setLocalFilters(prev =>
        produce(prev, draft => {
          const condition = findConditionById(draft, conditionId);
          if (condition) {
            condition.value = value;
          }
        })
      );
    };

    const handleConfirm = () => {
      const normalized = normalizeFilters(localFilters);
      onChange(normalized);
      onClose?.();
    };

    const handleClearAll = () => {
      setLocalFilters(createEmptyGroup());
    };

    const conditionCount = countFilterConditions(localFilters);

    const renderNode = (node: FilterNode, parentGroup: FilterGroup) => {
      if (node.type === "group") {
        return renderNestedGroup(node, parentGroup.id);
      }
      return renderCondition(node, parentGroup);
    };

    const renderNestedGroup = (group: FilterGroup, parentId: string) => (
      <div
        key={group.id}
        className="bg-page rounded-tau-md group/nested flex flex-col gap-1.5 p-1.5"
      >
        <div className="flex items-center gap-1 px-1">
          <button
            type="button"
            className="text-tau-meta text-ink-2 hover:text-ink-1 ease-tau-out cursor-pointer rounded-[6px] px-1.5 py-0.5 transition-colors duration-[160ms]"
            onClick={() => handleGroupLogicChange(group.id, group.logic === "and" ? "or" : "and")}
            title="点击切换组合逻辑"
          >
            {NESTED_LOGIC_LABEL[group.logic]}
          </button>
          <button
            type="button"
            aria-label="删除条件组"
            className="text-ink-3 hover:bg-danger-soft hover:text-danger ease-tau-out ml-auto cursor-pointer rounded-[6px] p-1 opacity-0 transition-opacity duration-[160ms] group-hover/nested:opacity-100"
            onClick={() => handleRemoveNode(parentId, group.id)}
          >
            <X className="size-3.5" strokeWidth={1.75} />
          </button>
        </div>
        <div className="flex flex-col gap-0.5">
          {group.children.map(child => renderNode(child, group))}
        </div>
        <button
          type="button"
          className="text-ink-3 hover:bg-hover hover:text-ink-1 rounded-tau-sm text-tau-sm ease-tau-out flex w-full cursor-pointer items-center gap-1 border-none bg-transparent px-2 py-1 transition-colors duration-[160ms]"
          onClick={() => handleAddCondition(group.id)}
          disabled={!filterableColumns.length}
        >
          <Plus className="size-3.5" strokeWidth={2.1} />
          <span>添加条件</span>
        </button>
      </div>
    );

    const renderCondition = (condition: FilterCondition, group: FilterGroup) => {
      const column = columns.find(col => col.id === condition.fieldId) ?? null;
      const definitions = column ? (pluginManager.getPlugin(column.type)?.filters ?? []) : [];
      const requiresValue = definitions.find(
        definition => definition.operator === condition.operator
      )?.requiresValue;

      return (
        <div
          key={condition.id}
          className="group/cond hover:bg-hover ease-tau-out rounded-tau-sm flex min-h-8 items-center gap-1 px-1 py-1 transition-colors duration-[160ms]"
        >
          <SimpleDropdown
            items={filterableColumns.map(col => ({
              key: col.id,
              label: (
                <div className="flex items-center gap-2">
                  <ColumnIcon type={col.type} pluginManager={pluginManager} />
                  <span>{col.title}</span>
                </div>
              ),
            }))}
            onSelect={value => handleFieldChange(condition.id, value)}
            className="min-w-0 flex-1"
          >
            <div className="text-ink-1 hover:bg-surface-hover text-tau-sm flex h-7 min-w-0 flex-1 cursor-pointer items-center gap-1.5 rounded-[7px] px-2 transition-colors">
              {column ? (
                <ColumnIcon type={column.type} pluginManager={pluginManager} />
              ) : (
                <span className="text-ink-3">选择字段</span>
              )}
              {column && <span className="truncate">{column.title}</span>}
              <ChevronDown
                className="text-ink-3 ml-auto size-3 shrink-0 opacity-60"
                strokeWidth={2.25}
              />
            </div>
          </SimpleDropdown>
          <SimpleDropdown
            items={definitions.map(def => ({
              key: def.operator,
              label: def.label ?? def.operator,
            }))}
            onSelect={value => handleOperatorChange(condition.id, value)}
          >
            <div className="text-ink-2 hover:bg-surface-hover text-tau-sm flex h-7 cursor-pointer items-center gap-1 whitespace-nowrap rounded-[7px] px-2 transition-colors">
              {definitions.find(d => d.operator === condition.operator)?.label ?? "操作"}
              <ChevronDown className="text-ink-3 size-3 shrink-0 opacity-60" strokeWidth={2.25} />
            </div>
          </SimpleDropdown>
          {column && requiresValue !== false && (
            <div className="min-w-0 flex-[1.2]">
              <FilterValueEditor
                key={`${condition.id}-${column.id}-${column.type}`}
                column={column}
                value={condition.value ?? null}
                onChange={value => handleValueChange(condition.id, value)}
                pluginManager={pluginManager}
                theme={theme}
              />
            </div>
          )}
          <button
            type="button"
            aria-label="删除条件"
            className="text-ink-3 hover:bg-danger-soft hover:text-danger ease-tau-out ml-auto grid size-6 shrink-0 cursor-pointer place-items-center rounded-[7px] opacity-0 transition-opacity duration-[160ms] group-hover/cond:opacity-100"
            onClick={() => handleRemoveNode(group.id, condition.id)}
          >
            <X className="size-3.5" strokeWidth={2.2} />
          </button>
        </div>
      );
    };

    return (
      <div className="text-ink-1 max-h-[520px] w-[384px] overflow-y-auto p-2.5">
        <div className="flex flex-col gap-2">
          <div className="flex items-baseline gap-2 px-1">
            <span className="text-tau-meta text-ink-1 font-semibold">筛选</span>
            {conditionCount > 0 && (
              <span className="text-tau-micro text-ink-3">{conditionCount} 个条件</span>
            )}
          </div>
          {filterableColumns.length === 0 ? (
            <div className="text-tau-body text-ink-3 px-3 py-8 text-center">
              当前没有支持筛选的字段
            </div>
          ) : (
            <>
              <div className="bg-group rounded-tau-sm flex p-0.5">
                {(Object.keys(LOGIC_SEGMENT_LABEL) as FilterLogicOperator[]).map(logic => (
                  <button
                    key={logic}
                    type="button"
                    onClick={() => handleGroupLogicChange(localFilters.id, logic)}
                    className={cn(
                      "text-tau-sm ease-tau-out h-6 flex-1 cursor-pointer rounded-[6px] transition-colors duration-[160ms]",
                      localFilters.logic === logic
                        ? "bg-surface text-ink-1 shadow-card font-medium"
                        : "text-ink-2 hover:text-ink-1"
                    )}
                  >
                    {LOGIC_SEGMENT_LABEL[logic]}
                  </button>
                ))}
              </div>
              {localFilters.children.length ? (
                <div className="flex flex-col gap-0.5">
                  {localFilters.children.map(child => renderNode(child, localFilters))}
                </div>
              ) : (
                <div className="flex flex-col items-center gap-1 py-5 text-center">
                  <p className="text-tau-body text-ink-2 font-medium">从添加条件开始</p>
                  <p className="text-tau-meta text-ink-3">按条件组合缩小本视图的范围</p>
                </div>
              )}
              <div className="flex gap-1 px-1">
                <button
                  type="button"
                  className="text-ink-2 hover:bg-hover hover:text-ink-1 rounded-tau-sm text-tau-sm ease-tau-out flex cursor-pointer items-center gap-1 border-none bg-transparent px-2 py-1.5 transition-colors duration-[160ms] disabled:cursor-not-allowed disabled:opacity-40"
                  onClick={() => handleAddCondition(localFilters.id)}
                  disabled={!filterableColumns.length}
                >
                  <Plus className="size-3.5" strokeWidth={2.1} />
                  <span>添加条件</span>
                </button>
                <button
                  type="button"
                  className="text-ink-3 hover:bg-hover hover:text-ink-1 rounded-tau-sm text-tau-sm ease-tau-out flex cursor-pointer items-center gap-1 border-none bg-transparent px-2 py-1.5 transition-colors duration-[160ms]"
                  onClick={() => handleAddGroup(localFilters.id)}
                >
                  <Plus className="size-3.5" strokeWidth={2.1} />
                  <span>添加条件组</span>
                </button>
              </div>
            </>
          )}
          <div className="border-line-2 mt-1 flex items-center gap-1.5 border-t px-1 pt-2.5">
            {conditionCount > 0 && (
              <button
                type="button"
                className="text-tau-micro text-ink-3 hover:text-danger ease-tau-out cursor-pointer rounded-[6px] px-1.5 py-1 transition-colors duration-[160ms]"
                onClick={handleClearAll}
              >
                清空
              </button>
            )}
            <span className="flex-1" />
            <Button variant="ghost" size="sm" onClick={onClose}>
              取消
            </Button>
            <Button variant="primary" size="sm" onClick={handleConfirm}>
              确定
            </Button>
          </div>
        </div>
      </div>
    );
  }
);

FilterPanel.displayName = "FilterPanel";

export default FilterPanel;

const findGroupById = (group: FilterGroup, targetId: string): FilterGroup | null => {
  if (group.id === targetId) return group;
  for (const child of group.children) {
    if (child.type === "group") {
      const found = findGroupById(child, targetId);
      if (found) return found;
    }
  }
  return null;
};

const findConditionById = (group: FilterGroup, conditionId: string): FilterCondition | null => {
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
    .map(child => {
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
        <div className="h-10 w-full overflow-hidden">
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
        <div className="h-10 w-full overflow-hidden">
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

    return <div className="text-tau-body text-ink-3">该字段暂无编辑器</div>;
  }
);

FilterValueEditor.displayName = "FilterValueEditor";
