import { useContext, useMemo } from "react";
import { produce } from "immer";
import { useMemoizedFn } from "ahooks";
import { ExternalLink, FilePlus, FileSearch, Palette, StickyNote, Unlink } from "lucide-react";
import { Menu, cn } from "@tau/ui";

import { MindNodeElement } from "@/components/WhiteBoard/types";
import { MindUtil } from "@/components/WhiteBoard/utils";
import { useBoard } from "@/components/WhiteBoard/hooks";
import { MIND_MAP_THEMES } from "@/components/WhiteBoard/constants/mind-themes";
import { AttrBarContext, AttrPopover, ChromeButton } from "@/components/WhiteBoard/chrome";

interface MindMapSetterProps {
  element: MindNodeElement;
  onChange: (element: MindNodeElement) => void;
}

type MindTheme = (typeof MIND_MAP_THEMES)[number];

/** 主题预览：主题色板本身是用户数据色，完整保留；卡片外壳用主题语言 */
function ThemePreview({ theme }: { theme: MindTheme }) {
  if (theme.id === "rainbow") {
    const colors = theme.palette.map(p => p.background);
    const step = 100 / colors.length;
    const stops = colors.map((c, i) => `${c} ${i * step}%, ${c} ${(i + 1) * step}%`).join(", ");
    return (
      <span
        className="block h-4 w-full rounded-[4px]"
        style={{ background: `linear-gradient(115deg, ${stops})` }}
      />
    );
  }
  return (
    <span className="flex h-4 w-full overflow-hidden rounded-[4px]">
      {theme.palette.slice(0, 6).map((p, i) => (
        <span key={i} className="h-full flex-1" style={{ background: p.background }} />
      ))}
    </span>
  );
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
  const currentThemeId = root?.themeId || MindUtil.getDefaultThemeId();

  const handleSelectTheme = useMemoizedFn((themeId: string) => {
    if (!root) return;
    onChange(produce(root, draft => void (draft.themeId = themeId)) as MindNodeElement);
    MindUtil.saveDefaultThemeId(themeId);
  });

  return (
    <AttrPopover label="导图主题" icon={<Palette strokeWidth={1.75} />} width={300}>
      {/* 主题数量多：限高内部滚动，避免弹层超出窗口 */}
      <div className="-mr-2 grid max-h-[min(360px,50vh)] grid-cols-2 gap-1.5 overflow-y-auto overscroll-contain pr-2">
        {MIND_MAP_THEMES.map(theme => {
          const on = theme.id === currentThemeId;
          return (
            <button
              key={theme.id}
              type="button"
              aria-pressed={on}
              onClick={() => handleSelectTheme(theme.id)}
              className={cn(
                "ring-line-1 text-ink-2 hover:bg-hover hover:text-ink-1 flex cursor-pointer flex-col gap-1.5 rounded-[9px] p-2 text-left text-[12px] ring-1 ring-inset",
                on &&
                  "bg-accent-soft text-accent-text ring-accent/45 hover:bg-accent-soft hover:text-accent-text font-medium"
              )}
            >
              <span className="truncate">{theme.label}</span>
              <ThemePreview theme={theme} />
            </button>
          );
        })}
      </div>
    </AttrPopover>
  );
}

const MindMapSetter = ({ element, onChange }: MindMapSetterProps) => {
  return (
    <>
      {/* 导图主题只挂在根节点上 */}
      {MindUtil.isRoot(element) && <ThemeSetter element={element} onChange={onChange} />}
      <NoteSetter element={element} />
    </>
  );
};

export default MindMapSetter;
