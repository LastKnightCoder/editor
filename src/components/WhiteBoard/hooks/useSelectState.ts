import { useSelection } from "./useSelection";

export const useSelectState = (elementId: string) => {
  const selection = useSelection();
  const isSelected = Boolean(
    selection &&
      selection.selectedElements.some((element) => element.id === elementId),
  );
  const isSelecting = Boolean(
    selection &&
      selection.selectArea &&
      selection.selectArea.anchor !== selection.selectArea.focus,
  );

  return {
    isSelected,
    isSelecting,
  };
};

export default useSelectState;
