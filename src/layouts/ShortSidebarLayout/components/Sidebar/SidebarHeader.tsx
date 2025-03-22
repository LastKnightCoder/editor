import { memo } from "react";
import classnames from "classnames";
import useGlobalStateStore from "@/stores/useGlobalStateStore.ts";
import SelectDatabase from "@/components/SelectDatabase";
import SVG from "react-inlinesvg";
import TitlebarIcon from "@/components/TitlebarIcon";
import sidebarLeft from "@/assets/icons/sidebar-left.svg";
import styles from "./index.module.less";
import { useMemoizedFn } from "ahooks";

interface SidebarHeaderProps {
  isMac: boolean;
  isFullscreen: boolean;
}

const SidebarHeader = memo((props: SidebarHeaderProps) => {
  const { isMac, isFullscreen } = props;

  const handleHideSidebar = useMemoizedFn(() => {
    useGlobalStateStore.setState({
      sidebarOpen: false,
    });
  });

  return (
    <div
      className={classnames(styles.header, {
        [styles.indent]: isMac && !isFullscreen,
      })}
    >
      <SelectDatabase />
      <TitlebarIcon onClick={handleHideSidebar}>
        <SVG src={sidebarLeft} />
      </TitlebarIcon>
    </div>
  );
});

export default SidebarHeader;
