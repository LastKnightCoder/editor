import { produce } from "immer";
import useSettingStore from "@/stores/useSettingStore.ts";
import For from "@/components/For";

const Icons = {
  FileText: () => (
    <svg
      className="w-6 h-6"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
      />
    </svg>
  ),
  Book: () => (
    <svg
      className="w-6 h-6"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
      />
    </svg>
  ),
  Palette: () => (
    <svg
      className="w-6 h-6"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01"
      />
    </svg>
  ),
  Folder: () => (
    <svg
      className="w-6 h-6"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
      />
    </svg>
  ),
  Database: () => (
    <svg
      className="w-6 h-6"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4"
      />
    </svg>
  ),
  FilePdf: () => (
    <svg
      className="w-6 h-6"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
      />
    </svg>
  ),
  Clock: () => (
    <svg
      className="w-6 h-6"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  ),
  Calendar: () => (
    <svg
      className="w-6 h-6"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
      />
    </svg>
  ),
  Chat: () => (
    <svg
      className="w-6 h-6"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
      />
    </svg>
  ),
  CheckList: () => (
    <svg
      className="w-6 h-6"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
      />
    </svg>
  ),
  Question: () => (
    <svg
      className="w-6 h-6"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  ),
  Search: () => (
    <svg
      className="w-6 h-6"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
      />
    </svg>
  ),
  Chart: () => (
    <svg
      className="w-6 h-6"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
      />
    </svg>
  ),
  FolderOpen: () => (
    <svg
      className="w-6 h-6"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M5 19a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1M5 19h14a2 2 0 002-2v-5a2 2 0 00-2-2H9a2 2 0 00-2 2v5a2 2 0 01-2 2z"
      />
    </svg>
  ),
  Edit: () => (
    <svg
      className="w-6 h-6"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
      />
    </svg>
  ),
  Robot: () => (
    <svg
      className="w-6 h-6"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
      />
    </svg>
  ),
};

const MODULE_CONFIG: Record<
  string,
  {
    icon: keyof typeof Icons;
    description: string;
    category: "content" | "knowledge" | "personal" | "tools";
  }
> = {
  card: {
    icon: "FileText",
    description: "快速记录想法和灵感",
    category: "content",
  },
  article: {
    icon: "Book",
    description: "创作和管理长篇文章",
    category: "content",
  },
  whiteBoard: {
    icon: "Palette",
    description: "可视化思维导图与白板",
    category: "content",
  },
  project: {
    icon: "Folder",
    description: "项目计划与任务管理",
    category: "content",
  },
  document: {
    icon: "Database",
    description: "构建个人知识体系",
    category: "knowledge",
  },
  pdf: {
    icon: "FilePdf",
    description: "阅读和标注 PDF 文档",
    category: "knowledge",
  },
  weread: {
    icon: "Book",
    description: "同步微信读书笔记",
    category: "knowledge",
  },
  vecDocuments: {
    icon: "Search",
    description: "全文搜索与索引",
    category: "knowledge",
  },
  dailyNote: {
    icon: "Edit",
    description: "记录每日心情与想法",
    category: "personal",
  },
  pomodoro: {
    icon: "Clock",
    description: "番茄工作法专注计时",
    category: "personal",
  },
  todo: {
    icon: "CheckList",
    description: "待办事项清单管理",
    category: "personal",
  },
  question: {
    icon: "Question",
    description: "问题追踪与解决方案",
    category: "personal",
  },
  chatManagement: {
    icon: "Chat",
    description: "聊天与沟通记录",
    category: "personal",
  },
  calendar: {
    icon: "Calendar",
    description: "日程安排与提醒",
    category: "personal",
  },
  goal: {
    icon: "Chart",
    description: "进度跟踪与可视化",
    category: "personal",
  },
  resourceManagement: {
    icon: "FolderOpen",
    description: "文件与资源管理",
    category: "tools",
  },
  promptManagement: {
    icon: "Robot",
    description: "AI 提示词模板管理",
    category: "tools",
  },
};

// 分类配置
const CATEGORY_CONFIG = {
  content: { name: "内容创作", color: "border-blue-500" },
  knowledge: { name: "知识管理", color: "border-green-500" },
  personal: { name: "个人管理", color: "border-orange-500" },
  tools: { name: "工具与资源", color: "border-cyan-500" },
};

