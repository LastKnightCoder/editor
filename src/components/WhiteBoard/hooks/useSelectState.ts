import { useSelection } from "./useSelection";

export const useSelectState = (elementId: string) => {
  const selection = useSelection();
  const isSelected = !!selection?.selectedElements.some(element => element.id === elementId);
  const isSelecting = !!selection?.selectArea;

  return {
    isSelected,
    isSelecting,
  }
}

export default useSelectState;