import { useMemo, useState } from "react";
import { Empty, Input } from "antd";
import classnames from "classnames";

import { Epub } from "@/types";
import CustomModal from "@/components/CustomModal";
import If from "@/components/If";
import { formatDate } from "@/utils/time.ts";
import EpubCard from "@/pages/PdfView/EpubCard";

interface SelectEpubModalProps {
  open: boolean;
  epubs: Epub[];
  selectedEpubId?: number | null;
  onSelect?: (epub: Epub) => void;
  onOk?: () => Promise<void> | void;
  onCancel?: () => void;
  title?: string;
  excludeEpubIds?: number[];
}

const filterEpubs = (
  epubs: Epub[],
  keyword: string,
  excludeEpubIds: number[],
) => {
  const normalized = keyword.trim().toLowerCase();
  const excludeSet = new Set(excludeEpubIds);

  return epubs
    .filter((epub) => !excludeSet.has(epub.id))
    .filter((epub) => {
      if (!normalized) return true;
      const target =
        `${epub.title || ""} ${epub.author || ""} ${epub.fileName} ${epub.tags.join(" ")}`.toLowerCase();
      return target.includes(normalized);
    })
    .sort((a, b) => b.updateTime - a.updateTime);
};

const SelectEpubModal = (props: SelectEpubModalProps) => {
  const {
    open,
    epubs,
    selectedEpubId,
    onSelect,
    onOk,
    onCancel,
    title = "选择关联 EPUB",
    excludeEpubIds = [],
  } = props;

  const [searchValue, setSearchValue] = useState("");

  const filteredEpubs = useMemo(() => {
    return filterEpubs(epubs, searchValue, excludeEpubIds);
  }, [epubs, searchValue, excludeEpubIds]);

  const handleSelect = (epub: Epub) => {
    if (!onSelect) return;
    onSelect(epub);
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
      okButtonProps={{ disabled: !selectedEpubId }}
      contentClassName="p-0"
      bodyClassName="h-[600px] box-border px-6 py-4"
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
          placeholder="通过名称、作者或标签筛选 EPUB"
          onChange={(e) => setSearchValue(e.target.value)}
        />

        <If condition={filteredEpubs.length === 0}>
          <div className="flex-1 flex items-center justify-center">
            <Empty description="暂无可用的 EPUB" />
          </div>
        </If>

        <If condition={filteredEpubs.length > 0}>
          <div
            className="flex-1 overflow-y-auto"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
              gap: 20,
              alignContent: "flex-start",
            }}
          >
            {filteredEpubs.map((epub) => (
              <div key={epub.id} className="h-full">
                <EpubCard
                  epub={epub}
                  showActions={false}
                  onCardClick={() => handleSelect(epub)}
                  style={{ height: 220 }}
                  className={classnames(
                    "h-full",
                    epub.id === selectedEpubId
                      ? "ring-2 ring-purple-500"
                      : "hover:ring-2 hover:ring-purple-200",
                  )}
                />
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-2 text-right">
                  更新于 {formatDate(epub.updateTime, true)}
                </div>
              </div>
            ))}
          </div>
        </If>
      </div>
    </CustomModal>
  );
};

export default SelectEpubModal;
