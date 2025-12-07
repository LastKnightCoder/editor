import { memo } from "react";
import { Webview } from "@tau/shared";
import { useTabParams } from "@/contexts/TabContext";
import { TabParams, TabType } from "@/types/tab";
import { convertFileSrc, getHomeDir } from "@/commands";
import { remoteResourceToLocal } from "@/utils";
import useGithubCdnUrl from "@/hooks/useGithubCdnUrl";

const WebViewPage = memo(() => {
  const { url } = useTabParams<TabParams[TabType.WebView]>();

  if (!url) {
    return (
      <div className="w-full h-full flex items-center justify-center text-secondary">
        <span>未提供网页地址</span>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col overflow-hidden">
      <Webview
        src={url}
        className="w-full h-full"
        convertFileSrc={convertFileSrc}
        getHomeDir={getHomeDir}
        remoteResourceToLocal={remoteResourceToLocal}
        useGithubCdnUrl={useGithubCdnUrl}
      />
    </div>
  );
});

export default WebViewPage;
