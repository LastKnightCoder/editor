import { useRef, useState } from "react";
import Database, { type DatabaseRef, type DatabaseProps, type DatabaseView } from "@tau/database";
import { Button } from "@tau/ui";
import { useThemeStore } from "@tau/themes/react";
import * as fixture from "./fixture";

export function App() {
  const ref = useRef<DatabaseRef>(null);
  const snapshot = useRef({
    columns: fixture.columns,
    rows: fixture.rows,
    views: fixture.views,
    activeViewId: 1,
  });
  const [saves, setSaves] = useState(0);
  const mode = useThemeStore(state => state.mode);
  const setAppearance = useThemeStore(state => state.setAppearance);
  const onUpdateView: NonNullable<DatabaseProps["onUpdateView"]> = async (id, updates) => {
    const current = snapshot.current.views.find(view => view.id === id);
    if (!current) return null;
    const type = updates.type ?? current.type;
    const updated: DatabaseView = {
      ...current,
      name: updates.name ?? current.name,
      type,
      config: {
        ...current.config,
        // 宿主按目标视图类型把专属配置写入 viewOptions[type]，其余子键保留
        viewOptions:
          updates.viewOptions === undefined
            ? current.config.viewOptions
            : { ...current.config.viewOptions, [type]: updates.viewOptions },
      },
    };
    snapshot.current.views = snapshot.current.views.map(view => (view.id === id ? updated : view));
    return updated;
  };
  return (
    <main className="bg-page text-ink-1 font-tau flex h-full min-h-0 flex-col gap-4 p-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-tau-title font-semibold">Database Web 示例</h1>
        <span className="text-ink-3 text-tau-meta">内存保存次数：{saves}；刷新后恢复示例数据</span>
        <Button onClick={() => setAppearance(mode === "light" ? "dark" : "light")}>切换明暗</Button>
        <Button
          onClick={() =>
            ref.current?.dispatch(
              {
                type: "rows.apply",
                changes: {
                  upsert: [{ id: "r1", title: "外部确认更新" }],
                  remove: [],
                },
              },
              "external"
            )
          }
        >
          接收外部补丁
        </Button>
      </div>
      <div className="min-h-0 flex-1">
        <Database
          ref={ref}
          columns={fixture.columns}
          data={fixture.rows}
          views={fixture.views}
          activeViewId={1}
          viewConfig={fixture.config}
          onDataChange={data => {
            Object.assign(snapshot.current, data);
            setSaves(value => value + 1);
          }}
          onViewConfigChange={config => {
            snapshot.current.views = snapshot.current.views.map(view =>
              view.id === snapshot.current.activeViewId ? { ...view, config } : view
            );
          }}
          onActiveViewIdChange={async id => {
            if (id !== null) snapshot.current.activeViewId = id;
          }}
          onCreateView={async input => {
            const view: DatabaseView = {
              ...input,
              id: Math.max(...snapshot.current.views.map(view => view.id), 0) + 1,
              config: { ...fixture.config, ...input.config },
            };
            snapshot.current.views = [...snapshot.current.views, view];
            return view;
          }}
          onDeleteView={async id => {
            if (snapshot.current.views.length <= 1) return null;
            snapshot.current.views = snapshot.current.views.filter(view => view.id !== id);
            return id;
          }}
          onRenameView={(id, name) => onUpdateView(id, { name })}
          onUpdateView={onUpdateView}
          onReorderViews={async ids => {
            snapshot.current.views = snapshot.current.views.map(view => ({
              ...view,
              order: ids.indexOf(view.id),
            }));
          }}
        />
      </div>
    </main>
  );
}
