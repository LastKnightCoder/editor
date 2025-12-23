import { TabType } from "@/types/tab";
import { BaseTabContentProvider } from "./base-provider";
import type { ITab } from "@/types/tab";
import type { TabContentResponse, TabContentOptions } from "../types";

export class WebViewProvider extends BaseTabContentProvider<TabType.WebView> {
  readonly tabType = TabType.WebView;

  validateParams(params?: { url: string }): boolean {
    return !!(params?.url && typeof params.url === "string");
  }

  async getContent(
    tab: ITab<TabType.WebView>,
    _options?: TabContentOptions,
  ): Promise<TabContentResponse> {
    const metadata = this.buildMetadata(tab);

    if (!tab.params?.url) {
      throw new Error("URL is required for WebView");
    }

    const content = {
      url: tab.params.url,
      description: `网页视图 - ${tab.params.url}`,
      type: "webview",
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
