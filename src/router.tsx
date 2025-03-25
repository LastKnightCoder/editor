import { createHashRouter } from "react-router-dom";

import QuickCard from "@/pages/QuickCard";
import QuickTimeRecord from "@/pages/QuickTimeRecord";
import SettingsPage from "@/pages/Settings";
import SingleCardEditor from "@/pages/SingleCardEditor";
import SingleArticleEditor from "@/pages/SingleArticleEditor";
import SingleProjectItemEditor from "@/pages/SingleProjectItemEditor";
import SingleDocumentItemEditor from "@/pages/SingleDocumentItemEditor";
import SingleMarkdownEditor from "@/pages/SingleMarkdownEditor";
import CardListView from "@/pages/CardListView";
import CardDetailView from "@/pages/CardDetailView";

import ShortSidebarLayout from "@/layouts/ShortSidebarLayout";
import QuickOpenLayout from "@/layouts/QuickOpenLayout";

import HomeView from "@/layouts/ShortSidebarLayout/components/HomeView";
import ArticleView from "@/layouts/ShortSidebarLayout/components/ArticleView";
import CardLinkGraph from "@/layouts/ShortSidebarLayout/components/CardLinkGraph";
import WhiteBoardView from "@/layouts/ShortSidebarLayout/components/WhiteBoardView";
import DocumentsView from "@/layouts/ShortSidebarLayout/components/DocumentsView";
import DocumentView from "@/layouts/ShortSidebarLayout/components/DocumentView";
import ProjectsView from "@/layouts/ShortSidebarLayout/components/ProjectsView";
import ProjectView from "@/layouts/ShortSidebarLayout/components/ProjectView";
import PdfView from "@/layouts/ShortSidebarLayout/components/PdfView";
import DailyNoteView from "@/layouts/ShortSidebarLayout/components/DailyNoteView";
import TimeRecordView from "@/layouts/ShortSidebarLayout/components/TimeRecordView";
import VecDocumentView from "@/layouts/ShortSidebarLayout/components/VecDocumentView";

const routes = [
  {
    path: "/",
    element: <ShortSidebarLayout />,
    children: [
      {
        path: "/",
        element: <HomeView />,
      },
      {
        path: "cards/list",
        element: <CardListView />,
      },
      {
        path: "cards/detail/:id",
        element: <CardDetailView />,
      },
      {
        path: "cards/link-graph",
        element: <CardLinkGraph />,
      },
      {
        path: "articles/",
        element: <ArticleView />,
      },
      {
        path: "white-boards/",
        element: <WhiteBoardView />,
      },
      {
        path: "documents/",
        element: <DocumentsView />,
      },
      {
        path: "documents/:id",
        element: <DocumentView />,
      },
      {
        path: "projects/list",
        element: <ProjectsView />,
      },
      {
        path: "projects/:id",
        element: <ProjectView />,
      },
      {
        path: "pdfs/",
        element: <PdfView />,
      },
      {
        path: "dailies/",
        element: <DailyNoteView />,
      },
      {
        path: "time-records",
        element: <TimeRecordView />,
      },
      {
        path: "vec-documents/",
        element: <VecDocumentView />,
      },
      {
        path: "settings",
        element: <SettingsPage />,
      },
    ],
  },
  {
    path: "/quick-card",
    element: <QuickCard />,
  },
  {
    path: "/quick-time-record",
    element: <QuickTimeRecord />,
  },
  {
    path: "/single-card-editor/",
    element: <QuickOpenLayout />,
    children: [
      {
        index: true,
        element: <SingleCardEditor />,
      },
    ],
  },
  {
    path: "/single-article-editor/",
    element: <QuickOpenLayout />,
    children: [
      {
        index: true,
        element: <SingleArticleEditor />,
      },
    ],
  },
  {
    path: "/single-project-item-editor/",
    element: <QuickOpenLayout />,
    children: [
      {
        index: true,
        element: <SingleProjectItemEditor />,
      },
    ],
  },
  {
    path: "/single-document-item-editor/",
    element: <QuickOpenLayout />,
    children: [
      {
        index: true,
        element: <SingleDocumentItemEditor />,
      },
    ],
  },
  {
    path: "/single-markdown-editor/",
    element: <QuickOpenLayout />,
    children: [
      {
        index: true,
        element: <SingleMarkdownEditor />,
      },
    ],
  },
];

export const router = createHashRouter(routes);
export default routes;
