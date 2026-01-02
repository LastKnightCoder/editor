import React, { memo, useState, useEffect } from "react";
import { DataTableView, DataTableViewType } from "@/types";
import {
  ColumnDef,
  GalleryViewConfig,
  CalendarViewConfig,
  KanbanViewConfig,
} from "./types";
import { useMemoizedFn } from "ahooks";
import ColumnDropdown from "./ColumnDropdown";
import CustomRadio from "@/components/CustomRadio";

interface ViewEditPanelProps {
  view: DataTableView | null;
  columns: ColumnDef[];
  onConfirm: (
    viewId: number,
    name: string,
    type: DataTableViewType,
    galleryConfig?: GalleryViewConfig,
    calendarConfig?: CalendarViewConfig,
    kanbanConfig?: KanbanViewConfig,
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

    useEffect(() => {
      if (view) {
        const galleryConfig = view.config.galleryConfig;
        const calendarConfig = view.config.calendarConfig;
        const kanbanConfig = view.config.kanbanConfig;

        setName(view.name);
        setViewType(view.type);
        setCoverType(galleryConfig?.coverType || "detail");
        setCoverImageColumnId(galleryConfig?.coverImageColumnId || "");
        setDateColumnId(calendarConfig?.dateColumnId || "");
        setGroupColumnId(kanbanConfig?.groupColumnId || "");
      }
    }, [view]);

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

      const kanbanConfig: KanbanViewConfig | undefined =
        viewType === "kanban"
          ? {
              groupColumnId: groupColumnId!,
            }
          : undefined;

      onConfirm(
        view.id,
        name.trim(),
        viewType,
        galleryConfig,
        calendarConfig,
        kanbanConfig,
      );
      onClose();
    });

    const imageColumns = columns.filter((col) => col.type === "image");
    const dateColumns = columns.filter((col) => col.type === "date");
    const selectColumns = columns.filter((col) => col.type === "select");

    if (!view) return null;

    const canSave = name.trim() && (viewType !== "kanban" || groupColumnId);

    return (
      <div style={{ width: "380px", padding: "20px" }}>
        <div className="space-y-4">
          {/* Title */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400">
              视图名称
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-3.5 rounded-xl text-sm outline-none transition-all bg-gray-50 dark:bg-slate-950 border border-gray-200 dark:border-slate-700 text-gray-800 dark:text-white shadow-inner placeholder:text-gray-400 dark:placeholder:text-slate-500 focus:border-indigo-500 focus:shadow-[inset_0_2px_4px_rgba(0,0,0,0.05),0_0_0_3px_rgba(99,102,241,0.15)] dark:focus:shadow-[inset_0_2px_4px_rgba(0,0,0,0.2),0_0_0_3px_rgba(99,102,241,0.25)]"
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
              ].map((option) => (
                <CustomRadio
                  key={option.value}
                  checked={viewType === option.value}
                  onChange={() =>
                    setViewType(option.value as DataTableViewType)
                  }
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
                    label={
                      imageColumns.length === 0 ? "图片 （无图片列）" : "图片"
                    }
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
                  dateColumns.length === 0
                    ? "无日期列"
                    : "选择日期列（默认使用第一个日期列）"
                }
                disabled={dateColumns.length === 0}
                allowClear
                label="日期列"
              />
              {dateColumns.length === 0 && (
                <div className="text-sm text-gray-500 dark:text-slate-400 -mt-2">
                  请先添加一个日期类型的列
                </div>
              )}
            </>
          )}

          {/* Kanban Config */}
          {viewType === "kanban" && (
            <>
              <ColumnDropdown
                columns={selectColumns}
                selectedId={groupColumnId}
                onSelect={setGroupColumnId}
                placeholder={
                  selectColumns.length === 0
                    ? "无单选列"
                    : "选择用于看板分组的单选列"
                }
                disabled={selectColumns.length === 0}
                label="分组列"
              />
              {selectColumns.length === 0 && (
                <div className="text-sm text-gray-500 dark:text-slate-400 -mt-2">
                  请先添加一个单选类型的列
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-2 mt-6 pt-4 border-t border-gray-200 dark:border-slate-700">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-4 py-3 rounded-xl text-sm font-semibold cursor-pointer transition-all bg-gray-100 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-200 hover:bg-gray-200 dark:hover:bg-slate-700"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleOk}
            disabled={!canSave}
            className="flex-1 px-4 py-3 rounded-xl border-none text-sm font-semibold cursor-pointer transition-all bg-indigo-500 text-white shadow-[0_4px_14px_rgba(99,102,241,0.35),0_1px_2px_rgba(0,0,0,0.05)] hover:bg-indigo-600 hover:-translate-y-px active:translate-y-0 disabled:bg-gray-200 dark:disabled:bg-slate-800 disabled:text-gray-400 dark:disabled:text-slate-500 disabled:cursor-not-allowed disabled:shadow-none disabled:transform-none"
          >
            保存
          </button>
        </div>
      </div>
    );
  },
);

ViewEditPanel.displayName = "ViewEditPanel";

export default ViewEditPanel;
