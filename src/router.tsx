import { createBrowserRouter } from "react-router-dom";
import loadable from "@loadable/component";

import ThreeColumnLayout from "@/layouts/ThreeColumnLayout";
import QuickCard from "@/pages/QuickCard";
import QuickTimeRecord from "@/pages/QuickTimeRecord";
import ShortSidebarLayout from "./layouts/ShortSidebarLayout";

import CardView from "@/layouts/ShortSidebarLayout/components/CardView";
import ArticleView from '@/layouts/ShortSidebarLayout/components/ArticleView';
import CardLinkGraph from "@/layouts/ShortSidebarLayout/components/CardLinkGraph";
import WhiteBoardView from "@/layouts/ShortSidebarLayout/components/WhiteBoardView";
import DocumentsView from "@/layouts/ShortSidebarLayout/components/DocumentsView";
import DocumentView from "@/layouts/ShortSidebarLayout/components/DocumentView";
import ProjectsView from "@/layouts/ShortSidebarLayout/components/ProjectsView";
import ProjectView from "@/layouts/ShortSidebarLayout/components/ProjectView";
import PdfView from "@/layouts/ShortSidebarLayout/components/PdfView";
import DailyNoteView from "@/layouts/ShortSidebarLayout/components/DailyNoteView";
import TimeRecordView from "@/layouts/ShortSidebarLayout/components/TimeRecordView";

const Statistic = loadable(() => import('@/pages/Statistic'));

const classicRoutes = [{
  path: '/quick-card',
  element: <QuickCard/>,
}, {
  path: '/quick-time-record',
  element: <QuickTimeRecord/>,
}, {
  path: '/statistic',
  element: <Statistic/>,
}, {
  path: '/*',
  element: <ThreeColumnLayout />,
}];

const shortSidebarRoutes = [{
  path: '/',
  element: <ShortSidebarLayout />,
  children: [{
    path: 'cards/list',
    element: <CardView />
  }, {
    path: 'cards/link-graph',
    element: <CardLinkGraph />,
  }, {
    path: 'articles/',
    element: <ArticleView />
  }, {
    path: 'white-boards/',
    element: <WhiteBoardView />
  }, {
    path: 'documents/',
    element: <DocumentsView />
  }, {
    path: 'documents/:id',
    element: <DocumentView />
  }, {
    path: 'projects/list',
    element: <ProjectsView />
  }, {
    path: 'projects/:id',
    element: <ProjectView />
  }, {
    path: 'pdfs/',
    element: <PdfView />
  }, {
    path: 'dailies/',
    element: <DailyNoteView />
  }, {
    path: 'time-records',
    element: <TimeRecordView />
  }]
}]

export const classicRouter = createBrowserRouter(classicRoutes);

export const shortSidebarRouter = createBrowserRouter(shortSidebarRoutes);


export default classicRouter;
