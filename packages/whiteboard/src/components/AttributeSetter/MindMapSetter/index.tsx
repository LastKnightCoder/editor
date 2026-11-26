import { attributeOption } from "../../../attribute-labels";
import { useAttributeI18n, type AttributeTranslate } from "../../../attributes-i18n";
import { useContext, useEffect, useMemo, useState } from "react";
import { produce } from "immer";
import { useMemoizedFn } from "ahooks";
import { ExternalLink, FilePlus, FileSearch, Palette, StickyNote, Unlink } from "lucide-react";
import { Checkbox, Menu, cn } from "@tau/ui";

import { MindNodeElement } from "../../../types";
import { BoardUtil, MindThemeUtil, MindUtil, PathUtil } from "../../../utils";
import { resolveMindLayoutId, type MindLayoutId } from "../../../utils/mind-layout";
import { useBoard } from "../../../hooks";
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

  useEffect(
    () => () => {
      if (!root) return;
      setPreview(root.id, null);
      setLayoutPreview(root.id, null);
    },
    [root, setPreview, setLayoutPreview]
  );

  return (
    <AttrPopover
      label={t("attributes.mind.style")}
      icon={<Palette strokeWidth={1.75} />}
      width={300}
    >
      <Field label={t("attributes.layout")}>
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
      </Field>
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
      <Field label={t("attributes.palette")}>
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
      {/* 导图样式只挂在根节点上 */}
      {MindUtil.isRoot(element) && <StyleSetter element={element} onChange={onChange} />}
      <MindSketchSetter element={element} onChange={onChange} />
      <NoteSetter element={element} />
    </>
  );
};

export default MindMapSetter;
