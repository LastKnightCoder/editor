import DocumentList from "./DocumentList";
import EditDocumentItem from "./EditDocumentItem";
import DocumentContext from "./DocumentContext";
import useThemeColors from "@/hooks/useThemeColors";
import { Empty, Button } from "antd";
import { useState, useEffect } from "react";
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

const DocumentView = () => {
  const { id, itemId } = useTabParams(TabType.DocumentDetail);
  const { borderClass } = useThemeColors();
  const documentId = Number(id);
  const [document, setDocument] = useState<IDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [hideSidebar, setHideSidebar] = useState(false);

  const [sidebarWidth, setSidebarWidth] = useLocalStorageState(
    "document-view-sidebar-width",
    {
      defaultValue: 300,
    },
  );

  const navigateTo = useTabStore((state) => state.navigateTo);

  useEffect(() => {
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
      }}
    >
      <div className="w-full h-full flex relative">
        <ResizeableAndHideableSidebar
          width={sidebarWidth ?? 300}
          onWidthChange={setSidebarWidth}
          open={!hideSidebar}
          disableResize={false}
          className={classnames("h-full border-r relative", borderClass)}
        >
          <DocumentList />
          <SidebarToggleButton.Collapse onToggle={onFoldSidebar} side="left" />
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
