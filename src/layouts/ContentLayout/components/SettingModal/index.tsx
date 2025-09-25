import { Modal, Tabs, TabsProps, Tooltip } from "antd";
import { useNavigate } from "react-router-dom";
import AppAbout from "@/pages/Settings/AppAbout";
import FontSetting from "@/pages/Settings/FontSetting";
import ResourceUploadSetting from "@/pages/Settings/ResourceUploadSetting";
import SyncSetting from "@/pages/Settings/SyncSetting";
import LLMProviderSetting from "@/pages/Settings/LLMProviderSetting";
import EmbeddingProviderSetting from "@/pages/Settings/EmbeddingProviderSetting";
import TextToSpeechSetting from "@/pages/Settings/TextToSpeechSetting";
import ModuleSetting from "@/pages/Settings/ModuleSetting";
import IntegrationSetting from "@/pages/Settings/IntegrationSetting";
import useSettingStore from "@/stores/useSettingStore";
import { useMemoizedFn } from "ahooks";
import { CloseOutlined, ExpandOutlined } from "@ant-design/icons";
import styles from "./index.module.less";

const SettingModal = () => {
  const navigate = useNavigate();

  const { settingModalOpen } = useSettingStore((state) => ({
    settingModalOpen: state.settingModalOpen,
  }));

  const onCancel = useMemoizedFn(() => {
    useSettingStore.setState({
      settingModalOpen: false,
    });
  });

  const items: TabsProps["items"] = [
    {
      key: "app",
      label: "关于软件",
      children: <AppAbout />,
    },
    {
      key: "font",
      label: "字体",
      children: <FontSetting />,
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
      key: "llm",
      label: "大语言模型",
      children: <LLMProviderSetting />,
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
      key: "module",
      label: "模块功能",
      children: <ModuleSetting />,
    },
    {
      key: "integration",
      label: "集成",
      children: <IntegrationSetting />,
    },
  ];

  const onExpand = useMemoizedFn(() => {
    navigate("/settings");
    useSettingStore.setState({
      settingModalOpen: false,
    });
  });

  return (
    <Modal
      open={settingModalOpen}
      onCancel={onCancel}
      footer={null}
      width={1080}
      height={"70vh"}
      styles={{
        body: {
          height: "70vh",
        },
      }}
      className="my-[15vh]! top-0!"
      closable={false}
    >
      <div className="flex flex-col h-full gap-4">
        <div className="flex flex-none">
          <div className="ml-6 text-2xl font-bold">设置</div>
          <div className="flex gap-4 ml-auto">
            <Tooltip title="全屏">
              <div
                className="w-7 h-7 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 flex items-center justify-center cursor-pointer"
                onClick={onExpand}
              >
                <ExpandOutlined className="w-3 h-3" />
              </div>
            </Tooltip>
            <div
              className="w-7 h-7 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 flex items-center justify-center cursor-pointer"
              onClick={onCancel}
            >
              <CloseOutlined className="w-3 h-3" />
            </div>
          </div>
        </div>
        <Tabs tabPosition={"left"} items={items} className={styles.tabs} />
      </div>
    </Modal>
  );
};

export default SettingModal;
