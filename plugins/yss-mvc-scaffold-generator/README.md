# YSS MVC Scaffold Generator Codex Plugin

这个插件把 YSS 数据分析项目初始化工具带入 Codex。安装后，Codex 可以直接调用 `data-analysis-project-scaffold` Skill，在空目录生成独立的 `project-instance` Maven 工程。

## 从 GitHub 配置

在 Codex 终端执行：

```bash
codex plugin marketplace add liuchunyuqq/yss-mvc-scaffold-generator --ref main
codex plugin add yss-mvc-scaffold-generator@personal
```

如果本机已有同名 marketplace，先运行 `codex plugin marketplace list`，再把安装命令中的 `@personal` 替换为实际 marketplace 名称。

## 使用

直接对 Codex 说明目标目录、项目名、Java 包名和数据库类型，例如：

```text
使用 data-analysis-project-scaffold，在 C:\projects\sales-analysis 初始化项目。
项目名为 sales-analysis，基础包为 com.yss.dataanalysis.sales，数据库使用 oracle，并启用 Mock。
```

Skill 会先执行 dry-run。确认目标目录为空且参数正确后，再执行正式生成。生成器不会覆盖或删除非空目录，不会写入真实数据库凭据，也不会自动创建 commit 或 remote。

## 发布与升级

插件源代码位于本仓库的 `plugins/yss-mvc-scaffold-generator`，marketplace 索引位于 `.agents/plugins/marketplace.json`。发布新版本时同步更新 `.codex-plugin/plugin.json` 的 `version`，提交并推送后，成员执行：

```bash
codex plugin marketplace upgrade personal
codex plugin remove yss-mvc-scaffold-generator
codex plugin add yss-mvc-scaffold-generator@personal
```
