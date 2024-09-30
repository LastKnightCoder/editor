import { useSelection } from "../../../hooks/useSelection";
import { useBoard } from "../../../hooks/useBoard";
const useSelectState = (elementId: string) => {
  const selection = useSelection();
  const board = useBoard();
  const isSelected = !!selection?.selectedElements.some(element => element.id === elementId);
  const isSelecting = !!selection?.selectArea;
  const isMoving = board?.movingElements.some(element => element.id === elementId);

  return {
    isSelected,
    isSelecting,
    isMoving,
  }
}

export default useSelectState;