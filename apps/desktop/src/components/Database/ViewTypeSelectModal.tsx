import React, { memo, useEffect, useState } from "react";
import { CalendarDays, LayoutGrid, SquareKanban, Table2 } from "lucide-react";
import { cn, Button, Dialog, Input, Select } from "@tau/ui";
import { DataTableViewType } from "@/types";

interface ViewType {
  type: DataTableViewType | string;
  name: string;
  icon: typeof Table2;
  disabled?: boolean;
  disabledReason?: string;
}

interface ViewTypeSelectModalProps {
  open: boolean;
  onCancel: () => void;
  onConfirm: (
    type: DataTableViewType,
    name: string,
    dateColumnId?: string,
    groupColumnId?: string
  ) => void;
  columns: Array<{ id: string; title: string; type: string }>;
  theme: "light" | "dark";
}

const ViewTypeSelectModal: React.FC<ViewTypeSelectModalProps> = memo(
  ({ open, onCancel, onConfirm, columns }) => {
    const [selectedType, setSelectedType] = useState<DataTableViewType | null>(null);
    const [name, setName] = useState("");
    const [dateColumnId, setDateColumnId] = useState<string | null>(null);
    const [groupColumnId, setGroupColumnId] = useState<string | null>(null);
    const [userModifiedName, setUserModifiedName] = useState(false);

    // 检查是否有日期列
    const dateColumns = columns.filter(col => col.type === "date");

    // 检查是否有单选列
    const selectColumns = columns.filter(col => col.type === "select");

    // 动态生成视图类型列表
    const viewTypes: ViewType[] = [
      { type: "table", name: "表格", icon: Table2 },
      { type: "gallery", name: "画廊", icon: LayoutGrid },
      {
        type: "calendar",
        name: "日历",
        icon: CalendarDays,
        disabled: dateColumns.length === 0,
        disabledReason: "需要至少一个日期列",
      },
      {
        type: "kanban",
        name: "看板",
        icon: SquareKanban,
        disabled: selectColumns.length === 0,
        disabledReason: "需要至少一个单选列",
      },
    ];

    useEffect(() => {
      if (!open) {
        setSelectedType(null);
        setUserModifiedName(false);
        setName("");
        setDateColumnId(null);
        setGroupColumnId(null);
      }
    }, [open]);

    const handleSelectType = (type: DataTableViewType) => {
      setSelectedType(type);
      // 如果用户没有手动修改过名称，则自动更新为新的视图类型名称
      if (!userModifiedName) {
        setName(viewTypes.find(v => v.type === type)?.name || "");
      }
    };

    const canConfirm =
      Boolean(selectedType) &&
      name.trim().length > 0 &&
      (selectedType !== "calendar" || Boolean(dateColumnId)) &&
      (selectedType !== "kanban" || Boolean(groupColumnId));

    const handleOk = () => {
      if (!selectedType || !canConfirm) return;
      onConfirm(selectedType, name.trim(), dateColumnId ?? undefined, groupColumnId ?? undefined);
    };

    return (
      <Dialog
        open={open}
        onOpenChange={next => {
          if (!next) onCancel();
        }}
        title="添加新视图"
        width={600}
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={onCancel}>
              取消
            </Button>
            <Button variant="primary" size="sm" disabled={!canConfirm} onClick={handleOk}>
              创建
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-5 py-1">
          <div className="grid grid-cols-2 gap-3">
            {viewTypes.map(viewType => {
              const Icon = viewType.icon;
              const selected = selectedType === viewType.type;
              return (
                <button
                  key={viewType.type}
                  type="button"
                  disabled={viewType.disabled}
                  title={viewType.disabled ? viewType.disabledReason : undefined}
                  onClick={() => handleSelectType(viewType.type as DataTableViewType)}
                  className={cn(
                    "ease-tau-out rounded-tau-md flex flex-col items-center justify-center gap-1.5 border p-5 transition-colors duration-[160ms]",
                    viewType.disabled
                      ? "text-ink-3 border-line-2 bg-page cursor-not-allowed opacity-60"
                      : selected
                        ? "border-accent bg-accent-soft text-accent-text cursor-pointer"
                        : "border-line-1 bg-surface text-ink-2 hover:border-ink-3 hover:bg-hover cursor-pointer"
                  )}
                >
                  <Icon
                    className={cn("size-8", selected ? "text-accent" : "text-ink-2")}
                    strokeWidth={1.5}
                  />
                  <span className={cn("text-tau-body font-medium", selected && "text-accent-text")}>
                    {viewType.name}
                  </span>
                  {viewType.disabled && viewType.disabledReason && (
                    <span className="text-tau-micro text-ink-3">{viewType.disabledReason}</span>
                  )}
                </button>
              );
            })}
          </div>
          {selectedType && (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <span className="text-tau-meta text-ink-2 font-medium">视图名称</span>
                <Input
                  value={name}
                  onChange={e => {
                    setName(e.target.value);
                    setUserModifiedName(true);
                  }}
                  placeholder="请输入视图名称"
                  maxLength={50}
                />
              </div>

              {selectedType === "calendar" && (
                <div className="flex flex-col gap-1.5">
                  <span className="text-tau-meta text-ink-2 font-medium">日期列</span>
                  <Select
                    value={dateColumnId}
                    onValueChange={setDateColumnId}
                    placeholder="选择用于日历的日期列"
                    options={dateColumns.map(col => ({ value: col.id, label: col.title }))}
                  />
                </div>
              )}

              {selectedType === "kanban" && (
                <div className="flex flex-col gap-1.5">
                  <span className="text-tau-meta text-ink-2 font-medium">分组列</span>
                  <Select
                    value={groupColumnId}
                    onValueChange={setGroupColumnId}
                    placeholder="选择用于看板分组的单选列"
                    options={selectColumns.map(col => ({ value: col.id, label: col.title }))}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </Dialog>
    );
  }
);

ViewTypeSelectModal.displayName = "ViewTypeSelectModal";

export default ViewTypeSelectModal;
