import { groupBlockPanelItems } from "./groupItems";
import { PortalToBody, cn } from "@tau/ui";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { useSlateStatic } from "slate-react";
import List, { blockPanelScrollPanelClass } from "./List";
import type { ExtensionAssembly } from "../../kit/ExtensionAssembly";

import useBlockPanelStore from "../../stores/useBlockPanelStore";
import { menuPanelClass } from "../EditorContextMenu/menuClasses";

interface IBlockPanelProps {
  assembly: ExtensionAssembly;
}

const BlockPanel = memo((props: IBlockPanelProps) => {
  const { assembly } = props;
  const editor = useSlateStatic();

  const { blockPanelVisible, ownerEditor, position, inputValue, list, filterList, reset } =
    useBlockPanelStore(state => ({
      blockPanelVisible: state.blockPanelVisible,
      ownerEditor: state.ownerEditor,
      position: state.position,
      list: state.list,
      inputValue: state.inputValue,
      filterList: state.filterList,
      reset: state.reset,
    }));
  const isOwner = ownerEditor === editor;

  // blockPanelVisible 进依赖：面板每次打开时重算，媒体插入项的
  // isAvailable（如 AI 生图配置状态）在打开时刻求值而非挂载时冻结
  const blockPanelList = useMemo(() => {
    if (!blockPanelVisible) return [];
    return groupBlockPanelItems(assembly.getBlockPanelItems(editor));
  }, [assembly, editor, blockPanelVisible]);

  const panelRef = useRef<HTMLDivElement>(null);
  const [calculatedPosition, setCalculatedPosition] = useState(position);

  useEffect(() => {
    if (!isOwner) return;
    filterList(inputValue, blockPanelList);
  }, [inputValue, filterList, blockPanelList, isOwner]);

  useEffect(() => {
    return () => {
      const { ownerEditor, reset } = useBlockPanelStore.getState();
      if (ownerEditor === editor) {
        reset();
      }
    };
  }, [editor]);

  // 直接监听文档级 Escape，避免依赖编辑器焦点位置
  useEffect(() => {
    if (!blockPanelVisible || !isOwner) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.isComposing || event.key !== "Escape") return;
      reset();
      event.preventDefault();
      event.stopPropagation();
    };

    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      document.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [blockPanelVisible, isOwner, reset]);

  // 点击外部关闭面板
  useEffect(() => {
    if (!blockPanelVisible || !isOwner) return;

    const handleClickOutside = (event: MouseEvent) => {
      // 子菜单挂在 body 的 Portal 中，仍属于当前块面板。
      if (
        event.target instanceof Element &&
        event.target.closest("[data-editor-block-panel-layer]")
      )
        return;
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        reset();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [blockPanelVisible, isOwner, reset]);

  // 视口边界检测
  useEffect(() => {
    if (!blockPanelVisible || !isOwner) return;

    const updatePosition = () => {
      if (!panelRef.current) return;

      const rect = panelRef.current.getBoundingClientRect();
      const gap = 8;
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      let x = position.x + 10;
      let y = position.y;

      if (x + rect.width > viewportWidth - gap) {
        x = viewportWidth - rect.width - gap;
      }

      if (y + rect.height > viewportHeight - gap) {
        y = position.y - rect.height;
        if (y < gap) {
          y = viewportHeight - rect.height - gap;
        }
      }

      x = Math.max(gap, x);
      y = Math.max(gap, y);

      setCalculatedPosition({ x, y });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);

    return () => {
      window.removeEventListener("resize", updatePosition);
    };
  }, [blockPanelVisible, isOwner, position, list.length]);

  if (!blockPanelVisible || !isOwner || list.length === 0) return null;

  return (
    <PortalToBody>
      <div
        ref={panelRef}
        className={cn(menuPanelClass, blockPanelScrollPanelClass)}
        style={{
          left: `${calculatedPosition.x}px`,
          top: `${calculatedPosition.y}px`,
        }}
      >
        <List />
      </div>
    </PortalToBody>
  );
});

export default BlockPanel;
