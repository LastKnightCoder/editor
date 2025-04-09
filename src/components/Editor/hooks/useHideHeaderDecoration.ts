import { useContext } from "react";
import { EditorContext } from "@/components/Editor";

const useHideHeaderDecoration = () => {
  const { hideHeaderDecoration } = useContext(EditorContext);
  return hideHeaderDecoration;
};

export default useHideHeaderDecoration;
