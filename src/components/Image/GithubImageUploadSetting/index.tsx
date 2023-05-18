import React, { useState } from "react";
import {Button, Drawer, Form, Input, Select} from "antd";
import {useGithubStore} from "../../../stores";
import {getBranchInfoList, getGitHubUserInfo, getRepoList} from "../../../utils";
import styles from './index.module.less';

interface IGithubImageUploadSettingProps {
  open: boolean;
  onClose: () => void;
}

const GithubImageUploadSetting: React.FC<IGithubImageUploadSettingProps> = (props) => {
  const { open, onClose } = props;

  const { token, setToken, repos, setRepos, setUserInfo, repo, setRepo, user, branches, setBranches, branch, setBranch } = useGithubStore(state => ({
    token: state.token,
    setToken: state.setToken,
    branch: state.branch,
    setBranch: state.setBranch,
    repos: state.repos,
    setRepos: state.setRepos,
    repo: state.repo,
    setRepo: state.setRepo,
    setUserInfo: state.setUserInfo,
    user: state.user,
    branches: state.branches,
    setBranches: state.setBranches,
  }));

  const [tokenValue, setTokenValue] = useState<string>(token);

  const handleSubmitToken = async () => {
    // 获取仓库列表
    const userInfo = await getGitHubUserInfo(tokenValue) as  any;
    if (userInfo) {
      setToken(tokenValue);
      const user = {
        owner: userInfo!.login,
        email: userInfo!.email,
      }
      setUserInfo(user);
      localStorage.setItem('github_token', tokenValue);
      localStorage.setItem('github_user', JSON.stringify(user));
      const repos = await getRepoList(userInfo.login, 1) as any;
      if (repos) {
        const repoNames = repos.map((i: any) => i.value);
        setRepos(repoNames);
        localStorage.setItem('github_repos', JSON.stringify(repoNames));
      }
    }
  }

  const handleSelectRepo = async (value: string) => {
    setRepo(value);
    localStorage.setItem('github_repo', value);
    const branches = await getBranchInfoList(user!.owner, value) as any;
    if (branches) {
      const branchNames = branches.map((i: any) => i.value);
      setBranches(branchNames);
      localStorage.setItem('github_branches', JSON.stringify(branchNames));
    }
  }

  const handleSelectBranch = (value: string) => {
    setBranch(value);
    localStorage.setItem('github_branch', value);
  }

  return (
    <Drawer
      title="Github 图床设置"
      placement="right"
      open={open}
      onClose={onClose}
      width={500}
    >
      <div className={styles.token}>
        <div>Token：</div>
        <Input value={tokenValue} onChange={(e) => {setTokenValue(e.target.value)}} />
        <Button type="primary" onClick={handleSubmitToken}>确定</Button>
      </div>
      {
        repos.length > 0 && (
          <Form style={{ marginTop: 20 }}>
            <Form.Item label="仓库">
              <Select onSelect={handleSelectRepo} value={repo}>
                {repos.map((i) => {
                  return <Select.Option key={i} value={i}>{i}</Select.Option>
                })}
              </Select>
            </Form.Item>
          </Form>
        )
      }
      {
        branches.length > 0 && (
          <Form style={{ marginTop: 20 }}>
            <Form.Item label="分支">
              <Select onSelect={handleSelectBranch} value={branch}>
                {branches.map((i) => {
                  return <Select.Option key={i} value={i}>{i}</Select.Option>
                })}
              </Select>
            </Form.Item>
          </Form>
        )
      }
    </Drawer>
  )
}

export default GithubImageUploadSetting;