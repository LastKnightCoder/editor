import { useNavigate, useParams } from "react-router-dom";
import { Breadcrumb, Empty } from "antd";
import { useEffect, useState } from "react";

import Titlebar from "@/components/Titlebar";
import EditPdf from "./EditPdf";
import { getPdfById } from "@/commands";
import { Pdf } from "@/types";
import { LoadingOutlined } from "@ant-design/icons";

const PdfDetailView = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const pdfId = id ? parseInt(id, 10) : undefined;

  const [pdf, setPdf] = useState<Pdf | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (pdfId) {
      setLoading(true);
      getPdfById(pdfId)
        .then((pdf) => {
          setPdf(pdf);
        })
        .finally(() => {
          setLoading(false);
        });
    }
  }, [pdfId]);

  // 面包屑导航
  const breadcrumbItems = [
    { title: "首页", onClick: () => navigate("/") },
    { title: "PDF列表", onClick: () => navigate("/pdfs/list") },
    {
      title: pdf ? `${pdf.fileName}` : "PDF详情",
      onClick: () => {
        // 当前页面，不需要操作
      },
    },
  ];

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
        <div className="flex-1 flex flex-col overflow-hidden">
          <Titlebar className="w-full h-15 flex-shrink-0">
            <Breadcrumb
              className="h-15 pl-10! flex items-center app-region-no-drag"
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
          <div className="flex-1 min-h-0 overflow-hidden">
            {loading ? (
              <div className="w-full h-full flex items-center justify-center">
                <LoadingOutlined />
              </div>
            ) : pdf ? (
              <EditPdf pdf={pdf} />
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
