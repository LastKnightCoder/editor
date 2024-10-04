import { createBrowserRouter } from "react-router-dom";
import loadable from "@loadable/component";

import ClassicLayout from "@/layouts/ClassicLayout";
import QuickCard from "@/pages/QuickCard";
import QuickTimeRecord from "@/pages/QuickTimeRecord";

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
  element: <ClassicLayout />,
}];

export const router = createBrowserRouter(classicRoutes);


export default router;
