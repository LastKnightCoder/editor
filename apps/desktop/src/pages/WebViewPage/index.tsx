import { memo, useState } from "react";
import { Webview } from "@tau/shared";
import { useTabParams, useTabContext } from "@/contexts/TabContext";
import { TabParams, TabType } from "@/types/tab";
import { convertFileSrc, getHomeDir } from "@/commands";
import { remoteResourceToLocal } from "@/utils";
import useGithubCdnUrl from "@/hooks/useGithubCdnUrl";
import WebViewSelectModal from "@/components/WebViewSelectModal";
import useTabStore from "@/stores/useTabStore";

const WebViewPage = memo(() => {
  const { url } = useTabParams<TabParams[TabType.WebView]>();
  const { tab, paneId } = useTabContext();
  const { updateTab } = useTabStore();
  const [showModal, setShowModal] = useState(!url);

  const handleConfirm = (result: {
    url: string;
    title: string;
    sourceType: "remote" | "local";
  }) => {
    updateTab(paneId, tab.id, {
      params: { url: result.url },
      title: result.title,
    });
    setShowModal(false);
  };

  if (!url) {
    return (
      <>
        <div className="w-full h-full flex items-center justify-center text-secondary">
          <div className="text-center">
            <p className="text-lg mb-4">请输入网页地址</p>
            <button
              onClick={() => setShowModal(true)}
              className="px-6 py-2 rounded-lg bg-blue-500 hover:bg-blue-600 text-white transition-colors"
            >
              输入网址
            </button>
          </div>
        </div>
        <WebViewSelectModal
          open={showModal}
          onCancel={() => setShowModal(false)}
          onConfirm={handleConfirm}
        />
      </>
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
