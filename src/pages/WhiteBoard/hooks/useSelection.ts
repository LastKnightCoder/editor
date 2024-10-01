import { useContext } from "react";
import { SelectionContext } from "../context";

export const useSelection = () => {
  const selection = useContext(SelectionContext);

  return selection;
}