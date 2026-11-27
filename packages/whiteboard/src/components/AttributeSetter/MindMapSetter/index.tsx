import { attributeOption } from "../../../attribute-labels";
import { useAttributeI18n, type AttributeTranslate } from "../../../attributes-i18n";
import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { produce } from "immer";
import { useMemoizedFn } from "ahooks";
import {
  ExternalLink,
  FilePlus,
  FileSearch,
  Network,
  Palette,
  StickyNote,
  Unlink,
} from "lucide-react";
import { Checkbox, Menu, cn } from "@tau/ui";

import type { Board, MindNodeElement, ViewPort } from "../../../types";
import { ViewPortTransforms } from "../../../transforms";
import { BoardUtil, MindThemeUtil, MindUtil, PathUtil } from "../../../utils";
import { resolveMindLayoutId, type MindLayoutId } from "../../../utils/mind-layout";
import { useBoard } from "../../../hooks";
import { BOARD_TO_CONTAINER } from "../../../constants";
import { useMindMode, useMindThemePreviewStore } from "../../../hooks/useMindTheme";
import {
  MIND_PALETTES,
  MIND_THEME_STYLES,
  getPaletteById,
  type MindThemeStyle,
} from "../../../constants/mind-themes";
import { AttrBarContext, AttrPopover, ChromeButton, Field, Seg } from "../../../chrome";
import ThemeThumbnail from "./ThemeThumbnail";
import LayoutThumbnail from "./LayoutThumbnail";
import SketchPopover from "../SketchPopover";
import { useTextExtension } from "../../../extensions/text";

interface MindMapSetterProps {
  element: MindNodeElement;
  onChange: (element: MindNodeElement) => void;
}

/** 笔记：新建 / 选择由节点自身响应（弹窗挂在 MindNode 上），取消关联走画布的确认框 */
function NoteSetter({ element }: { element: MindNodeElement }) {
  const { t } = useAttributeI18n();
  const board = useBoard();
  const { side } = useContext(AttrBarContext);
  const linked = !!element.contentId;
  const text = useTextExtension();
  if (!text.create && !text.Selector) return null;

  return (
    <Menu
      trigger={
        <ChromeButton
          label={linked ? t("attributes.note") : t("attributes.note.link")}
          active={linked}
          tooltipPlacement={side}
        >
          <StickyNote strokeWidth={1.75} />
        </ChromeButton>
      }
    >
      {linked ? (
        <>
          <Menu.Item
            icon={<ExternalLink />}
            onSelect={() => board.emit("tau.note.open", element.contentId, element.contentTitle)}
          >
            {t("attributes.note.open")}
          </Menu.Item>
          <Menu.Item
            icon={<FileSearch />}
            onSelect={() => board.emit("tau.mind.select-note", element.id)}
          >
            {t("attributes.note.replace")}
          </Menu.Item>
          <Menu.Separator />
          <Menu.Item
            danger
            icon={<Unlink />}
            onSelect={() => board.emit("tau.mind.confirm-unlink-note", element.id)}
          >
            {t("attributes.note.unlink")}
          </Menu.Item>
        </>
      ) : (
        <>
          <Menu.Item
            icon={<FilePlus />}
            onSelect={() => board.emit("tau.mind.create-note", element.id)}
          >
            {t("attributes.note.create")}
          </Menu.Item>
          <Menu.Item
            icon={<FileSearch />}
            onSelect={() => board.emit("tau.mind.select-note", element.id)}
          >
            {t("attributes.note.select")}
          </Menu.Item>
        </>
      )}
    </Menu>
  );
}

const LAYOUT_OPTIONS = (t: AttributeTranslate): Array<{ value: MindLayoutId; label: string }> => [
  { value: "mind", label: t("attributes.layout.mind") },
  { value: "logic", label: t("attributes.layout.logic") },
  { value: "org", label: t("attributes.layout.org") },
  { value: "tree", label: t("attributes.layout.tree") },
];

const PAN_DURATION = 240;
/** 弹层与树、画布边缘的留白（含弹层边框与定位引擎的 8px 间距） */
const PAN_MARGIN = 20;

type ScreenRect = { left: number; top: number; right: number; bottom: number };

function treeScreenRect(board: Board, root: MindNodeElement, container: HTMLElement) {
  const bounds = board.getBounds(root);
  if (!bounds) return null;
  const rect = container.getBoundingClientRect();
  const { viewPort } = board;
  const scale = viewPort.width > 0 ? container.clientWidth / viewPort.width : viewPort.zoom;
  return {
    left: rect.left + (bounds.minX - viewPort.minX) * scale,
    top: rect.top + (bounds.minY - viewPort.minY) * scale,
    right: rect.left + (bounds.maxX - viewPort.minX) * scale,
    bottom: rect.top + (bounds.maxY - viewPort.minY) * scale,
  };
}

