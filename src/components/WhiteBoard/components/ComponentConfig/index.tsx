import { useBoard, useSelection } from "@/components/WhiteBoard/hooks";
import componentConfig from './config.ts';
import { BoardElement, Operation } from "@/components/WhiteBoard";
import { PathUtil } from "@/components/WhiteBoard/utils";

const ComponentConfig = () => {
  const selection = useSelection();
  const board = useBoard();

  if (!selection) return null;

  if (selection.selectedElements.length !== 1) return null;

  const element = selection.selectedElements[0];

  // @ts-ignore
  const config = componentConfig[element.type];

  const onElementChange = (newElement: BoardElement) => {
    const path = PathUtil.getPathByElement(board, newElement);
    if (!path) return;
    const ops: Operation[] = [{
      type: 'set_node',
      path,
      properties: element,
      newProperties: newElement,
    }, {
      type: 'set_selection',
      properties: selection,
      newProperties: {
        ...selection,
        selectedElements: [newElement],
      }
    }]
    board.apply(ops);
  }

  const handleOnFocus = () => {
    board.isEditingProperties = true;
  }

  const handleOnBlur = () => {
    board.isEditingProperties = false;
  }

  if (config && config.component) return config.component({ element, onChange: onElementChange, onFocus: handleOnFocus, onBlur: handleOnBlur });

  return null;
}

export default ComponentConfig;
