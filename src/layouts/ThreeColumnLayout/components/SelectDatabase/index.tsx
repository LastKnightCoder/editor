import React, { useState, useRef } from "react";
import { Dropdown, MenuProps, Space, Divider, Button, theme, Modal, Input, InputRef, App } from "antd";
import { produce } from "immer";
import { DownOutlined } from "@ant-design/icons";

import useSettingStore from "@/stores/useSettingStore";

const { useToken } = theme;

const SelectDatabase = () => {
  const {
    database
  } = useSettingStore(state => ({
    database: state.setting.database,
  }));

  const [createDatabaseModalOpen, setCreateDatabaseModalOpen] = useState(false);
  const createRef = useRef<InputRef>(null);

  const { token } = useToken();
  const { message } = App.useApp();

  const contentStyle: React.CSSProperties = {
    width: 150,
    backgroundColor: token.colorBgElevated,
    borderRadius: token.borderRadiusLG,
    boxShadow: token.boxShadowSecondary,
  };

  const { active, databases } = database;

  const menu: MenuProps['items'] = databases.map(item => ({
    key: item.name,
    label: item.name.replace('.db', ''),
    disabled: active === item.name,
  }));

  const handleClickMenu: MenuProps['onClick'] = async ({ key }) => {
    useSettingStore.setState(produce(state => {
      state.setting.database.active = key;
    }));
  }

  const onHandleCreateDatabase = (databaseName: string) => {
    if (!databaseName) return;
    if (!databaseName.endsWith('.db')) {
      databaseName += '.db';
    }
    useSettingStore.setState(produce(state => {
      state.setting.database.databases.push({
        name: databaseName,
        version: 1,
      });
      state.setting.database.active = databaseName;
    }));
    setCreateDatabaseModalOpen(false);
  }

  return (
    <div style={{ cursor: 'pointer' }}>
      <Dropdown
        trigger={['click']}
        menu={{
          items: menu,
          onClick: handleClickMenu,
        }}
        dropdownRender={(menu) => (
          <div style={contentStyle}>
            {React.cloneElement(menu as React.ReactElement)}
            <Divider style={{ margin: 0 }} />
            <Space style={{ padding: 8 }}>
              <Button onClick={() => { setCreateDatabaseModalOpen(true) }}>创建新的数据库</Button>
            </Space>
          </div>
        )}
      >
        <Space>
          {active.replace('.db', '')}
          <DownOutlined />
        </Space>
      </Dropdown>
      <Modal
        width={400}
        title="创建新的数据库"
        open={createDatabaseModalOpen}
        onCancel={() => setCreateDatabaseModalOpen(false)}
        footer={null}
      >
        <div style={{
          display: 'flex',
          gap: 8,
        }}>
          <Input ref={createRef} placeholder={'请输入要创建的数据库名称'} />
          <Button
            onClick={() => {
              if (!createRef.current) return;
              const databaseName = createRef.current.input?.value || '';
              if (!databaseName) {
                message.error('请输入数据库名称');
                return;
              }
              onHandleCreateDatabase(databaseName);
            }}
          >
            创建
          </Button>
        </div>
      </Modal>
    </div>
  )

}

export default SelectDatabase;