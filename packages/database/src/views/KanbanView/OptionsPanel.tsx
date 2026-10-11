import React, { memo, useEffect, useMemo } from "react";
import { useMemoizedFn } from "ahooks";
import { Checkbox, Radio, RadioGroup } from "@tau/ui";
import ColumnDropdown from "../../ColumnDropdown";
import type { ColumnDef, KanbanCardTemplate, KanbanViewConfig } from "../../types";
import type { ViewOptionsPanelProps } from "../types";
import { getTemplateDefaultCardDisplay, resolveKanbanCardDisplay } from "./cardDisplayConfig";

/** 看板视图的专属配置区块（受控，viewOptions.kanban）：分组列、卡片模板、完成列与可见字段 */
const KanbanOptionsPanel: React.FC<ViewOptionsPanelProps<KanbanViewConfig>> = memo(
  ({ options, onChange, columns, pluginManager, setCanSave }) => {
    const isBooleanColumn = useMemoizedFn((column: ColumnDef) =>
      pluginManager.hasCapability(column.type, "boolean")
    );
    const primaryColumnId = useMemo(() => columns.find(column => column.isPrimary)?.id, [columns]);
    // props.columns 已按当前视图列序排列，等价于原面板里 view.config.columnOrder 的重排结果
    const viewConfig = useMemo(
      () => ({ columnOrder: columns.map(column => column.id) }),
      [columns]
    );
    const groupColumnId = options?.groupColumnId ?? "";

    const kanbanDisplay = useMemo(
      () =>
        resolveKanbanCardDisplay({
          columns,
          viewConfig,
          kanban: options,
          primaryColumnId,
          groupColumnId: groupColumnId || undefined,
          isBooleanColumn,
        }),
      [columns, viewConfig, options, primaryColumnId, groupColumnId, isBooleanColumn]
    );

    useEffect(() => {
      setCanSave?.(Boolean(groupColumnId));
    }, [groupColumnId, setCanSave]);

    const patchCardDisplay = useMemoizedFn(
      (cardDisplay: Partial<NonNullable<KanbanViewConfig["cardDisplay"]>>) => {
        onChange({
          groupColumnId,
          cardDisplay: {
            template: kanbanDisplay.template,
            doneColumnId: kanbanDisplay.doneColumnId,
            visibleFieldIds: kanbanDisplay.visibleFieldIds,
            showFieldLabels: kanbanDisplay.showFieldLabels,
            ...cardDisplay,
          },
        });
      }
    );

    const handleTemplateChange = useMemoizedFn((template: KanbanCardTemplate) => {
      const preset = getTemplateDefaultCardDisplay({
        template,
        columns,
        viewConfig,
        groupColumnId: groupColumnId || undefined,
        primaryColumnId,
        doneColumnId: kanbanDisplay.doneColumnId,
      });
      patchCardDisplay({ template, visibleFieldIds: preset.visibleFieldIds });
    });

    const handleGroupColumnChange = useMemoizedFn((nextGroupColumnId: string) => {
      const resolved = resolveKanbanCardDisplay({
        columns,
        viewConfig,
        kanban: nextGroupColumnId
          ? {
              groupColumnId: nextGroupColumnId,
              cardDisplay: {
                template: kanbanDisplay.template,
                doneColumnId: kanbanDisplay.doneColumnId,
                visibleFieldIds: kanbanDisplay.visibleFieldIds,
                showFieldLabels: kanbanDisplay.showFieldLabels,
              },
            }
          : undefined,
        primaryColumnId,
        groupColumnId: nextGroupColumnId || undefined,
        isBooleanColumn,
      });
      onChange({
        groupColumnId: nextGroupColumnId,
        cardDisplay: {
          template: resolved.template,
          doneColumnId: resolved.doneColumnId,
          visibleFieldIds: resolved.visibleFieldIds,
          showFieldLabels: resolved.showFieldLabels,
        },
      });
    });

    const handleDoneColumnChange = useMemoizedFn((nextDoneColumnId: string) => {
      const resolved = resolveKanbanCardDisplay({
        columns,
        viewConfig,
        kanban: groupColumnId
          ? {
              groupColumnId,
              cardDisplay: {
                template: kanbanDisplay.template,
                doneColumnId: nextDoneColumnId || undefined,
                visibleFieldIds: kanbanDisplay.visibleFieldIds,
                showFieldLabels: kanbanDisplay.showFieldLabels,
              },
            }
          : undefined,
        primaryColumnId,
        groupColumnId: groupColumnId || undefined,
        isBooleanColumn,
      });
      patchCardDisplay({
        doneColumnId: nextDoneColumnId || undefined,
        visibleFieldIds: resolved.visibleFieldIds,
      });
    });

    const handleVisibleFieldToggle = useMemoizedFn((fieldId: string) => {
      const candidateOrder = new Map(
        kanbanDisplay.candidateFields.map((field, index) => [field.id, index])
      );
      const currentIds = new Set(kanbanDisplay.visibleFieldIds);
      if (currentIds.has(fieldId)) {
        currentIds.delete(fieldId);
      } else {
        currentIds.add(fieldId);
      }
      const nextVisibleFieldIds = Array.from(currentIds).sort(
        (idA, idB) =>
          (candidateOrder.get(idA) ?? Number.MAX_SAFE_INTEGER) -
          (candidateOrder.get(idB) ?? Number.MAX_SAFE_INTEGER)
      );
      patchCardDisplay({ visibleFieldIds: nextVisibleFieldIds });
    });

    const selectColumns = columns.filter(col =>
      pluginManager.hasCapability(col.type, "singleOption")
    );
    const checkboxColumns = columns.filter(col => isBooleanColumn(col) && !col.hidden);

    return (
      <>
        <RadioGroup
          label="卡片模板"
          value={kanbanDisplay.template}
          onValueChange={value => handleTemplateChange(value as KanbanCardTemplate)}
          orientation="vertical"
        >
          <Radio value="compact" label="简洁（仅标题）" />
          <Radio value="task" label="任务（标题 + 完成 + 2属性）" />
          <Radio value="detail" label="详情（标题 + 完成 + 4属性）" />
        </RadioGroup>

        <ColumnDropdown
          columns={selectColumns}
          selectedId={groupColumnId}
          onSelect={handleGroupColumnChange}
          placeholder={selectColumns.length === 0 ? "无单选列" : "选择用于看板分组的单选列"}
          disabled={selectColumns.length === 0}
          label="分组列"
        />
        {selectColumns.length === 0 && (
          <div className="text-tau-sm text-ink-3">请先添加一个单选类型的列</div>
        )}

        <ColumnDropdown
          columns={checkboxColumns}
          selectedId={kanbanDisplay.doneColumnId ?? ""}
          onSelect={handleDoneColumnChange}
          placeholder={
            checkboxColumns.length === 0 ? "无复选框列" : "自动选择第一个复选框列（可手动指定）"
          }
          disabled={checkboxColumns.length === 0}
          allowClear
          label="完成状态列"
        />
        {checkboxColumns.length === 0 && (
          <div className="text-tau-sm text-ink-3">当前没有复选框列，卡片将不显示完成状态</div>
        )}

        <div className="flex flex-col gap-1.5">
          <span className="text-tau-meta text-ink-2 font-medium">卡片属性字段</span>
          {kanbanDisplay.template === "compact" ? (
            <div className="bg-page text-tau-sm text-ink-3 rounded-tau-md px-3 py-2">
              简洁模板不展示属性字段
            </div>
          ) : (
            <div className="bg-page rounded-tau-md max-h-44 overflow-y-auto p-1.5">
              {kanbanDisplay.candidateFields.length === 0 ? (
                <div className="text-tau-sm text-ink-3 px-2 py-1">暂无可显示字段</div>
              ) : (
                kanbanDisplay.candidateFields.map(field => {
                  const checked = kanbanDisplay.visibleFieldIds.includes(field.id);
                  return (
                    <label
                      key={field.id}
                      className="rounded-tau-sm hover:bg-hover flex cursor-pointer items-center px-1.5 py-1"
                    >
                      <Checkbox
                        checked={checked}
                        onChange={() => handleVisibleFieldToggle(field.id)}
                      />
                      <span className="text-tau-sm text-ink-1 ml-2">{field.title}</span>
                    </label>
                  );
                })
              )}
            </div>
          )}
        </div>

        <label className="bg-page rounded-tau-md flex cursor-pointer items-center justify-between px-3 py-2">
          <span className="text-tau-sm text-ink-1">显示字段标签</span>
          <Checkbox
            checked={kanbanDisplay.showFieldLabels}
            onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
              patchCardDisplay({ showFieldLabels: event.target.checked })
            }
          />
        </label>
      </>
    );
  }
);

KanbanOptionsPanel.displayName = "KanbanOptionsPanel";

export default KanbanOptionsPanel;
