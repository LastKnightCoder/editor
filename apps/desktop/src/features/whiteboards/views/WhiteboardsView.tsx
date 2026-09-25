/**
 * 白板列表页 · 方案 A「画廊」（mockups/whiteboards/plan-a2-gallery.html 定稿，D-047）：
 * 工具栏（标题 / 标签范围 + 摘要 · 标题过滤 · 排序 · 新建）→ 缩略图卡片网格。
 *
 * 页面参数 id = 标签范围（侧栏子项，`tag:<名>` / `untagged`，空 = 全部），标签不在页内另做目录。
 * 点卡片进入白板详情（whiteboard-detail）；多页白板悬停扫到哪页就打开哪页。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Plus, Presentation, Search, SearchX, X } from "lucide-react";
import {
  Button,
  ConfirmDialog,
  IconButton,
  Loading,
  Segmented,
  Tag,
  toast,
  useEdgeFade,
} from "@tau/ui";
import { usePage, usePageParams } from "@/page/PageProvider";
import { isMac } from "@/platform";
import {
  inScope,
  matchTitle,
  openTarget,
  parseScope,
  rankTags,
  scopeId,
  sortItems,
  displayTitle,
  type WhiteboardItem,
  type WhiteboardScope,
  type WhiteboardSort,
} from "../model";
import { useWhiteboardMutations, useWhiteboardRefs, useWhiteboards } from "../queries";
import { useWhiteboardThumbnails } from "../thumbnails";
import { WhiteboardCard } from "../components/WhiteboardCard";
import { WhiteboardInfoDialog } from "../components/WhiteboardInfoDialog";

export function WhiteboardsView() {
  const { navigator } = usePage();
  const params = usePageParams<{ id?: string }>();
  const scope = parseScope(params.id);
  const { items, loading } = useWhiteboards();
  const thumbnails = useWhiteboardThumbnails();
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
  const searchRef = useRef<HTMLInputElement>(null);
  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null);
  useEdgeFade(scrollEl);

  // 相对时间每分钟刷新一次
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  // ⌘F / Ctrl+F 聚焦标题过滤（仅本页在栈顶时）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (navigator.current()?.key !== "whiteboard" || e.defaultPrevented) return;
      if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "f") {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigator]);

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
        toast.error("这块白板没有可打开的页");
        return;
      }
      navigator.push("whiteboard-detail", { id: item.id, page: target });
    },
    [navigator]
  );

  if (loading) return <Loading />;

  const filtering = query.trim().length > 0;

  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-[1720px] flex-col px-[26px] pb-4">
      {/* 工具栏 */}
      <div className="flex h-12 flex-none items-center gap-3">
        <h1 className="text-tau-title flex items-center gap-2 font-semibold tracking-[-0.01em]">
          白板
          {scope.kind !== "all" && (
            <>
              <span className="text-ink-3 font-normal">/</span>
              <Tag onRemove={() => setScope({ kind: "all" })}>
                {scope.kind === "tag" ? scope.tag : "无标签"}
              </Tag>
            </>
          )}
        </h1>
        {all.length > 0 && (
          <span className="text-tau-meta text-ink-2 tabular-nums">
            {scope.kind === "all" ? (
              <>
                <b className="text-ink-1 font-semibold">{all.length}</b> 个白板
                <span className="text-ink-3 mx-1.5">·</span>
                <b className="text-ink-1 font-semibold">{pageTotal}</b> 页
              </>
            ) : (
              <>
                <b className="text-ink-1 font-semibold">{inRange.length}</b> 个白板
              </>
            )}
          </span>
        )}
        <span className="flex-1" />
        {all.length > 0 && (
          <>
            <label className="bg-surface border-line-1 focus-within:border-accent flex h-[30px] w-[220px] items-center gap-2 rounded-[10px] border pl-2.5 pr-2 transition-[border-color,box-shadow] duration-[160ms] focus-within:shadow-[var(--tau-focus-ring)]">
              <Search className="text-ink-3 size-[14px] shrink-0" strokeWidth={1.75} />
              <input
                ref={searchRef}
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Escape" && query) {
                    e.stopPropagation();
                    setQuery("");
                  }
                }}
                placeholder="过滤标题"
                className="text-tau-meta placeholder:text-ink-3 min-w-0 flex-1 bg-transparent outline-none"
              />
              {filtering ? (
                <>
                  <span className="text-tau-tiny text-ink-3 whitespace-nowrap tabular-nums">
                    {visible.length} / {inRange.length}
                  </span>
                  <IconButton
                    title="清除过滤 (Esc)"
                    className="size-[18px] rounded-[5px]"
                    onClick={() => setQuery("")}
                  >
                    <X className="size-[11px]" strokeWidth={1.75} />
                  </IconButton>
                </>
              ) : (
                <kbd className="font-tau-mono bg-hover text-ink-3 rounded-[5px] px-[5px] py-0.5 text-[11px] leading-none">
                  {isMac ? "⌘F" : "Ctrl+F"}
                </kbd>
              )}
            </label>
            <Segmented
              label="排序"
              size="sm"
              value={sort}
              onValueChange={(v: WhiteboardSort) => setSort(v)}
            >
              <Segmented.Item value="updated" label="最近更新" />
              <Segmented.Item value="created" label="创建时间" />
              <Segmented.Item value="title" label="名称" />
            </Segmented>
          </>
        )}
        <Button
          variant="primary"
          size="sm"
          icon={Plus}
          onClick={() => setDialog({ mode: "create" })}
        >
          新建白板
        </Button>
      </div>

      {/* 网格 */}
      <div
        ref={setScrollEl}
        className="edge-fade-scroll -mr-[18px] min-h-0 flex-1 overflow-y-auto pb-2 pr-[18px] pt-1.5"
      >
        {all.length === 0 ? (
          <Empty
            icon={Presentation}
            title="还没有白板"
            text="白板适合画结构、贴想法、做演示。一块白板可以有多页。"
            action={
              <Button
                variant="soft"
                size="sm"
                icon={Plus}
                onClick={() => setDialog({ mode: "create" })}
              >
                新建白板
              </Button>
            }
          />
        ) : visible.length === 0 ? (
          filtering ? (
            <Empty
              icon={SearchX}
              title="没有匹配的白板"
              text={`没有标题包含「${query.trim()}」的白板${scope.kind === "all" ? "" : "（当前标签内）"}。`}
              action={
                <Button variant="secondary" size="sm" onClick={() => setQuery("")}>
                  清除过滤
                </Button>
              }
            />
          ) : (
            <Empty
              icon={Presentation}
              title="这里还没有白板"
              text={
                scope.kind === "tag" ? "在这里新建，会自动带上这个标签。" : "所有白板都带着标签。"
              }
              action={
                scope.kind === "tag" ? (
                  <Button
                    variant="soft"
                    size="sm"
                    icon={Plus}
                    onClick={() => setDialog({ mode: "create" })}
                  >
                    在这里新建
                  </Button>
                ) : undefined
              }
            />
          )
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-x-[18px] gap-y-5">
            {visible.map(item => (
              <WhiteboardCard
                key={item.id}
                item={item}
                thumbnails={thumbnails}
                now={now}
                query={query}
                onOpen={open}
                onEdit={it => setDialog({ mode: "edit", item: it })}
                onPickCover={it =>
                  void mutations
                    .pickCover(it.id)
                    .then(done => done && toast.success("封面已更新"))
                    .catch(() => toast.error("封面上传失败"))
                }
                onRemoveCover={it =>
                  void mutations
                    .removeCover(it.id)
                    .then(() => toast.success("已改用画布缩略图"))
                    .catch(() => toast.error("操作失败"))
                }
                onDelete={it => {
                  setDeleteTarget(it);
                  setDeleteOpen(true);
                }}
              />
            ))}
          </div>
        )}
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
            toast.success("已保存");
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
          toast.success(`已删除「${displayTitle(item)}」`);
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
  const [deleting, setDeleting] = useState(false);
  const refs = useWhiteboardRefs(open && item ? item.id : null);
  const projects = refs.data ?? [];
  const shown = item;

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={next => !next && onClose()}
      title="删除白板"
      context={shown ? displayTitle(shown) : undefined}
      description={
        <div className="flex flex-col gap-2.5">
          <p>
            {shown?.pages.length ?? 0} 页、共 {shown?.elementCount ?? 0}{" "}
            个元素会一起删除，删除后无法恢复。
          </p>
          {refs.isPending && open ? (
            <p className="text-ink-3 text-tau-meta">正在检查项目引用…</p>
          ) : projects.length > 0 ? (
            <div className="bg-warn-soft text-tau-meta rounded-[10px] px-3 py-2.5">
              <p className="text-warn font-medium">被 {projects.length} 个项目引用</p>
              <ul className="text-ink-1 mt-1 space-y-0.5">
                {projects.map(name => (
                  <li key={name} className="truncate">
                    {name}
                  </li>
                ))}
              </ul>
              <p className="text-ink-2 mt-1.5">删除后，这些项目里的白板条目会解除关联。</p>
            </div>
          ) : null}
        </div>
      }
      danger
      confirmText="删除"
      loading={deleting}
      onConfirm={async () => {
        if (!item) return;
        setDeleting(true);
        try {
          await onConfirm(item);
          onClose();
        } catch {
          toast.error("删除失败");
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
