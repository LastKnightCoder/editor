import React, { memo, useState, useEffect, useMemo } from "react";
import { DataTableView, DataTableViewType } from "@/types";
import {
  ColumnDef,
  GalleryViewConfig,
  CalendarViewConfig,
  KanbanCardTemplate,
  KanbanViewConfig,
} from "./types";
import { useMemoizedFn } from "ahooks";
import ColumnDropdown from "./ColumnDropdown";
import {
  getTemplateDefaultCardDisplay,
  resolveKanbanCardDisplay,
} from "./views/KanbanView/cardDisplayConfig";
import { Button, Input, Checkbox, Radio, RadioGroup } from "@tau/ui";

interface ViewEditPanelProps {
  view: DataTableView | null;
  columns: ColumnDef[];
  onConfirm: (
    viewId: number,
    name: string,
    type: DataTableViewType,
    galleryConfig?: GalleryViewConfig,
    calendarConfig?: CalendarViewConfig,
    kanbanConfig?: KanbanViewConfig
  ) => void;
  onClose: () => void;
}

const ViewEditPanel: React.FC<ViewEditPanelProps> = memo(
  ({ view, columns, onConfirm, onClose }) => {
    const [name, setName] = useState("");
    const [viewType, setViewType] = useState<DataTableViewType>("table");
    const [coverType, setCoverType] = useState<"detail" | "image">("detail");
    const [coverImageColumnId, setCoverImageColumnId] = useState<string>("");
    const [dateColumnId, setDateColumnId] = useState<string>("");
    const [groupColumnId, setGroupColumnId] = useState<string>("");
    const [kanbanTemplate, setKanbanTemplate] = useState<KanbanCardTemplate>("task");
    const [kanbanDoneColumnId, setKanbanDoneColumnId] = useState<string>("");
    const [kanbanVisibleFieldIds, setKanbanVisibleFieldIds] = useState<string[]>([]);
    const [kanbanShowFieldLabels, setKanbanShowFieldLabels] = useState(false);

    const orderedColumns = useMemo(() => {
      if (!view) return columns;
      const columnMap = new Map(columns.map(column => [column.id, column]));
      const ordered: ColumnDef[] = [];
      const usedIds = new Set<string>();

      view.config.columnOrder.forEach(columnId => {
        const found = columnMap.get(columnId);
        if (!found || usedIds.has(found.id)) return;
        ordered.push(found);
        usedIds.add(found.id);
      });

      columns.forEach(column => {
        if (usedIds.has(column.id)) return;
        ordered.push(column);
      });

      return ordered;
    }, [columns, view]);
    const primaryColumnId = useMemo(() => columns.find(column => column.isPrimary)?.id, [columns]);

    useEffect(() => {
      if (view) {
        const galleryConfig = view.config.galleryConfig;
        const calendarConfig = view.config.calendarConfig;
        const kanbanConfig = view.config.kanbanConfig;
        const resolvedKanbanDisplay = resolveKanbanCardDisplay({
          columns,
          viewConfig: view.config,
          kanbanConfig,
          primaryColumnId,
          groupColumnId: kanbanConfig?.groupColumnId,
        });

        setName(view.name);
        setViewType(view.type);
        setCoverType(galleryConfig?.coverType || "detail");
        setCoverImageColumnId(galleryConfig?.coverImageColumnId || "");
        setDateColumnId(calendarConfig?.dateColumnId || "");
        setGroupColumnId(kanbanConfig?.groupColumnId || "");
        setKanbanTemplate(resolvedKanbanDisplay.template);
        setKanbanDoneColumnId(resolvedKanbanDisplay.doneColumnId || "");
        setKanbanVisibleFieldIds(resolvedKanbanDisplay.visibleFieldIds);
        setKanbanShowFieldLabels(resolvedKanbanDisplay.showFieldLabels);
      }
    }, [view, columns, primaryColumnId]);

    const handleOk = useMemoizedFn(async () => {
      if (!view || !name.trim()) return;

      const galleryConfig: GalleryViewConfig | undefined =
        viewType === "gallery"
          ? {
              coverType,
              coverImageColumnId,
            }
          : undefined;

      const calendarConfig: CalendarViewConfig | undefined =
        viewType === "calendar"
          ? {
              dateColumnId,
            }
          : undefined;

      const resolvedKanbanDisplay = resolveKanbanCardDisplay({
        columns,
        viewConfig: view.config,
        kanbanConfig:
          viewType === "kanban" && groupColumnId
            ? {
                groupColumnId,
                cardDisplay: {
                  template: kanbanTemplate,
                  doneColumnId: kanbanDoneColumnId || undefined,
                  visibleFieldIds: kanbanVisibleFieldIds,
                  showFieldLabels: kanbanShowFieldLabels,
                },
              }
            : undefined,
        primaryColumnId,
        groupColumnId: groupColumnId || undefined,
      });

      const kanbanConfig: KanbanViewConfig | undefined =
        viewType === "kanban"
          ? {
              groupColumnId: groupColumnId!,
              cardDisplay: {
                template: resolvedKanbanDisplay.template,
                doneColumnId: resolvedKanbanDisplay.doneColumnId,
                visibleFieldIds: resolvedKanbanDisplay.visibleFieldIds,
                showFieldLabels: resolvedKanbanDisplay.showFieldLabels,
              },
            }
          : undefined;

      onConfirm(view.id, name.trim(), viewType, galleryConfig, calendarConfig, kanbanConfig);
      onClose();
    });

    const imageColumns = orderedColumns.filter(col => col.type === "image");
    const dateColumns = orderedColumns.filter(col => col.type === "date");
    const selectColumns = orderedColumns.filter(col => col.type === "select");
    const checkboxColumns = orderedColumns.filter(col => col.type === "checkbox" && !col.hidden);
    const effectiveViewConfig = view?.config ?? {
      columnOrder: orderedColumns.map(column => column.id),
    };

    const kanbanDisplay = resolveKanbanCardDisplay({
      columns,
      viewConfig: effectiveViewConfig,
      kanbanConfig: groupColumnId
        ? {
            groupColumnId,
            cardDisplay: {
              template: kanbanTemplate,
              doneColumnId: kanbanDoneColumnId || undefined,
              visibleFieldIds: kanbanVisibleFieldIds,
              showFieldLabels: kanbanShowFieldLabels,
            },
          }
        : undefined,
      primaryColumnId,
      groupColumnId: groupColumnId || undefined,
    });

    const handleTemplateChange = useMemoizedFn((template: KanbanCardTemplate) => {
      setKanbanTemplate(template);
      const preset = getTemplateDefaultCardDisplay({
        template,
        columns,
        viewConfig: effectiveViewConfig,
        groupColumnId: groupColumnId || undefined,
        primaryColumnId,
        doneColumnId: kanbanDoneColumnId || undefined,
      });
      setKanbanVisibleFieldIds(preset.visibleFieldIds);
    });

    const handleGroupColumnChange = useMemoizedFn((nextGroupColumnId: string) => {
      setGroupColumnId(nextGroupColumnId);
      const resolved = resolveKanbanCardDisplay({
        columns,
        viewConfig: effectiveViewConfig,
        kanbanConfig: nextGroupColumnId
          ? {
              groupColumnId: nextGroupColumnId,
              cardDisplay: {
                template: kanbanTemplate,
                doneColumnId: kanbanDoneColumnId || undefined,
                visibleFieldIds: kanbanVisibleFieldIds,
                showFieldLabels: kanbanShowFieldLabels,
              },
            }
          : undefined,
        primaryColumnId,
        groupColumnId: nextGroupColumnId || undefined,
      });
      setKanbanDoneColumnId(resolved.doneColumnId || "");
      setKanbanVisibleFieldIds(resolved.visibleFieldIds);
    });

    const handleDoneColumnChange = useMemoizedFn((nextDoneColumnId: string) => {
      setKanbanDoneColumnId(nextDoneColumnId);
      const resolved = resolveKanbanCardDisplay({
        columns,
        viewConfig: effectiveViewConfig,
        kanbanConfig: groupColumnId
          ? {
              groupColumnId,
              cardDisplay: {
                template: kanbanTemplate,
                doneColumnId: nextDoneColumnId || undefined,
                visibleFieldIds: kanbanVisibleFieldIds,
                showFieldLabels: kanbanShowFieldLabels,
              },
            }
          : undefined,
        primaryColumnId,
        groupColumnId: groupColumnId || undefined,
      });
      setKanbanVisibleFieldIds(resolved.visibleFieldIds);
    });

    const handleVisibleFieldToggle = useMemoizedFn((fieldId: string) => {
      const candidateOrder = new Map(
        kanbanDisplay.candidateFields.map((field, index) => [field.id, index])
      );
      const currentIds = new Set(kanbanVisibleFieldIds);
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
      setKanbanVisibleFieldIds(nextVisibleFieldIds);
    });

    if (!view) return null;

    const canSave = name.trim() && (viewType !== "kanban" || groupColumnId);

    return (
      <div
        style={{
          maxHeight: "min(85vh, 780px)",
        }}
        className="flex w-full min-w-0 flex-col gap-4 overflow-hidden p-5 pt-4"
      >
        <div className="min-h-0 space-y-4 overflow-y-auto pr-1">
          {/* Title */}
          <div className="flex flex-col gap-1.5">
            <span className="text-tau-meta text-ink-2 font-medium">视图名称</span>
            <Input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="请输入视图名称"
              maxLength={50}
              data-autofocus
            />
          </div>

          {/* View Type */}
          <RadioGroup
            label="视图类型"
            value={viewType}
            onValueChange={value => setViewType(value as DataTableViewType)}
            orientation="vertical"
          >
            <Radio value="table" label="表格" />
            <Radio value="gallery" label="画廊" />
            <Radio value="calendar" label="日历" />
            <Radio value="kanban" label="看板" />
          </RadioGroup>

          {/* Gallery Config */}
          {viewType === "gallery" && (
            <>
              <RadioGroup
                label="封面类型"
                value={coverType}
                onValueChange={value => setCoverType(value as "detail" | "image")}
                orientation="vertical"
              >
                <Radio value="detail" label="详情" />
                <Radio
                  value="image"
                  disabled={imageColumns.length === 0}
                  label={imageColumns.length === 0 ? "图片（无图片列）" : "图片"}
                />
              </RadioGroup>

              {coverType === "image" && imageColumns.length > 0 && (
                <ColumnDropdown
                  columns={imageColumns}
                  selectedId={coverImageColumnId}
                  onSelect={setCoverImageColumnId}
                  placeholder="选择图片列"
                  label="图片列"
                />
              )}
            </>
          )}

          {/* Calendar Config */}
          {viewType === "calendar" && (
            <>
              <ColumnDropdown
                columns={dateColumns}
                selectedId={dateColumnId}
                onSelect={setDateColumnId}
                placeholder={
                  dateColumns.length === 0 ? "无日期列" : "选择日期列（默认使用第一个日期列）"
                }
                disabled={dateColumns.length === 0}
                allowClear
                label="日期列"
              />
              {dateColumns.length === 0 && (
                <div className="text-tau-sm text-ink-3">请先添加一个日期类型的列</div>
              )}
            </>
          )}

          {/* Kanban Config */}
          {viewType === "kanban" && (
            <>
              <RadioGroup
                label="卡片模板"
                value={kanbanTemplate}
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
                selectedId={kanbanDoneColumnId}
                onSelect={handleDoneColumnChange}
                placeholder={
                  checkboxColumns.length === 0
                    ? "无复选框列"
                    : "自动选择第一个复选框列（可手动指定）"
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
                {kanbanTemplate === "compact" ? (
                  <div className="bg-page text-tau-sm text-ink-3 rounded-tau-md px-3 py-2">
                    简洁模板不展示属性字段
                  </div>
                ) : (
                  <div className="bg-page rounded-tau-md max-h-44 overflow-y-auto p-1.5">
                    {kanbanDisplay.candidateFields.length === 0 ? (
                      <div className="text-tau-sm text-ink-3 px-2 py-1">暂无可显示字段</div>
                    ) : (
                      kanbanDisplay.candidateFields.map(field => {
                        const checked = kanbanVisibleFieldIds.includes(field.id);
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
                  checked={kanbanShowFieldLabels}
                  onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                    setKanbanShowFieldLabels(event.target.checked)
                  }
                />
              </label>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex shrink-0 gap-2">
          <Button variant="secondary" size="sm" block onClick={onClose}>
            取消
          </Button>
          <Button variant="primary" size="sm" block onClick={handleOk} disabled={!canSave}>
            保存
          </Button>
        </div>
      </div>
    );
  }
);

ViewEditPanel.displayName = "ViewEditPanel";

export default ViewEditPanel;
