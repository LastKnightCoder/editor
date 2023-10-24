import { getOctokit, context } from '@actions/github';

import updatelog from './updatelog.mjs';

const token = process.env.GITHUB_TOKEN;

async function updater() {
  if (!token) {
    console.log('GITHUB_TOKEN is required');
    process.exit(1);
  }

  // 用户名，仓库名
  const options = { owner: context.repo.owner, repo: context.repo.repo };
  const github = getOctokit(token);

  // 获取 tag
  const { data: tags } = await github.rest.repos.listTags({
    ...options,
    per_page: 10,
    page: 1,
  });

  // 过滤包含 `v` 版本信息的 tag
  const tag = tags.find((t) => t.name.startsWith('v'));
  // console.log(`${JSON.stringify(tag, null, 2)}`);

  if (!tag) return;

  // 获取此 tag 的详细信息
  const { data: latestRelease } = await github.rest.repos.getReleaseByTag({
    ...options,
    tag: tag.name,
  });

  github.rest.repos.updateRelease({
    owner: context.repo.owner,
    repo: context.repo.repo,
    body: updatelog(tag.name),
    release_id: process.env.release_id,
    draft: false,
    prerelease: false
  })
}

updater().catch(console.error);