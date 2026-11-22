import { createContext, useContext } from "react";
import { EMarkerType } from "../../types/arrow";

export const MarkerPrefixContext = createContext<string | null>(null);

export function useArrowMarkers(source: EMarkerType, target: EMarkerType) {
  const prefix = useContext(MarkerPrefixContext);
  const url = (type: EMarkerType) =>
    prefix && type !== EMarkerType.None ? `url(#${prefix}-${type})` : "none";
  return { markerStart: url(source), markerEnd: url(target) };
}
