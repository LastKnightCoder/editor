/**
 * 选择白板弹窗：关键字过滤（标题 / 描述 / 标签）+ 缩略图卡片网格（同白板列表画廊的精简版）。
 *
 * - 单选（默认）：点卡片即确认；多选：点卡片勾选，底部「已选 N 个」+ 确认
 * - excludeWhiteBoardIds 中的白板不出现在列表里
 * - 列表按最近更新排序，分批渲染（滚到底再追加），缩略图用封面或第一页的结构示意图
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Files, Presentation, Search } from "lucide-react";
import { Button, Dialog, Input, Loading, cn } from "@tau/ui";

import { WhiteBoard } from "@/types";
import { FadeScroll } from "@/components/FadeScroll";
import LocalImage from "@/components/LocalImage";
import { PageSchematic } from "@/components/WhiteBoard/schematic/PageSchematic";
import {
  displayTitle,
  fullTime,
  relativeTime,
  toItem,
  type WhiteboardItem,
} from "@/features/whiteboards/model";

interface ISelectWhiteBoardModalProps {
  open: boolean;
  title?: string;
  multiple?: boolean;
  /** 白板列表仍在读取 */
  loading?: boolean;
  onCancel?: () => void;
  onChange?: (whiteBoards: WhiteBoard[]) => void;
  onOk?: (whiteBoards: WhiteBoard[]) => Promise<void> | void;
  excludeWhiteBoardIds?: number[];
  selectedWhiteBoards?: WhiteBoard[];
  allWhiteBoards: WhiteBoard[];
}

/** 每批渲染的卡片数 */
const BATCH = 24;

/** 画布纸底 + 点阵（示意图的底，同白板列表卡片） */
const CANVAS_BG =
  "bg-surface-hover bg-[radial-gradient(color-mix(in_srgb,var(--tau-ink-1)_13%,transparent)_1px,transparent_1.2px)] bg-[length:14px_14px]";

function matchKeyword(item: WhiteboardItem, keyword: string) {
  const q = keyword.trim().toLowerCase();
  if (!q) return true;
  return (
    displayTitle(item).toLowerCase().includes(q) ||
    item.description.toLowerCase().includes(q) ||
    item.tags.some(tag => tag.toLowerCase().includes(q))
  );
}

const SelectWhiteBoardModal = (props: ISelectWhiteBoardModalProps) => {
  const {
    open,
    multiple = false,
    title,
    loading = false,
    onCancel,
    onChange,
    onOk,
    excludeWhiteBoardIds = [],
    selectedWhiteBoards = [],
    allWhiteBoards = [],
  } = props;

  const [keyword, setKeyword] = useState("");
  const [limit, setLimit] = useState(BATCH);
  const [saving, setSaving] = useState(false);
  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const now = useRef(Date.now());

  useEffect(() => {
    if (!open) return;
    setKeyword("");
    now.current = Date.now();
  }, [open]);

  useEffect(() => {
    setLimit(BATCH);
    scrollEl?.scrollTo({ top: 0 });
  }, [keyword, open, scrollEl]);

  const excludeKey = excludeWhiteBoardIds.join(",");
  const candidates = useMemo(() => {
    const excluded = new Set(excludeWhiteBoardIds);
    return allWhiteBoards
      .filter(board => !excluded.has(board.id))
      .map(board => ({ item: toItem(board), board }))
      .sort((x, y) => y.item.updateTime - x.item.updateTime);
    // excludeWhiteBoardIds 常为调用方每次渲染新建的数组，按内容比较
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allWhiteBoards, excludeKey]);
  const visible = useMemo(
    () => candidates.filter(({ item }) => matchKeyword(item, keyword)),
    [candidates, keyword]
  );
  const hasMore = limit < visible.length;

  // 滚到底部哨兵时追加一批
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!hasMore || !sentinel || !scrollEl) return;
    const observer = new IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting) setLimit(n => n + BATCH);
      },
      { root: scrollEl, rootMargin: "200px" }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, scrollEl, limit]);

  const selectedIds = new Set(selectedWhiteBoards.map(board => board.id));

  const confirm = async (targets: WhiteBoard[]) => {
    if (!targets.length || !onOk) return;
    setSaving(true);
    try {
      await onOk(targets);
    } catch (error) {
      // 失败提示由调用方给出，弹窗保持打开以便重试
      console.error(error);
    } finally {
      setSaving(false);
    }
  };

  const choose = (board: WhiteBoard) => {
    if (!multiple) {
      onChange?.([board]);
      void confirm([board]);
      return;
    }
    onChange?.(
      selectedIds.has(board.id)
        ? selectedWhiteBoards.filter(item => item.id !== board.id)
        : [...selectedWhiteBoards, board]
    );
  };

  const close = () => onCancel?.();

  return (
    <Dialog
      open={open}
      onOpenChange={next => !next && close()}
      title={title || "选择关联白板"}
      locked={saving}
      width={880}
      height={640}
      footer={
        <>
          {multiple && (
            <span className="text-ink-2 mr-auto text-[12.5px] tabular-nums">
              {selectedWhiteBoards.length ? `已选 ${selectedWhiteBoards.length} 个白板` : "未选择"}
            </span>
          )}
          <Button variant="secondary" size="sm" disabled={saving} onClick={close}>
            取消
          </Button>
          {multiple && (
            <Button
              variant="primary"
              size="sm"
              loading={saving}
              disabled={!selectedWhiteBoards.length}
              onClick={() => void confirm(selectedWhiteBoards)}
            >
              确定
            </Button>
          )}
        </>
      }
    >
      <div className="flex items-center gap-3 px-6 pb-3 pt-3">
        <Input
          data-autofocus
          lead={Search}
          clearable
          value={keyword}
          onChange={e => setKeyword(e.target.value)}
          onKeyDown={e => {
            if (e.key === "Escape" && keyword) {
              e.stopPropagation();
              setKeyword("");
            }
          }}
          placeholder="搜索白板标题、描述或标签"
          aria-label="搜索白板"
          wrapperClassName="flex-1"
        />
        {!loading && candidates.length > 0 && (
          <span className="text-tau-meta text-ink-3 shrink-0 tabular-nums">
            {keyword.trim()
              ? `${visible.length} / ${candidates.length}`
              : `共 ${candidates.length}`}{" "}
            个白板
          </span>
        )}
      </div>

      {/* 右侧 6px 透明边 + pr-[18px] = 左侧 pl-6；pt-1 给首行卡片 hover 阴影留出绘制空间 */}
      <FadeScroll scrollRef={setScrollEl} className="min-h-0 flex-1 pb-5 pl-6 pr-[18px] pt-1">
        {loading ? (
          <Loading />
        ) : visible.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-5 py-20 text-center">
            <span className="bg-accent-soft text-accent-text mb-1.5 grid size-[52px] place-items-center rounded-[16px]">
              <Presentation className="size-6" strokeWidth={1.5} />
            </span>
            <p className="text-ink-1 text-[15px] font-semibold">
              {keyword.trim() ? "没有匹配的白板" : "没有可选择的白板"}
            </p>
            {keyword.trim() && (
              <Button variant="secondary" size="sm" className="mt-2" onClick={() => setKeyword("")}>
                清除搜索
              </Button>
            )}
          </div>
        ) : (
          <>
            <div
              role="listbox"
              aria-multiselectable={multiple || undefined}
              className="grid grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-3"
            >
              {visible.slice(0, limit).map(({ item, board }) => (
                <BoardOption
                  key={item.id}
                  item={item}
                  now={now.current}
                  selected={selectedIds.has(item.id)}
                  multiple={multiple}
                  disabled={saving}
                  onClick={() => choose(board)}
                />
              ))}
            </div>
            {hasMore && <div ref={sentinelRef} className="h-px" />}
          </>
        )}
      </FadeScroll>
    </Dialog>
  );
};

