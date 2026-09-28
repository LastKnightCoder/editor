import { TabType } from "@/types/tab";
import { getProjectById, getProjectItemById } from "@/commands/project";
import { getMarkdown } from "@/utils/markdown";
import { BaseTabContentProvider } from "./base-provider";
import type { ITab } from "@/types/tab";
import type { TabContentResponse, TabContentOptions } from "../types";

export class ProjectDetailProvider extends BaseTabContentProvider<TabType.ProjectDetail> {
  readonly tabType = TabType.ProjectDetail;

  validateParams(params?: { id: number; itemId?: number }): boolean {
    return !!(params?.id && typeof params.id === "number");
  }

  async getContent(
    tab: ITab<TabType.ProjectDetail>,
    options?: TabContentOptions
  ): Promise<TabContentResponse> {
    const metadata = this.buildMetadata(tab);

    if (!tab.params?.id) {
      throw new Error("Project ID is required");
    }

    const project = await getProjectById(tab.params.id);

    let content: any;

    // 如果指定了 itemId，返回项目项内容
    if (tab.params.itemId) {
      const projectItem = await getProjectItemById(tab.params.itemId);

      if (!projectItem) {
        throw new Error(`Project item with ID ${tab.params.itemId} not found`);
      }

      const markdown = getMarkdown(projectItem.content);

      const {
        content: truncatedContent,
        truncated,
        originalLength,
        totalLength,
        range,
      } = this.truncateContent(markdown, options?.range);

      content = {
        type: "project-item",
        projectId: project.id,
        projectTitle: project.title,
        item: {
          id: projectItem.id,
          title: projectItem.title,
          markdown: truncatedContent,
          projectItemType: projectItem.projectItemType,
          wordCount: projectItem.count,
          createTime: projectItem.createTime,
          updateTime: projectItem.updateTime,
        },
      };

      return {
        metadata,
        content,
        contentType: "markdown",
        truncated,
        originalLength,
        totalLength,
        range,
      };
    }

    // 否则返回项目概览
    const projectDesc = getMarkdown(project.desc);
    const {
      content: truncatedDesc,
      truncated,
      originalLength,
      totalLength,
      range,
    } = this.truncateContent(projectDesc, options?.range);

    content = {
      type: "project-overview",
      project: {
        id: project.id,
        title: project.title,
        description: truncatedDesc,
        archived: project.archived,
        pinned: project.pinned,
        createTime: project.createTime,
        updateTime: project.updateTime,
        childrenCount: project.children.length,
      },
    };

    return {
      metadata,
      content,
      contentType: "object",
      truncated,
      originalLength,
      totalLength,
      range,
    };
  }
}
