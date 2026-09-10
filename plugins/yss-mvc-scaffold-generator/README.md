# YSS MVC Scaffold Generator Plugin

这个插件把 YSS MVC 数据分析项目初始化工具带入 Codex 和 Claude Code。安装后，Agent 可以直接调用 `yss-mvc-scaffold-generator` Skill，在空目录生成独立的 `project-instance` Maven 工程，或为已克隆的 MVC 项目恢复相邻 `skillUtils`。

两个平台共用同一份插件目录与 Skill，只是清单文件不同：Codex 读取 `.codex-plugin/plugin.json`，Claude Code 读取 `.claude-plugin/plugin.json`。两份清单的插件名、版本和描述保持一致。

## 从 GitHub 配置

Codex 终端：

```bash
codex plugin marketplace add liuchunyuqq/yss-mvc-scaffold-generator --ref main
codex plugin add yss-mvc-scaffold-generator@personal
```

Claude Code 终端（或在会话内使用 `/plugin marketplace add` 与 `/plugin install`）：

```bash
claude plugin marketplace add liuchunyuqq/yss-mvc-scaffold-generator
claude plugin install yss-mvc-scaffold-generator@personal
```

如果本机已有同名 marketplace，先运行 `codex plugin marketplace list` 或 `claude plugin marketplace list`，再把安装命令中的 `@personal` 替换为实际 marketplace 名称。安装后新建任务或会话，确保 Skill 被重新加载。

## 使用

直接对 Codex 或 Claude Code 说明目标目录、项目名、Java 包名和数据库类型，例如：

```text
使用 yss-mvc-scaffold-generator，在 C:\projects\sales-analysis 初始化项目。
项目名为 sales-analysis，基础包为 com.yss.dataanalysis.sales，数据库使用 oracle，并启用 Mock。
```

Skill 会先执行 dry-run。确认目标目录为空且参数正确后，再执行正式生成。生成器不会覆盖或删除非空目录，不会写入真实数据库凭据，也不会自动创建 commit 或 remote。初始化阶段不执行 Maven 或下载依赖；settings 缺失不会导致文件结构不完整，后续验证时再显式使用 `-s <settings.xml>`。

## 发布与升级

插件源代码位于本仓库的 `plugins/yss-mvc-scaffold-generator`，marketplace 索引位于 `.agents/plugins/marketplace.json`（Codex）和 `.claude-plugin/marketplace.json`（Claude Code）。其中 `yss-mvc-scaffold-generator` Skill 必须通过仓库根 `scripts/sync-from-source.ps1` 从 `source.json` 声明的模板源同步，不直接维护插件内副本。发布新版本时同步更新 `.codex-plugin/plugin.json` 与 `.claude-plugin/plugin.json` 的 `version`，提交并推送后，成员执行：

Codex：

```bash
codex plugin marketplace upgrade personal
codex plugin remove yss-mvc-scaffold-generator
codex plugin add yss-mvc-scaffold-generator@personal
```

Claude Code：

```bash
claude plugin marketplace update personal
claude plugin update yss-mvc-scaffold-generator@personal
```
