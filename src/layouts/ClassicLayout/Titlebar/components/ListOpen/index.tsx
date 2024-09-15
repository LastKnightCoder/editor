import useGlobalStateStore from "@/stores/useGlobalStateStore.ts";
import { MenuFoldOutlined, MenuUnfoldOutlined } from "@ant-design/icons";
import TitlebarIcon from "@/components/TitlebarIcon";

const ListOpen = () => {
  const {
    listOpen,
  } = useGlobalStateStore(state => ({
    listOpen: state.listOpen,
  }));

  return (
    <TitlebarIcon tip={listOpen ? '收起列表' : '打开列表'} onClick={() => {
      useGlobalStateStore.setState({
        listOpen: !listOpen,
      })
    }}>
      {listOpen ? <MenuFoldOutlined /> : <MenuUnfoldOutlined />}
    </TitlebarIcon>
  )
}

export default ListOpen;
