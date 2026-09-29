import { Box, Images } from "lucide-react";
import { PortalToBody } from "@tau/shared";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { useSlateStatic } from "slate-react";
import { cn } from "@tau/ui";
import List, { blockPanelScrollPanelClass } from "./List";
import { IBlockPanelListItem } from "../../types";
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
    const list = assembly.getBlockPanelItems(editor);

    const imageTitles = new Set(["行内图片", "图册"]);
    const reactTitles = new Set(["React 组件", "从模板选择"]);
    const groupedItems: IBlockPanelListItem[] = [];
    const imageItems: IBlockPanelListItem[] = [];
    const reactItems: IBlockPanelListItem[] = [];

    list.forEach(item => {
      if (imageTitles.has(item.title)) {
        imageItems.push(item);
      } else if (reactTitles.has(item.title)) {
        reactItems.push(item);
      } else {
        groupedItems.push(item);
      }
    });

    // 图片扩展自带"图片"分组（插入方式二级菜单），行内图片/图册并入其子级
    const mergeGroup = (
      sourceItems: IBlockPanelListItem[],
      titles: Set<string>,
      groupItem: IBlockPanelListItem
    ) => {
      if (sourceItems.length === 0) return;

      const existingGroup = groupedItems.find(item => item.title === groupItem.title);
      if (existingGroup) {
        // 以新对象替换而非原地变异，扩展返回缓存项时不会被累积污染
        const merged: IBlockPanelListItem = {
          ...existingGroup,
          children: [...(existingGroup.children ?? []), ...sourceItems],
        };
        groupedItems.splice(groupedItems.indexOf(existingGroup), 1, merged);
        return;
      }

      const firstIndex = list.findIndex(item => titles.has(item.title));
      let insertIndex = groupedItems.length;
      if (firstIndex >= 0) {
        insertIndex = list
          .slice(0, firstIndex)
          .filter(item => !imageTitles.has(item.title) && !reactTitles.has(item.title)).length;
      }

      const finalList = [...groupedItems];
      finalList.splice(insertIndex, 0, { ...groupItem, children: sourceItems });
      groupedItems.splice(0, groupedItems.length, ...finalList);
    };

    mergeGroup(imageItems, imageTitles, {
      icon: Images,
      title: "图片",
      description: "插入不同类型的图片",
      keywords: ["图片", "image", "块级图片", "行内图片", "图册"],
    });

    mergeGroup(reactItems, reactTitles, {
      icon: Box,
      title: "React 组件",
      description: "插入自定义 React 组件",
      keywords: ["React", "组件", "custom"],
    });

    if (imageItems.length === 0 && reactItems.length === 0) {
      return list;
    }

    return groupedItems;
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
