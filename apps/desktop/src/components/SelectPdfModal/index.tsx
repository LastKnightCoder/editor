import { useMemo, useState } from "react";
import { Empty, Input } from "antd";
import classnames from "classnames";

import { Pdf } from "@/types";
import CustomModal from "@/components/CustomModal";
import If from "@/components/If";
import { formatDate } from "@/utils/time.ts";
import PdfCard from "@/pages/PdfView/PdfCard";

interface SelectPdfModalProps {
  open: boolean;
  pdfs: Pdf[];
  selectedPdfId?: number | null;
  onSelect?: (pdf: Pdf) => void;
  onOk?: () => Promise<void> | void;
  onCancel?: () => void;
  title?: string;
  excludePdfIds?: number[];
}

const filterPdfs = (pdfs: Pdf[], keyword: string, excludePdfIds: number[]) => {
  const normalized = keyword.trim().toLowerCase();
  const excludeSet = new Set(excludePdfIds);

  return pdfs
    .filter((pdf) => !excludeSet.has(pdf.id))
    .filter((pdf) => {
      if (!normalized) return true;
      const target =
        `${pdf.fileName} ${pdf.tags.join(" ")} ${pdf.category}`.toLowerCase();
      return target.includes(normalized);
    })
    .sort((a, b) => b.updateTime - a.updateTime);
};

const SelectPdfModal = (props: SelectPdfModalProps) => {
  const {
    open,
    pdfs,
    selectedPdfId,
    onSelect,
    onOk,
    onCancel,
    title = "选择关联 PDF",
    excludePdfIds = [],
  } = props;

  const [searchValue, setSearchValue] = useState("");

  const filteredPdfs = useMemo(() => {
    return filterPdfs(pdfs, searchValue, excludePdfIds);
  }, [pdfs, searchValue, excludePdfIds]);

  const handleSelect = (pdf: Pdf) => {
    if (!onSelect) return;
    onSelect(pdf);
  };

  const handleOk = () => {
    return onOk?.();
  };

  const handleCancel = () => {
    setSearchValue("");
    onCancel?.();
  };

  return (
    <CustomModal
      title={title}
      open={open}
      onCancel={handleCancel}
      onOk={handleOk}
      width={1100}
      okButtonProps={{ disabled: !selectedPdfId }}
      contentClassName="p-0 h-[min(760px,calc(100vh-120px))]"
      bodyClassName="flex-1 min-h-0 box-border px-6 py-4"
    >
      <div
        className="flex flex-col gap-4 h-full"
        style={{
          borderLeft: "20px solid transparent",
          borderRight: "20px solid transparent",
        }}
      >
        <Input.Search
          allowClear
          value={searchValue}
          placeholder="通过名称、标签或分类筛选 PDF"
          onChange={(e) => setSearchValue(e.target.value)}
        />

        <If condition={filteredPdfs.length === 0}>
          <div className="flex-1 flex items-center justify-center">
            <Empty description="暂无可用的 PDF" />
          </div>
        </If>

        <If condition={filteredPdfs.length > 0}>
          <div
            className="flex-1 min-h-0 overflow-y-auto"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
              gap: 20,
              alignContent: "flex-start",
            }}
          >
            {filteredPdfs.map((pdf) => (
              <div key={pdf.id} className="h-full">
                <PdfCard
                  pdf={pdf}
                  showActions={false}
                  onCardClick={() => handleSelect(pdf)}
                  style={{ height: 200 }}
                  className={classnames(
                    "h-full",
                    pdf.id === selectedPdfId
                      ? "ring-2 ring-blue-500"
                      : "hover:ring-2 hover:ring-blue-200",
                  )}
                />
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-2 text-right">
                  更新于 {formatDate(pdf.updateTime, true)}
                </div>
              </div>
            ))}
          </div>
        </If>
      </div>
    </CustomModal>
  );
};

export default SelectPdfModal;
