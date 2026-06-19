import { useMemoizedFn } from "ahooks";
import {
  useBoard,
  useSelection,
  usePresentationState,
} from "@/components/WhiteBoard/hooks";
import {
  BoardElement,
  Operation,
  FrameElement,
} from "@/components/WhiteBoard/types";
import { SnapBehavior } from "@/components/WhiteBoard/types/capabilities";
import { BoardUtil, FrameUtil, PathUtil } from "@/components/WhiteBoard/utils";
import setterConfig from "./setter-config.ts";

const AttributeSetter = () => {
  const selection = useSelection();
  const board = useBoard();

  const { isPresentationMode } = usePresentationState();

  const onElementChange = useMemoizedFn((newElement: BoardElement) => {
    if (!selection) return;
    const path = PathUtil.getPathByElement(board, newElement);
    if (!path) return;

    // 注意：newElement 可能带有 children（例如 Frame/Column/mind-node），不能直接 set_node(newElement)。
    // 这里只允许 patch 当前节点自身属性，结构变化必须用 move/insert/remove 表达。
    const currentElement = PathUtil.getElementByPath(board, path);
    if (!currentElement) return;

    const ops: Operation[] = [
      ...BoardUtil.diffNodePatchOnly(currentElement, newElement, path),
      {
        type: "set_selection",
        properties: selection,
        newProperties: {
          ...selection,
          selectedElements: [newElement],
        },
      },
    ];
    board.apply(ops);
  });

  const onMultiElementsChange = useMemoizedFn((newElements: BoardElement[]) => {
    if (!selection) return;

    const ops: Operation[] = [];
    const selectedElements = selection.selectedElements;
    const notChangedElements = selectedElements.filter(
      (el) => !newElements.map((el) => el.id).includes(el.id),
    );

    const capService = board.capabilityService;

    newElements.forEach((newElement) => {
      const path = PathUtil.getPathByElement(board, newElement);
      if (!path) return;

      const currentElement = PathUtil.getElementByPath(board, path);
      if (!currentElement) return;

      // 容器（Frame/Column）与 RootOnly 元素（mind-node 根）移动时，
      // 子元素需要随容器一起平移：用子树平移 ops，避免 set_node 写入 children。
      const snapCap = capService.getSnapCapability(currentElement.type);
      const shouldTranslateSubtree =
        capService.shouldMoveWithChildren(currentElement) ||
        (snapCap.behavior === SnapBehavior.RootOnly &&
          Boolean(snapCap.moveAll) &&
          Array.isArray(currentElement.children) &&
          currentElement.children.length > 0);

      if (
        shouldTranslateSubtree &&
        typeof currentElement.x === "number" &&
        typeof currentElement.y === "number" &&
        typeof newElement.x === "number" &&
        typeof newElement.y === "number"
      ) {
        const dx = newElement.x - currentElement.x;
        const dy = newElement.y - currentElement.y;
        ops.push(
          ...BoardUtil.buildTranslateSubtreeOps(currentElement, path, dx, dy),
        );
      } else {
        ops.push(
          ...BoardUtil.diffNodePatchOnly(currentElement, newElement, path),
        );
      }
    });

    ops.push({
      type: "set_selection",
      properties: selection,
      newProperties: {
        ...selection,
        selectedElements: [...notChangedElements, ...newElements],
      },
    });
    if (ops.length > 0) {
      board.apply(ops);
    }
  });

  if (isPresentationMode) return null;

  if (!selection) return null;

  const frames = selection.selectedElements.filter((el) => el.type === "frame");

  const validElements = selection.selectedElements.filter(
    (el) =>
      !frames.some((frame) =>
        FrameUtil.isChildInFrame(frame as FrameElement, el),
      ),
  );

  if (selection.selectedElements.length > 1 && validElements.length <= 1) {
    return null;
  }

  const noArrowElements = validElements.filter((el) => el.type !== "arrow");

  // 多选对齐时剔除任何容器（Frame/Column/MindNode 等）的内部元素，
  // 避免内部元素被独立平移破坏容器布局；容器自身移动已通过子树平移携带子元素。
  const containerDescendantIds = BoardUtil.getContainerDescendantIds(board);
  const alignElements = noArrowElements.filter(
    (el) => !containerDescendantIds.has(el.id),
  );

  // 多选元素的情况
  if (alignElements.length > 1) {
    const MultiSelectComponent = setterConfig.multiselect.component;
    return (
      <MultiSelectComponent
        elements={alignElements}
        onChange={onMultiElementsChange}
      />
    );
  }

  // 单选元素的情况
  if (validElements.length === 1) {
    const element = validElements[0];

    // @ts-ignore
    const config = setterConfig[element.type];

    if (config && config.component) {
      const Component = config.component;
      return <Component onChange={onElementChange} element={element} />;
    }
  }

  return null;
};

export default AttributeSetter;
