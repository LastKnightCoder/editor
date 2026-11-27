import { useDatabaseI18n } from "../i18n";

/** 视图类型不可用（如贡献该视图的扩展被移除）时的通用占位：数据与 viewOptions 原样保留，视图可删除或改为其它类型 */
const MissingView = ({ type }: { type: string }) => {
  const { t } = useDatabaseI18n();
  return (
    <div className="flex h-full w-full items-center justify-center">
      <span className="text-ink-3 text-tau-meta px-2">{t("view.missing", { type })}</span>
    </div>
  );
};

export default MissingView;
