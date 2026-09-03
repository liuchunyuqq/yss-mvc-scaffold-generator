# YSS MVC Scaffold Generator

这是一个可从 GitHub marketplace 安装的 Codex 插件仓库，用于初始化 YSS Java 8 数据分析项目。

## 安装

```bash
codex plugin marketplace add liuchunyuqq/yss-mvc-scaffold-generator --ref main
codex plugin add yss-mvc-scaffold-generator@personal
```

## 使用

安装后在 Codex 中说：

```text
使用 data-analysis-project-scaffold，在 C:\projects\sales-analysis 初始化项目。
项目名为 sales-analysis，基础包为 com.yss.dataanalysis.sales，数据库使用 oracle，并启用 Mock。
```

插件会先执行 dry-run；确认参数和空目标目录后再正式生成。生成器不会覆盖或删除非空目录，不会写入真实凭据，也不会自动创建 commit 或 remote。
