# 发布版本

`.github/workflows/release.yml` 在推送 `v*` 标签时运行，也支持在 GitHub Actions 的 **Release → Run workflow** 中填写已有版本标签补跑。普通 main 分支推送和 PR 只运行 CI。

## 日常发版

先完成代码、更新 `CHANGELOG.md` 并提交，然后执行：

```sh
npm version patch -m "Release %s"
git push origin main --follow-tags
```

`npm version minor` / `npm version major` 用于次版本或主版本。CLI 版本从 `package.json` 读取，毋须手工修改代码。标签必须为 `v` 加上包的完整版本号，且 lockfile 版本一致。带预发布后缀的版本发布到 npm 的 `next`，其他版本发布到 `latest`。

流水线会：

1. 在 Windows 和 Ubuntu 上构建、测试、执行隔离安装，并验证所有示例的导出。
2. 在 Ubuntu 上重新构建版本标签对应的源码，生成含离线字体的 `score-text.tgz`。
3. 用 OIDC 发布 npm 包并生成 provenance；不需要 `NPM_TOKEN` 或手工输入发布验证码。
4. 校验公开 registry 的包完整性，创建 GitHub Release，附上安装包、四份 PDF、四份 YAML 和 `SHA256SUMS.txt`。

失败后可从 Actions 重新运行；已经发布的相同版本只有在完整性完全一致时才会跳过 npm 发布，不能覆盖不同内容的 npm 版本。修复后如需改动源码，应发布新版本。

## npm 可信发布配置

首次配置时包必须已经存在，维护者账号必须启用 2FA。本项目使用以下身份：

| 字段 | 值 |
| --- | --- |
| Provider | GitHub Actions |
| Organization / user | `TaiRuiQu` |
| Repository | `score-text` |
| Workflow filename | `release.yml` |
| Environment | 留空 |
| Allowed action | `npm publish` |

可以在 npm 包 Settings → Trusted publishing 配置，也可以由维护者运行：

```sh
npx --yes npm@11 trust github score-text --file release.yml --repo TaiRuiQu/score-text --allow-publish --yes --auth-type=web
```

配置过程在浏览器中验证 2FA；后续流水线自动使用 GitHub 签发的短期身份。`id-token: write` 和 `contents: write` 仅授予发布 job；验证 job 只有读取权限。流水线不缓存发布构建，不接收 npm 发布密钥。

参见 [npm 可信发布文档](https://docs.npmjs.com/trusted-publishers/) 和 [npm trust](https://docs.npmjs.com/cli/v11/commands/npm-trust/)。
