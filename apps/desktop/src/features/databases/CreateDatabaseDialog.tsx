import { useState } from "react";
import {
  BookOpen,
  Calendar,
  FileText,
  Folder,
  NotebookPen,
  PenTool,
  Sparkles,
  SquareCheck,
  StickyNote,
  type LucideIcon,
} from "lucide-react";
import { Button, Dialog, cn, toast } from "@tau/ui";
import { QUERY_SOURCES, type QueryDefinition, type QuerySource } from "@tau/shared/query-database";
import { createDatabaseItem } from "@/commands/database-item";
import { emptyQuery, queueQueryOpenIntent } from "@/features/shared/query-database/headerSlot";
import { starterQuery } from "@/features/shared/query-database/summary";
import { useCodeAssist } from "@/features/shared/database/useFormulaAssist";

const STARTERS: { source: QuerySource; icon: LucideIcon; hint: string }[] = [
  { source: "cards", icon: StickyNote, hint: "标题、标签、字数、更新时间" },
  { source: "articles", icon: BookOpen, hint: "标题、标签、字数、置顶" },
  { source: "documents", icon: FileText, hint: "标题、所属项目、类型" },
  { source: "projects", icon: Folder, hint: "标题、归档、根文档数" },
  { source: "todos", icon: SquareCheck, hint: "待办、完成、截止日期、清单" },
  { source: "calendar", icon: Calendar, hint: "日程、开始、结束、全天" },
  { source: "diary", icon: NotebookPen, hint: "日期、标签、字数" },
  { source: "whiteboards", icon: PenTool, hint: "标题、标签、页数" },
];

export interface CreateDatabaseDialogProps {
  open: boolean;
  onClose(): void;
  onCreated(created: { id: number }): void;
}

/** 新建实时查询：只选起点（一句话或来源），编辑都在创建后的数据库页里完成 */
export function CreateDatabaseDialog({ open, onClose, onCreated }: CreateDatabaseDialogProps) {
  const assist = useCodeAssist("queryDatabase");
  const [request, setRequest] = useState("");
  const [source, setSource] = useState<QuerySource>();
  const [saving, setSaving] = useState(false);

  const create = async (input: { query: QueryDefinition; title: string; assist?: string }) => {
    setSaving(true);
    try {
      const created = await createDatabaseItem({
        title: input.title,
        query: input.query,
      });
      queueQueryOpenIntent(created.dataTableId, { assist: input.assist });
      onClose();
      onCreated(created);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "创建失败");
    } finally {
      setSaving(false);
    }
  };
  const submit = () => {
    const text = request.trim();
    if (text)
      return create({
        query: emptyQuery(),
        title: text.length > 24 ? `${text.slice(0, 24)}…` : text,
        assist: text,
      });
    if (source)
      return create({
        query: starterQuery(source),
        title: QUERY_SOURCES[source].title,
      });
  };
  const ready = Boolean(request.trim() || source);

  return (
    <Dialog
      open={open}
      onOpenChange={next => {
        if (!next && !saving) onClose();
      }}
      onAfterClose={() => {
        setRequest("");
        setSource(undefined);
      }}
      title="新建实时查询"
      locked={saving}
      width={720}
      footer={
        <>
          <span className="text-ink-3 mr-auto text-[12px]">
            {request.trim()
              ? "AI 会在打开的数据库里编写查询，写完即保存。"
              : "结果随原内容自动更新，只能查看。"}
          </span>
          <Button
            variant="ghost"
            size="sm"
            disabled={saving}
            onClick={() => void create({ query: emptyQuery(), title: "实时查询" })}
          >
            写代码
          </Button>
          <Button
            variant="primary"
            size="sm"
            loading={saving}
            disabled={!ready}
            onClick={() => void submit()}
          >
            {request.trim() ? "生成并打开" : "创建"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col px-6 pt-1 pb-5">
        {assist && (
          <>
            <label
              className={cn(
                "flex h-[46px] items-center gap-2.5 rounded-[11px] px-3.5",
                request.trim()
                  ? "shadow-[inset_0_0_0_1.5px_var(--tau-accent)]"
                  : "shadow-[inset_0_0_0_1px_var(--tau-line-1)]"
              )}
            >
              <Sparkles className="text-accent-text size-[15px] shrink-0" strokeWidth={1.75} />
              <input
                data-autofocus
                value={request}
                onChange={event => {
                  setRequest(event.target.value);
                  if (event.target.value.trim()) setSource(undefined);
                }}
                onKeyDown={event => {
                  if (event.key === "Enter" && !event.nativeEvent.isComposing && ready)
                    void submit();
                }}
                placeholder="描述你想看的数据，AI 写好查询"
                aria-label="描述想看的数据"
                className="text-ink-1 placeholder:text-ink-3 min-w-0 flex-1 bg-transparent text-[13px] outline-none"
              />
            </label>
            <p className="text-ink-3 mt-[18px] mb-2 text-[12px]">或者从一个来源开始</p>
          </>
        )}
        <div className="grid grid-cols-3 gap-2">
          {STARTERS.map(({ source: kind, icon: Icon, hint }) => (
            <button
              key={kind}
              type="button"
              aria-pressed={source === kind}
              onClick={() => {
                setSource(kind);
                setRequest("");
              }}
              onDoubleClick={() =>
                void create({
                  query: starterQuery(kind),
                  title: QUERY_SOURCES[kind].title,
                })
              }
              className={cn(
                "ease-tau-out flex gap-2.5 rounded-[10px] px-3 py-2.5 text-left transition-colors duration-[160ms]",
                source === kind
                  ? "bg-accent-soft shadow-[inset_0_0_0_1.5px_var(--tau-accent)]"
                  : "hover:bg-hover shadow-[inset_0_0_0_1px_var(--tau-line-1)]"
              )}
            >
              <Icon className="text-ink-2 mt-0.5 size-[15px] shrink-0" strokeWidth={1.75} />
              <span className="min-w-0">
                <b className="text-ink-1 block text-[13px] font-medium">
                  {QUERY_SOURCES[kind].title === "普通数据库行"
                    ? "数据库"
                    : QUERY_SOURCES[kind].title}
                </b>
                <span className="text-ink-3 block truncate text-[11.5px]">{hint}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </Dialog>
  );
}
