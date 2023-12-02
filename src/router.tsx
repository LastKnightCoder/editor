import { createBrowserRouter, Navigate } from "react-router-dom";
import loadable from "@loadable/component";

import DefaultLayout from '@/layouts/DefaultLayout';
const Cards = loadable(() => import('@/pages/Cards'));
const Articles = loadable(() => import('@/pages/Articles'));
const Documents = loadable(() => import('@/pages/Documents'));
const ArticleEdit = loadable(() => import('@/pages/Articles/ArticleEdit'));
const Statistic = loadable(() => import('@/pages/Statistic'));
const Animate = loadable(() => import('@/pages/Animate'));
const DailyNote = loadable(() => import('@/pages/DailyNote'));
const CardGraph = loadable(() => import('@/pages/CardGraph'));

const routes = [{
  path: '/',
  element: <DefaultLayout />,
  children: [{
    index: true,
    element: <Navigate to="/cards" replace />,
  } ,{
    path: 'cards/',
    children: [{
      index: true,
      element: <Navigate to="/cards/list/" replace />,
    }, {
      path: 'list/',
      element: <Cards />,
    }, {
      path: 'link-graph/',
      element: <CardGraph />,
    }],
  }, {
    path: 'articles/',
    children: [{
      index: true,
      element: <Navigate to="/articles/list" replace />,
    }, {
      path: 'list/',
      element: <Articles />,
    }, {
      path: 'edit',
      element: <ArticleEdit />,
    }]
  }, {
    path: 'documents/',
    element: <Documents />,
  }, {
    path: 'statistic/',
    element: <Statistic />,
  }, {
    path: '/animate',
    element: <Animate />,
  }, {
    path: '/daily',
    element: <DailyNote />,
  }]
}]

const router = createBrowserRouter(routes);

export default router;