import { createBrowserRouter, Navigate } from "react-router-dom";
import loadable from "@loadable/component";

import DefaultLayout from '@/layouts/DefaultLayout';
import Cards from "@/pages/Cards";
import QuickCard from "@/pages/QuickCard";
import QuickTimeRecord from "@/pages/QuickTimeRecord";

const Articles = loadable(() => import('@/pages/Articles'));
const Documents = loadable(() => import('@/pages/Documents'));
const ArticleEdit = loadable(() => import('@/pages/Articles/ArticleEdit'));
const Statistic = loadable(() => import('@/pages/Statistic'));
const Animate = loadable(() => import('@/pages/Animate'));
const DailyNote = loadable(() => import('@/pages/DailyNote'));
const TimeRecord = loadable(() => import('@/pages/TimeRecord'));

const routes = [{
  path: '/',
  element: <DefaultLayout />,
  children: [{
    index: true,
    element: <Navigate to="/cards" replace />,
  } ,{
    path: 'cards/',
    element: <Cards />,
  }, {
    path: 'articles/',
    children: [{
      index: true,
      element: <Navigate to="/articles/list" replace />,
    }, {
      path: 'list/',
      element: <Articles />,
    }, {
      path: 'edit/:articleId/',
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
  }, {
    path: '/time-record',
    element: <TimeRecord />,
  }]
}, {
  path: '/quick-card',
  element: <QuickCard />,
}, {
  path: '/quick-time-record',
  element: <QuickTimeRecord />,
}]

const router = createBrowserRouter(routes);

export default router;