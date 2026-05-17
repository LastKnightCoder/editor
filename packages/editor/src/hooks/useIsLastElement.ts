import { Element } from "slate";
import { useSlateStatic } from "slate-react";
import { findPathSafely } from "../utils";

const useIsLastElement = (element: Element) => {
  const editor = useSlateStatic();
  const path = findPathSafely(editor, element);
  if (!path) {
    return false;
  }
  return path.length === 1 && editor.children.length - 1 === path[0];
};

export default useIsLastElement;