const ModuleSetting = () => {
  const { module, setting } = useSettingStore((state) => ({
    module: state.setting.module,
    setting: state.setting,
  }));

  const modules = Object.keys(module).map((key) => ({
    key,
    name: module[key as keyof typeof module].name,
    enable: module[key as keyof typeof module].enable,
    config: MODULE_CONFIG[key] || {
      icon: "FileText" as keyof typeof Icons,
      description: "功能模块",
      category: "tools" as const,
    },
  }));

  const groupedModules = modules.reduce(
    (acc, mod) => {
      const category = mod.config.category;
      if (!acc[category]) {
        acc[category] = [];
      }
      acc[category].push(mod);
      return acc;
    },
    {} as Record<string, typeof modules>,
  );

  const onModuleChange = (key: string) => {
    const currentModule = module[key as keyof typeof module];
    const newSetting = produce(setting, (draft) => {
      draft.module[key as keyof typeof module].enable = !currentModule.enable;
    });
    useSettingStore.setState({ setting: newSetting });
  };

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      {Object.entries(groupedModules).map(([category, mods]) => (
        <div key={category} className="mb-12 last:mb-0">
          <h2
            className={`text-lg font-semibold mb-5 pl-4 border-l-4 text-gray-800 dark:text-gray-200 ${
              CATEGORY_CONFIG[category as keyof typeof CATEGORY_CONFIG]
                ?.color || "border-gray-400"
            }`}
          >
            {CATEGORY_CONFIG[category as keyof typeof CATEGORY_CONFIG]?.name ||
              category}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            <For
              data={mods}
              renderItem={(module) => {
                const IconComponent = Icons[module.config.icon];
                return (
                  <div
                    key={module.key}
                    onClick={() => onModuleChange(module.key)}
                    className={`
                      relative overflow-hidden rounded-xl p-5 border-2 cursor-pointer
                      transition-all duration-300 ease-in-out
                      shadow-sm hover:shadow-xl hover:-translate-y-1
                      ${
                        module.enable
                          ? "border-blue-500 bg-linear-to-br from-white to-blue-50 dark:from-gray-800 dark:to-blue-950/30 dark:border-blue-600"
                          : "border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 opacity-75 hover:opacity-85 hover:bg-gray-100 dark:hover:bg-gray-800/70"
                      }
                    `}
                  >
                    {module.enable && (
                      <div className="absolute top-0 left-0 right-0 h-1 bg-linear-to-r from-blue-500 via-blue-400 to-blue-500 dark:from-blue-600 dark:via-blue-500 dark:to-blue-600 animate-shimmer bg-size-[200%_100%]" />
                    )}

                    <div className="flex items-start justify-between mb-4">
                      <div
                        className={`
                        w-12 h-12 rounded-xl flex items-center justify-center
                        transition-all duration-300
                        ${
                          module.enable
                            ? "bg-linear-to-br from-blue-100 to-blue-200 text-blue-600 dark:from-blue-900/40 dark:to-blue-800/40 dark:text-blue-400"
                            : "bg-gray-200 text-gray-500 dark:bg-gray-700 dark:text-gray-400"
                        }
                      `}
                      >
                        <IconComponent />
                      </div>

                      <span
                        className={`
                        px-3 py-1 rounded-full text-xs font-medium
                        transition-all duration-300
                        ${
                          module.enable
                            ? "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400"
                            : "bg-gray-200 text-gray-500 dark:bg-gray-700 dark:text-gray-400"
                        }
                      `}
                      >
                        {module.enable ? "已启用" : "未启用"}
                      </span>
                    </div>

                    <div className="space-y-2">
                      <h3
                        className={`
                        text-base font-semibold transition-colors duration-300
                        ${module.enable ? "text-gray-900 dark:text-gray-100" : "text-gray-400 dark:text-gray-500"}
                      `}
                      >
                        {module.name}
                      </h3>
                      <p
                        className={`
                        text-sm leading-relaxed min-h-[40px]
                        transition-colors duration-300
                        ${module.enable ? "text-gray-500 dark:text-gray-400" : "text-gray-300 dark:text-gray-600"}
                      `}
                      >
                        {module.config.description}
                      </p>
                    </div>
                  </div>
                );
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
};

export default ModuleSetting;
