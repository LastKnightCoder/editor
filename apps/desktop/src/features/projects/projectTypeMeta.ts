/**
 * 项目三型元数据（域内单源）：label / 一句说明 / lucide 图标 / 类型派生色。
 *
 * 类型派生色是设计定稿的数据色（与文章封面派生色、热力图色阶同性质，出处
 * mockups/projects/plan-c-cockpit.html）：文档树 = 青蓝、数据表格 = 紫罗兰、
 * Vibe Learning = 主题 accent（走语义类）。不进主题词表。
 */

import { FolderTree, Table, FlaskConical, type LucideIcon } from "lucide-react";
import { EProjectType, type Project } from "@/types/project";

export interface ProjectTypeMeta {
  label: string;
  description: string;
  icon: LucideIcon;
  /** 类型色 soft 底（icon 块 / 徽章底） */
  softClass: string;
  /** 类型色前景（icon / 徽章文字） */
  textClass: string;
  /** hero 卡顶缘身份线（3px 向右渐隐） */
  barClass: string;
  /** 筛选 pills 的类型色点 */
  dotClass: string;
}

type ProjectType = Project["projectType"];

export const PROJECT_TYPE_META: Record<ProjectType, ProjectTypeMeta> = {
  [EProjectType.DocumentTree]: {
    label: "文档树",
    description: "以文档树形式组织内容",
    icon: FolderTree,
    softClass: "bg-[rgba(63,133,124,0.13)]",
    textClass: "text-[#3f857c]",
    barClass: "bg-gradient-to-r from-[#3f857c] to-transparent",
    dotClass: "bg-[#3f857c]",
  },
  [EProjectType.DataTable]: {
    label: "数据表格",
    description: "使用表格管理结构化数据",
    icon: Table,
    softClass: "bg-[rgba(111,83,150,0.13)]",
    textClass: "text-[#6f5396]",
    barClass: "bg-gradient-to-r from-[#6f5396] to-transparent",
    dotClass: "bg-[#6f5396]",
  },
  [EProjectType.VibeLearning]: {
    label: "Vibe Learning",
    description: "沉浸式学习项目",
    icon: FlaskConical,
    softClass: "bg-accent-soft",
    textClass: "text-accent-text",
    barClass: "bg-gradient-to-r from-accent to-transparent",
    dotClass: "bg-accent",
  },
};

export function projectTypeMeta(type: ProjectType): ProjectTypeMeta {
  return PROJECT_TYPE_META[type] ?? PROJECT_TYPE_META[EProjectType.DocumentTree];
}
