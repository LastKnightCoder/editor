import { useContext } from "react";
import { SelectionContext } from "../index";

export const useSelection = () => {
  const selection = useContext(SelectionContext);

  return selection;
}