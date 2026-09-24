import { useState, memo } from "react";
import classNames from "classnames";
import { HiOutlineChevronDown } from "react-icons/hi";

import AutoHeightTable from "@/components/AutoHeightTable";
import useTableConfig from "./useTableConfig";
import useThemeColors from "@/hooks/useThemeColors";
import { IndexType } from "@/types";

const INDEX_OPTIONS: { value: IndexType | "diary"; label: string }[] = [
  { value: "card", label: "卡片" },
  { value: "article", label: "文章" },
  { value: "project-item", label: "项目" },
  { value: "diary", label: "日记" },
];

const VecDocumentView = memo(() => {
  const [indexType, setIndexType] = useState<IndexType | "diary">("card");
  const [selectOpen, setSelectOpen] = useState(false);
  const themeColors = useThemeColors();
  const tableConfig = useTableConfig(indexType);

  if (!tableConfig) return null;

  const { dataSource, columns, pagination, onChange, rowSelection, rightExtraNode, leftExtraNode } =
    tableConfig;

  const currentOption = INDEX_OPTIONS.find(opt => opt.value === indexType);

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      <div className="box-border w-full flex-1 overflow-hidden p-6">
        <div className="flex h-full w-full max-w-full flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              {/* 自定义 Select */}
              <div className="relative">
                <button
                  onClick={() => setSelectOpen(!selectOpen)}
                  className={classNames(
                    "flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium transition-all",
                    themeColors.cardBorderClass,
                    themeColors.hoverClass,
                    themeColors.activeTextClass
                  )}
                >
                  {currentOption?.label}
                  <HiOutlineChevronDown
                    className={classNames("transition-transform", selectOpen && "rotate-180")}
                  />
                </button>
                {selectOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setSelectOpen(false)} />
                    <div
                      className={classNames(
                        "absolute left-0 top-full z-20 mt-1 min-w-[120px] rounded-lg border py-1 shadow-lg",
                        themeColors.cardBorderClass,
                        themeColors.glassPanelBg
                      )}
                    >
                      {INDEX_OPTIONS.map(option => (
                        <button
                          key={option.value}
                          onClick={() => {
                            setIndexType(option.value);
                            setSelectOpen(false);
                          }}
                          className={classNames(
                            "w-full cursor-pointer px-3 py-1.5 text-left text-sm transition-colors",
                            themeColors.hoverClass,
                            option.value === indexType
                              ? themeColors.activeTextClass
                              : themeColors.textClass
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
