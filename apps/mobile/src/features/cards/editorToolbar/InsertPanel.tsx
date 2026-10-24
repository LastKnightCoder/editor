import { useEffect, useMemo, useRef, useState, type SyntheticEvent } from "react";
import { Search } from "lucide-react";

import {
  resolveExpectedKeyboardHeight,
  useKeyboardReservation,
  useKeyboardViewport,
} from "../../../components/KeyboardViewportProvider";
import {
  INSERT_GROUPS,
  INSERT_ITEMS,
  OVERLAY_INSERT_KINDS,
  pushRecentInsertKind,
  readRecentInsertKinds,
  searchInsertItems,
  type InsertGroupKey,
  type InsertItem,
  type InsertTone,
} from "./insertItems";
import type {
  InsertSheetItemKind,
  MobileEditorToolbarController,
} from "./useMobileEditorToolbarController";

type InsertPanelProps = {
  controller: MobileEditorToolbarController;
  /** 条目白名单：传入时只展示其中的条目 */
  allowedKinds?: ReadonlySet<InsertSheetItemKind>;
  /** 条目数据源，默认内置条目 */
  items?: readonly InsertItem[];
  /** 搜索框获焦 / 失焦：宿主据此把面板挪到键盘上方 */
  onSearchingChange?: (searching: boolean) => void;
};

type PluginPanelItem = Omit<InsertItem, "kind" | "icon"> & {
  kind: `plugin:${number}`;
  icon: MobileEditorToolbarController["pluginInsertItems"][number]["icon"];
  run: () => void;
};
type PanelItem = InsertItem | PluginPanelItem;

const ICON_STROKE = 2.2;

/** tone → 图标块底色与前景（静态类名，供 Tailwind 扫描） */
const TONE_CLASS: Record<InsertTone, string> = {
  1: "bg-tag-1-soft text-tag-1",
  2: "bg-tag-2-soft text-tag-2",
  3: "bg-tag-3-soft text-tag-3",
  4: "bg-tag-4-soft text-tag-4",
  5: "bg-tag-5-soft text-tag-5",
};

const GROUP_TITLES = Object.fromEntries(
  INSERT_GROUPS.map(group => [group.key, group.title])
) as Record<InsertGroupKey, string>;

/** 按下时阻止按钮抢焦点，动作在 click 执行 */
function preventFocusSteal(event: SyntheticEvent) {
  event.preventDefault();
}

const pressHandlers = {
  onPointerDown: preventFocusSteal,
  onMouseDown: preventFocusSteal,
};

/** 搜索时键盘上方的结果区高度 */
const SEARCH_RESULTS_HEIGHT = 220;

