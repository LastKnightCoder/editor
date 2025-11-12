import { Empty } from "antd";
import { useEffect, useState } from "react";

import EditPdf from "./EditPdf";
import { getPdfById } from "@/commands";
import { Pdf } from "@/types";
import { LoadingOutlined } from "@ant-design/icons";
import useTabParams from "@/hooks/useTabParams";
import { TabType } from "@/types/tab";

const PdfDetailView = () => {
  const { id } = useTabParams(TabType.PdfDetail);
  const pdfId = id;

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
