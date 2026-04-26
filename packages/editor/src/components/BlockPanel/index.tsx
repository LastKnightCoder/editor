import { Box, Images } from "lucide-react";
import { PortalToBody } from "@tau/shared";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { useSlateStatic } from "slate-react";
import List from "./List";
import IExtension from "../../extensions/types";
import { IBlockPanelListItem } from "../../types";

import useBlockPanelStore from "../../stores/useBlockPanelStore";
import menuStyles from "../EditorContextMenu/index.module.less";

interface IBlockPanelProps {
  extensions: IExtension[];
}

const BlockPanel = memo((props: IBlockPanelProps) => {
  const { extensions } = props;
  const editor = useSlateStatic();
  const blockPanelList = useMemo(() => {
    const list = extensions
      .map((extension) => extension.getBlockPanelItems())
      .flat();

    const imageTitles = new Set(["块级图片", "行内图片", "图册"]);
    const reactTitles = new Set(["React 组件", "从模板选择"]);
    const groupedItems: IBlockPanelListItem[] = [];
    const imageItems: IBlockPanelListItem[] = [];
    const reactItems: IBlockPanelListItem[] = [];

    list.forEach((item) => {
      if (imageTitles.has(item.title)) {
        imageItems.push(item);
      } else if (reactTitles.has(item.title)) {
        reactItems.push(item);
      } else {
        groupedItems.push(item);
      }
    });

    const mergeGroup = (
      sourceItems: IBlockPanelListItem[],
      titles: Set<string>,
      groupItem: IBlockPanelListItem,
    ) => {
      if (sourceItems.length === 0) return;

      const firstIndex = list.findIndex((item) => titles.has(item.title));
      let insertIndex = groupedItems.length;
      if (firstIndex >= 0) {
        insertIndex = list
          .slice(0, firstIndex)
          .filter(
            (item) =>
              !imageTitles.has(item.title) && !reactTitles.has(item.title),
          ).length;
      }

      const finalList = [...groupedItems];
      finalList.splice(insertIndex, 0, groupItem);
      groupedItems.splice(0, groupedItems.length, ...finalList);
    };

    mergeGroup(imageItems, imageTitles, {
      icon: Images,
      title: "图片",
      description: "插入不同类型的图片",
      keywords: ["图片", "image", "块级图片", "行内图片", "图册"],
      children: imageItems,
    });

    mergeGroup(reactItems, reactTitles, {
      icon: Box,
      title: "React 组件",
      description: "自定义组件或从模板库选择",
      keywords: ["React", "组件", "模板", "custom"],
      children: reactItems,
    });

    if (imageItems.length === 0 && reactItems.length === 0) {
      return list;
    }

    return groupedItems;
  }, [extensions]);

  const {
    blockPanelVisible,
    ownerEditor,
    position,
    inputValue,
    list,
    filterList,
    reset,
  } = useBlockPanelStore((state) => ({
    blockPanelVisible: state.blockPanelVisible,
    ownerEditor: state.ownerEditor,
    position: state.position,
    list: state.list,
    inputValue: state.inputValue,
    filterList: state.filterList,
    reset: state.reset,
  }));
  const isOwner = ownerEditor === editor;

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
      if (
        panelRef.current &&
        !panelRef.current.contains(event.target as Node)
      ) {
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
        className={menuStyles.menu}
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
