import { useEffect, useState, type ComponentType, type Ref } from "react";
import { ASSET_PREFIX } from "@tau/collaboration";
import type { EditorCollaborationBinding } from "@tau/editor/src/collaboration/types";

/**
 * 包装平台媒体组件：将协同资源的 ASSET_PREFIX 地址解析为本地地址后再渲染。
 * 泛型透传保持插槽组件的原有 props 类型。
 */
export function createAssetMedia<P extends { src?: string; ref?: Ref<HTMLMediaElement> }>(
  Component: ComponentType<P>,
  binding: EditorCollaborationBinding
): ComponentType<P> {
  function AssetMedia(props: P) {
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
      <Component
        {...props}
        ref={props.ref}
        src={source.startsWith(ASSET_PREFIX) ? resolved : source}
      />
    );
  }
  AssetMedia.displayName = "CollaborationAssetMedia";
  return AssetMedia;
}
