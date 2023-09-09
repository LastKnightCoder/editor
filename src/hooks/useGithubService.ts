import useSettingStore from "@/stores/useSettingStore.ts";

import {
  getGithubUserInfo,
  getReposByOwner,
  getBranchesByRepo,
} from "@/utils";

const useGithubService = () => {
  const {
    github,
  } = useSettingStore(state => ({
    github: state.setting.imageBed.github
  }));

  const { token, repo, user } = github;

  const getUserInfo = async () => {
    return getGithubUserInfo(token);
  }

  const getRepos = async () => {
    const { name: owner } = user;
    return getReposByOwner(token, owner);
  }

  const getBranches = async () => {
    const { name: owner } = user;
    return getBranchesByRepo(token, owner, repo);
  }

  return {
    getUserInfo,
    getRepos,
    getBranches,
  }
}

export default useGithubService;