/**
 * 让树的某一侧空出弹层的位置所需的最小屏幕位移；已有空位返回 null，
 * 平移后树在该方向上放不进画布（树太大）也不算可行。
 */
function findPanShift(tree: ScreenRect, view: ScreenRect, panel: HTMLElement) {
  const w = panel.offsetWidth + PAN_MARGIN;
  const h = panel.offsetHeight + PAN_MARGIN;
  const room = {
    left: tree.left - view.left,
    right: view.right - tree.right,
    top: tree.top - view.top,
    bottom: view.bottom - tree.bottom,
  };
  if (room.left >= w || room.right >= w || room.top >= h || room.bottom >= h) return null;
  const candidates = [
    { x: w - room.left, y: 0, fits: room.right - (w - room.left) >= PAN_MARGIN },
    { x: room.right - w, y: 0, fits: room.left - (w - room.right) >= PAN_MARGIN },
    { x: 0, y: h - room.top, fits: room.bottom - (h - room.top) >= PAN_MARGIN },
    { x: 0, y: room.bottom - h, fits: room.top - (h - room.bottom) >= PAN_MARGIN },
  ].filter(c => c.fits);
  if (!candidates.length) return null;
  return candidates.reduce((a, b) => (Math.hypot(b.x, b.y) < Math.hypot(a.x, a.y) ? b : a));
}

const optionClass = (on: boolean) =>
  cn(
    "ring-line-1 text-ink-2 hover:bg-hover hover:text-ink-1 flex cursor-pointer flex-col gap-1 rounded-[9px] p-1.5 text-left text-[11.5px] ring-1 ring-inset",
    on &&
      "bg-accent-soft text-accent-text ring-accent/45 hover:bg-accent-soft hover:text-accent-text font-medium"
  );

