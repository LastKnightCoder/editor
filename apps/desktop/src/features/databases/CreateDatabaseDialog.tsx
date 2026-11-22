/**
 * 新建数据库：第一步选空白表或已有数据源；选了数据源进入第二步配置范围、字段与名称，右侧实时预览。
 * 空白表沿用驾驶舱的名称 + 描述弹窗。
 */

import { useState } from "react";
import { ChevronLeft, Plus } from "lucide-react";
import { Button, Dialog, Input, toast } from "@tau/ui";
import { createDatabaseItem } from "@/commands/database-item";
import { DATA_SOURCES, sourceDef, requireSourceDef } from "./data-sources";
import { SourcePreview, SourceScopeFields } from "./SourceConfigForm";
import { SOURCE_ICONS, draftReady, initialDraft, type SourceDraft } from "./source-draft";
import type { DataTableSourceKind } from "@tau/shared/database-types";

export interface CreateDatabaseDialogProps {
  open: boolean;
  onClose(): void;
  /** 选了空白表：交给驾驶舱原有的新建弹窗 */
  onBlank(): void;
  onCreated(created: { id: number }): void;
}

const OPTION_CLASS =
  "border-line-1 hover:bg-hover rounded-tau-sm flex w-full cursor-pointer items-center gap-3 border px-3.5 py-3 text-left transition-colors duration-[160ms]";

export function CreateDatabaseDialog({
  open,
  onClose,
  onBlank,
  onCreated,
}: CreateDatabaseDialogProps) {
  const [kind, setKind] = useState<DataTableSourceKind | null>(null);
  const [draft, setDraft] = useState<SourceDraft | null>(null);
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const def = kind ? sourceDef(kind) : undefined;

  const choose = (next: DataTableSourceKind) => {
    const nextDef = requireSourceDef(next);
    setKind(next);
    setDraft(initialDraft(nextDef));
    setTitle(nextDef.label);
  };
  const back = () => {
    setKind(null);
    setDraft(null);
  };
  const close = () => {
    if (saving) return;
    onClose();
  };

  const create = async () => {
    if (!def || !draft) return;
    if (!title.trim()) {
      toast.warning("请输入名称");
      return;
    }
    setSaving(true);
    try {
      const created = await createDatabaseItem({
        title: title.trim(),
        source: { kind: def.kind, scope: draft.scope, fields: draft.fields },
      });
      toast.success("已创建");
      onClose();
      onCreated(created);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "创建失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={next => {
        if (!next) close();
      }}
      onAfterClose={back}
      title={def ? `从${def.label}新建` : "新建数据库"}
      locked={saving}
      width={def ? 960 : 520}
      height={def ? 600 : undefined}
      footer={
        def && draft ? (
          <>
            <span className="text-ink-3 mr-auto text-[12px]">
              表格随{def.label}实时更新，能改的字段会写回{def.label}
            </span>
            <Button
              variant="secondary"
              size="sm"
              icon={ChevronLeft}
              disabled={saving}
              onClick={back}
            >
              上一步
            </Button>
            <Button
              variant="primary"
              size="sm"
              loading={saving}
              disabled={!draftReady(def, draft)}
              onClick={create}
            >
              创建数据库
            </Button>
          </>
        ) : undefined
      }
    >
      {def && draft ? (
        <div className="flex h-full min-h-0 gap-5 px-6 pt-2 pb-4">
          <div className="flex w-[280px] flex-none flex-col gap-4 overflow-y-auto pr-1">
            <section className="flex flex-col gap-2">
              <h5 className="text-ink-2 text-[12px]">名称</h5>
              <Input
                data-autofocus
                value={title}
                onChange={event => setTitle(event.target.value)}
                placeholder="名称"
              />
            </section>
            <SourceScopeFields def={def} draft={draft} onChange={setDraft} />
          </div>
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <SourcePreview def={def} draft={draft} />
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4 px-6 pt-2 pb-5">
          <button
            type="button"
            className={OPTION_CLASS}
            onClick={() => {
              onClose();
              onBlank();
            }}
          >
            <Plus className="text-ink-2 size-[18px] flex-none" strokeWidth={1.75} />
            <span className="flex flex-col gap-0.5">
              <b className="text-ink-1 text-[13.5px] font-medium">空白数据库</b>
              <span className="text-ink-3 text-[12px]">从一张空表开始，自己定义列</span>
            </span>
          </button>
          <section className="flex flex-col gap-2">
            <h5 className="text-ink-2 text-[12px]">笔记与写作</h5>
            <div className="grid grid-cols-2 gap-2">
              {DATA_SOURCES.map(source => {
                const Icon = SOURCE_ICONS[source.kind];
                return (
                  <button
                    key={source.kind}
                    type="button"
                    className={OPTION_CLASS}
                    onClick={() => choose(source.kind)}
                  >
                    <Icon className="text-ink-2 size-[18px] flex-none" strokeWidth={1.75} />
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <b className="text-ink-1 text-[13.5px] font-medium">{source.label}</b>
                      <span className="text-ink-3 truncate text-[12px]">
                        {source.fields.map(field => field.title).join("、")}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        </div>
      )}
    </Dialog>
  );
}
