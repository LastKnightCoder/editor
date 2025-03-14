import TitlebarIcon from "@/components/TitlebarIcon";
import useGlobalStateStore from "@/stores/useGlobalStateStore.ts";
import { MdCenterFocusWeak } from "react-icons/md";

const FocusMode = () => {
  const { focusMode } = useGlobalStateStore((state) => ({
    focusMode: state.focusMode,
  }));

  return (
    <TitlebarIcon
      tip={"专注模式"}
      active={focusMode}
      onClick={() => {
        useGlobalStateStore.setState({
          focusMode: !focusMode,
        });
      }}
    >
      <MdCenterFocusWeak />
    </TitlebarIcon>
  );
};

export default FocusMode;
