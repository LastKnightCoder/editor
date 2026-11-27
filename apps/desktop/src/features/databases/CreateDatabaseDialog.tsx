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
import { useDatabasesI18n, type DatabasesMessageKey } from "./i18n";

/* 来源提示走词典投影：source id 稳定，hint 文案随语言解析 */
const STARTERS: { source: QuerySource; icon: LucideIcon; hintKey: DatabasesMessageKey }[] = [
  { source: "cards", icon: StickyNote, hintKey: "create.hint.cards" },
  { source: "articles", icon: BookOpen, hintKey: "create.hint.articles" },
  { source: "documents", icon: FileText, hintKey: "create.hint.documents" },
  { source: "projects", icon: Folder, hintKey: "create.hint.projects" },
  { source: "todos", icon: SquareCheck, hintKey: "create.hint.todos" },
  { source: "calendar", icon: Calendar, hintKey: "create.hint.calendar" },
  { source: "diary", icon: NotebookPen, hintKey: "create.hint.diary" },
  { source: "whiteboards", icon: PenTool, hintKey: "create.hint.whiteboards" },
];

export interface CreateDatabaseDialogProps {
  open: boolean;
  onClose(): void;
  onCreated(created: { id: number }): void;
}

/** 新建实时查询：只选起点（一句话或来源），编辑都在创建后的数据库页里完成 */
export function CreateDatabaseDialog({ open, onClose, onCreated }: CreateDatabaseDialogProps) {
  const { t } = useDatabasesI18n();
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
      toast.error(error instanceof Error ? error.message : t("create.failed"));
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
      title={t("create.title")}
      locked={saving}
      width={720}
      footer={
        <>
          <span className="text-ink-3 mr-auto text-[12px]">
            {request.trim() ? t("create.assist.hintAi") : t("create.assist.hintReadonly")}
          </span>
          <Button
            variant="ghost"
            size="sm"
            disabled={saving}
            onClick={() => void create({ query: emptyQuery(), title: "实时查询" })}
          >
            {t("create.writeCode")}
          </Button>
          <Button
            variant="primary"
            size="sm"
            loading={saving}
            disabled={!ready}
            onClick={() => void submit()}
          >
            {request.trim() ? t("create.submit.generate") : t("create.submit.create")}
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
                placeholder={t("create.request.placeholder")}
                aria-label={t("create.request.aria")}
                className="text-ink-1 placeholder:text-ink-3 min-w-0 flex-1 bg-transparent text-[13px] outline-none"
              />
            </label>
            <p className="text-ink-3 mt-[18px] mb-2 text-[12px]">{t("create.source.divider")}</p>
          </>
        )}
        <div className="grid grid-cols-3 gap-2">
          {STARTERS.map(({ source: kind, icon: Icon, hintKey }) => (
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
                    ? t("create.source.title.database")
                    : QUERY_SOURCES[kind].title}
                </b>
                <span className="text-ink-3 block truncate text-[11.5px]">{t(hintKey)}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </Dialog>
  );
}