export function InsertPanel(props: InsertPanelProps) {
  const { controller, allowedKinds, items = INSERT_ITEMS, onSearchingChange } = props;
  const [query, setQuery] = useState("");
  const [recentKinds, setRecentKinds] = useState(readRecentInsertKinds);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const reservation = useKeyboardReservation();
  const keyboardViewport = useKeyboardViewport();
  const { reservedHeight } = keyboardViewport;
  const expectedKeyboardHeight = resolveExpectedKeyboardHeight(keyboardViewport);
  const [searching, setSearching] = useState(false);
  // 搜索获焦前的面板高度，失焦后恢复
  const browseHeightRef = useRef(0);

  const availableItems = useMemo<PanelItem[]>(
    () =>
      allowedKinds
        ? items.filter(item => allowedKinds.has(item.kind))
        : [
            ...items,
            ...controller.pluginInsertItems.map((item, index): PluginPanelItem => ({
              kind: `plugin:${index}`,
              label: item.title,
              keywords: item.keywords,
              group: "plugin",
              tone: 3,
              icon: item.icon,
              run: item.run,
            })),
          ],
    [allowedKinds, items, controller.pluginInsertItems]
  );

  const hasQuery = query.trim().length > 0;
  const results = hasQuery ? searchInsertItems(availableItems, query) : [];
  const recentItems = recentKinds
    .map(kind => availableItems.find(item => item.kind === kind && !item.source))
    .filter((item): item is InsertItem => item !== undefined);

  // 搜索期间面板挪到键盘上方，预留 = 键盘 + 结果区，且不低于原面板高度，避免布局先降后升；
  // 键盘升起前按预计高度预留，与面板位置同步
  useEffect(() => {
    if (!searching) return;
    reservation.reserve(
      Math.max(browseHeightRef.current, expectedKeyboardHeight + SEARCH_RESULTS_HEIGHT)
    );
  }, [searching, expectedKeyboardHeight, reservation]);

  const handleSearchFocus = () => {
    if (!searching) browseHeightRef.current = reservedHeight;
    setSearching(true);
    onSearchingChange?.(true);
  };

  const handleSearchBlur = () => {
    setSearching(false);
    onSearchingChange?.(false);
    reservation.reserve(browseHeightRef.current);
  };

  const selectItem = (item: PanelItem) => {
    searchInputRef.current?.blur();
    if ("run" in item) {
      item.run();
      controller.closePanel({ showKeyboard: true, restoreSelection: true });
      return;
    }
    setRecentKinds(pushRecentInsertKind(item.kind));
    // 面板仍打开时执行：动作作用于面板选区且不聚焦编辑器
    controller.handleSelectInsertItem(item.kind);
    if (OVERLAY_INSERT_KINDS.has(item.kind)) {
      controller.closePanel({ showKeyboard: false });
      return;
    }
    // 面板选区已随插入同步为插入后的选区，恢复它即光标落在新内容处
    controller.closePanel({ showKeyboard: true, restoreSelection: true });
  };

  const renderTile = (item: PanelItem) => {
    const Icon = item.icon;
    return (
      <button
        key={`${item.source?.pluginId ?? "builtin"}:${item.kind}`}
        type="button"
        data-insert-kind={item.kind}
        className="text-ink-1 flex flex-col items-center gap-[5px] text-[11.5px]"
        {...pressHandlers}
        onClick={() => selectItem(item)}
      >
        <span
          className={`flex h-11 w-11 items-center justify-center rounded-[13px] ${TONE_CLASS[item.tone]}`}
        >
          <Icon className="size-5" />
        </span>
        {item.label}
        {item.source ? (
          <span className="text-tag-3 -mt-1 text-[9.5px]">{item.source.name}</span>
        ) : null}
      </button>
    );
  };

  const renderResults = () => {
    if (results.length === 0) {
      return <div className="text-ink-3 py-8 text-center text-[13px]">没有匹配的块</div>;
    }
    return (
      <div className="flex flex-col" data-insert-section="results">
        {results.map(item => {
          const Icon = item.icon;
          return (
            <button
              key={`${item.source?.pluginId ?? "builtin"}:${item.kind}`}
              type="button"
              data-insert-kind={item.kind}
              className="active:bg-press flex h-12 items-center gap-3 rounded-xl px-2"
              {...pressHandlers}
              onClick={() => selectItem(item)}
            >
              <span
                className={`flex h-9 w-9 items-center justify-center rounded-[10px] ${TONE_CLASS[item.tone]}`}
              >
                <Icon className="size-[18px]" />
              </span>
              <span className="text-ink-1 text-[14.5px]">{item.label}</span>
              <span className="text-ink-3 ml-auto text-[12px]">{GROUP_TITLES[item.group]}</span>
            </button>
          );
        })}
      </div>
    );
  };

  const renderBrowse = () => (
    <>
      {recentItems.length > 0 ? (
        <div
          className="scrollbar-hide mb-[11px] flex gap-1.5 overflow-x-auto"
          data-insert-section="recent"
        >
          {recentItems.map(item => {
            const Icon = item.icon;
            return (
              <button
                key={item.kind}
                type="button"
                data-insert-kind={item.kind}
                className="bg-page text-ink-1 flex h-[30px] shrink-0 items-center gap-[5px] rounded-full px-2.5 text-[12.5px]"
                {...pressHandlers}
                onClick={() => selectItem(item)}
              >
                <Icon size={14} strokeWidth={ICON_STROKE} />
                {item.label}
              </button>
            );
          })}
        </div>
      ) : null}
      {INSERT_GROUPS.map(group => {
        const groupItems = availableItems.filter(item => item.group === group.key);
        if (groupItems.length === 0) return null;
        return (
          <section key={group.key} data-insert-section={group.key}>
            <div className="text-ink-3 mb-[7px] text-[11.5px]">{group.title}</div>
            <div className="mb-3 grid grid-cols-4 gap-x-1 gap-y-2.5">
              {groupItems.map(renderTile)}
            </div>
          </section>
        );
      })}
    </>
  );

  return (
    <div className="px-3.5 pt-3">
      <label className="bg-page mb-2.5 flex h-[38px] items-center gap-[7px] rounded-[11px] px-[11px]">
        <Search size={16} strokeWidth={ICON_STROKE} className="text-ink-3 shrink-0" />
        <input
          ref={searchInputRef}
          type="search"
          value={query}
          placeholder="搜索块"
          aria-label="搜索块"
          className="text-ink-1 placeholder:text-ink-3 min-w-0 flex-1 bg-transparent text-[13.5px] outline-none"
          onFocus={handleSearchFocus}
          onBlur={handleSearchBlur}
          onChange={event => setQuery(event.target.value)}
        />
      </label>
      {hasQuery ? renderResults() : renderBrowse()}
    </div>
  );
}

export default InsertPanel;
