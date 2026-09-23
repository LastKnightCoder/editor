import { Empty } from "antd";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocalStorageState } from "ahooks";

import EditPdf from "@/components/EditPdf";
import PdfChatPanel, { type PdfChatPanelHandle } from "./PdfChatPanel";
import { getPdfById } from "@/commands";
import { Pdf } from "@/types";
import { LoadingOutlined } from "@ant-design/icons";
import useTabParams from "@/hooks/useTabParams";
import { TabType } from "@/types/tab";
import useSettingStore from "@/stores/useSettingStore";
import type { PdfAskAIContext } from "@/components/PdfEmbed";
import type { PdfCitationTarget } from "./pdfCitation";
import ResizableAndHideableSidebar from "@/components/ResizableAndHideableSidebar";

const PdfDetailView = () => {
  const { id } = useTabParams(TabType.PdfDetail);
  const pdfId = id;
  const mainDbName = useSettingStore(state => state.setting.database.active);
  const chatPanelRef = useRef<PdfChatPanelHandle>(null);

  const [pdf, setPdf] = useState<Pdf | null>(null);
  const [loading, setLoading] = useState(false);
  const [chatCollapsed, setChatCollapsed] = useState(false);
  const [jumpTarget, setJumpTarget] = useState<PdfCitationTarget | null>(null);
  const [chatWidth, setChatWidth] = useLocalStorageState("pdf-chat-panel-width", {
    defaultValue: 440,
  });

  useEffect(() => {
    if (pdfId) {
      setLoading(true);
      getPdfById(pdfId)
        .then(pdf => {
          setPdf(pdf);
        })
        .finally(() => {
          setLoading(false);
        });
    }
  }, [pdfId]);

  const buildAskText = useMemo(
    () => (context: PdfAskAIContext) => {
      const base = [`请基于当前 PDF 回答这个问题，并尽量给出页码。`];
      base.push(`当前关注位置：第 ${context.pageNumber} 页。`);
      if (context.kind === "selection" && context.text) {
        base.push(`用户选中的文本：\n${context.text}`);
        base.push("请先解释这段内容，再结合当前 PDF 上下文补充完整回答。");
      } else if (context.kind === "annotation" && context.text) {
        base.push(`用户当前选中的标注内容：\n${context.text}`);
        base.push("请结合相邻上下文和全文搜索进行回答。");
      } else if (context.kind === "area") {
        if (context.text) {
          base.push(`该区域相关文本：\n${context.text}`);
        }
        base.push("请结合截图区域、当前页文本和全文搜索回答问题，并说明你的依据。");
      }
      base.push("如果证据不足，请明确说明。");
      return base.join("\n\n");
    },
    []
  );

  const handleAskAI = async (context: PdfAskAIContext) => {
    await chatPanelRef.current?.askQuestion({
      text: buildAskText(context),
      imageUrl: context.captureUrl,
    });
  };

  if (!pdfId) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <Empty description="PDF不存在或已被删除" />
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col">
      <div className="relative flex flex-1 overflow-hidden">
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <div className="min-h-0 flex-1 overflow-hidden">
            {loading ? (
              <div className="flex h-full w-full items-center justify-center">
                <LoadingOutlined />
              </div>
            ) : pdf ? (
              <EditPdf pdf={pdf} onAskAI={handleAskAI} jumpTarget={jumpTarget} />
            ) : (
              <Empty description="请选择一个PDF文件" />
            )}
          </div>
        </div>
        {pdf ? (
          <ResizableAndHideableSidebar
            className="relative box-border h-full flex-none"
            width={chatWidth ?? 440}
            open={!chatCollapsed}
            onToggle={() => setChatCollapsed(prev => !prev)}
            onWidthChange={width => {
              setChatWidth(width);
            }}
            resizeHandleSide="left"
            sidebarPosition="right"
            minWidth={360}
            maxWidth={760}
            disableResize={chatCollapsed}
            showInternalExpandButtonWhenClosed
          >
            <PdfChatPanel
              ref={chatPanelRef}
              pdf={pdf}
              mainDbName={mainDbName}
              collapsed={chatCollapsed}
              onToggleCollapsed={() => setChatCollapsed(prev => !prev)}
              onCitationNavigate={target => {
                setJumpTarget({ ...target });
              }}
            />
          </ResizableAndHideableSidebar>
        ) : null}
      </div>
    </div>
  );
};

export default PdfDetailView;
