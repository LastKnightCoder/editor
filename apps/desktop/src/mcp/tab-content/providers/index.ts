import { tabContentRegistry } from "../registry";

// 列表类 providers
import { CardListProvider } from "./card-list-provider";
import { ArticleListProvider } from "./article-list-provider";
import { DocumentListProvider } from "./document-list-provider";
import { WhiteBoardListProvider } from "./whiteboard-list-provider";
import { PdfListProvider } from "./pdf-list-provider";
import { SlidesProvider } from "./slides-provider";

// 详情类 providers
import { CardDetailProvider } from "./card-detail-provider";
import { ArticleDetailProvider } from "./article-detail-provider";
import { ProjectDetailProvider } from "./project-detail-provider";
import { DocumentDetailProvider } from "./document-detail-provider";
import { WhiteBoardDetailProvider } from "./whiteboard-detail-provider";
import { PdfDetailProvider } from "./pdf-detail-provider";
import { EpubDetailProvider } from "./epub-detail-provider";
import { SlideDetailProvider } from "./slide-detail-provider";
import { WebViewProvider } from "./web-view-provider";
import { BlockPreviewProvider } from "./block-preview-provider";

// 功能页面类 providers
import { HomeProvider } from "./home-provider";
import { DailyNoteProvider } from "./daily-note-provider";
import { VecDocumentProvider } from "./vec-document-provider";
import { SettingsProvider } from "./settings-provider";
import { CalendarProvider } from "./calendar-provider";
import { ChatManagementProvider } from "./chat-management-provider";
import { ResourceManagementProvider } from "./resource-management-provider";
import { TodoProvider } from "./todo-provider";
import { GoalsProvider } from "./goals-provider";
import { QuestionsProvider } from "./questions-provider";
import { PomodoroProvider } from "./pomodoro-provider";
import { PromptManagementProvider } from "./prompt-management-provider";
import { WeReadProvider } from "./weread-provider";
import { FlashcardCenterProvider } from "./flashcard-center-provider";
import { DataViewProvider } from "./data-view-provider";

/**
 * 初始化并注册所有 Tab 内容提供者
 */
export function initializeTabContentProviders(): void {
  tabContentRegistry.registerMultiple([
    // 列表类 (6个)
    new CardListProvider(),
    new ArticleListProvider(),
    new DocumentListProvider(),
    new WhiteBoardListProvider(),
    new PdfListProvider(),
    new SlidesProvider(),

    // 详情类 (10个)
    new CardDetailProvider(),
    new ArticleDetailProvider(),
    new ProjectDetailProvider(),
    new DocumentDetailProvider(),
    new WhiteBoardDetailProvider(),
    new PdfDetailProvider(),
    new EpubDetailProvider(),
    new SlideDetailProvider(),
    new WebViewProvider(),
    new BlockPreviewProvider(),

    // 功能页面类 (16个)
    new HomeProvider(),
    new DailyNoteProvider(),
    new VecDocumentProvider(),
    new SettingsProvider(),
    new CalendarProvider(),
    new ChatManagementProvider(),
    new ResourceManagementProvider(),
    new TodoProvider(),
    new GoalsProvider(),
    new QuestionsProvider(),
    new PomodoroProvider(),
    new PromptManagementProvider(),
    new WeReadProvider(),
    new FlashcardCenterProvider(),
    new DataViewProvider(),
  ]);

  console.log(`Registered ${tabContentRegistry.size} tab content providers`);
}

// 导出注册表
export { tabContentRegistry };
