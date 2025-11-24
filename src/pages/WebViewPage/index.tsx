import { memo } from "react";
import Webview from "@/components/Webview";
import { useTabParams } from "@/contexts/TabContext";
import { TabParams, TabType } from "@/types/tab";

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
      <Webview src={url} className="w-full h-full" />
    </div>
  );
});

export default WebViewPage;
