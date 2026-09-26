import CustomModal from "@/components/CustomModal";
import AppAbout from "@/pages/Settings/AppAbout";
import AppearanceSetting from "@/pages/Settings/AppearanceSetting";
import ResourceUploadSetting from "@/pages/Settings/ResourceUploadSetting";
import SyncSetting from "@/pages/Settings/SyncSetting";
import PublishSetting from "@/pages/Settings/PublishSetting";
import ImageGenerationSetting from "@/pages/Settings/ImageGenerationSetting";
import EmbeddingProviderSetting from "@/pages/Settings/EmbeddingProviderSetting";
import TextToSpeechSetting from "@/pages/Settings/TextToSpeechSetting";
import TranscriptionSetting from "@/pages/Settings/TranscriptionSetting";
import IntegrationSetting from "@/pages/Settings/IntegrationSetting";
import MiscSetting from "@/pages/Settings/MiscSetting";
import useSettingStore from "@/stores/useSettingStore";
import useTabStore from "@/stores/useTabStore";
import useSettingTabStore, { SettingsTabKey } from "@/stores/useSettingTabStore";
import { TabType } from "@/types/tab";
import { useMemoizedFn } from "ahooks";
import useThemeColors from "@/hooks/useThemeColors";
import classNames from "classnames";

interface TabItem {
  key: SettingsTabKey;
  label: string;
  children: React.ReactNode;
}

const SettingModal = () => {
  const navigateTo = useTabStore(state => state.navigateTo);
  const themeColors = useThemeColors();

  const settingModalOpen = useSettingStore(state => state.settingModalOpen);

  const activeTab = useSettingTabStore(state => state.activeKey);
  const setActiveTab = useSettingTabStore(state => state.setActiveKey);

  const onCancel = useMemoizedFn(() => {
    useSettingStore.setState({
      settingModalOpen: false,
    });
  });

  const items: TabItem[] = [
    {
      key: "app",
      label: "关于软件",
      children: <AppAbout />,
    },
    {
      key: "appearance",
      label: "外观",
      children: <AppearanceSetting />,
    },
    {
      key: "imageBed",
      label: "资源存储",
      children: <ResourceUploadSetting />,
    },
    {
      key: "sync",
      label: "同步",
      children: <SyncSetting />,
    },
    {
      key: "publish",
      label: "发布",
      children: <PublishSetting />,
    },
    {
      key: "imageGeneration",
      label: "图片生成",
      children: <ImageGenerationSetting />,
    },
    {
      key: "embedding",
      label: "嵌入模型",
      children: <EmbeddingProviderSetting />,
    },
    {
      key: "textToSpeech",
      label: "文字转语音",
      children: <TextToSpeechSetting />,
    },
    {
      key: "transcription",
      label: "语音转录",
      children: <TranscriptionSetting />,
    },
    {
      key: "integration",
      label: "集成",
      children: <IntegrationSetting />,
    },
    {
      key: "misc",
      label: "杂项",
      children: <MiscSetting />,
    },
  ];

  const onExpand = useMemoizedFn(() => {
    navigateTo(TabType.Settings);
    useSettingStore.setState({
      settingModalOpen: false,
    });
  });

  const activeItem = items.find(item => item.key === activeTab) || items[0];

  return (
    <CustomModal
      className="z-9990 relative"
      open={settingModalOpen}
      onCancel={onCancel}
      width={1200}
      contentStyle={{ height: "min(75vh, 800px)" }}
      closeOnOverlay={false}
      showCloseButton={false}
      bodyClassName="overflow-hidden"
      footer={null}
    >
      <div className="flex h-full min-h-0 flex-col gap-4">
        <div className="flex flex-none items-center justify-between">
          <div className="text-2xl font-bold text-gray-800 dark:text-white">设置</div>
          <div className="flex gap-2">
            <button
              onClick={onExpand}
              className={classNames(
                "flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg transition-all",
                themeColors.hoverClass,
                themeColors.textClass
              )}
              title="全屏"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"
                />
              </svg>
            </button>
            <button
              onClick={onCancel}
              className={classNames(
                "flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg transition-all",
                themeColors.hoverClass,
                themeColors.textClass
              )}
              title="关闭"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 gap-6">
          <div className="w-48 flex-none overflow-y-auto border-r border-[#f0f0f0] p-3 dark:border-[#282829]">
            <div className="flex flex-col gap-1">
              {items.map(item => {
                const isActive = item.key === activeTab;
                return (
                  <button
                    key={item.key}
                    onClick={() => setActiveTab(item.key)}
                    className={classNames(
                      "w-full rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-all",
                      isActive
                        ? [themeColors.activeClass]
                        : "text-gray-700 hover:bg-gray-100/50 dark:text-gray-300 dark:hover:bg-zinc-800/50"
                    )}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right content area */}
          <div className="min-w-0 flex-1 overflow-y-auto">{activeItem?.children}</div>
        </div>
      </div>
    </CustomModal>
  );
};

export default SettingModal;
