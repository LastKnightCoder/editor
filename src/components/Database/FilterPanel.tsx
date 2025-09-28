import { memo, useEffect, useMemo, useState } from "react";
import { Button, Select, Empty, Tooltip } from "antd";
import { v4 as uuidv4 } from "uuid";
import classNames from "classnames";
import { MdAdd, MdClose, MdOutlineAddBox } from "react-icons/md";
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

    const handleAddGroup = (groupId: string) => {
      setLocalFilters((prev) =>
        produce(prev, (draft) => {
          const target = findGroupById(draft, groupId);
          if (!target) return;
          target.children.push(createEmptyGroup());
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

    const handleCancel = () => {
      setLocalFilters(cloneFilterGroup(filters) ?? createEmptyGroup());
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
          className={classNames(
            "rounded-xl border border-[#2C2C2C] dark:border-[#A5A199] px-3 py-3 flex flex-col gap-3 bg-[#F5F5F5] dark:bg-[#1E1E1E]",
          )}
        >
          <div className="flex items-center gap-2">
            <Select
              size="small"
              value={group.logic}
              onChange={(value) => handleGroupLogicChange(group.id, value)}
              options={LOGIC_OPTIONS}
              className="w-20"
            />
            {parentId && (
              <Tooltip title="删除分组">
                <button
                  className="ml-auto text-[#807D78] hover:text-red-500"
                  onClick={() => handleRemoveNode(parentId, group.id)}
                >
                  <MdClose />
                </button>
              </Tooltip>
            )}
          </div>
          <div className="flex flex-col gap-2">
            {group.children.length ? (
              group.children.map((child) => renderNode(child, group))
            ) : (
              <div className="text-sm text-[#807D78] dark:text-[#A5A199] flex justify-center items-center h-20">
                请添加条件或分组
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              icon={<MdAdd />}
              onClick={() => handleAddCondition(group.id)}
              disabled={!filterableColumns.length}
            >
              添加条件
            </Button>
            <Button
              icon={<MdOutlineAddBox />}
              onClick={() => handleAddGroup(group.id)}
              disabled={!filterableColumns.length}
            >
              添加分组
            </Button>
          </div>
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
          className="flex flex-col gap-2 rounded-lg bg-white dark:bg-[#262626] px-3 py-3 border border-[#2C2C2C] dark:border-[#A5A199]"
        >
          <div className="flex items-center gap-2">
            <Select
              className="flex-1"
              placeholder="选择字段"
              value={condition.fieldId ?? undefined}
              onChange={(value) => handleFieldChange(condition.id, value)}
              options={filterableColumns.map((col) => ({
                label: col.title,
                value: col.id,
              }))}
            />
            <Select
              className="w-32"
              placeholder="操作符"
              value={condition.operator ?? undefined}
              onChange={(value) => handleOperatorChange(condition.id, value)}
              disabled={!column || definitions.length === 0}
              options={definitions.map((definition) => ({
                label: definition.label ?? definition.operator,
                value: definition.operator,
              }))}
            />
            <Tooltip title="删除条件">
              <button
                className="text-[#807D78] hover:text-red-500"
                onClick={() => handleRemoveNode(group.id, condition.id)}
              >
                <MdClose />
              </button>
            </Tooltip>
          </div>
          {column && requiresValue !== false && (
            <div className="border border-dashed border-[#2C2C2C] dark:border-[#A5A199] rounded-md px-2 py-1">
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
      <div
        className="w-[420px] max-h-[520px] overflow-y-auto text-[#2C2C2C] dark:text-[#FFFFFF]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex flex-col gap-4">
          <div>
            <div className="text-base font-semibold">筛选</div>
            <div className="text-xs text-[#807D78] dark:text-[#A5A199] mt-1">
              设置筛选条件以限定表格中的记录
            </div>
          </div>
          {filterableColumns.length === 0 ? (
            <Empty
              description="当前没有支持筛选的字段"
              image={Empty.PRESENTED_IMAGE_SIMPLE}
            />
          ) : (
            renderGroup(localFilters)
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button onClick={handleCancel}>取消</Button>
            <Button type="primary" onClick={handleConfirm}>
              确定
            </Button>
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

    return <div className="text-sm text-[#807D78]">该字段暂无编辑器</div>;
  },
);

FilterValueEditor.displayName = "FilterValueEditor";
