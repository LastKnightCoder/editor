import React, { memo, useEffect, useState } from "react";
import { cn, Button, Dialog, DialogBody, Input, Select } from "@tau/ui";
import { DatabaseViewType } from "./types";
import { builtInViewRegistry } from "./views/builtInViewRegistry";
import type { ViewRegistry } from "./views/ViewRegistry";
import type { DatabaseViewDefinition } from "./views/types";
import type PluginManager from "./PluginManager";

interface ViewTypeSelectModalProps {
  open: boolean;
  onCancel: () => void;
  onConfirm: (type: DatabaseViewType, name: string, columnId?: string) => void;
  columns: Array<{ id: string; title: string; type: string }>;
  pluginManager: PluginManager;
  /** 运行时视图注册表；缺省为仅含内置四视图的注册表 */
  viewRegistry?: ViewRegistry;
  theme: "light" | "dark";
}

/** 该视图创建时是否有可选的必需列（按视图定义声明的字段能力过滤） */
const requiredColumnCandidates = (
  definition: DatabaseViewDefinition,
  columns: ViewTypeSelectModalProps["columns"],
  pluginManager: PluginManager
) =>
  definition.requiredColumn
    ? columns.filter(col =>
        pluginManager.hasCapability(col.type, definition.requiredColumn!.capability)
      )
    : null;

const ViewTypeSelectModal: React.FC<ViewTypeSelectModalProps> = memo(
  ({ open, onCancel, onConfirm, columns, pluginManager, viewRegistry = builtInViewRegistry }) => {
    const [selectedType, setSelectedType] = useState<DatabaseViewType | null>(null);
    const [name, setName] = useState("");
    const [columnId, setColumnId] = useState<string | null>(null);
    const [userModifiedName, setUserModifiedName] = useState(false);

    const definitions = viewRegistry.list();
    const selectedDefinition = selectedType ? viewRegistry.get(selectedType) : undefined;
    const requiredColumns = selectedDefinition
      ? requiredColumnCandidates(selectedDefinition, columns, pluginManager)
      : null;

    useEffect(() => {
      if (!open) {
        setSelectedType(null);
        setUserModifiedName(false);
        setName("");
        setColumnId(null);
      }
    }, [open]);

    const handleSelectType = (type: DatabaseViewType) => {
      // 切换类型时重置已选列：不同类型的必需列候选不同
      if (type !== selectedType) setColumnId(null);
      setSelectedType(type);
      // 如果用户没有手动修改过名称，则自动更新为新的视图类型名称
      if (!userModifiedName) {
        setName(viewRegistry.get(type)?.name ?? "");
      }
    };

    const canConfirm =
      Boolean(selectedType) && name.trim().length > 0 && (!requiredColumns || Boolean(columnId));

    const handleOk = () => {
      if (!selectedType || !canConfirm) return;
      onConfirm(selectedType, name.trim(), columnId ?? undefined);
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
        <DialogBody>
          <div className="flex flex-col gap-5 py-1">
            <div className="grid grid-cols-2 gap-3">
              {definitions.map(definition => {
                const Icon = definition.icon;
                const selected = selectedType === definition.type;
                const disabled = definition.requiredColumn
                  ? requiredColumnCandidates(definition, columns, pluginManager)?.length === 0
                  : false;
                const disabledReason = definition.requiredColumn?.unavailableReason;
                return (
                  <button
                    key={definition.type}
                    type="button"
                    disabled={disabled}
                    title={disabled ? disabledReason : undefined}
                    onClick={() => handleSelectType(definition.type)}
                    className={cn(
                      "ease-tau-out rounded-tau-md flex flex-col items-center justify-center gap-1.5 border p-5 transition-colors duration-[160ms]",
                      disabled
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
                    <span
                      className={cn("text-tau-body font-medium", selected && "text-accent-text")}
                    >
                      {definition.name}
                    </span>
                    {disabled && disabledReason && (
                      <span className="text-tau-micro text-ink-3">{disabledReason}</span>
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

                {selectedDefinition?.requiredColumn && (
                  <div className="flex flex-col gap-1.5">
                    <span className="text-tau-meta text-ink-2 font-medium">
                      {selectedDefinition.requiredColumn.columnLabel}
                    </span>
                    <Select
                      value={columnId}
                      onValueChange={setColumnId}
                      placeholder={selectedDefinition.requiredColumn.columnPlaceholder}
                      options={(requiredColumns ?? []).map(col => ({
                        value: col.id,
                        label: col.title,
                      }))}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        </DialogBody>
      </Dialog>
    );
  }
);

ViewTypeSelectModal.displayName = "ViewTypeSelectModal";

export default ViewTypeSelectModal;
