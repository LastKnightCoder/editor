/**
 * 关联表标题行右侧的数据源标记：说明数据来自哪里，可调整范围与字段、去源头打开。
 */

import { useRef, useState } from "react";
import { ExternalLink, SlidersHorizontal } from "lucide-react";
import { Button, Dialog, Popover, toast } from "@tau/ui";
import type { DataTableSource } from "@tau/shared/database-types";
import { updateDataTableSource } from "@/commands/data-table";
import { sourceDef, requireSourceDef } from "@/features/databases/data-sources";
import { SourcePreview, SourceScopeFields } from "@/features/databases/SourceConfigForm";
import { SOURCE_ICONS, draftReady, type SourceDraft } from "@/features/databases/source-draft";
import { openPage } from "@/services/page-navigation";

const SOURCE_PAGES = { card: "cards", article: "articles", diary: "diary" } as const;

function scopeText(source: DataTableSource, projectTitle?: string) {
  const def = requireSourceDef(source.kind);
  if (source.kind === "document")
    return `${projectTitle ?? "所选项目"}${source.scope.deep ? "，含子文档" : "，仅根目录"}`;
  if (source.kind === "diary")
    return { month: "本月", year: "今年", all: "全部" }[source.scope.range ?? "month"];
  return source.scope.tags?.length ? source.scope.tags.join("、") : `全部${def.unit}`;
}

export function DataSourcePill({
  tableId,
  source,
  customColumns,
  onChanged,
}: {
  tableId: number;
  source: DataTableSource;
  /** 自建列个数 */
  customColumns: number;
  onChanged(): Promise<void> | void;
}) {
  const def = sourceDef(source.kind);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<SourceDraft | null>(null);
  const editingSource = useRef(source);
  const [saving, setSaving] = useState(false);
  if (!def) return null;
  const Icon = SOURCE_ICONS[source.kind];

  const openSource = () => {
    setOpen(false);
    if (source.kind === "document") {
      if (source.scope.projectId) openPage("project-detail", { id: source.scope.projectId });
      return;
    }
    openPage(SOURCE_PAGES[source.kind]);
  };

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      await updateDataTableSource({
        tableId,
        expectedSource: editingSource.current,
        scope: draft.scope,
        fields: draft.fields,
      });
      setDraft(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存失败");
    } finally {
      // 另一窗口可能已调整字段；再次打开设置时使用最新快照。
      try {
        await onChanged();
      } catch (reloadError) {
        toast.error(reloadError instanceof Error ? reloadError.message : "重新读取数据源失败");
      }
      setSaving(false);
    }
  };

  return (
    <>
      <Popover
        open={open}
        onOpenChange={setOpen}
        placement="bottom-end"
        arrow={false}
        className="w-[300px]"
        trigger={
          <button
            type="button"
            title={`数据来自${def.label}`}
            className="border-line-1 text-ink-2 hover:bg-hover hover:text-ink-1 inline-flex h-7 shrink-0 cursor-pointer items-center gap-1.5 rounded-full border px-2.5 text-[12px] transition-colors duration-[160ms]"
          >
            <span className="bg-accent size-1.5 rounded-full" />
            <Icon className="size-3.5" strokeWidth={1.75} />
            {def.label}
          </button>
        }
      >
        <Popover.Header icon={<Icon strokeWidth={1.75} />}>数据来自{def.label}</Popover.Header>
        <Popover.Body>
          <dl className="grid grid-cols-[48px_1fr] gap-x-2 gap-y-1.5 text-[12.5px]">
            <dt className="text-ink-3">范围</dt>
            <dd className="text-ink-1 min-w-0 truncate">{scopeText(source)}</dd>
            <dt className="text-ink-3">字段</dt>
            <dd className="text-ink-1">
              {source.fields.length} 个来自{def.label}
              {customColumns > 0 && ` · ${customColumns} 个自建`}
            </dd>
            <dt className="text-ink-3">同步</dt>
            <dd className="text-ink-1">实时</dd>
          </dl>
          <div className="mt-3 flex flex-col gap-1">
            <Button
              variant="ghost"
              size="sm"
              icon={SlidersHorizontal}
              className="justify-start"
              onClick={() => {
                setOpen(false);
                editingSource.current = source;
                setDraft({ scope: source.scope, fields: source.fields });
              }}
            >
              调整范围与字段
            </Button>
            <Button
              variant="ghost"
              size="sm"
              icon={ExternalLink}
              className="justify-start"
              onClick={openSource}
            >
              在{def.label}中打开
            </Button>
          </div>
        </Popover.Body>
      </Popover>
      <Dialog
        open={draft !== null}
        onOpenChange={next => {
          if (!next && !saving) setDraft(null);
        }}
        title="调整范围与字段"
        locked={saving}
        width={960}
        height={600}
        footer={
          <>
            <span className="text-ink-3 mr-auto text-[12px]">
              取消的字段从表里移除，自建列和它们的值不受影响
            </span>
            <Button variant="secondary" size="sm" disabled={saving} onClick={() => setDraft(null)}>
              取消
            </Button>
            <Button
              variant="primary"
              size="sm"
              loading={saving}
              disabled={!draft || !draftReady(def, draft)}
              onClick={save}
            >
              保存
            </Button>
          </>
        }
      >
        {draft && (
          <div className="flex h-full min-h-0 gap-5 px-6 pt-2 pb-4">
            <div className="flex w-[280px] flex-none flex-col gap-4 overflow-y-auto pr-1">
              <SourceScopeFields def={def} draft={draft} onChange={setDraft} />
            </div>
            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              <SourcePreview def={def} draft={draft} />
            </div>
          </div>
        )}
      </Dialog>
    </>
  );
}
