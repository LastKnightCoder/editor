import React, { memo, useEffect, useMemo, useState } from "react";
import { DatabaseView, DatabaseViewType } from "./types";
import { ColumnDef } from "./types";
import { useMemoizedFn } from "ahooks";
import PluginManager from "./PluginManager";
import { getViewOptions } from "./core/viewOptions";
import { Button, Input, Radio, RadioGroup } from "@tau/ui";
import { builtInViewRegistry } from "./views/builtInViewRegistry";
import type { ViewRegistry } from "./views/ViewRegistry";

interface ViewEditPanelProps {
  view: DatabaseView | null;
  columns: ColumnDef[];
  pluginManager: PluginManager;
  /** 运行时视图注册表；缺省为仅含内置四视图的注册表 */
  viewRegistry?: ViewRegistry;
  onConfirm: (viewId: number, name: string, type: DatabaseViewType, viewOptions?: unknown) => void;
  onClose: () => void;
}

const ViewEditPanel: React.FC<ViewEditPanelProps> = memo(
  ({ view, columns, pluginManager, viewRegistry = builtInViewRegistry, onConfirm, onClose }) => {
    const [name, setName] = useState("");
    const [viewType, setViewType] = useState<DatabaseViewType>("table");
    // 各视图类型的专属配置草稿互不干扰：切换类型再切回，未保存的编辑保留（同旧面板的分区状态）
    const [optionsByType, setOptionsByType] = useState<Record<string, unknown>>({});
    const [optionsCanSave, setOptionsCanSave] = useState(true);

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

    // 视图对象会随保存回写重建（引用变、身份不变）：编辑中的草稿只按视图身份重置
    const viewId = view?.id;
    useEffect(() => {
      if (!view) return;
      setName(view.name);
      setViewType(view.type);
      setOptionsByType({ [view.type]: getViewOptions(view.config, view.type) });
      setOptionsCanSave(true);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [viewId]);

    const handleTypeChange = useMemoizedFn((type: DatabaseViewType) => {
      if (type === viewType) return;
      setViewType(type);
      setOptionsCanSave(true);
      // 首次切到某类型时，从视图已有配置装载该类型的草稿
      setOptionsByType(previous =>
        type in previous ? previous : { ...previous, [type]: getViewOptions(view?.config, type) }
      );
    });

    const OptionsPanel = viewRegistry.get(viewType)?.OptionsPanel;

    const handleOk = useMemoizedFn(async () => {
      if (!view || !name.trim()) return;
      // 只提交当前视图类型的专属配置，由宿主写入 viewOptions[viewType]
      onConfirm(view.id, name.trim(), viewType, optionsByType[viewType]);
      onClose();
    });

    if (!view) return null;

    const canSave = name.trim() !== "" && optionsCanSave;

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
            onValueChange={value => handleTypeChange(value as DatabaseViewType)}
            orientation="vertical"
          >
            {viewRegistry.list().map(definition => (
              <Radio key={definition.type} value={definition.type} label={definition.name} />
            ))}
          </RadioGroup>

          {/* 视图专属配置区：由各视图定义的 OptionsPanel 提供 */}
          {OptionsPanel && (
            <OptionsPanel
              options={optionsByType[viewType]}
              onChange={nextOptions =>
                setOptionsByType(previous => ({ ...previous, [viewType]: nextOptions }))
              }
              columns={orderedColumns}
              pluginManager={pluginManager}
              setCanSave={setOptionsCanSave}
            />
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
