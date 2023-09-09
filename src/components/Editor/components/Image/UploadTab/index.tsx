import { memo, useState } from "react";
import { Button, Input, Tabs, TabsProps } from "antd";

interface UploadTabProps {
  uploadImage: () => void;
  setLink: (link: string) => void;
}

const UploadTab = memo((props: UploadTabProps) => {
  const { uploadImage, setLink } = props;

  const [linkValue, setLinkValue] = useState('');

  const items: TabsProps['items'] = [{
    key: 'upload',
    label: '本地上传',
    children: <Button onClick={uploadImage}>本地上传</Button>
  }, {
    key: 'link',
    label: '网络图片',
    children: (
      <div style={{ display: 'flex' }}>
        <Input
          value={linkValue}
          onChange={e => setLinkValue(e.target.value)}
          placeholder="请输入网络图片地址"
        />
        <Button style={{ marginLeft: 16 }} onClick={() => setLink(linkValue)}>确定</Button>
      </div>
    )
  }];

  return (
    <Tabs
      style={{
        width: 400,
      }}
      defaultActiveKey="upload"
      items={items}
    />
  )
});

export default UploadTab;