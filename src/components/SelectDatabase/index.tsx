import { useState, useRef } from "react";
import { Divider, Button, Modal, Input, InputRef, App, Flex, Popover } from "antd";
import { produce } from "immer";
import { IoCaretDownOutline } from "react-icons/io5";

import useSettingStore from "@/stores/useSettingStore.ts";
import For from "@/components/For";
import DatabaseItem from "@/components/SelectDatabase/DatabaseItem";
import { closeDatabase, getDatabasePath, removeFile } from "@/commands";

const SelectDatabase = () => {
  const {
    database
  } = useSettingStore(state => ({
    database: state.setting.database,
  }));

  const [createDatabaseModalOpen, setCreateDatabaseModalOpen] = useState(false);
  const [databaseSelectPopoverOpen, setDatabaseSelectPopoverOpen] = useState(false);

  const createRef = useRef<InputRef>(null);

  const { message, modal } = App.useApp();

  const { active, databases } = database;

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
      <Popover
        open={databaseSelectPopoverOpen}
        onOpenChange={setDatabaseSelectPopoverOpen}
        trigger={'click'}
        styles={{
          body: {
            padding: 4,
            marginLeft: 12
          }
        }}
        arrow={false}
        content={(
          <Flex vertical gap={4} style={{ width: 150 }}>
            <For
              data={databases}
              renderItem={(database) => (
                <DatabaseItem
                  key={database.name}
                  name={database.name}
                  disable={active === database.name}
                  onClick={() => {
                    useSettingStore.setState(produce(state => {
                      state.setting.database.active = database.name;
                    }));
                    setDatabaseSelectPopoverOpen(false);
                  }}
                  onClickDelete={async () => {
                    if (database.name === active) return;
                    modal.confirm({
                      title: '确定要删除此数据库吗？',
                      content: '删除后，数据库文件将被删除，数据无法恢复！',
                      onOk: async () => {
                        useSettingStore.setState(produce(state => {
                          state.setting.database.databases = state.setting.database.databases.filter((item: { name: string }) => item.name !== database.name);
                        }));
                        await closeDatabase(database.name);
                        const databasePath = await getDatabasePath(database.name);
                        await removeFile(databasePath);
                      },
                      okButtonProps: {
                        danger: true
                      }
                    })
                  }}
                />
              )}
            />
            <Divider style={{ margin: '12px 0' }} />
            <Button
              onClick={() => {
                setCreateDatabaseModalOpen(true);
                setDatabaseSelectPopoverOpen(false);
              }}
              style={{
                margin: '0 6px 12px'
              }}
            >
              创建新的数据库
            </Button>
          </Flex>
        )}
      >
        <Flex gap={4} align={'center'}>
          {active.replace('.db', '')}
          <IoCaretDownOutline />
        </Flex>
      </Popover>
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
