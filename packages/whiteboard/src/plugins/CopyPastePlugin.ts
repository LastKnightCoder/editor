import { embeddedTextOptions, type TextExtensionOptions } from "../extensions/text";
import { WhiteboardValidationError } from "../extensions/validation";
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
  getElementGroupId,
  writeClipboardPayload,
  deleteBoardElements,
  RichTextUtil,
  getLayerOrderActionState,
  executeLayerOrderAction,
} from "../utils";
import { SelectTransforms, ViewPortTransforms } from "../transforms";

import { v4 as getUuid } from "uuid";
import React from "react";
import { ArrowDown, ArrowDownToLine, ArrowUp, ArrowUpToLine, Copy, Trash2 } from "lucide-react";
import { isMarkdownLikeText } from "@tau/markdown";

import { Descendant } from "slate";

export class CopyPastePlugin implements IBoardPlugin {
  name = "copy-paste";

  constructor(private readonly text: TextExtensionOptions = embeddedTextOptions) {
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
  private filterContainerChildren(board: Board, elements: BoardElement[]): BoardElement[] {
    if (elements.length <= 1) return elements;

    const capService = board.capabilityService;

    // 找到所有带子元素的容器（如 frame）
    const containers = elements.filter(el => capService.shouldMoveWithChildren(el));

    // 收集所有容器的所有子元素ID（包括嵌套的）
    const allChildIds = new Set<string>();
    containers.forEach(container => {
      const childIds = this.collectAllChildIds(container);
      childIds.forEach(id => allChildIds.add(id));
    });

    // 从元素列表中移除所有容器的子元素
    const filteredElements = elements.filter(el => !allChildIds.has(el.id));

    return filteredElements;
  }

  private collectReferencedContentIds(elements: BoardElement[]): Map<number, number> {
    const counts = new Map<number, number>();

    const visit = (element: BoardElement) => {
      const contentId = (element as { contentId?: unknown }).contentId;
      if (typeof contentId === "number" && contentId > 0) {
        counts.set(contentId, (counts.get(contentId) || 0) + 1);
      }
      if (Array.isArray(element.children)) {
        element.children.forEach(visit);
      }
    };

    elements.forEach(visit);
    return counts;
  }

  private syncPastedContentRefs(elements: BoardElement[]) {
    const counts = this.collectReferencedContentIds(elements);
    counts.forEach((count, contentId) => {
      for (let index = 0; index < count; index += 1) {
        void this.text.retain?.(contentId).catch(error => {
          console.error("Failed to increment pasted content ref count:", error);
        });
      }
    });
  }

  getContextMenu(context: ContextMenuContext): PluginContextMenuItem[] {
    const { targetElements, board } = context;
    const items: PluginContextMenuItem[] = [];
    const targetCount = targetElements.length;
    const isMac = typeof navigator !== "undefined" && /mac/i.test(navigator.platform);
    const copyShortcut = isMac ? "⌘C" : "Ctrl+C";
    const deleteShortcut = isMac ? "⌘⌫" : "Delete";

    // 复制菜单项
    if (targetCount === 0) {
      // 没有选中元素时，显示禁用的复制项
      items.push({
        key: "copy",
        label: "复制",
        icon: React.createElement(Copy, { size: 14 }),
        shortcut: copyShortcut,
        priority: 300,
        disabled: true,
        onSelect: () => {},
      });
    } else {
      const labelSuffix = targetCount > 1 ? "选中" : "元素";
      const layerActionState = getLayerOrderActionState(board, targetElements);
      items.push({
        key: "copy",
        label: `复制${labelSuffix}`,
        icon: React.createElement(Copy, { size: 14 }),
        shortcut: copyShortcut,
        priority: 300,
        onSelect: (ctx: ContextMenuContext) => {
          // 过滤掉容器内的元素
          const filteredElements = this.filterContainerChildren(ctx.board, targetElements);
          const payload = buildClipboardPayload(ctx.board, filteredElements);
          if (!payload) return;
          writeClipboardPayload(payload).then(success => {
            if (!success) {
              console.warn("复制到剪贴板失败");
            }
          });
        },
      });

      items.push(
        {
          key: "layer-move-up",
          label: "上移一层",
          icon: React.createElement(ArrowUp, { size: 14 }),
          priority: 304,
          disabled: layerActionState.moveUpDisabled,
          onSelect: (ctx: ContextMenuContext) => {
            executeLayerOrderAction(ctx.board, ctx.targetElements, "move-up");
          },
        },
        {
          key: "layer-move-down",
          label: "下移一层",
          icon: React.createElement(ArrowDown, { size: 14 }),
          priority: 305,
          disabled: layerActionState.moveDownDisabled,
          onSelect: (ctx: ContextMenuContext) => {
            executeLayerOrderAction(ctx.board, ctx.targetElements, "move-down");
          },
        },
        {
          key: "layer-move-top",
          label: "移至顶层",
          icon: React.createElement(ArrowUpToLine, { size: 14 }),
          priority: 306,
          disabled: layerActionState.moveTopDisabled,
          onSelect: (ctx: ContextMenuContext) => {
            executeLayerOrderAction(ctx.board, ctx.targetElements, "move-top");
          },
        },
        {
          key: "layer-move-bottom",
          label: "移至底层",
          icon: React.createElement(ArrowDownToLine, { size: 14 }),
          priority: 307,
          disabled: layerActionState.moveBottomDisabled,
          onSelect: (ctx: ContextMenuContext) => {
            executeLayerOrderAction(ctx.board, ctx.targetElements, "move-bottom");
          },
        }
      );

      // 删除菜单项（仅在非只读且非演示模式时显示）
      const canDelete =
        !board.readonly &&
        !board.presentationManager.isPresentationMode &&
        !board.presentationManager.isCreatingSequence;

      if (canDelete) {
        items.push({
          key: "delete",
          label: `删除${labelSuffix}`,
          icon: React.createElement(Trash2, { size: 14 }),
          shortcut: deleteShortcut,
          priority: 310,
          danger: true,
          onSelect: (ctx: ContextMenuContext) => {
            // 过滤掉容器内的元素，避免重复删除
            const filteredElements = this.filterContainerChildren(ctx.board, targetElements);
            const deleted = deleteBoardElements(ctx.board, filteredElements);
            if (!deleted) return;
            const targetIds = new Set(filteredElements.map(element => element.id));
            const remainingSelected = ctx.board.selection.selectedElements.filter(
              element => !targetIds.has(element.id)
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
    const filteredElements = this.filterContainerChildren(board, selectedElements);

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
    const filteredElements = this.filterContainerChildren(board, selectedElements);

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
    const applicationJson = e.clipboardData?.getData("application/json");
    const textPlain = e.clipboardData?.getData("text/plain");
    const payloadCandidates = Array.from(
      new Set(
        [applicationJson, textPlain].filter(
          (value): value is string => typeof value === "string" && value.length > 0
        )
      )
    );

    for (const candidate of payloadCandidates) {
      if (this.tryPasteWhiteboardPayload(candidate, e, board)) {
        return;
      }
    }

    this.tryPasteTextAsRichText(e, board);
  }

  private tryPasteWhiteboardPayload(data: string, e: ClipboardEvent, board: Board): boolean {
    let dataObj: { source?: string; elements?: BoardElement[] } | null = null;
    try {
      dataObj = JSON.parse(data);
    } catch (_error) {
      return false;
    }

    if (dataObj?.source !== "editor-white-board") {
      return false;
    }

    // 获取粘贴板的元素
    const elements: BoardElement[] = Array.isArray(dataObj.elements) ? dataObj.elements : [];
    if (elements.length === 0) {
      return false;
    }

    // 收集所有需要替换的ID映射，包括子元素
    const idMaps = new Map<string, string>();
    this.collectAllIds(elements, idMaps);

    elements.forEach(element => {
      // 更新元素位置并替换所有ID引用
      this.updateElementIds(element, idMaps);
    });

    const groupIdMaps = new Map<string, string>();
    this.collectGroupIds(elements, groupIdMaps);
    elements.forEach(element => {
      this.updateGroupIds(element, groupIdMaps);
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

    try {
      board.apply(ops);
    } catch (error) {
      // 剪贴板可能携带第三方元素，数据不合规时放弃本次粘贴（不落入文本粘贴兜底）
      if (error instanceof WhiteboardValidationError) {
        console.error(`粘贴的白板元素数据不合规，已放弃：${error.message}`);
        e.preventDefault();
        e.stopImmediatePropagation();
        return true;
      }
      throw error;
    }
    this.syncPastedContentRefs(elements);
    ViewPortTransforms.centerElementsIfNotInViewPort(board, elements);

    e.preventDefault();
    e.stopImmediatePropagation();
    return true;
  }

  private tryPasteTextAsRichText(e: ClipboardEvent, board: Board): boolean {
    if (board.isEditingElements.length > 0) return false;
    if (this.isEditableEventTarget(e.target)) return false;
    if (this.hasMediaClipboardItems(e)) return false;

    const text = e.clipboardData?.getData("text/plain");
    if (!text || text.trim().length === 0) return false;

    const content =
      isMarkdownLikeText(text) && this.text.importMarkdown
        ? this.text.importMarkdown(text)
        : this.buildPlainTextContent(text);

    const { minX, minY, width, height } = board.viewPort;
    const pastedRichTextMaxWidth = 300;
    const element: BoardElement = {
      id: getUuid(),
      type: "richtext",
      x: minX + width / 2 - pastedRichTextMaxWidth / 2,
      y: minY + height / 2,
      width: pastedRichTextMaxWidth,
      height: 42,
      maxWidth: pastedRichTextMaxWidth,
      maxHeight: 1000,
      readonly: false,
      resized: false,
      autoHeight: true,
      content: content.length > 0 ? content : this.buildPlainTextContent(""),
      autoFocus: true,
      ...RichTextUtil.load(),
    };

    board.apply([
      {
        type: "insert_node",
        path: [board.children.length],
        node: element,
      },
      {
        type: "set_selection",
        properties: board.selection,
        newProperties: {
          selectedElements: [element],
          selectArea: null,
        },
      },
    ]);

    e.preventDefault();
    e.stopImmediatePropagation();
    return true;
  }

  private hasMediaClipboardItems(e: ClipboardEvent): boolean {
    const items = e.clipboardData?.items;
    if (!items) return false;

    for (let i = 0; i < items.length; i++) {
      const type = items[i].type;
      if (type.startsWith("image/") || type.startsWith("video/") || type.startsWith("audio/")) {
        return true;
      }
    }
    return false;
  }

  private isEditableEventTarget(target: EventTarget | null): boolean {
    const element =
      target instanceof Element ? target : target instanceof Node ? target.parentElement : null;
    if (!element) return false;

    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
      return true;
    }

    return Boolean(
      (element instanceof HTMLElement && element.isContentEditable) ||
      element.closest('[contenteditable="true"]') ||
      element.closest("[data-slate-editor]") ||
      element.closest("input") ||
      element.closest("textarea")
    );
  }

  private buildPlainTextContent(text: string): Descendant[] {
    const lines = text.split(/\r?\n/);
    if (lines.length === 0) {
      return [this.createEmptyParagraph()];
    }

    return lines.map(line => ({
      type: "paragraph",
      children: [
        {
          type: "formatted",
          text: line,
        },
      ],
    })) as Descendant[];
  }

  private createEmptyParagraph(): Descendant {
    return {
      type: "paragraph",
      children: [
        {
          type: "formatted",
          text: "",
        },
      ],
    } as Descendant;
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
  private updateElementIds(element: BoardElement, idMaps: Map<string, string>): BoardElement {
    // 更新当前元素的ID
    const updatedElement = { ...element };
    updatedElement.id = idMaps.get(element.id) || element.id;

    // 处理元素的 bindId 引用 (如 arrow 的 source/target)
    // 使用属性检查而非类型检查,支持任何具有绑定关系的元素类型
    if (updatedElement.source?.bindId) {
      updatedElement.source.bindId =
        idMaps.get(updatedElement.source.bindId) || updatedElement.source.bindId;
    }
    if (updatedElement.target?.bindId) {
      updatedElement.target.bindId =
        idMaps.get(updatedElement.target.bindId) || updatedElement.target.bindId;
    }

    // 递归处理children
    if (updatedElement.children && updatedElement.children.length > 0) {
      updatedElement.children = updatedElement.children.map(child =>
        this.updateElementIds(child, idMaps)
      );
    }

    return updatedElement;
  }

  private collectGroupIds(elements: BoardElement[], groupIdMaps: Map<string, string>) {
    for (const element of elements) {
      const groupId = getElementGroupId(element);
      if (groupId && !groupIdMaps.has(groupId)) {
        groupIdMaps.set(groupId, getUuid());
      }

      if (element.children && element.children.length > 0) {
        this.collectGroupIds(element.children, groupIdMaps);
      }
    }
  }

  private updateGroupIds(element: BoardElement, groupIdMaps: Map<string, string>) {
    const groupId = getElementGroupId(element);
    if (groupId) {
      element.groupId = groupIdMaps.get(groupId) || groupId;
    }

    if (element.children && element.children.length > 0) {
      element.children.forEach(child => this.updateGroupIds(child, groupIdMaps));
    }
  }
}
