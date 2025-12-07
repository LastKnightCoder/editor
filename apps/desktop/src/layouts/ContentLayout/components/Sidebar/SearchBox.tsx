import { memo } from "react";
import useCommandPanelStore from "@/stores/useCommandPanelStore.ts";
import { useMemoizedFn } from "ahooks";
import SidebarItem from "./SidebarItem";
import search from "@/assets/icons/search.svg";

interface SearchBoxProps {
  className?: string;
  showTooltip?: boolean;
  disableDefaultHover?: boolean;
}

const SearchBox = memo((props: SearchBoxProps) => {
  const { className, showTooltip = true, disableDefaultHover = false } = props;
  const handleOpenCommandPanel = useMemoizedFn(() => {
    useCommandPanelStore.setState({
      open: true,
    });
  });

  return (
    <SidebarItem
      onClick={handleOpenCommandPanel}
      label={"搜索"}
      icon={search}
      active={false}
      isShortWidth={true}
      className={className}
      showTooltip={showTooltip}
      disableDefaultHover={disableDefaultHover}
    />
  );
});

export default SearchBox;
