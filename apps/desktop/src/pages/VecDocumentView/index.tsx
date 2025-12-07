import { useState, memo } from "react";
import classNames from "classnames";
import { HiOutlineChevronDown } from "react-icons/hi";

import AutoHeightTable from "@/components/AutoHeightTable";
import useTableConfig from "./useTableConfig";
import useThemeColors from "@/hooks/useThemeColors";
import { IndexType } from "@/types";

const INDEX_OPTIONS: { value: IndexType; label: string }[] = [
  { value: "card", label: "卡片" },
  { value: "article", label: "文章" },
  { value: "project-item", label: "项目" },
  { value: "document-item", label: "知识库" },
];

const VecDocumentView = memo(() => {
  const [indexType, setIndexType] = useState<IndexType>("card");
  const [selectOpen, setSelectOpen] = useState(false);
  const themeColors = useThemeColors();
  const tableConfig = useTableConfig(indexType);

  if (!tableConfig) return null;

  const {
    dataSource,
    columns,
    pagination,
    onChange,
    rowSelection,
    rightExtraNode,
    leftExtraNode,
  } = tableConfig;

  const currentOption = INDEX_OPTIONS.find((opt) => opt.value === indexType);

  return (
    <div className="w-full h-full flex flex-col overflow-hidden">
      <div className="w-full flex-1 p-6 box-border overflow-hidden">
        <div className="w-full h-full max-w-full flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              {/* 自定义 Select */}
              <div className="relative">
                <button
                  onClick={() => setSelectOpen(!selectOpen)}
                  className={classNames(
                    "flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all cursor-pointer border",
                    themeColors.cardBorderClass,
                    themeColors.hoverClass,
                    themeColors.activeTextClass,
                  )}
                >
                  {currentOption?.label}
                  <HiOutlineChevronDown
                    className={classNames(
                      "transition-transform",
                      selectOpen && "rotate-180",
                    )}
                  />
                </button>
                {selectOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-10"
                      onClick={() => setSelectOpen(false)}
                    />
                    <div
                      className={classNames(
                        "absolute top-full left-0 mt-1 py-1 rounded-lg border shadow-lg z-20 min-w-[120px]",
                        themeColors.cardBorderClass,
                        themeColors.glassPanelBg,
                      )}
                    >
                      {INDEX_OPTIONS.map((option) => (
                        <button
                          key={option.value}
                          onClick={() => {
                            setIndexType(option.value);
                            setSelectOpen(false);
                          }}
                          className={classNames(
                            "w-full px-3 py-1.5 text-left text-sm transition-colors cursor-pointer",
                            themeColors.hoverClass,
                            option.value === indexType
                              ? themeColors.activeTextClass
                              : themeColors.textClass,
                          )}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
              {leftExtraNode}
            </div>
            {rightExtraNode}
          </div>
          <AutoHeightTable
            style={{
              flex: 1,
            }}
            scroll={{
              x: true,
            }}
            rowKey={"id"}
            pagination={pagination}
            dataSource={dataSource}
            columns={columns}
            onChange={onChange}
            rowSelection={rowSelection}
          />
        </div>
      </div>
    </div>
  );
});

export default VecDocumentView;
