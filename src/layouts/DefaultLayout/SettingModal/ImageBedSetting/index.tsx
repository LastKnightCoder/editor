import { Tabs, TabsProps } from "antd";
import GithubSetting from "./GithubSetting";

const ImageBedSetting = () => {
  const items: TabsProps['items'] = [{
    key: 'github',
    label: 'Github',
    children: <GithubSetting />,
  }]

  return (
    <Tabs
      items={items}
    />
  )
}

export default ImageBedSetting;