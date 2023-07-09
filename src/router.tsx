import {createBrowserRouter, Navigate} from "react-router-dom";

import Index from './pages/Index';
import Cards from "./pages/Cards";
import Articles from "./pages/Articles";


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
}]

const router = createBrowserRouter(routes);

export default router;