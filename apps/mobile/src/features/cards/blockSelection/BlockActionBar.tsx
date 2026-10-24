import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import {
  ArrowDown,
  ArrowUp,
  ChevronRight,
  Copy,
  CopyPlus,
  Ellipsis,
  ListTree,
  Repeat2,
  Trash2,
} from "lucide-react";
import type { EditorKit, EditorRef } from "@tau/editor";
import type { ContextMenuItem } from "@tau/editor/api";
import type { Editor } from "slate";
import { HistoryEditor } from "slate-history";
import { ReactEditor } from "slate-react";
import { ActionSheet, type ActionSheetItem } from "../../../components/ActionSheet";
import { toast } from "../../../components/toast";
import { Z_INDEX } from "../../../router/zIndex";
import {
  canMoveBlocks,
  copyBlocks,
  cutBlocks,
  deleteBlocks,
  duplicateBlocks,
  moveBlocks,
  type MoveDirection,
} from "./blockOps";
import {
  applyTransformToBlocks,
  buildMoreMenuGroups,
  CUT_MENU_KEY,
  resolveBlockMenu,
  resolveSharedTransforms,
} from "./blockMenu";
import { getSlateEditor } from "./measureBlocks";
import type { BlockSelectionState } from "./useBlockSelection";

const ICON_SIZE = 20;
/** 操作栏占位高度（不含安全区）：按钮 54 + 上下内边距 12 + 上边框 1 */
const ACTION_BAR_HEIGHT = 67;
const OCCLUSION_VAR = "--mobile-editor-toolbar-occlusion";

const MENU_ICON_SIZE = 18;

type BlockActionBarProps = {
  editorRef: RefObject<EditorRef | null>;
  /** 编辑器的 kit：块菜单（转换、更多）按它聚合的扩展菜单声明求值 */
  kit: EditorKit;
  selection: Pick<BlockSelectionState, "selected" | "setSelected" | "exit">;
  blockCount: number;
  portalContainer?: HTMLElement | null;
  /** 「更多」中的宿主项「整理结构」：打开大纲重排（打开后退出块选择）；不传时不显示 */
  onOpenOutline?: () => void;
};

type ActionButtonProps = {
  label: string;
  icon: ReactNode;
  disabled?: boolean;
  danger?: boolean;
  onPress?: () => void;
};

