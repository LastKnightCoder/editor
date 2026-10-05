import { useEffect, useState, type ComponentType, type Ref } from "react";
import { isCollaborationResource } from "@tau/collaboration";
import type { EditorCollaborationBinding } from "@tau/editor-collab";

/**
 * 包装平台媒体组件：将协同资源引用（服务器资产 / 仅本机资源）解析为本地地址后再渲染。
 * 解析失败（仅本机资源在其他成员设备上、资产被撤销）显示占位，不渲染空播放器。
 * 泛型透传保持插槽组件的原有 props 类型。
 */
export function createAssetMedia<P extends { src?: string; ref?: Ref<HTMLMediaElement> }>(
  Component: ComponentType<P>,
  binding: EditorCollaborationBinding,
  label: string
): ComponentType<P> {
  function AssetMedia(props: P) {
    const source = typeof props.src === "string" ? props.src : "";
    const managed = isCollaborationResource(source);
    const [resolved, setResolved] = useState<string>();
    useEffect(() => {
      let active = true;
      setResolved(undefined);
      if (managed)
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
    }, [source, managed]);
    if (managed && resolved === "")
      return (
        <div
          className="border-line-1 bg-page text-ink-3 rounded-tau-md text-tau-sm flex min-h-24 w-[min(480px,100%)] items-center justify-center gap-2 border border-dashed px-4 py-6"
          title="视频不上传协作服务器；添加者本机缺失的文件同样无法共享"
        >
          <i className="bg-warn h-[7px] w-[7px] flex-none rounded-full" />
          {label}未共享，仅在添加它的设备上可播放
        </div>
      );
    return <Component {...props} ref={props.ref} src={managed ? resolved : source} />;
  }
  AssetMedia.displayName = "CollaborationAssetMedia";
  return AssetMedia;
}
