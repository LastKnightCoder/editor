import {createBrowserRouter, Navigate} from "react-router-dom";

import Index from '@/pages/Index';
import Cards from "@/pages/Cards";
import Articles from "@/pages/Articles";
import Statistic from "@/pages/Statistic";
import LinkGraph from "@/pages/Cards/LinkGraph";


const routes = [{
  path: '/',
  element: <Index />,
  children: [{
    index: true,
    element: <Navigate to="/cards" replace />,
  } ,{
    path: 'cards/',
    children: [{
      index: true,
      element: <Navigate to="/cards/list" replace />,
    }, {
      path: 'list/',
      element: <Cards />,
    }, {
      path: 'link-graph/',
      element: <LinkGraph />,
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
  }]
}]

const router = createBrowserRouter(routes);

export default router;