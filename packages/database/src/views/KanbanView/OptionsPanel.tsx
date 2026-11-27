import React, { memo, useEffect, useMemo } from "react";
import { useMemoizedFn } from "ahooks";
import { Checkbox, Radio, RadioGroup } from "@tau/ui";
import ColumnDropdown from "../../ColumnDropdown";
import type { ColumnDef, KanbanCardTemplate, KanbanViewConfig } from "../../types";
import type { ViewOptionsPanelProps } from "../types";
import {
  createCardFieldPredicate,
  getTemplateDefaultCardDisplay,
  resolveKanbanCardDisplay,
} from "./cardDisplayConfig";
import { useDatabaseI18n } from "../../i18n";

/** 看板视图的专属配置区块（受控，viewOptions.kanban）：分组列、卡片模板、完成列与可见字段 */
const KanbanOptionsPanel: React.FC<ViewOptionsPanelProps<KanbanViewConfig>> = memo(
  ({ options, onChange, columns, pluginManager, setCanSave }) => {
    const { t } = useDatabaseI18n();
    const isBooleanColumn = useMemoizedFn((column: ColumnDef) =>
      pluginManager.hasCapability(column.type, "boolean")
    );
    const isCardField = useMemoizedFn(createCardFieldPredicate(pluginManager));
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
          isCardField,
        }),
      [columns, viewConfig, options, primaryColumnId, groupColumnId, isBooleanColumn, isCardField]
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
        isCardField,
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
        isCardField,
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
        isCardField,
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
          label={t("kanban.templateLabel")}
          value={kanbanDisplay.template}
          onValueChange={value => handleTemplateChange(value as KanbanCardTemplate)}
          orientation="vertical"
        >
          <Radio value="compact" label={t("kanban.template.compact")} />
          <Radio value="task" label={t("kanban.template.task")} />
          <Radio value="detail" label={t("kanban.template.detail")} />
        </RadioGroup>

        <ColumnDropdown
          columns={selectColumns}
          selectedId={groupColumnId}
          onSelect={handleGroupColumnChange}
          placeholder={
            selectColumns.length === 0
              ? t("kanban.groupColumnEmpty")
              : t("kanban.groupColumnPlaceholder")
          }
          disabled={selectColumns.length === 0}
          label={t("kanban.groupColumnLabel")}
        />
        {selectColumns.length === 0 && (
          <div className="text-tau-sm text-ink-3">{t("kanban.groupColumnHint")}</div>
        )}

        <ColumnDropdown
          columns={checkboxColumns}
          selectedId={kanbanDisplay.doneColumnId ?? ""}
          onSelect={handleDoneColumnChange}
          placeholder={
            checkboxColumns.length === 0
              ? t("kanban.doneColumnEmpty")
              : t("kanban.doneColumnPlaceholder")
          }
          disabled={checkboxColumns.length === 0}
          allowClear
          label={t("kanban.doneColumnLabel")}
        />
        {checkboxColumns.length === 0 && (
          <div className="text-tau-sm text-ink-3">{t("kanban.doneColumnHint")}</div>
        )}

        <div className="flex flex-col gap-1.5">
          <span className="text-tau-meta text-ink-2 font-medium">{t("kanban.fieldsLabel")}</span>
          {kanbanDisplay.template === "compact" ? (
            <div className="bg-page text-tau-sm text-ink-3 rounded-tau-md px-3 py-2">
              {t("kanban.fieldsCompactHint")}
            </div>
          ) : (
            <div className="bg-page rounded-tau-md max-h-44 overflow-y-auto p-1.5">
              {kanbanDisplay.candidateFields.length === 0 ? (
                <div className="text-tau-sm text-ink-3 px-2 py-1">{t("kanban.fieldsEmpty")}</div>
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
          <span className="text-tau-sm text-ink-1">{t("kanban.showFieldLabels")}</span>
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
