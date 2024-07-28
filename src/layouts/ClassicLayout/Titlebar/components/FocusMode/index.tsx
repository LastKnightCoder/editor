import TitlebarIcon from "@/components/TitlebarIcon";
import useGlobalStateStore from "@/stores/useGlobalStateStore.ts";
import { MdCenterFocusWeak } from "react-icons/md";
import { Tooltip } from "antd";

const FocusMode = () => {
  const {
    focusMode,
  } = useGlobalStateStore(state => ({
    focusMode: state.focusMode,
  }));

  return (
    <Tooltip title={'专注模式'} trigger={'hover'}>
      <TitlebarIcon active={focusMode} onClick={() => {
        useGlobalStateStore.setState({
          focusMode: !focusMode,
        });
      }}>
        <MdCenterFocusWeak />
      </TitlebarIcon>
    </Tooltip>
  )
}

export default FocusMode;