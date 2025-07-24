import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Tabs, TabsProps, Breadcrumb } from "antd";
import Titlebar from "@/components/Titlebar";

import AppAbout from "./AppAbout";
import FontSetting from "./FontSetting";
import ResourceUploadSetting from "./ResourceUploadSetting";
import SyncSetting from "./SyncSetting";
import ModuleSetting from "./ModuleSetting";
import TextToSpeechSetting from "./TextToSpeechSetting";
import LLMProviderSetting from "./LLMProviderSetting";
import EmbeddingProviderSetting from "./EmbeddingProviderSetting";

import styles from "./index.module.less";

const SettingsPage = () => {
  const navigate = useNavigate();

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
  ];

  const breadcrumbItems = useMemo(() => {
    return [
      { title: "首页", path: "/" },
      { title: "设置", path: "/settings" },
    ];
  }, []);

  return (
    <div className="w-full h-full flex flex-col box-border overflow-hidden bg-[var(--background-color)] gap-2">
      <Titlebar className="h-15 flex-shrink-0">
        <Breadcrumb
          className="h-15 pl-6! flex items-center app-region-no-drag"
          items={breadcrumbItems.map((item) => ({
            title: (
              <span
                className="cursor-pointer transition-all duration-300 ease-in-out p-1 rounded hover:bg-[var(--common-hover-bg)]"
                onClick={() => navigate(item.path)}
              >
                {item.title}
              </span>
            ),
          }))}
        />
      </Titlebar>
      <div className="flex flex-1 overflow-hidden">
        <Tabs tabPosition={"left"} items={items} className={styles.tabs} />
      </div>
    </div>
  );
};

export default SettingsPage;
