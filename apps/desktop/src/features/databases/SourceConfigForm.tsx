/**
 * 数据源的范围、字段与预览：新建关联表与「调整范围与字段」共用。
 * 预览是主进程按当前范围与字段合并出的前几行，改动即刷新。
 */

import { useEffect, useMemo, useState } from "react";
import { Lock } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Checkbox, FilterPill, Loading, Select, cn } from "@tau/ui";
import type { CellValue, ColumnDef, DataTableSourceScope } from "@tau/shared/database-types";
import { previewDataSource } from "@/commands/data-table";
import { normalizeSourceFields, type SourceDef } from "./data-sources";
import { catalogOptions, draftReady, useDataSourceCatalog, type SourceDraft } from "./source-draft";

const RANGES = [
  { value: "month", label: "本月" },
  { value: "year", label: "今年" },
  { value: "all", label: "全部" },
] as const;

export function SourceScopeFields({
  def,
  draft,
  onChange,
}: {
  def: SourceDef;
  draft: SourceDraft;
  onChange(draft: SourceDraft): void;
}) {
  const { data: catalog } = useDataSourceCatalog();
  const options = catalogOptions(catalog, def.kind);
  const setScope = (scope: DataTableSourceScope) => onChange({ ...draft, scope });

  // 项目文档默认选最近更新的项目
  const firstProject = options.projects?.[0]?.id;
  useEffect(() => {
    if (def.kind === "document" && !draft.scope.projectId && firstProject)
      onChange({ ...draft, scope: { ...draft.scope, projectId: firstProject } });
  }, [def.kind, draft, firstProject, onChange]);

  const fields = normalizeSourceFields(def, draft.fields);
  const toggleField = (key: string, on: boolean) =>
    onChange({
      ...draft,
      fields: normalizeSourceFields(
        def,
        on ? [...fields, key] : fields.filter(item => item !== key)
      ),
    });

  return (
    <>
      <section className="flex flex-col gap-2">
        <h5 className="text-ink-2 text-[12px]">范围</h5>
        {def.kind === "document" && (
          <>
            <Select
              aria-label="项目"
              searchable
              placeholder={options.projects?.length ? "选择项目" : "还没有项目"}
              options={(options.projects ?? []).map(project => ({
                value: project.id,
                label: project.title || "未命名项目",
              }))}
              value={draft.scope.projectId ?? null}
              onValueChange={projectId => setScope({ ...draft.scope, projectId })}
              className="w-full"
            />
            <Checkbox
              label="包含子文档"
              checked={Boolean(draft.scope.deep)}
              onChange={event => setScope({ ...draft.scope, deep: event.target.checked })}
            />
          </>
        )}
        {def.kind === "diary" && (
          <div className="flex flex-wrap gap-1.5">
            {RANGES.map(range => (
              <FilterPill
                key={range.value}
                active={(draft.scope.range ?? "month") === range.value}
                label={range.label}
                onClick={() => setScope({ range: range.value })}
              />
            ))}
          </div>
        )}
        {(def.kind === "card" || def.kind === "article") && (
          <>
            <Select
              aria-label="标签"
              multiple
              searchable
              placeholder={`全部${def.unit}`}
              emptyText="没有匹配的标签"
              options={(options.tags ?? []).map(tag => ({ value: tag, label: tag }))}
              value={draft.scope.tags ?? []}
              onValueChange={tags => setScope({ tags: [...tags] })}
              className="w-full"
            />
            <p className="text-ink-3 text-[11.5px]">
              不选标签即全部{def.unit}；选了标签时包含它的子标签
            </p>
          </>
        )}
      </section>
      <section className="flex flex-col gap-2">
        <h5 className="text-ink-2 text-[12px]">字段</h5>
        <p className="text-ink-3 -mt-1 text-[11.5px]">带锁的字段只能在{def.label}里修改</p>
        <div className="flex flex-col gap-1.5">
          {def.fields.map(field => (
            <div key={field.key} className="flex items-center gap-2">
              <Checkbox
                label={field.title}
                checked={fields.includes(field.key)}
                disabled={field.primary}
                onChange={event => toggleField(field.key, event.target.checked)}
              />
              {!field.writable && (
                <Lock className="text-ink-3 size-3" strokeWidth={1.75} aria-label="只读" />
              )}
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

function previewText(column: ColumnDef, value: CellValue): string {
  if (value == null || value === "") return "";
  if (Array.isArray(value)) return value.join("、");
  if (typeof value === "boolean") return value ? "✓" : "";
  if (typeof value === "object" && "start" in value && typeof value.start === "number")
    return new Date(value.start).toLocaleDateString("zh-CN");
  if (column.type === "number") return String(value);
  return String(value);
}

export function SourcePreview({ def, draft }: { def: SourceDef; draft: SourceDraft }) {
  const ready = draftReady(def, draft);
  const input = useMemo(
    () => ({ kind: def.kind, scope: draft.scope, fields: draft.fields, limit: 12 }),
    [def.kind, draft]
  );
  const [debounced, setDebounced] = useState(input);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(input), 160);
    return () => window.clearTimeout(timer);
  }, [input]);
  const query = useQuery({
    queryKey: ["databases", "source-preview", debounced],
    queryFn: () => previewDataSource(debounced),
    enabled: ready,
    placeholderData: previous => previous,
  });

  if (!ready)
    return <p className="text-ink-3 p-6 text-center text-[12.5px]">选择一个项目后显示预览</p>;
  if (!query.data) return <Loading />;
  const { columns, rows, total } = query.data;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="text-ink-3 flex h-8 flex-none items-center gap-1.5 text-[12px]">
        <b className="text-ink-1 font-medium">{total} 行</b>
        {total > rows.length && <span>· 预览前 {rows.length} 行</span>}
      </div>
      <div className="border-line-1 rounded-tau-sm min-h-0 flex-1 overflow-auto border">
        {rows.length === 0 ? (
          <p className="text-ink-3 p-6 text-center text-[12.5px]">范围内还没有{def.unit}</p>
        ) : (
          <table className="w-full border-collapse text-[12.5px]">
            <thead>
              <tr>
                {columns.map(column => (
                  <th
                    key={column.id}
                    className="text-ink-3 border-line-1 bg-surface sticky top-0 border-b px-2.5 py-1.5 text-left font-normal whitespace-nowrap"
                  >
                    <span className="inline-flex items-center gap-1">
                      {column.title}
                      {column.readonly && <Lock className="size-3" strokeWidth={1.75} />}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr key={row.id}>
                  {columns.map(column => (
                    <td
                      key={column.id}
                      className={cn(
                        "border-line-1 text-ink-1 max-w-[220px] truncate border-b px-2.5 py-1.5",
                        column.isPrimary && "font-medium"
                      )}
                    >
                      {previewText(column, row[column.id])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
