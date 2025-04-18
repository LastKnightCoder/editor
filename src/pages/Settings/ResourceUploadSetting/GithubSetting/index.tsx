import { useEffect, useState } from "react";
import { Button, Flex, Input, message, Select, Space } from "antd";
import { produce } from "immer";

import useSettingStore from "@/stores/useSettingStore.ts";
import { getGithubUserInfo, getReposByOwner, getBranchesByRepo } from "@/utils";
import If from "@/components/If";
import { useMemoizedFn } from "ahooks";
import { EGithubCDN, GithubCDNOptions } from "@/constants/github";
const GithubSetting = () => {
  const { github } = useSettingStore((state) => ({
    github: state.setting.imageBed.github,
  }));

  const { token, repo, branch, user, cdn } = github;

  const [repos, setRepos] = useState<string[]>([]);
  const [branches, setBranches] = useState<string[]>([]);
  const [checkTokenLoading, setCheckTokenLoading] = useState(false);

  const handleSelectRepo = useMemoizedFn(async (value: string) => {
    useSettingStore.setState(
      produce((state) => {
        state.setting.imageBed.github.repo = value;
      }),
    );
    const branches = await getBranchesByRepo(token, user.name, repo);
    if (branches) {
      setBranches(branches.map((i: any) => i.name));
    } else {
      message.error("获取分支列表失败");
    }
  });

  const onCheckToken = useMemoizedFn(async (showLoading = true) => {
    if (showLoading) {
      setCheckTokenLoading(true);
    }
    const res = await getGithubUserInfo(token);
    if (res) {
      const { login, email } = res;
      useSettingStore.setState(
        produce((state) => {
          state.setting.imageBed.github.user = {
            name: login,
            email,
          };
        }),
      );
      const repos = await getReposByOwner(token, user.name);
      if (repos) {
        setRepos(repos.map((i: any) => i.name));
      } else {
        message.error("获取仓库列表失败");
      }
    } else {
      message.error("token 无效");
    }
    setCheckTokenLoading(false);
  });

  const handleSelectBranch = useMemoizedFn(async (value: string) => {
    useSettingStore.setState(
      produce((state) => {
        state.setting.imageBed.github.branch = value;
      }),
    );
  });

  const handleSelectCDN = useMemoizedFn(async (value: string) => {
    useSettingStore.setState(
      produce((state) => {
        state.setting.imageBed.github.cdn = value as EGithubCDN;
      }),
    );
  });

  useEffect(() => {
    if (!!repo && repos.length === 0 && token) {
      onCheckToken(false).then();
    }
  }, [onCheckToken, repo, repos, token]);

  useEffect(() => {
    if (!!branch && branches.length === 0 && token && !!repo) {
      handleSelectRepo(repo).then();
    }
  }, [branch, branches, handleSelectRepo, repo, token]);

  return (
    <Flex vertical gap={12}>
      <h2>基础设置</h2>
      <Space>
        <div>token：</div>
        <Space>
          <Input
            width={400}
            value={token}
            onChange={(e) => {
              useSettingStore.setState(
                produce((state) => {
                  state.setting.imageBed.github.token = e.target.value;
                }),
              );
            }}
          />
          <Button
            loading={checkTokenLoading}
            onClick={() => {
              onCheckToken();
            }}
          >
            确定
          </Button>
        </Space>
      </Space>
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
      <h2>CDN 设置</h2>
      <Select
        style={{ width: 400 }}
        options={GithubCDNOptions}
        value={cdn}
        onChange={handleSelectCDN}
      />
    </Flex>
  );
};

export default GithubSetting;
