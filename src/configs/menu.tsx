import {MenuProps} from "antd";
import {MdOutlineArticle, MdOutlineListAlt, MdStickyNote2} from "react-icons/md";
import {NavLink} from "react-router-dom";
import {AiOutlineBarChart} from "react-icons/ai";

export const menuConfigs: MenuProps['items'] = [{
  key: 'card',
  label: '卡片管理',
  icon: <MdStickyNote2 />,
  children: [{
    icon: <MdOutlineListAlt />,
    key: 'card-list',
    label: <NavLink to={'/cards/list'}>卡片列表</NavLink>,
  }, {
    icon: <MdOutlineListAlt />,
    key: 'card-link-graph',
    label: <NavLink to={'/cards/link-graph'}>关系图谱</NavLink>,
  }]
}, {
  key: 'article',
  label: '文章管理',
  icon: <MdOutlineArticle />,
  children: [{
    icon: <MdOutlineListAlt />,
    key: 'article-list',
    label: <NavLink to={'/articles/list'}>文章列表</NavLink>,
  }]
}, {
  key: 'data-statistics',
  label: <NavLink to={'/statistic'}>数据统计</NavLink>,
  icon: <AiOutlineBarChart />,
}]