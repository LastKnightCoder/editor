import {
  Board,
  BoardElement,
  IBoardPlugin,
  Operation,
  ContextMenuContext,
  PluginContextMenuItem,
} from "../types";
import {
  PathUtil,
  buildClipboardPayload,
  writeClipboardPayload,
  deleteBoardElements,
} from "@/components/WhiteBoard/utils";
import {
  SelectTransforms,
  ViewPortTransforms,
} from "@/components/WhiteBoard/transforms";
import { v4 as getUuid } from "uuid";
import React from "react";
import { CopyOutlined, DeleteOutlined } from "@ant-design/icons";

export class CopyPastePlugin implements IBoardPlugin {
  name = "copy-paste";

  constructor() {
    this.onCopy = this.onCopy.bind(this);
    this.onCut = this.onCut.bind(this);
    this.onPaste = this.onPaste.bind(this);
  }

  /**
   * 递归收集容器的所有子元素ID
   */
  private collectAllChildIds(element: BoardElement): Set<string> {
    const childIds = new Set<string>();

    const traverse = (el: BoardElement) => {
      if (el.children && el.children.length > 0) {
        el.children.forEach((child: BoardElement) => {
          childIds.add(child.id);
          // 递归遍历子元素
          traverse(child);
        });
      }
    };

    traverse(element);
    return childIds;
  }

  /**
   * 过滤掉容器内的元素，避免重复复制
   * 如果同时选中了容器和其内部元素，只保留容器
   */
  private filterContainerChildren(
    board: Board,
    elements: BoardElement[],
  ): BoardElement[] {
    if (elements.length <= 1) return elements;

    const capService = board.capabilityService;

    // 找到所有带子元素的容器（如 frame）
    const containers = elements.filter((el) =>
      capService.shouldMoveWithChildren(el),
    );

    // 收集所有容器的所有子元素ID（包括嵌套的）
    const allChildIds = new Set<string>();
    containers.forEach((container) => {
      const childIds = this.collectAllChildIds(container);
      childIds.forEach((id) => allChildIds.add(id));
    });

    // 从元素列表中移除所有容器的子元素
    const filteredElements = elements.filter(
      (el) => !allChildIds.has(el.id),
    );

    return filteredElements;
  }

  getContextMenu(context: ContextMenuContext): PluginContextMenuItem[] {
    const { targetElements, board } = context;
    const items: PluginContextMenuItem[] = [];
    const targetCount = targetElements.length;
    const isMac =
      typeof navigator !== "undefined" && /mac/i.test(navigator.platform);
    const copyShortcut = isMac ? "⌘C" : "Ctrl+C";
    const deleteShortcut = isMac ? "⌘⌫" : "Delete";

    // 复制菜单项
    if (targetCount === 0) {
      // 没有选中元素时，显示禁用的复制项
      items.push({
        key: "copy",
        label: "复制",
        icon: React.createElement(CopyOutlined),
        shortcut: copyShortcut,
        priority: 300,
        disabled: true,
        onSelect: () => {},
      });
    } else {
      const labelSuffix = targetCount > 1 ? "选中" : "元素";
      items.push({
        key: "copy",
        label: `复制${labelSuffix}`,
        icon: React.createElement(CopyOutlined),
        shortcut: copyShortcut,
        priority: 300,
        onSelect: (ctx: ContextMenuContext) => {
          // 过滤掉容器内的元素
          const filteredElements = this.filterContainerChildren(
            ctx.board,
            targetElements,
          );
          const payload = buildClipboardPayload(ctx.board, filteredElements);
          if (!payload) return;
          writeClipboardPayload(payload).then((success) => {
            if (!success) {
              console.warn("复制到剪贴板失败");
            }
          });
        },
      });

      // 删除菜单项（仅在非只读且非演示模式时显示）
      const canDelete =
        !board.readonly &&
        !board.presentationManager.isPresentationMode &&
        !board.presentationManager.isCreatingSequence;

      if (canDelete) {
        items.push({
          key: "delete",
          label: `删除${labelSuffix}`,
          icon: React.createElement(DeleteOutlined),
          shortcut: deleteShortcut,
          priority: 310,
          danger: true,
          onSelect: (ctx: ContextMenuContext) => {
            // 过滤掉容器内的元素，避免重复删除
            const filteredElements = this.filterContainerChildren(
              ctx.board,
              targetElements,
            );
            const deleted = deleteBoardElements(ctx.board, filteredElements);
            if (!deleted) return;
            const targetIds = new Set(
              filteredElements.map((element) => element.id),
            );
            const remainingSelected =
              ctx.board.selection.selectedElements.filter(
                (element) => !targetIds.has(element.id),
              );
            SelectTransforms.updateSelectArea(ctx.board, {
              selectArea: null,
              selectedElements: remainingSelected,
            });
          },
        });
      }
    }

    return items;
  }

