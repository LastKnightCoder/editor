import { useContext, useEffect, useMemo, useState } from "react";
import { produce } from "immer";
import { useMemoizedFn } from "ahooks";
import { ExternalLink, FilePlus, FileSearch, Palette, StickyNote, Unlink } from "lucide-react";
import { Checkbox, Menu, cn } from "@tau/ui";

import { MindNodeElement } from "@/components/WhiteBoard/types";
import { MindThemeUtil, MindUtil } from "@/components/WhiteBoard/utils";
import { useBoard } from "@/components/WhiteBoard/hooks";
import { useMindMode, useMindThemePreviewStore } from "@/components/WhiteBoard/hooks/useMindTheme";
import {
  MIND_PALETTES,
  MIND_THEME_STYLES,
  getPaletteById,
  type MindThemeStyle,
} from "@/components/WhiteBoard/constants/mind-themes";
import {
  AttrBarContext,
  AttrPopover,
  ChromeButton,
  Field,
  Seg,
} from "@/components/WhiteBoard/chrome";
import ThemeThumbnail from "./ThemeThumbnail";
import SketchPopover from "../SketchPopover";

interface MindMapSetterProps {
  element: MindNodeElement;
  onChange: (element: MindNodeElement) => void;
}

/** 笔记：新建 / 选择由节点自身响应（弹窗挂在 MindNode 上），取消关联走画布的确认框 */
function NoteSetter({ element }: { element: MindNodeElement }) {
  const board = useBoard();
  const { side } = useContext(AttrBarContext);
  const linked = !!element.contentId;

  return (
    <Menu
      trigger={
        <ChromeButton label={linked ? "笔记" : "关联笔记"} active={linked} tooltipPlacement={side}>
          <StickyNote strokeWidth={1.75} />
        </ChromeButton>
      }
    >
      {linked ? (
        <>
          <Menu.Item
            icon={<ExternalLink />}
            onSelect={() => board.emit("open-note", element.contentId, element.contentTitle)}
          >
            打开笔记
          </Menu.Item>
          <Menu.Item
            icon={<FileSearch />}
            onSelect={() => board.emit("mind:select-note", element.id)}
          >
            更换笔记
          </Menu.Item>
          <Menu.Separator />
          <Menu.Item
            danger
            icon={<Unlink />}
            onSelect={() => board.emit("mind:confirm-unlink-note", element.id)}
          >
            取消关联
          </Menu.Item>
        </>
      ) : (
        <>
          <Menu.Item
            icon={<FilePlus />}
            onSelect={() => board.emit("mind:create-note", element.id)}
          >
            新建笔记
          </Menu.Item>
          <Menu.Item
            icon={<FileSearch />}
            onSelect={() => board.emit("mind:select-note", element.id)}
          >
            选择笔记
          </Menu.Item>
        </>
      )}
    </Menu>
  );
}

function ThemeSetter({ element, onChange }: MindMapSetterProps) {
  const board = useBoard();
  const root = useMemo(() => MindUtil.getRoot(board, element), [board, element]);
  const mode = useMindMode();
  const setPreview = useMindThemePreviewStore(s => s.setPreview);
  const [asDefault, setAsDefault] = useState(false);

  const current = MindThemeUtil.getThemeOf(root);
  const paletteId = getPaletteById(current.themeId).id;
  const style = MindThemeUtil.resolveStyle(current.themeStyle);

  const apply = useMemoizedFn((next: { themeId?: string; themeStyle?: MindThemeStyle }) => {
    if (!root) return;
    const themeId = next.themeId ?? paletteId;
    const themeStyle = next.themeStyle ?? style;
    onChange(
      produce(root, draft => {
        draft.themeId = themeId;
        draft.themeStyle = themeStyle;
      }) as MindNodeElement
    );
    if (asDefault) MindThemeUtil.saveDefault(themeId, themeStyle);
  });

  // 悬停预览：只写预览态，移开或选中后清掉
  const preview = useMemoizedFn((themeId: string | null) => {
    if (!root) return;
    setPreview(root.id, themeId ? { themeId, themeStyle: style } : null);
  });

  useEffect(() => () => void (root && setPreview(root.id, null)), [root, setPreview]);

  return (
    <AttrPopover label="导图主题" icon={<Palette strokeWidth={1.75} />} width={300}>
      <Field label="风格">
        <Seg
          label="风格"
          options={MIND_THEME_STYLES}
          value={style}
          onChange={v => apply({ themeStyle: v })}
        />
      </Field>
      <Field label="配色">
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
                className={cn(
                  "ring-line-1 text-ink-2 hover:bg-hover hover:text-ink-1 flex cursor-pointer flex-col gap-1 rounded-[9px] p-1.5 text-left text-[11.5px] ring-1 ring-inset",
                  on &&
                    "bg-accent-soft text-accent-text ring-accent/45 hover:bg-accent-soft hover:text-accent-text font-medium"
                )}
              >
                <ThemeThumbnail themeId={palette.id} themeStyle={style} mode={mode} />
                <span className="truncate">{palette.label}</span>
              </button>
            );
          })}
        </div>
      </Field>
      <Field className="border-line-1 mt-3 border-t pt-2.5">
        <Checkbox
          label="设为新导图默认"
          checked={asDefault}
          onChange={e => {
            const on = e.target.checked;
            setAsDefault(on);
            if (on) MindThemeUtil.saveDefault(paletteId, style);
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
      {/* 导图主题只挂在根节点上 */}
      {MindUtil.isRoot(element) && <ThemeSetter element={element} onChange={onChange} />}
      <MindSketchSetter element={element} onChange={onChange} />
      <NoteSetter element={element} />
    </>
  );
};

export default MindMapSetter;
