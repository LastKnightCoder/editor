import React, { useState, useRef } from "react";
import { Dropdown, MenuProps, Space, Divider, Button, theme, Modal, Input, InputRef, App, Flex } from "antd";
import { produce } from "immer";
import { IoCaretDownOutline } from "react-icons/io5";

import useSettingStore from "@/stores/useSettingStore.ts";

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
    // @ts-ignore
    <div style={{ cursor: 'pointer', '-webkit-app-region': 'no-drag' }}>
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
        <Flex gap={4} align={'center'}>
          {active.replace('.db', '')}
          <IoCaretDownOutline />
        </Flex>
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