function BoardOption({
  item,
  now,
  selected,
  multiple,
  disabled,
  onClick,
}: {
  item: WhiteboardItem;
  now: number;
  selected: boolean;
  multiple: boolean;
  disabled: boolean;
  onClick(): void;
}) {
  const [failedCover, setFailedCover] = useState(false);
  const cover = item.snapshot && !failedCover ? item.snapshot : "";
  const firstPage = item.pages[0];

  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      disabled={disabled}
      onClick={onClick}
      title={item.description || undefined}
      className={cn(
        "bg-surface ease-tau-out group relative flex flex-col rounded-[var(--tau-radius-lg)] border p-1.5 text-left",
        "transition-[box-shadow,border-color] duration-200",
        "focus-visible:shadow-[var(--tau-focus-ring)] focus-visible:outline-none",
        selected
          ? "border-accent shadow-[0_0_0_1px_var(--tau-accent)]"
          : "border-line-1 enabled:hover:shadow-lift enabled:hover:border-transparent"
      )}
    >
      <div
        className={cn(
          "relative aspect-[16/10] w-full overflow-hidden rounded-[11px] shadow-[inset_0_0_0_1px_var(--tau-line-2)]",
          CANVAS_BG
        )}
      >
        {cover ? (
          <LocalImage
            url={cover}
            className="absolute inset-0 h-full w-full object-cover"
            onLoadError={() => setFailedCover(true)}
          />
        ) : firstPage && firstPage.elementCount > 0 ? (
          <PageSchematic
            elements={firstPage.elements}
            aspect={16 / 10}
            className="absolute inset-0 h-full w-full"
          />
        ) : (
          <div className="text-ink-3 absolute inset-0 flex flex-col items-center justify-center gap-1.5 text-[12px]">
            <Presentation className="size-5" strokeWidth={1.5} />
            <span>空白画布</span>
          </div>
        )}
        {item.pages.length > 1 && (
          <span className="text-tau-tiny text-ink-2 bg-surface/90 absolute bottom-2 right-2 inline-flex h-5 items-center gap-1 rounded-[6px] px-[7px] tabular-nums">
            <Files className="size-[11px]" strokeWidth={1.75} />
            {item.pages.length} 页
          </span>
        )}
        {(multiple || selected) && (
          <span
            className={cn(
              "ease-tau-out absolute right-2 top-2 grid size-5 place-items-center rounded-full transition-opacity duration-150",
              selected
                ? "bg-accent text-ink-inverse"
                : "bg-surface/90 text-transparent opacity-0 shadow-[inset_0_0_0_1.5px_var(--tau-ink-3)] group-hover:opacity-100"
            )}
          >
            <Check className="size-3" strokeWidth={3} />
          </span>
        )}
      </div>
      <div className="flex w-full min-w-0 flex-col px-1.5 pb-1 pt-2">
        <span className="text-ink-1 truncate text-[13px] font-semibold leading-[1.45]">
          {displayTitle(item)}
        </span>
        <span
          className="text-ink-3 mt-0.5 truncate text-[12px] tabular-nums"
          title={fullTime(item.updateTime)}
        >
          {item.tags.length > 0 && `#${item.tags[0]} · `}
          {relativeTime(item.updateTime, now)}更新
        </span>
      </div>
    </button>
  );
}

export default SelectWhiteBoardModal;
