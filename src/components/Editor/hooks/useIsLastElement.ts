import { Element } from "slate";
import { ReactEditor, useSlate } from "slate-react";

const useIsLastElement = (element: Element) => {
  const editor = useSlate();
  const path = ReactEditor.findPath(editor, element);
  return path.length === 1 && editor.children.length - 1 === path[0];
};

export default useIsLastElement;
