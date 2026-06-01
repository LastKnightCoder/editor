import {
  PlusOutlined,
  ImportOutlined,
  ExportOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import { App } from "antd";
import { useMemoizedFn } from "ahooks";
import useRssStore from "@/stores/useRssStore";
import { importOpml, exportOpml } from "@/commands/rss";
import useThemeColors from "@/hooks/useThemeColors";

interface SidebarFooterProps {
  onAddClick: () => void;
}

export default function SidebarFooter({ onAddClick }: SidebarFooterProps) {
  const themeColors = useThemeColors();
  const { message } = App.useApp();
  const { isRefreshing, refreshAll, init } = useRssStore();

  const handleImport = useMemoizedFn(async () => {
    const result = await importOpml();
    if (result.imported > 0) {
      message.success(`成功导入 ${result.imported} 个订阅`);
      await init();
    }
    if (result.errors.length > 0) {
      message.warning(`${result.errors.length} 个订阅导入失败`);
    }
  });

  const handleExport = useMemoizedFn(async () => {
    const result = await exportOpml();
    if (result.success) {
      message.success("导出成功");
    }
  });

  return (
    <div
      className={`flex items-center gap-1.5 px-4 py-3 border-t ${themeColors.borderClass} backdrop-blur-sm`}
    >
      <FooterButton
        icon={<PlusOutlined />}
        title="添加订阅"
        onClick={onAddClick}
        themeColors={themeColors}
      />
      <FooterButton
        icon={<ImportOutlined />}
        title="导入 OPML"
        onClick={handleImport}
        themeColors={themeColors}
      />
      <FooterButton
        icon={<ExportOutlined />}
        title="导出 OPML"
        onClick={handleExport}
        themeColors={themeColors}
      />
      <FooterButton
        icon={<ReloadOutlined spin={isRefreshing} />}
        title="刷新全部"
        onClick={refreshAll}
        themeColors={themeColors}
      />
    </div>
  );
}

function FooterButton({
  icon,
  title,
  onClick,
  themeColors,
}: {
  icon: React.ReactNode;
  title: string;
  onClick: () => void;
  themeColors: ReturnType<typeof useThemeColors>;
}) {
  return (
    <button
      className={`flex h-8 w-8 items-center justify-center rounded-lg border-none cursor-pointer bg-transparent transition-all duration-200 text-xs hover:scale-105 active:scale-95 ${themeColors.secondaryTextClass} ${themeColors.hoverClass}`}
      title={title}
      onClick={onClick}
    >
      {icon}
    </button>
  );
}
