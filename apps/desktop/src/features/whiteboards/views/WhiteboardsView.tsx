/**
 * 白板列表页 · 画廊，
 * 外壳为一整张纸（同文章 / 卡片库）：纸顶工具栏（标题 / 标签范围 + 摘要 · 标题过滤 · 排序 · 新建）
 * → 纸内缩略图卡片网格（细描边卡）。
 *
 * 页面参数 id = 标签范围（侧栏子项，`tag:<名>` / `untagged`，空 = 全部），标签不在页内另做目录。
 * 点卡片进入白板详情（whiteboard-detail）；多页白板悬停扫到哪页就打开哪页。
 */

import { displayTitle } from "../format";
import { useWhiteboardI18n, whiteboardTranslator } from "../i18n";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Presentation, Search, SearchX, X } from "lucide-react";
import { Button, ConfirmDialog, Input, Loading, Segmented, toast } from "@tau/ui";
import { FadeScroll } from "@tau/ui";
import { usePage, usePageParams } from "@/page/PageProvider";
import {
  inScope,
  matchTitle,
  openTarget,
  parseScope,
  rankTags,
  scopeId,
  sortItems,
  type WhiteboardItem,
  type WhiteboardScope,
  type WhiteboardSort,
} from "../model";
import { useWhiteboardMutations, useWhiteboardRefs, useWhiteboards } from "../queries";
import { WhiteboardCard } from "../components/WhiteboardCard";
import { WhiteboardInfoDialog } from "../components/WhiteboardInfoDialog";

