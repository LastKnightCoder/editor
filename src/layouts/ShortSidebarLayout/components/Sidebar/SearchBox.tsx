import { memo } from "react";
import useSettingStore from "@/stores/useSettingStore.ts";
import useCommandPanelStore from "@/stores/useCommandPanelStore.ts";
import classnames from "classnames";
import styles from "./index.module.less";
import { Flex } from "antd";
import { useMemoizedFn } from "ahooks";

interface SearchBoxProps {
  isMac: boolean;
}

const SearchBox = memo((props: SearchBoxProps) => {
  const { isMac } = props;

  const darkMode = useSettingStore((state) => state.setting.darkMode);

  const handleOpenCommandPanel = useMemoizedFn(() => {
    useCommandPanelStore.setState({
      open: true,
    });
  });

  return (
    <div
      className={classnames(styles.search, { [styles.dark]: darkMode })}
      onClick={handleOpenCommandPanel}
    >
      <Flex gap={8} align={"center"}>
        <svg
          width="20"
          height="20"
          viewBox="0 0 20 20"
          style={{ width: 14, height: 14, fontWeight: 700 }}
        >
          <path
            d="M14.386 14.386l4.0877 4.0877-4.0877-4.0877c-2.9418 2.9419-7.7115 2.9419-10.6533 0-2.9419-2.9418-2.9419-7.7115 0-10.6533 2.9418-2.9419 7.7115-2.9419 10.6533 0 2.9419 2.9418 2.9419 7.7115 0 10.6533z"
            stroke="currentColor"
            fill="none"
            fillRule="evenodd"
            strokeLinecap="round"
            strokeLinejoin="round"
          ></path>
        </svg>
        <span>搜索</span>
      </Flex>
      <Flex align={"center"}>
        <kbd>{isMac ? "Cmd" : "Ctrl"} + K</kbd>
      </Flex>
    </div>
  );
});

export default SearchBox;
