import { useReadingI18n } from "../reading.i18n";
import { PageHeader, PageHeaderTextButton } from "../../../components/PageHeader";

type BlockSelectionHeaderProps = {
  selectedCount: number;
  totalCount: number;
  onCancel: () => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  /** 封面沉浸页：顶栏浮于滚动内容之上，需自带实底 */
  floating?: boolean;
};

/** 块选择模式顶栏：取消 / 已选 N 个块 / 全选（已全选时为取消全选） */
export function BlockSelectionHeader(props: BlockSelectionHeaderProps) {
  const { t } = useReadingI18n();
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
    <PageHeader
      leading={
        <PageHeaderTextButton tone="muted" onClick={onCancel}>
          {t("cancel")}
        </PageHeaderTextButton>
      }
      title={
        selectedCount > 0 ? t("blocks.selected", { count: selectedCount }) : t("blocks.select")
      }
      actions={
        <PageHeaderTextButton
          tone={allSelected ? "muted" : "primary"}
          onClick={allSelected ? onDeselectAll : onSelectAll}
        >
          {allSelected ? t("deselectAll") : t("selectAll")}
        </PageHeaderTextButton>
      }
    />
  );
  return floating ? (
    <div className="bg-surface absolute inset-x-0 top-0 z-30">{header}</div>
  ) : (
    header
  );
}

export default BlockSelectionHeader;
