import {createBrowserRouter, Navigate} from "react-router-dom";

import DefaultLayout from '@/layouts/DefaultLayout';
import Cards from "@/pages/Cards";
import Articles from "@/pages/Articles";
import Statistic from "@/pages/Statistic";
import Animate from "@/pages/Animate";
import DailyNote from "@/pages/DailyNote";
import LinkGraph from "@/pages/Cards/LinkGraph";
import CardDetail from "@/pages/Cards/CardDetail";

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
      element: <LinkGraph />,
    }, {
      path: 'detail/',
      element: <CardDetail />,
    }, {
      path: 'detail/:cardId/',
      element: <CardDetail />,
    }],
  }, {
    path: 'articles/',
    children: [{
      index: true,
      element: <Navigate to="/articles/list" replace />,
    }, {
      path: 'list/',
      element: <Articles />,
    }]
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