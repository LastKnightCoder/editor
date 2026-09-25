import { TabType } from "@/types/tab";
import { BaseTabContentProvider } from "./base-provider";
import type { ITab } from "@/types/tab";
import type { TabContentResponse, TabContentOptions } from "../types";

export class SettingsProvider extends BaseTabContentProvider<TabType.Settings> {
  readonly tabType = TabType.Settings;

  async getContent(
    tab: ITab<TabType.Settings>,
    _options?: TabContentOptions
  ): Promise<TabContentResponse> {
    const metadata = this.buildMetadata(tab);

    const content = {
      description: "应用设置 - 配置各项功能和偏好",
      categories: [
        { key: "app", label: "关于软件" },
        { key: "appearance", label: "外观" },
        { key: "imageBed", label: "资源存储" },
        { key: "sync", label: "同步" },
        { key: "publish", label: "发布" },
        { key: "llm", label: "大语言模型" },
        { key: "imageGeneration", label: "图片生成" },
        { key: "embedding", label: "嵌入模型" },
        { key: "textToSpeech", label: "文字转语音" },
        { key: "transcription", label: "语音转录" },
        { key: "integration", label: "集成" },
        { key: "misc", label: "杂项" },
      ],
      type: "functional-page",
    };

    return {
      metadata,
      content,
      contentType: "object",
      truncated: false,
      originalLength: 0,
      totalLength: 0,
    };
  }
}