function ActionButton(props: ActionButtonProps) {
  const { label, icon, disabled = false, danger = false, onPress } = props;
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onPress}
      className={`flex h-[54px] flex-1 flex-col items-center justify-center gap-1 rounded-xl text-[11.5px] ${
        disabled ? "text-ink-3" : `active:bg-press ${danger ? "text-danger" : "text-ink-1"}`
      }`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function scrollBlockIntoView(editor: Editor, index: number) {
  requestAnimationFrame(() => {
    const node = editor.children[index];
    if (!node) return;
    try {
      ReactEditor.toDOMNode(editor as ReactEditor, node).scrollIntoView?.({ block: "nearest" });
    } catch {
      // 节点尚未渲染时不滚动
    }
  });
}

type MenuSheet = { id: number; title: string; groups: ActionSheetItem[][] };

/** 块选择模式底部操作栏：上移、下移、转换、复制、删除、更多 */
export function BlockActionBar(props: BlockActionBarProps) {
  const { editorRef, kit, selection, blockCount, portalContainer, onOpenOutline } = props;
  const { selected, setSelected, exit } = selection;
  const portalRoot = portalContainer ?? (typeof document === "undefined" ? null : document.body);
  const empty = selected.length === 0;
  const editor = getSlateEditor(editorRef);
  // 渲染期求值：选择或文档变化都会让宿主重渲染本组件
  const sharedTransforms = editor && !empty ? resolveSharedTransforms(kit, editor, selected) : [];

  // 菜单面板串联：选项点击只登记动作，面板退场完成后执行（打开下一级面板或执行命令）
  const [sheet, setSheet] = useState<MenuSheet | null>(null);
  const sheetIdRef = useRef(0);
  const pendingRef = useRef<(() => void) | null>(null);
  const openSheet = (title: string, groups: ActionSheetItem[][]) => {
    sheetIdRef.current += 1;
    setSheet({ id: sheetIdRef.current, title, groups });
  };
  const handleSheetClose = () => {
    const pending = pendingRef.current;
    pendingRef.current = null;
    setSheet(null);
    pending?.();
  };
  const later = (action: () => void) => () => {
    pendingRef.current = action;
  };

  // 与配件栏同一遮挡变量：滚动容器据此给操作栏留白（安全区已由滚动末尾留白承担，这里只计栏高）
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty(OCCLUSION_VAR, `${ACTION_BAR_HEIGHT}px`);
    return () => {
      root.style.removeProperty(OCCLUSION_VAR);
    };
  }, []);

  const move = (direction: MoveDirection) => {
    const editor = getSlateEditor(editorRef);
    if (!editor) return;
    const next = moveBlocks(editor, selected, direction);
    if (!next) return;
    setSelected(next);
    scrollBlockIntoView(editor, next[0]);
  };

  const copy = () => {
    const editor = getSlateEditor(editorRef);
    if (editor) void copyBlocks(editor, selected);
  };

  const remove = () => {
    const editor = getSlateEditor(editorRef);
    if (!editor || empty) return;
    const count = selected.length;
    deleteBlocks(editor, selected);
    exit();
    toast({
      type: "success",
      text: `已删除 ${count} 个块`,
      action: {
        label: "撤销",
        onClick: () => {
          if (HistoryEditor.isHistoryEditor(editor)) editor.undo();
        },
      },
    });
  };

  const openTransformSheet = () => {
    if (!editor || sharedTransforms.length === 0) return;
    const indices = selected;
    openSheet("转换为", [
      sharedTransforms.map(item => ({
        label: item.label,
        icon: item.icon,
        onClick: later(() => applyTransformToBlocks(kit, editor, indices, item.key)),
      })),
    ]);
  };

  // 单块命令：块数变化由选择状态自动裁剪越界下标
  const toSheetItem = (item: ContextMenuItem, desc?: string): ActionSheetItem => ({
    label: item.label,
    icon: item.icon,
    danger: item.danger,
    desc,
    trailing: item.children ? <ChevronRight strokeWidth={2} /> : undefined,
    onClick: later(() => {
      if (item.children) openSheet(item.label, [item.children.map(child => toSheetItem(child))]);
      else item.onSelect?.();
    }),
  });

  const openMoreSheet = () => {
    if (!editor || selected.length !== 1) return;
    const [index] = selected;
    const groups = buildMoreMenuGroups(resolveBlockMenu(kit, editor, index));
    const toItem = (item: ContextMenuItem): ActionSheetItem =>
      item.key === CUT_MENU_KEY
        ? {
            ...toSheetItem(item),
            onClick: later(() => {
              exit();
              void cutBlocks(editor, [index]);
            }),
          }
        : toSheetItem(item);
    const duplicateItem: ActionSheetItem = {
      label: "创建副本",
      icon: <CopyPlus size={MENU_ICON_SIZE} />,
      onClick: later(() => {
        duplicateBlocks(editor, [index]);
      }),
    };
    const hostItems: ActionSheetItem[] = [duplicateItem];
    if (onOpenOutline) {
      hostItems.push({
        label: "整理结构",
        icon: <ListTree size={MENU_ICON_SIZE} />,
        onClick: later(() => {
          exit();
          onOpenOutline();
        }),
      });
    }
    const builtin = groups.builtin.map(group => group.map(toItem));
    if (builtin.length > 0) builtin[builtin.length - 1].push(...hostItems);
    else builtin.push(hostItems);
    openSheet("更多", [
      ...builtin,
      groups.plugin.map(item => toSheetItem(item, `插件 · ${item.owner}`)),
      groups.danger.map(toItem),
    ]);
  };

  if (!portalRoot) return null;
  const actionBar = createPortal(
    <nav
      data-block-action-bar="true"
      className="bg-surface border-line-1 fixed inset-x-0 bottom-0 flex border-t px-1.5 pb-[calc(var(--mobile-safe-bottom)+6px)] pt-1.5"
      style={{ zIndex: Z_INDEX.POPOVER }}
    >
      <ActionButton
        label="上移"
        icon={<ArrowUp size={ICON_SIZE} />}
        disabled={!canMoveBlocks(selected, "up", blockCount)}
        onPress={() => move("up")}
      />
      <ActionButton
        label="下移"
        icon={<ArrowDown size={ICON_SIZE} />}
        disabled={!canMoveBlocks(selected, "down", blockCount)}
        onPress={() => move("down")}
      />
      <ActionButton
        label="转换"
        icon={<Repeat2 size={ICON_SIZE} />}
        disabled={sharedTransforms.length === 0}
        onPress={openTransformSheet}
      />
      <ActionButton label="复制" icon={<Copy size={ICON_SIZE} />} disabled={empty} onPress={copy} />
      <ActionButton
        label="删除"
        icon={<Trash2 size={ICON_SIZE} />}
        danger
        disabled={empty}
        onPress={remove}
      />
      <ActionButton
        label="更多"
        icon={<Ellipsis size={ICON_SIZE} />}
        disabled={selected.length !== 1}
        onPress={openMoreSheet}
      />
    </nav>,
    portalRoot
  );
  return (
    <>
      {actionBar}
      {sheet ? (
        // 每个面板独立挂载：上一级退场完成后下一级从入场动画开始
        <ActionSheet
          key={sheet.id}
          open
          title={sheet.title}
          groups={sheet.groups}
          onClose={handleSheetClose}
        />
      ) : null}
    </>
  );
}

export default BlockActionBar;
