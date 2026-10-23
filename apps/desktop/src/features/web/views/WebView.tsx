import { Webview } from "@tau/shared";
import { usePageParams } from "@/page/PageProvider";
import { convertFileSrc, getHomeDir } from "@/commands";
import { remoteResourceToLocal } from "@/utils";

export function WebView() {
  const { url } = usePageParams<{ url: string }>();
  return (
    <Webview
      key={url}
      src={url}
      className="h-full w-full"
      convertFileSrc={convertFileSrc}
      getHomeDir={getHomeDir}
      remoteResourceToLocal={remoteResourceToLocal}
    />
  );
}