  onCopy(e: ClipboardEvent, board: Board) {
    // 读取当前所有选择的元素
    const selectedElements = board.selection.selectedElements;
    if (selectedElements.length === 0) return;

    // 过滤掉容器内的元素
    const filteredElements = this.filterContainerChildren(
      board,
      selectedElements,
    );

    const payload = buildClipboardPayload(board, filteredElements);
    if (!payload) return;

    e.clipboardData?.setData("application/json", payload);
    e.clipboardData?.setData("text/plain", payload);
    e.preventDefault();
    e.stopImmediatePropagation();
  }

  onCut(e: ClipboardEvent, board: Board) {
    const selectedElements = board.selection.selectedElements;
    if (selectedElements.length === 0) return;

    // 过滤掉容器内的元素，避免重复删除
    const filteredElements = this.filterContainerChildren(
      board,
      selectedElements,
    );

    // 创建删除操作，现在不需要预先计算路径了，apply 方法会自动处理路径转换
    const ops: Operation[] = [];
    for (const element of filteredElements) {
      const path = PathUtil.getPathByElement(board, element);
      if (path) {
        ops.push({
          type: "remove_node",
          path,
          node: element,
        });
      }
    }

    board.apply(ops);
    this.onCopy(e, board);
    SelectTransforms.updateSelectArea(board, {
      selectArea: null,
      selectedElements: [],
    });
  }

  onPaste(e: ClipboardEvent, board: Board) {
    // 读取剪切板数据
    let data = e.clipboardData?.getData("application/json");
    if (!data) {
      data = e.clipboardData?.getData("text/plain");
    }
    if (!data) return;
    try {
      const dataObj = JSON.parse(data);
      if (dataObj.source !== "editor-white-board") return;
      // 获取粘贴板的元素
      const elements: BoardElement[] = dataObj.elements;

      // 收集所有需要替换的ID映射，包括子元素
      const idMaps = new Map<string, string>();
      this.collectAllIds(elements, idMaps);

      elements.forEach((element) => {
        // 更新元素位置并替换所有ID引用
        this.updateElementIds(element, idMaps);
      });

      const childrenLength = board.children.length;
      const ops: Operation[] = [];
      for (const element of elements) {
        const path = [childrenLength];
        ops.push({
          type: "insert_node",
          path,
          node: element,
        });
      }

      ops.push({
        type: "set_selection",
        properties: board.selection,
        newProperties: {
          selectedElements: elements,
          selectArea: null,
        },
      });

      board.apply(ops);
      ViewPortTransforms.centerElementsIfNotInViewPort(board, elements);

      e.preventDefault();
      e.stopImmediatePropagation();
    } catch (e) {
      console.error(e);
      return;
    }
  }

  /**
   * 递归收集所有元素的ID，包括children中的元素
   */
  private collectAllIds(elements: BoardElement[], idMaps: Map<string, string>) {
    for (const element of elements) {
      // 为当前元素生成新ID
      const newId = getUuid();
      idMaps.set(element.id, newId);
      element.id = newId;

      // 递归处理children
      if (element.children && element.children.length > 0) {
        this.collectAllIds(element.children, idMaps);
      }
    }
  }

  /**
   * 递归更新元素及其children的所有ID引用
   */
  private updateElementIds(
    element: BoardElement,
    idMaps: Map<string, string>,
  ): BoardElement {
    // 更新当前元素的ID
    const updatedElement = { ...element };
    updatedElement.id = idMaps.get(element.id) || element.id;

    // 处理元素的 bindId 引用 (如 arrow 的 source/target)
    // 使用属性检查而非类型检查,支持任何具有绑定关系的元素类型
    if (updatedElement.source?.bindId) {
      updatedElement.source.bindId =
        idMaps.get(updatedElement.source.bindId) ||
        updatedElement.source.bindId;
    }
    if (updatedElement.target?.bindId) {
      updatedElement.target.bindId =
        idMaps.get(updatedElement.target.bindId) ||
        updatedElement.target.bindId;
    }

    // 递归处理children
    if (updatedElement.children && updatedElement.children.length > 0) {
      updatedElement.children = updatedElement.children.map((child) =>
        this.updateElementIds(child, idMaps),
      );
    }

    return updatedElement;
  }
}
