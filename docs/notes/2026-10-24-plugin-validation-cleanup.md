# 插件校验收敛发行核对

一次性发行快照：SDK、模板、23 个插件和中心已发布，客户端未发布。

删除未知或多余字段即报错、重复解析与构建 imports 元信息，以及简介、关键词、Skill 和表单数量等无实际预算依据的限制。读取器提取协议字段；保留权限、身份、路径、来源、摘要、节点归属、协议版本、工作区/生命周期和整体资源预算。当前规则以架构与 SDK 契约为准。

## 包与部署

- SDK：0.42.0，npm 实际下载摘要 `sha512-lXeKtCAKh29FWin5+Z9LgEYQ3+DhoYm1t7Ri83hPK1xpm44QvbUOe7uJQ2lBVuB9B3NlSMsxcSZl4Jcg86zyEw==` 与本地包一致。
- UI：0.5.0，与 npm 字节一致，本批无需重复发布。
- API：Worker `ed896f93-1561-4344-ac5b-cf98c321d155`，源码 `403834d25`。
- 网页：Pages `dd9d6cfc`，源码 `b33c2c50b`；正式网页 JS 摘要与生产构建一致。
- 无数据库迁移、Secrets 或平台开关变更；桌面 0.59.4、移动 0.2.4 仅保留源码，没有发行安装包。

## 验证

SDK 255 项、中心 API 102 项与网页 96 项、桌面插件 107 项、移动插件 73 项和原生中心 6 项通过。两端及 SDK/中心类型检查、两端生产构建通过。24 仓候选和真实 npm 冻结安装、构建及已有测试通过；模板真实 npm 原锁冻结验证通过。全部真实 ZIP 的静态定义、已声明平台装配和未声明平台拒绝检查，以及真实上传取消检查通过。

24 个正式 CI 全部成功，GitHub ZIP 与中心 ZIP 的摘要/大小、发行源码、真实 npm 构建清单、文件 integrity 和目录最新版逐包一致。

整套 smoke 的中心/API/v1/v2/平台计数/详情/CORS/下载及协作 HTTPS/WSS 均已通过，最终在独立统计脚本 `https://stats.taunote.app/script.js` 失败，复查为 HTTP 410；没有降低检查或修改该服务。未做视觉走查或真机验收。

## 发行清单

