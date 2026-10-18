import Axios from "axios";

const axios = Axios.create({
  baseURL: "https://api.github.com",
  timeout: 300000,
});

axios.defaults.headers["Content-Type"] = "application/json";

export const getGithubUserInfo = async (token: string) => {
  if (!token) return null;
  const res = await axios.get("/user", {
    headers: {
      Authorization: `token ${token}`,
    },
  });
  if (res.status === 200) {
    return res.data;
  }
  return null;
};

export const getReposByOwner = async (token: string, owner: string) => {
  if (!token || !owner) return null;
  const res = await axios.get(`/users/${owner}/repos`, {
    params: {
      type: "owner",
      sort: "updated",
      direction: "desc",
      per_page: 100,
      page: 1,
    },
    headers: {
      Authorization: `token ${token}`,
    },
  });
  if (res.status === 200) {
    return res.data;
  }
  return null;
};

export const getBranchesByRepo = async (token: string, owner: string, repo: string) => {
  if (!token || !owner || !repo) return null;
  const res = await axios.get(`/repos/${owner}/${repo}/branches`, {
    headers: {
      Authorization: `token ${token}`,
    },
  });
  if (res.status === 200) {
    return res.data;
  }
  return null;
};
