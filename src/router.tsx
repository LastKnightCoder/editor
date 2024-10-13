import { createBrowserRouter } from "react-router-dom";
import loadable from "@loadable/component";

import ThreeColumnLayout from "@/layouts/ThreeColumnLayout";
import QuickCard from "@/pages/QuickCard";
import QuickTimeRecord from "@/pages/QuickTimeRecord";
import ShortSidebarLayout from "./layouts/ShortSidebarLayout";

import CardView from "@/layouts/ShortSidebarLayout/components/CardView";
import ArticleView from '@/layouts/ShortSidebarLayout/components/ArticleView';
import CardLinkGraph from "@/layouts/ShortSidebarLayout/components/CardLinkGraph";

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
    path: 'cards/link-graph/',
    element: <CardLinkGraph />,
  }, {
    path: 'articles/',
    element: <ArticleView />
  }]
}]

export const classicRouter = createBrowserRouter(classicRoutes);

export const shortSidebarRouter = createBrowserRouter(shortSidebarRoutes);


export default classicRouter;
