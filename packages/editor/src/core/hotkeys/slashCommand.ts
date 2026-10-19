import type { EditorCommand, EditorHotkey } from "../api/command";
import useBlockPanelStore from "../stores/useBlockPanelStore";

/** 块面板（斜杠菜单）打开时的键盘管理。未命中（面板不可见或不归当前编辑器）时不拦默认 */
export const slashCommandCommands: EditorCommand[] = [
  {
    id: "tau.panel.backspace",
    title: "块面板删除字符",
    run: editor => {
      // 关闭 blockPanel
      const { blockPanelVisible, ownerEditor, inputValue, reset } = useBlockPanelStore.getState();
      if (blockPanelVisible && ownerEditor === editor) {
        if (inputValue.length <= 1) {
          reset();
          return;
        }
        // 获取当前鼠标的位置
        const selection = window.getSelection();
        if (selection && selection.rangeCount > 0) {
          const range = selection.getRangeAt(0);
          const rect = range.getBoundingClientRect();
          const position = {
            x: rect.left,
            y: rect.top + rect.height,
          };
          useBlockPanelStore.setState({
            inputValue: inputValue.slice(0, inputValue.length - 1),
            position,
          });
        }
      }
    },
  },
  {
    id: "tau.panel.next",
    title: "块面板下一项",
    run: (editor, ctx) => {
      // 选择下一个
      const { blockPanelVisible, ownerEditor, setActiveIndex } = useBlockPanelStore.getState();
      if (blockPanelVisible && ownerEditor === editor) {
        setActiveIndex(true);
        ctx.event?.preventDefault();
      }
    },
  },
  {
    id: "tau.panel.prev",
    title: "块面板上一项",
    run: (editor, ctx) => {
      // 选择上一个
      const { blockPanelVisible, ownerEditor, setActiveIndex } = useBlockPanelStore.getState();
      if (blockPanelVisible && ownerEditor === editor) {
        setActiveIndex(false);
        ctx.event?.preventDefault();
      }
    },
  },
  {
    id: "tau.panel.confirm",
    title: "块面板确认",
    run: (editor, ctx) => {
      const { blockPanelVisible, ownerEditor, selectItem, getActiveItem, enterSubmenu } =
        useBlockPanelStore.getState();
      if (blockPanelVisible && ownerEditor === editor) {
        const currentItem = getActiveItem();

        // 如果当前项有子菜单且没有 onClick，进入子菜单
        if (currentItem?.children && currentItem.children.length > 0 && !currentItem.onClick) {
          enterSubmenu();
        } else {
          selectItem(editor);
        }
        ctx.event?.preventDefault();
      }
    },
  },
  {
    id: "tau.panel.enter-submenu",
    title: "块面板进入子菜单",
    run: (editor, ctx) => {
      const { blockPanelVisible, ownerEditor, getActiveItem, enterSubmenu } =
        useBlockPanelStore.getState();
      if (!blockPanelVisible || ownerEditor !== editor) return;

      const currentItem = getActiveItem();
      if (currentItem?.children && currentItem.children.length > 0) {
        enterSubmenu();
        ctx.event?.preventDefault();
      }
    },
  },
  {
    id: "tau.panel.exit-submenu",
    title: "块面板退出子菜单",
    run: (editor, ctx) => {
      const { blockPanelVisible, ownerEditor, activePath, exitSubmenu } =
        useBlockPanelStore.getState();
      if (blockPanelVisible && ownerEditor === editor && activePath.length > 1) {
        exitSubmenu();
        ctx.event?.preventDefault();
      }
    },
  },
];

export const slashCommandHotkeys: EditorHotkey[] = [
  { key: "backspace", command: "tau.panel.backspace" },
  { key: "ArrowDown", command: "tau.panel.next" },
  { key: "ArrowUp", command: "tau.panel.prev" },
  { key: "enter", command: "tau.panel.confirm" },
  { key: "right", command: "tau.panel.enter-submenu" },
  { key: "left", command: "tau.panel.exit-submenu" },
];
