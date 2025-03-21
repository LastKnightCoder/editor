import { useMatch, useNavigate } from "react-router-dom";
import classnames from "classnames";
import For from "@/components/For";
import { FaListUl } from "react-icons/fa6";
import TitlebarIcon from "@/components/TitlebarIcon";
import graphIcon from "@/assets/icons/graph.svg";
import SVG from "react-inlinesvg";

import styles from "./index.module.less";

const CardTitlebar = () => {
  const navigate = useNavigate();

  const tabsConfig = [
    {
      label: "卡片列表",
      to: "/cards/list",
      icon: <FaListUl />,
      active: useMatch("/cards/list") !== null,
    },
    {
      label: "关系图谱",
      to: "/cards/link-graph",
      icon: <SVG src={graphIcon} />,
      active: useMatch("/cards/link-graph") !== null,
    },
  ];

  return (
    <div className={styles.nav}>
      <For
        data={tabsConfig}
        renderItem={(item) => (
          <div
            key={item.label}
            className={classnames(styles.item)}
            onClick={() => navigate(item.to)}
          >
            <TitlebarIcon
              tip={item.label}
              onClick={() => navigate(item.to)}
              active={item.active}
            >
              {item.icon}
            </TitlebarIcon>
          </div>
        )}
      />
    </div>
  );
};

export default CardTitlebar;
