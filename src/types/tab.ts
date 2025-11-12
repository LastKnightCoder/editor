/**
 * Tab 类型枚举
 */
export enum TabType {
  Home = "home",
  CardList = "cardList",
  CardDetail = "cardDetail",
  ArticleList = "articleList",
  ArticleDetail = "articleDetail",
  ProjectList = "projectList",
  ProjectDetail = "projectDetail",
  DocumentList = "documentList",
  DocumentDetail = "documentDetail",
  WhiteBoardList = "whiteBoardList",
  WhiteBoardDetail = "whiteBoardDetail",
  PdfList = "pdfList",
  PdfDetail = "pdfDetail",
  DailyNote = "dailyNote",
  TimeRecord = "timeRecord",
  VecDocument = "vecDocument",
  Settings = "settings",
  Calendar = "calendar",
  ChatManagement = "chatManagement",
  ResourceManagement = "resourceManagement",
  Todo = "todo",
  Goals = "goals",
  Questions = "questions",
  Pomodoro = "pomodoro",
}

/**
 * Tab 参数类型
 * ProjectDetail 和 DocumentDetail 包含项目/文档 ID 以及可选的具体项 ID
 */
export type TabParams = {
  [TabType.Home]: undefined;
  [TabType.CardList]: undefined;
  [TabType.CardDetail]: { id: number };
  [TabType.ArticleList]: undefined;
  [TabType.ArticleDetail]: { id: number };
  [TabType.ProjectList]: undefined;
  [TabType.ProjectDetail]: { id: number; itemId?: number }; // 项目 ID 和可选的项目项 ID
  [TabType.DocumentList]: undefined;
  [TabType.DocumentDetail]: { id: number; itemId?: number }; // 文档 ID 和可选的知识库项 ID
  [TabType.WhiteBoardList]: undefined;
  [TabType.WhiteBoardDetail]: { id: number };
  [TabType.PdfList]: undefined;
  [TabType.PdfDetail]: { id: number };
  [TabType.DailyNote]: undefined;
  [TabType.TimeRecord]: undefined;
  [TabType.VecDocument]: undefined;
  [TabType.Settings]: undefined;
  [TabType.Calendar]: undefined;
  [TabType.ChatManagement]: undefined;
  [TabType.ResourceManagement]: undefined;
  [TabType.Todo]: undefined;
  [TabType.Goals]: undefined;
  [TabType.Questions]: undefined;
  [TabType.Pomodoro]: undefined;
};

/**
 * Tab 数据接口
 */
export interface ITab<T extends TabType = TabType> {
  id: string;
  type: T;
  title: string;
  params?: TabParams[T];
  closable?: boolean;
}

/**
 * Pane 分屏方向
 */
export enum PaneDirection {
  Horizontal = "horizontal",
  Vertical = "vertical",
}

/**
 * Pane 数据接口
 */
export interface IPane {
  id: string;
  tabs: ITab[];
  activeTabId: string;
  direction?: PaneDirection;
  splitRatio?: number; // 分屏比例 0-1
}

/**
 * Tab 标题配置
 */
export const TAB_TITLES: Record<TabType, string> = {
  [TabType.Home]: "首页",
  [TabType.CardList]: "卡片",
  [TabType.CardDetail]: "卡片详情",
  [TabType.ArticleList]: "文章",
  [TabType.ArticleDetail]: "文章详情",
  [TabType.ProjectList]: "项目",
  [TabType.ProjectDetail]: "项目详情",
  [TabType.DocumentList]: "知识库",
  [TabType.DocumentDetail]: "知识库详情",
  [TabType.WhiteBoardList]: "白板",
  [TabType.WhiteBoardDetail]: "白板详情",
  [TabType.PdfList]: "PDF",
  [TabType.PdfDetail]: "PDF 详情",
  [TabType.DailyNote]: "日记",
  [TabType.TimeRecord]: "时间记录",
  [TabType.VecDocument]: "索引数据库",
  [TabType.Settings]: "设置",
  [TabType.Calendar]: "日历",
  [TabType.ChatManagement]: "聊天管理",
  [TabType.ResourceManagement]: "资源管理",
  [TabType.Todo]: "任务列表",
  [TabType.Goals]: "进度管理",
  [TabType.Questions]: "问题管理",
  [TabType.Pomodoro]: "番茄专注",
};
