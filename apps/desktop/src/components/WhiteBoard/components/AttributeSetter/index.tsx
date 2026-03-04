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

    newElements.forEach((newElement) => {
      const path = PathUtil.getPathByElement(board, newElement);
      if (!path) return;

      const currentElement = PathUtil.getElementByPath(board, path);
      if (!currentElement) return;
      ops.push(
        ...BoardUtil.diffNodePatchOnly(currentElement, newElement, path),
      );
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

  // 多选元素的情况
  if (noArrowElements.length > 1) {
    const MultiSelectComponent = setterConfig.multiselect.component;
    return (
      <MultiSelectComponent
        elements={noArrowElements}
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
