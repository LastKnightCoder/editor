import { PageHeader } from "../../../components/PageHeader";

type BlockSelectionHeaderProps = {
  selectedCount: number;
  totalCount: number;
  onCancel: () => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  /** 封面沉浸页：顶栏浮于滚动内容之上，需自带实底 */
  floating?: boolean;
};

const TEXT_BUTTON_CLASS =
  "active:bg-press h-10 shrink-0 rounded-full px-3 text-[15px] transition-colors";

/** 块选择模式顶栏：取消 / 已选 N 个块 / 全选（已全选时为取消全选） */
export function BlockSelectionHeader(props: BlockSelectionHeaderProps) {
  const {
    selectedCount,
    totalCount,
    onCancel,
    onSelectAll,
    onDeselectAll,
    floating = false,
  } = props;
  const allSelected = totalCount > 0 && selectedCount >= totalCount;
  const header = (
    <PageHeader>
      <button type="button" className={`${TEXT_BUTTON_CLASS} text-ink-2`} onClick={onCancel}>
        取消
      </button>
      <span className="text-ink-1 absolute left-1/2 max-w-[calc(100%-208px)] -translate-x-1/2 truncate px-1 text-center text-[18px] font-extrabold">
        {selectedCount > 0 ? `已选 ${selectedCount} 个块` : "选择块"}
      </span>
      <button
        type="button"
        className={`${TEXT_BUTTON_CLASS} ml-auto ${
          allSelected ? "text-ink-2" : "text-accent-text font-semibold"
        }`}
        onClick={allSelected ? onDeselectAll : onSelectAll}
      >
        {allSelected ? "取消全选" : "全选"}
      </button>
    </PageHeader>
  );
  return floating ? <div className="bg-page absolute inset-x-0 top-0 z-30">{header}</div> : header;
}

export default BlockSelectionHeader;
