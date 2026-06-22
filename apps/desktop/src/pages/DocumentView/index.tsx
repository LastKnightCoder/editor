import DocumentList from "./DocumentList";
import EditDocumentItem from "./EditDocumentItem";
import DocumentContext from "./DocumentContext";
import useThemeColors from "@/hooks/useThemeColors";
import { Empty, Button } from "antd";
import { useEffect, useRef, useState } from "react";
import { IDocument } from "@/types";
import { getDocument } from "@/commands";
import { LoadingOutlined } from "@ant-design/icons";
import useTabParams from "@/hooks/useTabParams";
import useTabStore from "@/stores/useTabStore";
import { TabType } from "@/types/tab";
import ResizeableAndHideableSidebar from "@/components/ResizableAndHideableSidebar";
import { useLocalStorageState } from "ahooks";
import classnames from "classnames";
import SidebarToggleButton from "@/components/SidebarToggleButton";
import { useDatabaseChangeEffect } from "@/hooks/useDatabaseChangeEffect";

const DocumentView = () => {
  const { id, itemId } = useTabParams(TabType.DocumentDetail);
  const { borderClass } = useThemeColors();
  const documentId = Number(id);
  const [document, setDocument] = useState<IDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [hideSidebar, setHideSidebar] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerWidth, setContainerWidth] = useState<number | undefined>(
    undefined,
  );

  const [sidebarWidth, setSidebarWidth] = useLocalStorageState(
    "document-view-sidebar-width",
    {
      defaultValue: 300,
    },
  );

  const navigateTo = useTabStore((state) => state.navigateTo);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setContainerWidth(entry.contentRect.width);
    });
    observer.observe(el);
    setContainerWidth(el.getBoundingClientRect().width);
    return () => observer.disconnect();
  }, [document]);

  const sidebarMaxWidth =
    containerWidth !== undefined ? Math.max(200, containerWidth - 300) : 900;

  // 在数据库连接或切换时加载知识库
  useDatabaseChangeEffect(() => {
    setLoading(true);
    getDocument(documentId)
      .then((document) => {
        setDocument(document);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [documentId]);

  if (loading) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <LoadingOutlined />
      </div>
    );
  }

  if (!document) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <Empty
          description="知识库不存在或已被删除"
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        >
          <Button
            type="primary"
            onClick={() => navigateTo(TabType.DocumentList)}
          >
            返回知识库列表
          </Button>
        </Empty>
      </div>
    );
  }

  if (!document) return null;

  const onFoldSidebar = () => {
    setHideSidebar(!hideSidebar);
  };

  return (
    <DocumentContext.Provider
      value={{
        documentId: document.id,
        itemId: itemId,
        containerWidth,
      }}
    >
      <div ref={containerRef} className="w-full h-full flex relative">
        <ResizeableAndHideableSidebar
          width={sidebarWidth ?? 300}
          onWidthChange={setSidebarWidth}
          open={!hideSidebar}
          onToggle={onFoldSidebar}
          sidebarPosition="left"
          maxWidth={sidebarMaxWidth}
          disableResize={false}
          className={classnames(
            "h-full border-r relative overflow-hidden",
            borderClass,
          )}
        >
          <DocumentList />
        </ResizeableAndHideableSidebar>
        <SidebarToggleButton.Expand
          isHidden={hideSidebar}
          onToggle={onFoldSidebar}
          side="left"
        />
        <div className="flex-1 h-full flex flex-col overflow-hidden">
          <div className="w-full flex-1 overflow-hidden">
            <EditDocumentItem
              key={itemId ?? document.id}
              documentItemId={itemId ?? 0}
            />
          </div>
        </div>
      </div>
    </DocumentContext.Provider>
  );
};

export default DocumentView;
