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
        <div className="text-secondary flex h-full w-full items-center justify-center">
          <div className="text-center">
            <p className="mb-4 text-lg">请输入网页地址</p>
            <button
              onClick={() => setShowModal(true)}
              className="rounded-lg bg-[var(--th-accent)] px-6 py-2 text-[var(--th-btn-text)] transition-colors hover:bg-[var(--th-btn-bg)]"
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
    <div className="flex h-full w-full flex-col overflow-hidden">
      <Webview
        src={url}
        className="h-full w-full"
        convertFileSrc={convertFileSrc}
        getHomeDir={getHomeDir}
        remoteResourceToLocal={remoteResourceToLocal}
        cdnUrlResolver={useGithubCdnUrl}
      />
    </div>
  );
});

export default WebViewPage;
