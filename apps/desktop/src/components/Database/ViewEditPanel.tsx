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
import CustomRadio from "@/components/CustomRadio";
import {
  getTemplateDefaultCardDisplay,
  resolveKanbanCardDisplay,
} from "./views/KanbanView/cardDisplayConfig";

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
          width: "min(380px, calc(100vw - 32px))",
          maxHeight: "min(85vh, 780px)",
          padding: "20px",
        }}
        className="flex flex-col overflow-hidden"
      >
        <div className="min-h-0 space-y-4 overflow-y-auto pr-1">
          {/* Title */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400">
              视图名称
            </label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3.5 text-sm text-gray-800 shadow-inner outline-none transition-all placeholder:text-gray-400 focus:border-[var(--th-border-focus)] focus:shadow-[var(--th-focus-ring)] dark:border-slate-700 dark:bg-zinc-950 dark:text-white dark:placeholder:text-slate-500"
              placeholder="请输入视图名称"
              maxLength={50}
            />
          </div>

          {/* View Type */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400">
              视图类型
            </label>
            <div className="space-y-2">
              {[
                { value: "table", label: "表格" },
                { value: "gallery", label: "画廊" },
                { value: "calendar", label: "日历" },
                { value: "kanban", label: "看板" },
              ].map(option => (
                <CustomRadio
                  key={option.value}
                  checked={viewType === option.value}
                  onChange={() => setViewType(option.value as DataTableViewType)}
                  label={option.label}
                  className="text-sm"
                />
              ))}
            </div>
          </div>

          {/* Gallery Config */}
          {viewType === "gallery" && (
            <>
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400">
                  封面类型
                </label>
                <div className="space-y-2">
                  <CustomRadio
                    checked={coverType === "detail"}
                    onChange={() => setCoverType("detail")}
                    label="详情"
                    className="text-sm"
                  />
                  <CustomRadio
                    checked={coverType === "image"}
                    onChange={() => setCoverType("image")}
                    label={imageColumns.length === 0 ? "图片 （无图片列）" : "图片"}
                    disabled={imageColumns.length === 0}
                    className="text-sm"
                  />
                </div>
              </div>

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
                <div className="-mt-2 text-sm text-gray-500 dark:text-slate-400">
                  请先添加一个日期类型的列
                </div>
              )}
            </>
          )}

          {/* Kanban Config */}
          {viewType === "kanban" && (
            <>
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400">
                  卡片模板
                </label>
                <div className="space-y-2">
                  {[
                    { value: "compact", label: "简洁（仅标题）" },
                    { value: "task", label: "任务（标题 + 完成 + 2属性）" },
                    { value: "detail", label: "详情（标题 + 完成 + 4属性）" },
                  ].map(templateOption => (
                    <CustomRadio
                      key={templateOption.value}
                      checked={kanbanTemplate === templateOption.value}
                      onChange={() =>
                        handleTemplateChange(templateOption.value as KanbanCardTemplate)
                      }
                      label={templateOption.label}
                      className="text-sm"
                    />
                  ))}
                </div>
              </div>

              <ColumnDropdown
                columns={selectColumns}
                selectedId={groupColumnId}
                onSelect={handleGroupColumnChange}
                placeholder={selectColumns.length === 0 ? "无单选列" : "选择用于看板分组的单选列"}
                disabled={selectColumns.length === 0}
                label="分组列"
              />
              {selectColumns.length === 0 && (
                <div className="-mt-2 text-sm text-gray-500 dark:text-slate-400">
                  请先添加一个单选类型的列
                </div>
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
                <div className="-mt-2 text-sm text-gray-500 dark:text-slate-400">
                  当前没有复选框列，卡片将不显示完成状态
                </div>
              )}

              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400">
                  卡片属性字段
                </label>
                {kanbanTemplate === "compact" ? (
                  <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500 dark:border-slate-700 dark:bg-zinc-900 dark:text-slate-400">
                    简洁模板不展示属性字段
                  </div>
                ) : (
                  <div className="max-h-44 space-y-2 overflow-y-auto rounded-xl border border-gray-200 bg-gray-50 p-2 dark:border-slate-700 dark:bg-zinc-950">
                    {kanbanDisplay.candidateFields.length === 0 ? (
                      <div className="px-2 py-1 text-sm text-gray-500 dark:text-slate-400">
                        暂无可显示字段
                      </div>
                    ) : (
                      kanbanDisplay.candidateFields.map(field => {
                        const checked = kanbanVisibleFieldIds.includes(field.id);
                        return (
                          <label
                            key={field.id}
                            className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 hover:bg-gray-100 dark:hover:bg-zinc-800"
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => handleVisibleFieldToggle(field.id)}
                              className="h-4 w-4 accent-indigo-500"
                            />
                            <span className="text-sm text-gray-700 dark:text-slate-200">
                              {field.title}
                            </span>
                          </label>
                        );
                      })
                    )}
                  </div>
                )}
              </div>

              <label className="flex cursor-pointer items-center justify-between rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 dark:border-slate-700 dark:bg-zinc-950">
                <span className="text-sm text-gray-700 dark:text-slate-200">显示字段标签</span>
                <input
                  type="checkbox"
                  checked={kanbanShowFieldLabels}
                  onChange={event => setKanbanShowFieldLabels(event.target.checked)}
                  className="h-4 w-4 accent-indigo-500"
                />
              </label>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="mt-4 flex shrink-0 gap-2 border-t border-gray-200 pt-4 dark:border-slate-700">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 cursor-pointer rounded-xl border border-gray-200 bg-gray-100 px-4 py-3 text-sm font-semibold text-gray-700 transition-all hover:bg-gray-200 dark:border-slate-700 dark:bg-zinc-800 dark:text-slate-200 dark:hover:bg-zinc-700"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleOk}
            disabled={!canSave}
            className="flex-1 cursor-pointer rounded-xl border-none bg-[var(--th-btn-bg)] px-4 py-3 text-sm font-semibold text-[var(--th-btn-text)] shadow-[0_4px_14px_rgba(99,102,241,0.35),0_1px_2px_rgba(0,0,0,0.05)] transition-all hover:-translate-y-px hover:bg-[var(--th-btn-hover)] active:translate-y-0 disabled:transform-none disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400 disabled:shadow-none dark:disabled:bg-zinc-800 dark:disabled:text-slate-500"
          >
            保存
          </button>
        </div>
      </div>
    );
  }
);

ViewEditPanel.displayName = "ViewEditPanel";

export default ViewEditPanel;
