import Axios from 'axios'
import {message} from "antd";
import { useGithubStore } from "../stores";

const axios = Axios.create({
  baseURL: 'https://api.github.com',
  // 五分钟
  timeout: 300000
})

axios.defaults.headers['Content-Type'] = 'application/json'

// 响应拦截器
axios.interceptors.response.use(
  (response) => {
    return response
  },
  (error) => {
    if (!error?.response) {
      message.error('图片上传失败');
    }
    return Promise.reject(error.response)
  }
)

interface IRequestConfig {
  method: string
  params?: any
  headers?: any
  [key: string]: any
}

const request = (config: IRequestConfig) => {
  let { token } = useGithubStore.getState();
  if (!token) {
    token = localStorage.getItem('github-token') || '';
  }
  const requestConfig = {} as IRequestConfig;

  config.method = config.method.toUpperCase()

  for (const configKey in config) {
    if (configKey === 'params') {
      if (config.method === 'GET') {
        requestConfig.params = config.params
      } else {
        requestConfig.data = config.params
      }
    } else {
      requestConfig[configKey] = config[configKey]
    }
  }

  if (token) {
    requestConfig.headers = {
      ...requestConfig.headers,
      Authorization: `token ${token}`
    }
  }

  return new Promise((resolve) => {
    axios
      .request(requestConfig)
      .then((res) => {
        const { status, data } = res
        if (res && (status === 200 || status === 201 || status === 204)) {
          resolve(data || 'SUCCESS')
        } else {
          resolve(null)
        }
      })
      .catch((err) => {
        if (requestConfig?.success422 && err?.status === 422) {
          resolve(err?.data || 'SUCCESS')
        } else {
          resolve(null)
        }
      })
  })
}

export const uploadSingleImage = (content: string, fileName: string) => {
  let { branch, repo, user } = useGithubStore.getState();
  if (!branch) {
    branch = localStorage.getItem('github-branch') || 'master';
  }
  if (!repo) {
    repo = localStorage.getItem('github-repo') || 'image-for-2023';
  }
  if (!user) {
    user = {
      owner: localStorage.getItem('github-owner') || 'LastKnightCoder',
      email: localStorage.getItem('github-email') || ''
    };
  }

  const path = fileName;

  const {
    owner,
    email
  } = user;

  return request({
    method: 'PUT',
    url: `/repos/${owner}/${repo}/contents/${path}`,
    data: {
      branch,
      message: `upload image ${path}`,
      content,
      commiter: {
        name: owner,
        email
      }
    }
  });
}

// 将 Github URL 替换为 CDN URL
export const replaceGithubUrlToCDNUrl = (url: string) => {
  let { branch } = useGithubStore.getState();
  if (!branch) {
    branch = localStorage.getItem('github-branch') || 'master';
  }
  return url.replace('https://raw.githubusercontent.com', 'https://cdn.staticaly.com/gh').replace(`/${branch}`, `@${branch}`);
}

export const getGitHubUserInfo = (token: string) => {
  return request({
    url: '/user',
    method: 'GET',
    headers: { Authorization: `token ${token}` }
  })
}

export const getRepoList = (owner: string, page = 1) => {
  // eslint-disable-next-line no-async-promise-executor
  return new Promise(async (resolve) => {
    const tmpList: any = await request({
      url: `users/${owner}/repos`,
      method: 'GET',
      params: {
        type: 'owner', // all | owner | member
        sort: 'created', // created | updated | pushed | full_name
        direction: 'desc', // asc | desc
        per_page: 100,
        page
      }
    })

    if (tmpList && tmpList.length) {
      resolve(
        tmpList
          .filter((v: any) => !v.fork && !v.private)
          .map((x: any) => ({
            value: x.name,
            label: x.name
          }))
      )
    } else {
      resolve(null)
    }
  })
}

export const getBranchInfoList = (owner: string, repo: string): Promise<any> => {
  // eslint-disable-next-line no-async-promise-executor
  return new Promise(async (resolve) => {
    const tmpList: any = await request({
      url: `/repos/${owner}/${repo}/branches`,
      method: 'GET'
    })

    if (tmpList && tmpList.length) {
      resolve(
        tmpList
          .filter((x: any) => !x.protected)
          .map((v: any) => ({
            value: v.name,
            label: v.name
          }))
          .reverse()
      )
    } else {
      resolve(null)
    }
  })
}
