/**
 * 项目页数据契约。
 *
 * 项目数量级小（学习容器，个位数到几十），列表全量轻表直取（getProjectList
 * 不含子项正文），无分页窗口；摘要在渲染层从富文本 desc 提纯（见 queries.ts）。
 */

import { EProjectType, type Project } from "@/types/project";

/** 列表条目：主进程 Project + itemCount 派生（项目内全部条目数，含文档树深层节点
 *  ——不是 Project.children 顶层 id 数；来源主进程 get-project-item-counts 聚合） */
export type ProjectPageItem = Project & { itemCount: number };

/** 类型筛选的取值（侧栏子项 / 页面参数 id）："" = 全部 */
export type ProjectTypeFilter = "" | Project["projectType"];

/** 三种项目类型的展示顺序（侧栏子项、新建弹窗共用） */
export const PROJECT_TYPE_KEYS = [
  EProjectType.DocumentTree,
  EProjectType.DataTable,
  EProjectType.VibeLearning,
] as const;