function StyleSetter({ element, onChange }: MindMapSetterProps) {
  const { t } = useAttributeI18n();
  const board = useBoard();
  const root = useMemo(() => MindUtil.getRoot(board, element), [board, element]);
  const mode = useMindMode();
  const setPreview = useMindThemePreviewStore(s => s.setPreview);
  const setLayoutPreview = useMindThemePreviewStore(s => s.setLayoutPreview);
  const [asDefault, setAsDefault] = useState(false);

  const current = MindThemeUtil.getThemeOf(root);
  const paletteId = getPaletteById(current.themeId).id;
  const style = MindThemeUtil.resolveStyle(current.themeStyle);
  const layoutId = resolveMindLayoutId(root?.layout);

  const saveDefault = (next: {
    themeId?: string;
    themeStyle?: MindThemeStyle;
    layout?: MindLayoutId;
  }) =>
    MindThemeUtil.saveDefault(
      next.themeId ?? paletteId,
      next.themeStyle ?? style,
      next.layout ?? layoutId
    );

  const apply = useMemoizedFn((next: { themeId?: string; themeStyle?: MindThemeStyle }) => {
    if (!root) return;
    onChange(
      produce(root, draft => {
        draft.themeId = next.themeId ?? paletteId;
        draft.themeStyle = next.themeStyle ?? style;
      }) as MindNodeElement
    );
    if (asDefault) saveDefault(next);
  });

  // 布局改的是整棵树的坐标，按整树 diff 一次提交，一步撤销
  const applyLayout = useMemoizedFn((layout: MindLayoutId) => {
    if (!root) return;
    setLayoutPreview(root.id, null);
    if (layout === layoutId) return;
    const rootPath = PathUtil.getPathByElement(board, root);
    if (!rootPath) return;
    const next = MindUtil.layout({ ...root, layout });
    const ops = BoardUtil.diffNode(root, next, rootPath);
    BoardUtil.normalizeOperations(ops);
    board.apply(ops);
    if (asDefault) saveDefault({ layout });
  });

  // 悬停预览：只写预览态，移开或选中后清掉
  const preview = useMemoizedFn((themeId: string | null) => {
    if (!root) return;
    setPreview(root.id, themeId ? { themeId, themeStyle: style } : null);
  });
  const previewLayout = useMemoizedFn((layout: MindLayoutId | null) => {
    if (!root) return;
    setLayoutPreview(root.id, layout ? MindUtil.previewLayout(root, layout) : null);
  });

  // 预览改的是整棵树，弹层要避开整棵树的屏幕矩形，而不只是选中的中心主题
  const getTreeRect = useMemoizedFn(() => {
    const container = BOARD_TO_CONTAINER.get(board);
    if (!container || !root) return null;
    return treeScreenRect(board, root, container);
  });

  // 树旁放不下弹层时临时平移画布腾出一侧，关闭时若用户没动过视口就移回
  const panned = useRef<{ before: ViewPort; after: ViewPort } | null>(null);
  const restoreViewport = useMemoizedFn(() => {
    const record = panned.current;
    panned.current = null;
    if (!record) return;
    const { viewPort } = board;
    if (viewPort.minX !== record.after.minX || viewPort.minY !== record.after.minY) return;
    void ViewPortTransforms.animateToViewport(board, viewPort, record.before, PAN_DURATION);
  });
  const onPopoverOpenChange = useMemoizedFn((open: boolean, panel: HTMLElement | null) => {
    if (!open) return restoreViewport();
    const container = BOARD_TO_CONTAINER.get(board);
    if (!container || !root || !panel || panned.current) return;
    const tree = treeScreenRect(board, root, container);
    const shift = tree && findPanShift(tree, container.getBoundingClientRect(), panel);
    if (!shift) return;
    const before = board.viewPort;
    const scale = before.width > 0 ? container.clientWidth / before.width : before.zoom;
    const after = {
      ...before,
      minX: before.minX - shift.x / scale,
      minY: before.minY - shift.y / scale,
    };
    panned.current = { before, after };
    void ViewPortTransforms.animateToViewport(board, before, after, PAN_DURATION);
  });
  useEffect(() => restoreViewport, [restoreViewport]);

  useEffect(
    () => () => {
      if (!root) return;
      setPreview(root.id, null);
      setLayoutPreview(root.id, null);
    },
    [root, setPreview, setLayoutPreview]
  );

  return (
    <>
      <AttrPopover
        label={t("attributes.layout")}
        icon={<Network strokeWidth={1.75} />}
        width={300}
        avoid={getTreeRect}
        onOpenChange={onPopoverOpenChange}
      >
        <div className="grid grid-cols-2 gap-1.5" onPointerLeave={() => previewLayout(null)}>
          {LAYOUT_OPTIONS(t).map(option => {
            const on = option.value === layoutId;
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={on}
                onPointerEnter={() => !on && previewLayout(option.value)}
                onClick={() => applyLayout(option.value)}
                className={optionClass(on)}
              >
                <LayoutThumbnail
                  layout={option.value}
                  themeId={paletteId}
                  themeStyle={style}
                  mode={mode}
                />
                <span className="truncate">{option.label}</span>
              </button>
            );
          })}
        </div>
      </AttrPopover>
      <AttrPopover
        label={t("attributes.palette")}
        icon={<Palette strokeWidth={1.75} />}
        width={300}
        avoid={getTreeRect}
        onOpenChange={onPopoverOpenChange}
      >
        <Field label={t("attributes.themeStyle")}>
          <Seg
            label={t("attributes.themeStyle")}
            options={MIND_THEME_STYLES.map(option => ({
              ...option,
              label: attributeOption("mindStyle", option.value, option.label, t),
            }))}
            value={style}
            onChange={v => apply({ themeStyle: v })}
          />
        </Field>
        <Field>
          <div className="grid grid-cols-2 gap-1.5" onPointerLeave={() => preview(null)}>
            {MIND_PALETTES.map(palette => {
              const on = palette.id === paletteId;
              return (
                <button
                  key={palette.id}
                  type="button"
                  aria-pressed={on}
                  onPointerEnter={() => !on && preview(palette.id)}
                  onClick={() => {
                    preview(null);
                    apply({ themeId: palette.id });
                  }}
                  className={optionClass(on)}
                >
                  <ThemeThumbnail themeId={palette.id} themeStyle={style} mode={mode} />
                  <span className="truncate">
                    {attributeOption("mindPalette", palette.id, palette.label, t)}
                  </span>
                </button>
              );
            })}
          </div>
        </Field>
        <Field className="border-line-1 mt-3 border-t pt-2.5">
          <Checkbox
            label={t("attributes.mind.default")}
            checked={asDefault}
            onChange={e => {
              const on = e.target.checked;
              setAsDefault(on);
              if (on) saveDefault({});
            }}
          />
        </Field>
      </AttrPopover>
    </>
  );
}

/** 画风覆盖存在根节点上，整棵导图共用；选中任一节点都能改 */
function MindSketchSetter({ element, onChange }: MindMapSetterProps) {
  const board = useBoard();
  const root = useMemo(() => MindUtil.getRoot(board, element), [board, element]);
  if (!root) return null;
  return <SketchPopover target={root} onChange={onChange} />;
}

const MindMapSetter = ({ element, onChange }: MindMapSetterProps) => {
  return (
    <>
      {/* 布局与配色只挂在根节点上 */}
      {MindUtil.isRoot(element) && <StyleSetter element={element} onChange={onChange} />}
      <MindSketchSetter element={element} onChange={onChange} />
      <NoteSetter element={element} />
    </>
  );
};

export default MindMapSetter;