export function WhiteboardsView() {
  const { t } = useWhiteboardI18n();
  const { navigator } = usePage();
  const params = usePageParams<{ id?: string }>();
  const scope = parseScope(params.id);
  const { items, loading } = useWhiteboards();
  const mutations = useWhiteboardMutations();

  const [sort, setSort] = useState<WhiteboardSort>("updated");
  const [query, setQuery] = useState("");
  const [dialog, setDialog] = useState<
    { mode: "create" } | { mode: "edit"; item: WhiteboardItem } | null
  >(null);
  // 删除目标在关闭动画期间保留，open 单独控制
  const [deleteTarget, setDeleteTarget] = useState<WhiteboardItem | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  // 相对时间每分钟刷新一次
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const setScope = useCallback(
    (next: WhiteboardScope) => navigator.push("whiteboard", { id: scopeId(next) }),
    [navigator]
  );

  const all = useMemo(() => items ?? [], [items]);
  const inRange = useMemo(
    () =>
      sortItems(
        all.filter(item => inScope(item, scope)),
        sort
      ),
    // scope 每次渲染新建，按其 id 比较
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [all, scopeId(scope), sort]
  );
  const visible = useMemo(() => inRange.filter(item => matchTitle(item, query)), [inRange, query]);
  const knownTags = useMemo(() => rankTags(all).map(t => t.name), [all]);
  const pageTotal = useMemo(() => all.reduce((sum, item) => sum + item.pages.length, 0), [all]);

  const open = useCallback(
    (item: WhiteboardItem, pageIndex?: number) => {
      const target = openTarget(item, pageIndex);
      if (target === null) {
        toast.error(whiteboardTranslator.t("list.noPage"));
        return;
      }
      navigator.push("whiteboard-detail", { id: item.id, page: target });
    },
    [navigator]
  );

  if (loading) return <Loading />;

  const filtering = query.trim().length > 0;

  return (
    <div className="@container mx-auto flex h-full min-h-0 w-full max-w-[1720px] flex-col px-4 pt-1 pb-4">
      {/* 一整张纸：工具栏固定在纸顶，网格在纸内滚动（同文章 / 卡片库） */}
      <div className="bg-surface shadow-card rounded-tau-lg flex min-h-0 flex-1 flex-col overflow-hidden">
        {/* 工具栏：标题 / 当前标签 + 摘要 + 标题过滤 + 排序 + 新建 */}
        <div className="mt-5 mb-3 flex h-10 flex-none items-center gap-3 px-8">
          <h1 className="text-tau-title-lg shrink-0 font-semibold tracking-[-0.01em] whitespace-nowrap">
            {t("title")}
          </h1>
          {scope.kind !== "all" && (
            <button
              type="button"
              title={t("list.clearScope")}
              onClick={() => setScope({ kind: "all" })}
              className="bg-selected text-accent-text inline-flex h-6 max-w-[180px] shrink-0 items-center gap-1 rounded-full pr-1.5 pl-2.5 text-[12px] font-medium"
            >
              <span className="truncate">
                {scope.kind === "tag" ? scope.tag : t("tags.untagged")}
              </span>
              <X className="size-3 shrink-0" strokeWidth={2} />
            </button>
          )}
          <span className="text-tau-meta text-ink-2 w-0 flex-1 truncate whitespace-nowrap tabular-nums">
            {all.length > 0 &&
              (filtering
                ? t("list.found", { visible: visible.length, count: inRange.length })
                : scope.kind === "all"
                  ? t("list.totalPages", { count: all.length, pages: pageTotal })
                  : t("list.total", { count: inRange.length }))}
          </span>
          {all.length > 0 && (
            <>
              <Input
                size="sm"
                lead={Search}
                clearable
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Escape" && query) {
                    e.stopPropagation();
                    setQuery("");
                  }
                }}
                placeholder={t("list.search")}
                // 输入框自身不贡献最小宽度，窄窗口下随标题栏收缩
                className="w-0"
                wrapperClassName="w-auto max-w-[240px] flex-[0_1_240px]"
              />
              <Segmented
                label={t("list.sort")}
                size="sm"
                value={sort}
                onValueChange={(v: WhiteboardSort) => setSort(v)}
                className="shrink-0"
              >
                <Segmented.Item value="updated" label={t("list.updated")} />
                <Segmented.Item value="created" label={t("list.created")} />
                <Segmented.Item value="title" label={t("list.name")} />
              </Segmented>
            </>
          )}
          <Button
            variant="primary"
            size="sm"
            icon={Plus}
            className="shrink-0 whitespace-nowrap"
            onClick={() => setDialog({ mode: "create" })}
          >
            {t("create")}
          </Button>
        </div>

        {/* 滚动区：FadeScroll（右侧 6px 透明边 + pr-[26px] = 左侧 pl-8），离纸底 16px；
            pt-1 给首行卡片 hover 的 lift 阴影留出绘制空间 */}
        <FadeScroll className="mb-4 min-h-0 flex-1 pt-1 pr-[26px] pb-2 pl-8">
          {all.length === 0 ? (
            <Empty
              icon={Presentation}
              title={t("list.empty")}
              text={t("list.emptyDescription")}
              action={
                <Button
                  variant="soft"
                  size="sm"
                  icon={Plus}
                  onClick={() => setDialog({ mode: "create" })}
                >
                  {t("create")}
                </Button>
              }
            />
          ) : visible.length === 0 ? (
            filtering ? (
              <Empty
                icon={SearchX}
                title={t("list.noMatch")}
                text={t(scope.kind === "all" ? "list.noMatchDescription" : "list.noMatchInScope", {
                  query: query.trim(),
                })}
                action={
                  <Button variant="secondary" size="sm" onClick={() => setQuery("")}>
                    {t("list.clearFilter")}
                  </Button>
                }
              />
            ) : (
              <Empty
                icon={Presentation}
                title={t("list.scopeEmpty")}
                text={t(scope.kind === "tag" ? "list.createTagged" : "list.allTagged")}
                action={
                  scope.kind === "tag" ? (
                    <Button
                      variant="soft"
                      size="sm"
                      icon={Plus}
                      onClick={() => setDialog({ mode: "create" })}
                    >
                      {t("list.createHere")}
                    </Button>
                  ) : undefined
                }
              />
            )
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3.5">
              {visible.map(item => (
                <WhiteboardCard
                  key={item.id}
                  item={item}
                  now={now}
                  query={query}
                  onOpen={open}
                  onEdit={it => setDialog({ mode: "edit", item: it })}
                  onPickCover={it =>
                    void mutations
                      .pickCover(it.id)
                      .then(done => done && toast.success(whiteboardTranslator.t("cover.updated")))
                      .catch(() => toast.error(whiteboardTranslator.t("cover.failed")))
                  }
                  onRemoveCover={it =>
                    void mutations
                      .removeCover(it.id)
                      .then(() => toast.success(whiteboardTranslator.t("cover.thumbnail")))
                      .catch(() => toast.error(whiteboardTranslator.t("operationFailed")))
                  }
                  onDelete={it => {
                    setDeleteTarget(it);
                    setDeleteOpen(true);
                  }}
                />
              ))}
            </div>
          )}
        </FadeScroll>
      </div>

      <WhiteboardInfoDialog
        open={dialog !== null}
        initial={dialog?.mode === "edit" ? dialog.item : null}
        presetTags={scope.kind === "tag" ? [scope.tag] : []}
        knownTags={knownTags}
        onClose={() => setDialog(null)}
        onSubmit={async info => {
          if (dialog?.mode === "edit") {
            await mutations.saveInfo(dialog.item.id, info);
            toast.success(whiteboardTranslator.t("saved"));
            return;
          }
          const board = await mutations.create(info);
          navigator.push("whiteboard-detail", { id: board.id });
        }}
      />

      <DeleteDialog
        item={deleteTarget}
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={async item => {
          await mutations.remove(item);
          toast.success(
            whiteboardTranslator.t("deleted", { title: displayTitle(item, whiteboardTranslator.t) })
          );
        }}
      />
    </div>
  );
}

