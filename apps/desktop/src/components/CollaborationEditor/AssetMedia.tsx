import { forwardRef, useEffect, useState, type ComponentType } from "react";
import { ASSET_PREFIX } from "@tau/collaboration";
import type { EditorCollaborationBinding } from "@tau/editor/src/collaboration/types";

export function createAssetMedia(
  Component: ComponentType<Record<string, unknown>>,
  binding: EditorCollaborationBinding
) {
  const AssetMedia = forwardRef<HTMLMediaElement, Record<string, unknown>>((props, ref) => {
    const source = typeof props.src === "string" ? props.src : "";
    const [resolved, setResolved] = useState<string>();
    useEffect(() => {
      let active = true;
      setResolved(undefined);
      if (source.startsWith(ASSET_PREFIX))
        void binding
          .resolveResource(source)
          .then(path => {
            if (active) setResolved(path);
          })
          .catch(() => {
            if (active) setResolved("");
          });
      return () => {
        active = false;
      };
    }, [source]);
    return (
      <Component {...props} ref={ref} src={source.startsWith(ASSET_PREFIX) ? resolved : source} />
    );
  });
  AssetMedia.displayName = "CollaborationAssetMedia";
  return AssetMedia;
}
