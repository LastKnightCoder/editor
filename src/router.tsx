import { createBrowserRouter } from "react-router-dom";
import loadable from "@loadable/component";

import ThreeColumnLayout from "@/layouts/ThreeColumnLayout";
import QuickCard from "@/pages/QuickCard";
import QuickTimeRecord from "@/pages/QuickTimeRecord";
import ShortSidebarLayout from "./layouts/ShortSidebarLayout";

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
    path: 'cards/*',
    element: <div>1111</div>
  }, {
    path: 'cards/:id/',
  }, {
    path: 'articles/',
    element: <div>2222</div>
  }]
}]

export const classicRouter = createBrowserRouter(classicRoutes);

export const shortSidebarRouter = createBrowserRouter(shortSidebarRoutes);


export default classicRouter;