/** 删除确认：写明一起删掉的页与元素，并列出引用它的项目（删除后这些条目解除关联） */
function DeleteDialog({
  item,
  open,
  onClose,
  onConfirm,
}: {
  item: WhiteboardItem | null;
  open: boolean;
  onClose(): void;
  onConfirm(item: WhiteboardItem): Promise<void>;
}) {
  const { t } = useWhiteboardI18n();
  const [deleting, setDeleting] = useState(false);
  const refs = useWhiteboardRefs(open && item ? item.id : null);
  const projects = refs.data ?? [];
  const shown = item;

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={next => !next && onClose()}
      title={t("remove.title")}
      context={shown ? displayTitle(shown, t) : undefined}
      description={
        <div className="flex flex-col gap-2.5">
          <p>
            {t("remove.description", {
              pages: shown?.pages.length ?? 0,
              elements: shown?.elementCount ?? 0,
            })}
          </p>
          {refs.isPending && open ? (
            <p className="text-ink-3 text-tau-meta">{t("remove.checking")}</p>
          ) : projects.length > 0 ? (
            <div className="bg-warn-soft text-tau-meta rounded-[10px] px-3 py-2.5">
              <p className="text-warn font-medium">
                {t("remove.references", { count: projects.length })}
              </p>
              <ul className="text-ink-1 mt-1 space-y-0.5">
                {projects.map(name => (
                  <li key={name} className="truncate">
                    {name}
                  </li>
                ))}
              </ul>
              <p className="text-ink-2 mt-1.5">{t("remove.unlink")}</p>
            </div>
          ) : null}
        </div>
      }
      danger
      confirmText={t("delete")}
      loading={deleting}
      onConfirm={async () => {
        if (!item) return;
        setDeleting(true);
        try {
          await onConfirm(item);
          onClose();
        } catch {
          toast.error(whiteboardTranslator.t("deleteFailed"));
        } finally {
          setDeleting(false);
        }
      }}
    />
  );
}

function Empty({
  icon: Icon,
  title,
  text,
  action,
}: {
  icon: typeof Presentation;
  title: string;
  text: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 px-5 py-20 text-center">
      <span className="bg-accent-soft text-accent-text mb-1.5 grid size-[52px] place-items-center rounded-[16px]">
        <Icon className="size-6" strokeWidth={1.5} />
      </span>
      <p className="text-ink-1 text-[15px] font-semibold">{title}</p>
      <p className="text-tau-meta text-ink-2 max-w-[34ch]">{text}</p>
      {action && <div className="mt-2.5">{action}</div>}
    </div>
  );
}