| 仓库                                                                                                          | 版本   | 源码提交                                   | 中心 releaseId                         | ZIP SHA-256                                                        |
| ------------------------------------------------------------------------------------------------------------- | ------ | ------------------------------------------ | -------------------------------------- | ------------------------------------------------------------------ |
| [tau-plugin-abc](https://github.com/LastKnightCoder/tau-plugin-abc/releases/tag/v0.1.9)                       | 0.1.9  | `e3613c635e8cd86016238f3697f4a64c13e80812` | `49cb83ba-1fcb-457e-a20d-fbe610a8e37d` | `3a59aa485d82dfcbf2784ce59f1de5046a0c81a0da635e389b9172483dfe7da7` |
| [tau-plugin-bilibili](https://github.com/LastKnightCoder/tau-plugin-bilibili/releases/tag/v0.2.4)             | 0.2.4  | `36f1935b20283fa902ee6e400c9072c4d1618c86` | `da2ea4f0-3b35-4cc0-8e64-32341b6ef87b` | `b0e1cfade1c2b215a151994770a125af318eb933e6c44abea6c8e28c04d086b5` |
| [tau-plugin-custom-block](https://github.com/LastKnightCoder/tau-plugin-custom-block/releases/tag/v1.0.11)    | 1.0.11 | `d6b56835f2fab3706ef35def2574c240f3a5cd26` | `501cf93c-fc0e-41b2-b972-7120e7985ae7` | `06efc1cf1fe77c8a61f9a717012d23e1cc9a272f41cf3bbea3c9d86fd421037f` |
| [tau-plugin-github](https://github.com/LastKnightCoder/tau-plugin-github/releases/tag/v0.3.2)                 | 0.3.2  | `bbda1d35cd5d5b05fb55714c356534631da24a41` | `0cd2ab54-818f-47ec-a3f4-243f76c6fa97` | `3529dd718813f76df36845872d6ef9006d9c4afe56d07b357e0a89607218180b` |
| [tau-plugin-html](https://github.com/LastKnightCoder/tau-plugin-html/releases/tag/v0.1.8)                     | 0.1.8  | `aafedf71762baca693901e9c3fe18f643691b8c8` | `f56d2c59-16aa-40fa-8c1f-55d1b2193b90` | `4fe1b0ffd4efc069034fdfd796707c97a2a4c58a2fde5a4db6ebbf889f3efe48` |
| [tau-plugin-image-gallery](https://github.com/LastKnightCoder/tau-plugin-image-gallery/releases/tag/v0.1.4)   | 0.1.4  | `3f42f2094b97f9255765548eaf570c30c2873aa6` | `f8ced65d-6d7c-4278-8de8-a0067feb3854` | `9df9fd332f6362afa23b9fd9896ae065e16a9d204cef224ae73160df02eb28b6` |
| [tau-plugin-images-openai](https://github.com/LastKnightCoder/tau-plugin-images-openai/releases/tag/v0.2.7)   | 0.2.7  | `3cbc92c1a654ac4956becdba9860269dddf84d45` | `99249800-c7d2-4bf9-b484-3a6304960c05` | `b755c0c7bd5f3ff846b831d6d089b860a48018161f61aaad75ab994e4dfcc9f3` |
| [tau-plugin-oss](https://github.com/LastKnightCoder/tau-plugin-oss/releases/tag/v0.3.2)                       | 0.3.2  | `a538be6e171fd13aeb1b9c1f16887d3abc017331` | `c15348bb-71c3-4550-8d3c-69802387c67d` | `4aa0ac90affcb7e05a1d0b02d8413127916b164e744e7ef9ee022aad964ce82d` |
| [tau-plugin-publish-github](https://github.com/LastKnightCoder/tau-plugin-publish-github/releases/tag/v0.1.7) | 0.1.7  | `155a38c9179cb6640aac18c647fc2038a7c9288b` | `fc4d3b11-cead-4031-996b-497a5e6d39dd` | `be5447c33646d0ec4efea2c167eae035a739bd786605c072b3acde0679954e3b` |
| [tau-plugin-publish-s3](https://github.com/LastKnightCoder/tau-plugin-publish-s3/releases/tag/v0.1.7)         | 0.1.7  | `aeadf967ac5aaded47f597205b71fae90b0b5b35` | `ad7d1cdc-3bb6-4dbe-8a71-ac625afa257b` | `cf95f41876b6093975a21691b61973ee6d988eadf2d7093fe4b7c7eead2845d8` |
| [tau-plugin-questions](https://github.com/LastKnightCoder/tau-plugin-questions/releases/tag/v0.1.5)           | 0.1.5  | `3d7cdf0ae39d238ce44a706fee79a87a6bf07fa5` | `be177454-7e02-411f-9e23-63c4c187f6a8` | `f167b9c908a1fa5d14866310ddb84501b25ac6aec5ce8a9c7e1abe727e6949de` |
| [tau-plugin-s3](https://github.com/LastKnightCoder/tau-plugin-s3/releases/tag/v0.4.2)                         | 0.4.2  | `6e401511ffd7fff9913abec2bb6281b59529182a` | `ac199217-a0e8-49fd-913f-ea8cde511e42` | `07a969989753eb18744748fa5de7b94f1a259b4574f02007e66cc90259d5c4e4` |
| [tau-plugin-stickman](https://github.com/LastKnightCoder/tau-plugin-stickman/releases/tag/v0.1.10)            | 0.1.10 | `9338aff3679a57845eb786d630176c80abb8b384` | `87b0db02-6acf-4c73-8a16-cf1bfd18ba68` | `4ba41d62b1bec7532437fbac5700cb95768e3040bf85d3b5cd6edd4087abcc47` |
| [tau-plugin-template](https://github.com/LastKnightCoder/tau-plugin-template/releases/tag/v1.2.2)             | 1.2.2  | `a2a5abfc92f57b6aeed0b2633ac1fa1a599641f1` | `87360959-7261-475d-a61e-7f47e0a65680` | `23c9e3a1087e85cdefbb3f5684f6d85be56b39895e45c03754854e7c91c2bbb7` |
| [tau-plugin-tikz](https://github.com/LastKnightCoder/tau-plugin-tikz/releases/tag/v0.1.8)                     | 0.1.8  | `9081d8a1fc1ea6fc7c9e513be8657d60dec809de` | `227b1047-f6dd-4bc4-9784-24eb592dba46` | `c19b31f183f7244d710a200dd1ec9196b51de6ebb38c9b24d65baf14244f1c71` |
| [tau-plugin-tts-minimax](https://github.com/LastKnightCoder/tau-plugin-tts-minimax/releases/tag/v0.1.10)      | 0.1.10 | `90257f95f628824a4a181d070d095991d1b27051` | `5982b537-d52f-4318-85c3-84eaca8e3903` | `9aacca1e239f1d1feb074ab5e27af5f938d9bf2c68f20abe70474eb6e706de59` |
| [tau-plugin-tts-qwen](https://github.com/LastKnightCoder/tau-plugin-tts-qwen/releases/tag/v0.1.10)            | 0.1.10 | `61ffa17e4619009ff51bda6cff922cd20e354927` | `ede4221f-9370-480a-8e61-d4fec2a6a2b1` | `479ffae0882eaa387adf18a5dad0e6f3e38e86326ae07e87c2b99f83d114fc34` |
| [tau-plugin-typst](https://github.com/LastKnightCoder/tau-plugin-typst/releases/tag/v0.2.4)                   | 0.2.4  | `c501dafa5cc61adf1afb2f37d63f3bfe23055abd` | `97579261-2a7f-4dab-816d-372b41b07e5d` | `30192e17caac1441b651ee09e56b2ee649688303bf5a6cf9196e3bd19e01e565` |
| [tau-plugin-upload-github](https://github.com/LastKnightCoder/tau-plugin-upload-github/releases/tag/v0.3.2)   | 0.3.2  | `f24f3929beb5326504d4b6ff9f9a366db1065888` | `4ff88731-306d-4541-b503-fc88d4a985d0` | `ebf929e34827ca0d92bc56019c9b820f4cf155b9f1339cd525730dcb2d0e6b5a` |
| [tau-plugin-upload-oss](https://github.com/LastKnightCoder/tau-plugin-upload-oss/releases/tag/v0.3.2)         | 0.3.2  | `18342a0b94228542550c7bc36af9ee96981f3e96` | `4458d960-ae47-42ee-891f-38c3fa0ca99e` | `a0918461a71bee629a6387b701d567b63c4cdde7fa4c3da878146bc1d2f1321d` |
| [tau-plugin-upload-s3](https://github.com/LastKnightCoder/tau-plugin-upload-s3/releases/tag/v0.3.2)           | 0.3.2  | `5b1be16722636344535315fcc7a80426285b7321` | `f04f1b98-0921-4aa1-8edd-8d5ec1ca9f39` | `90fc12e92949424539ce9848c3c980b9ebcbd05e2c3cf0c085f42b86bc0fb09a` |
| [tau-plugin-webdav](https://github.com/LastKnightCoder/tau-plugin-webdav/releases/tag/v0.3.2)                 | 0.3.2  | `8fb3c984a26fc7e516e71929184738a23d05d8d9` | `45f6e2b5-1ef0-4d04-8374-8607d7a21f04` | `64c40d26b604dacfc493757c5b4ef8dfbf55090873055242a2e7ae28d97585e6` |
| [tau-plugin-weread](https://github.com/LastKnightCoder/tau-plugin-weread/releases/tag/v1.0.13)                | 1.0.13 | `ad003b3f7c0f67ea944fe1e8864adfdf7d230d13` | `23bb8764-3ceb-4576-bc34-9e2a871235d6` | `bcff0d91afdda2ac8f4ae3ade2c7b0a6fe7e6d839fccc1447a14ec16ed3fb8f3` |
| [tau-plugin-youtube](https://github.com/LastKnightCoder/tau-plugin-youtube/releases/tag/v0.2.4)               | 0.2.4  | `290928d4118c9735dd286e6a701491dfe7c88a47` | `a949d8db-77d5-44c1-a1a6-81ab05f39c4d` | `098aa1c05fb6ae9c91ce15e4c6ad1c4a922aff9ccbe12ea8934a93aab234a84b` |
