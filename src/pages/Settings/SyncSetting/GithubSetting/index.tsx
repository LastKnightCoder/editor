import useSettingStore from "@/stores/useSettingStore.ts";
import { produce } from "immer";
import { Flex, Input, Select, Space, message } from "antd";
import If from "@/components/If";
import { useState, useEffect } from "react";
import { useMemoizedFn } from "ahooks";
import { getReposByOwner, getBranchesByRepo } from "@/utils";

const GithubSetting = () => {
  const { setting, integration } = useSettingStore((state) => ({
    setting: state.setting.sync.github,
    integration: state.setting.integration.github,
  }));

  const { repo = "", branch = "", pathPrefix = "" } = setting;
  const { token = "", user } = integration;

  const [repos, setRepos] = useState<string[]>([]);
  const [branches, setBranches] = useState<string[]>([]);

  const onLoadRepos = useMemoizedFn(async () => {
    if (!token) {
      message.warning("请先在集成设置中配置 Github Token");
      return;
    }
    const reposList = await getReposByOwner(token, user.name);
    if (reposList) {
      setRepos(reposList.map((r: { name: string }) => r.name));
    } else {
      message.error("获取仓库列表失败");
    }
  });

  const handleSelectRepo = useMemoizedFn(async (value: string) => {
    useSettingStore.setState(
      produce((state) => {
        state.setting.sync.github.repo = value;
      }),
    );
    const branchesList = await getBranchesByRepo(token, user.name, value);
    if (branchesList) {
      setBranches(branchesList.map((i: { name: string }) => i.name));
    } else {
      message.error("获取分支列表失败");
    }
  });

  const handleSelectBranch = useMemoizedFn(async (value: string) => {
    useSettingStore.setState(
      produce((state) => {
        state.setting.sync.github.branch = value;
      }),
    );
  });

  useEffect(() => {
    if (token) {
      onLoadRepos();
    }
  }, [onLoadRepos, token]);

  useEffect(() => {
    if (!!branch && branches.length === 0 && token && !!repo) {
      handleSelectRepo(repo);
    }
  }, [branch, branches, handleSelectRepo, repo, token]);

  return (
    <Flex vertical gap={10}>
      <If condition={!token}>
        <div className="p-3  border border-[#f0f0f0] dark:border-[#2a2a2a] rounded-md">
          请先在【集成设置】中配置 Github Token
        </div>
      </If>
      <If condition={!!token}>
        <If condition={repos.length > 0 || !!repo}>
          <Space>
            <div>仓库：</div>
            <Select
              style={{ width: 400 }}
              onSelect={handleSelectRepo}
              value={repo}
            >
              {repos.map((i) => {
                return (
                  <Select.Option key={i} value={i}>
                    {i}
                  </Select.Option>
                );
              })}
            </Select>
          </Space>
        </If>
        <If condition={branches.length > 0 || !!branch}>
          <Space>
            <div>分支：</div>
            <Select
              style={{ width: 400 }}
              onSelect={handleSelectBranch}
              value={branch}
            >
              {branches.map((i) => {
                return (
                  <Select.Option key={i} value={i}>
                    {i}
                  </Select.Option>
                );
              })}
            </Select>
          </Space>
        </If>
        <Space>
          <div>路径前缀：</div>
          <Input
            style={{ width: 400 }}
            placeholder="如：sync/（可选）"
            value={pathPrefix}
            onChange={(e) => {
              useSettingStore.setState(
                produce((state) => {
                  state.setting.sync.github.pathPrefix = e.target.value;
                }),
              );
            }}
          />
        </Space>
      </If>
    </Flex>
  );
};

export default GithubSetting;
