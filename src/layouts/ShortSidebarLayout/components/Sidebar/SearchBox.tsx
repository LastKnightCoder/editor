import { memo } from "react";
import useCommandPanelStore from "@/stores/useCommandPanelStore.ts";
import { useMemoizedFn } from "ahooks";
import SidebarItem from "./SidebarItem";
import search from "@/assets/icons/search.svg";

const SearchBox = memo(() => {
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
    />
  );
});

export default SearchBox;
