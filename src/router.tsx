import {createBrowserRouter, Navigate} from "react-router-dom";

import Edit from './pages/Edit';
import Index from './pages/Index';
import Cards from "./pages/Index/Cards";
import Articles from "./pages/Index/Articles";


const routes = [{
  path: '/',
  element: <Index />,
  children: [{
    index: true,
    element: <Navigate to="/cards" replace />,
  } ,{
    path: 'cards/',
    element: <Cards />,
  }, {
    path: 'articles/',
    element: <Articles />,
  }]
}, {
  path: '/editor',
  element: <Edit />,
}]

const router = createBrowserRouter(routes);

export default router;