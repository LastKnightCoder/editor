import { useContext } from "react";
import { ViewPortContext } from "../context";

export const useViewPort = () => {
  const viewPort = useContext(ViewPortContext);

  return viewPort;
};
