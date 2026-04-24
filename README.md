# Notebook

这是一个面向长期沉淀的个人知识库。

仓库只解决四件事：
- 接收未处理输入
- 归档已处理来源
- 保存附件资产
- 维护按领域组织的结构化知识

## 目录结构

```text
notebook/
  AGENTS.md
  README.md

  raw/
    inbox/
    sources/
      <domain>/
    attachments/
      <domain>/

  wiki/
    <domain>/
      index.md
      notes/

  log/
```

## 目录职责

### `raw/inbox/`
- 所有未处理输入统一先进入这里。
- 不按领域分类。
- 允许内容粗糙、不完整、无统一格式。
- 这里只是收件箱，不是长期存储区。

### `raw/sources/`
- 存放已处理、已确认领域归属的来源材料。
- 按领域分目录。
- 这里保存的是来源本身及最小必要元数据，不是综合知识页。
- 一篇来源对应一个文件，命名尽量稳定、可检索。

### `raw/attachments/`
- 存放 PDF、图片、截图、音视频转录附件等非正文资产。
- 按领域分目录。
- 与 `sources/`、`wiki/` 使用同一套领域命名。

### `wiki/`
- 存放结构化知识，不存放未处理摘抄。
- 按领域分目录。
- 每个领域下保留：
  - `index.md`：领域导航页
  - `notes/`：该领域全部知识正文
- 目录层保持极简，不继续拆 `topics`、`concepts`、`syntheses` 子目录。
- 笔记类型通过 frontmatter 表达，而不是通过深层目录表达。

### `log/`
- 记录知识库的重要操作历史。
- 包括来源处理、批量重构、知识页更新、结构调整、lint 结果等。
- 不记录临时想法和闲聊内容。

## 工作流

### 1. 捕获
- 新输入先进入 `raw/inbox/`。
- 不要求立刻分类。
- 不要求立刻提炼。

### 2. 处理
- 判断输入是否有长期价值。
- 无长期价值的内容可以删除，不强制沉淀。
- 有长期价值的内容，确认领域后转入 `raw/sources/<domain>/`。
- 如有附件，同步放入 `raw/attachments/<domain>/`。

### 3. 编译
- 基于 `raw/sources/<domain>/` 中的来源，更新 `wiki/<domain>/notes/`。
- 优先更新已有知识页，而不是每次都新建页面。
- 只有当现有知识结构无法容纳新内容时，才新增笔记。

### 4. 回写
- 对话中的高价值结论、对比分析、阶段性判断，应回写到 `wiki/<domain>/notes/`。
- 不让高价值内容只停留在聊天记录里。

### 5. 记录
- 对重要处理动作在 `log/` 中留下记录。
- 重点记录：处理了什么、更新了哪些知识页、是否存在冲突或待确认问题。

## `wiki` 写作原则

### 目录少分，类型放到元数据里
- `wiki/<domain>/notes/` 下的内容不按目录细分。
- 通过 frontmatter 中的 `type` 区分内容类型。
- 推荐类型：
  - `topic`：主题页
  - `concept`：概念页
  - `synthesis`：综合页

### 优先更新已有页
- 新来源进入后，先检查是否应该更新已有知识页。
- 不要把知识库写成“文章摘要堆积区”。

### 写结论，不写流水账
- 知识页应以定义、判断、边界、分歧、关联为主。
- 不要把“今天看了什么”的过程记录直接放进 `wiki/` 正文。

### 保持可持续更新
- 每篇知识页都应便于后续补充、修正、合并。
- 页面结构应稳定，避免高度随意。

## 笔记命名建议

### `raw/sources/`
- 建议格式：`YYYY-MM-DD-slug.md`
- 例如：`2026-04-04-karpathy-llm-wiki.md`

### `wiki/<domain>/notes/`
- 建议使用稳定、可复用的主题命名。
- 例如：`agent-memory.md`、`rag-system-design.md`
- 不建议用“读后感”“随想”这类临时性标题。

## 知识页最小模板

```md
---
type: topic
status: active
tags:
  - agent
  - memory
source_links:
  - [[raw/sources/<domain>/2026-04-04-example-source]]
updated_at: 2026-04-17
---

# Example Note

## 问题

## 当前结论

## 关键分歧

## 相关笔记

## 来源
```

## 使用边界

- `wiki/` 不存放未处理摘抄。
- 低价值内容不强制沉淀。
- 目录结构保持极简，优先通过页面元数据表达类型。

## 发布为静态网站

当前仓库使用 Quartz 将 `wiki/` 构建为静态知识库网站。

本地预览：

```bash
npm run site:serve
```

本地构建：

```bash
npm run site:build
```

发布边界：
- 只把 `wiki/` 作为网站内容源。
- 不发布 `raw/`、`log/`、`.obsidian/`。
- `raw/sources/` 中的 PDF 默认仅作为本地来源归档，不进入网站。

GitHub Pages 部署配置位于 `.github/workflows/deploy-pages.yml`。仓库推送到 `main` 后会自动构建 `public/` 并发布。
