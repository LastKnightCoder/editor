import { tabContentRegistry } from "../registry";

// 列表类 providers
import { CardListProvider } from "./card-list-provider";
import { ArticleListProvider } from "./article-list-provider";
import { WhiteBoardListProvider } from "./whiteboard-list-provider";
import { PdfListProvider } from "./pdf-list-provider";

// 详情类 providers
import { CardDetailProvider } from "./card-detail-provider";
import { ArticleDetailProvider } from "./article-detail-provider";
import { ProjectDetailProvider } from "./project-detail-provider";
import { WhiteBoardDetailProvider } from "./whiteboard-detail-provider";
import { PdfDetailProvider } from "./pdf-detail-provider";
import { EpubDetailProvider } from "./epub-detail-provider";
import { WebViewProvider } from "./web-view-provider";
import { BlockPreviewProvider } from "./block-preview-provider";

// 功能页面类 providers
import { HomeProvider } from "./home-provider";
import { DailyNoteProvider } from "./daily-note-provider";
import { VecDocumentProvider } from "./vec-document-provider";
import { SettingsProvider } from "./settings-provider";
import { CalendarProvider } from "./calendar-provider";
import { ChatManagementProvider } from "./chat-management-provider";
import { TodoProvider } from "./todo-provider";
import { QuestionsProvider } from "./questions-provider";
import { PomodoroProvider } from "./pomodoro-provider";
import { WeReadProvider } from "./weread-provider";
import { FlashcardCenterProvider } from "./flashcard-center-provider";

/**
 * 初始化并注册所有 Tab 内容提供者
 */
export function initializeTabContentProviders(): void {
  tabContentRegistry.registerMultiple([
    // 列表类
    new CardListProvider(),
    new ArticleListProvider(),
    new WhiteBoardListProvider(),
    new PdfListProvider(),

    // 详情类
    new CardDetailProvider(),
    new ArticleDetailProvider(),
    new ProjectDetailProvider(),
    new WhiteBoardDetailProvider(),
    new PdfDetailProvider(),
    new EpubDetailProvider(),
    new WebViewProvider(),
    new BlockPreviewProvider(),

    // 功能页面类
    new HomeProvider(),
    new DailyNoteProvider(),
    new VecDocumentProvider(),
    new SettingsProvider(),
    new CalendarProvider(),
    new ChatManagementProvider(),
    new TodoProvider(),
    new QuestionsProvider(),
    new PomodoroProvider(),
    new WeReadProvider(),
    new FlashcardCenterProvider(),
  ]);

  console.log(`Registered ${tabContentRegistry.size} tab content providers`);
}

// 导出注册表
export { tabContentRegistry };
