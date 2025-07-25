import { useNavigate, useParams } from "react-router-dom";
import { Breadcrumb, Empty } from "antd";
import { useShallow } from "zustand/react/shallow";
import classnames from "classnames";
import { useState, useEffect } from "react";
import { LeftOutlined, RightOutlined } from "@ant-design/icons";

import Titlebar from "@/components/Titlebar";
import usePdfsStore from "@/stores/usePdfsStore";
import EditPdf from "../EditPdf";
import PdfCard from "../PdfCard";

const PdfDetailView = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const pdfId = id ? parseInt(id, 10) : undefined;
  const [isListExpanded, setIsListExpanded] = useState(true);

  const { pdfs, activePdf, setActivePdf } = usePdfsStore(
    useShallow((state) => ({
      pdfs: state.pdfs,
      activePdf: state.activePdf,
      setActivePdf: state.setActivePdf,
    })),
  );

  useEffect(() => {
    if (pdfId && pdfs.length > 0) {
      const pdf = pdfs.find((p) => p.id === pdfId);
      if (pdf) {
        setActivePdf(pdf);
      }
    }
  }, [pdfId, pdfs, setActivePdf]);

  // 面包屑导航
  const breadcrumbItems = [
    { title: "首页", onClick: () => navigate("/") },
    { title: "PDF列表", onClick: () => navigate("/pdfs/list") },
    {
      title: pdfId ? `PDF #${pdfId}` : "PDF详情",
      onClick: () => {
        // 当前页面，不需要操作
      },
    },
  ];

  const toggleList = () => {
    setIsListExpanded(!isListExpanded);
  };

  if (!pdfId) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <Empty description="PDF不存在或已被删除" />
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col">
      <div className="flex-1 flex overflow-hidden relative">
        <div
          className={classnames(
            "relative w-75 flex-shrink-0 bg-gray-50 dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 transition-all duration-300 ease-in-out flex flex-col",
            {
              "w-0 min-w-0 max-w-0": !isListExpanded,
            },
          )}
        >
          <div
            className={classnames(
              "flex-1 min-h-0 overflow-y-auto p-4 flex flex-col gap-3",
              {
                "opacity-0 pointer-events-none": !isListExpanded,
              },
            )}
          >
            {pdfs.map((pdf) => (
              <div
                key={pdf.id}
                className={classnames(
                  "cursor-pointer rounded-lg transition-all duration-300 ease-in-out border-2 border-transparent",
                  {
                    "border-blue-500": activePdf?.id === pdf.id,
                  },
                )}
                onClick={() => {
                  setActivePdf(pdf);
                  navigate(`/pdfs/detail/${pdf.id}`);
                }}
              >
                <PdfCard pdf={pdf} compact />
              </div>
            ))}
          </div>
        </div>
        <div
          className={classnames(
            "absolute top-1/2 transform -translate-y-1/2 w-8 h-8 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-full flex items-center justify-center cursor-pointer z-50 transition-all duration-300 ease-in-out text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 hover:scale-110 shadow-lg",
            {
              "left-2": !isListExpanded,
              "left-75": isListExpanded,
            },
          )}
          onClick={toggleList}
        >
          {isListExpanded ? <LeftOutlined /> : <RightOutlined />}
        </div>
        <div className="flex-1 flex flex-col overflow-hidden">
          <Titlebar className="w-full h-15 flex-shrink-0">
            <Breadcrumb
              className="h-15 pl-10 flex items-center app-region-no-drag"
              items={breadcrumbItems.map((item) => ({
                title: (
                  <span
                    className="cursor-pointer transition-all duration-300 ease-in-out px-2 py-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800"
                    onClick={item.onClick}
                  >
                    {item.title}
                  </span>
                ),
              }))}
            />
          </Titlebar>
          <div className="flex-1 overflow-hidden">
            {activePdf ? (
              <EditPdf />
            ) : (
              <Empty description="请选择一个PDF文件" />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PdfDetailView;
