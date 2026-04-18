# AGENTS.md

本文件定义代理在这个知识库中的工作规则。

目标是维护一个可持续更新的知识库。

## Python 环境约定

- 当前仓库使用 `uv` 管理本地 Python 环境。
- 本地虚拟环境固定放在仓库根目录的 `.venv/`。
- 当前已创建的环境命令为：`uv venv .venv --python 3.12`
- 需要运行 Python 命令时，优先使用：
  - `uv run --python .venv/bin/python <command>`
  - 或先执行 `source .venv/bin/activate` 后再运行命令
- 除非用户明确要求，不要在该仓库中切换到其他环境管理方式。
- `.venv/` 属于本地开发环境，不纳入版本控制。

## 资料抓取工具约定

- 当前仓库使用本地 `Node.js` 工具抓取网页正文。
- 已选定的工具是 `defuddle`，用于把网页清洗为可读的 Markdown。
- 当前仓库也支持把网页直接保留为 PDF，用于归档原始版式。
- 依赖定义在仓库根目录 `package.json`，不要依赖全局安装。
- 首选命令：
  - `npm install`
  - `npm run fetch:pdf -- <url> <output.pdf>`
  - 如果 PDF 抓取失败，再使用 `npx defuddle parse <url> --md`
  - 或 `npm run fetch:md -- <url> --md`
- PDF 归档命令：
  - `npm run fetch:pdf -- <url> <output.pdf>`
- 网页类原始资料默认直接保存到 `raw/sources/<domain>/`，优先保存为 `pdf`。
- 只有在 PDF 抓取失败时，才把网页正文保存为 `md` 放到 `raw/sources/<domain>/`。
- 不要把网页原始资料放到 `raw/attachments/`。
- 如果页面抓取失败，再退回到直接网页读取或其他替代方案。

## 仓库定位

- 代理围绕 `raw/inbox -> raw/sources -> wiki` 的流转工作。
- 重点是来源归档、知识编译、知识页更新和结构维护。

## 顶层结构

```text
raw/inbox/
raw/sources/<domain>/
wiki/<domain>/
log/
```

领域名称由用户自行定义。

规则：
- 同一领域名称要在 `sources/`、`wiki/` 中保持一致。
- 领域一旦开始使用，尽量不要频繁改名。

## 各目录规则

### `raw/inbox/`
- 所有未处理输入先进入 `raw/inbox/`。
- `raw/inbox/` 不分领域。
- 这里允许低结构化内容。
- 不要把 `raw/inbox/` 当长期资料库使用。

### `raw/sources/<domain>/`
- 存放已处理、已确认领域归属的来源材料。
- 一篇来源对应一个文件。
- 网页来源优先保存为原始 `pdf`；如果 PDF 抓取失败，则退回保存为 `md`。
- 这里是原始资料归档层，不是综合知识层。

### `raw/attachments/<domain>/`
- 仅在确有补充附件资产时使用。
- 不在该目录中存放网页原始资料。

### `wiki/<domain>/index.md`
- 这是领域入口页。
- 维护该领域的重要知识页导航。
- 应优先链接高价值、长期有效的内容。
- 避免把 `index.md` 写成冗长正文。

### `wiki/<domain>/notes/`
- 存放该领域全部知识正文。
- 不继续按目录细分。
- 内容类型通过 frontmatter 标记，不通过深层目录表达。

### `log/`
- 记录知识库的重要维护行为。
- 包括来源处理、结构调整、批量更新、lint、重要合并等。
- 不记录低价值噪音。

## 处理流程

### 1. 收到新材料时
- 先判断是否已有同类来源或相关知识页。
- 新材料默认先进入 `raw/inbox/`，除非用户明确要求直接归档到某个领域。

### 2. 处理 `raw/inbox/` 时
- 判断该材料是否有长期价值。
- 无长期价值内容可以删除或忽略，不强制沉淀。
- 有长期价值内容，确认领域后移动到 `raw/sources/<domain>/`。
- 网页类来源默认先尝试抓成 PDF；失败后再转为 Markdown。

### 3. 更新知识库时
- 优先更新已有 `wiki/<domain>/notes/` 页面。
- 只有在现有页面无法合理承载新知识时，才新建页面。
- 不要因为新增了一篇来源，就机械地产生一篇新的知识页。

### 4. 回写高价值结果时
- 如果一次分析、问答、比较、归纳具有长期价值，应回写到 `wiki/<domain>/notes/`。
- 不让高价值内容只保留在聊天记录里。

### 5. 记录变更时
- 对重要知识更新，在 `log/` 中记录：
  - 处理了什么来源
  - 更新了哪些知识页
  - 是否存在冲突、分歧或待确认问题

## `wiki` 写作规则

### 总原则
- `wiki` 只写结构化知识，不写未处理摘抄。
- 内容以结论、定义、边界、关联、分歧为主。
- 避免流水账式记录。

### 目录策略
- 目录保持极简。
- 不新增 `topics/`、`concepts/`、`syntheses/` 子目录，除非用户明确要求扩展。
- 统一放在 `wiki/<domain>/notes/` 下。

### 页面类型
- 页面类型通过 frontmatter 的 `type` 标记。
- 推荐值：
  - `topic`
  - `concept`
  - `synthesis`

### 推荐 frontmatter

```yaml
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
```

### 页面命名
- 知识页命名应稳定、可复用、可持续更新。
- 优先使用主题名，而不是一次性标题。
- 避免：
  - `读后感`
  - `一些想法`
  - `临时总结`

推荐：
- `agent-memory.md`
- `rag-system-design.md`
- `product-discovery.md`

### 页面内容建议
- 推荐包含以下部分中的若干项：
  - 问题或定义
  - 当前结论
  - 关键分歧
  - 与其他笔记的关系
  - 来源依据
  - 待确认问题

## 来源页规则

- `raw/sources/<domain>/` 中的文件按来源组织，不按主题组织。
- 推荐命名格式：`YYYY-MM-DD-slug.<ext>`
- 优先扩展名：`pdf`
- PDF 抓取失败时可使用 `md`
- 这里存原始资料，不额外为每个来源再写一份摘要页。

## 何时新建知识页

仅在以下情况新建：
- 出现了此前不存在的重要主题
- 现有页面过于拥挤，拆分能明显提升可维护性
- 用户明确要求把某个问题独立成页

其余情况优先更新已有页面。

## 禁止事项

- 不要在 `wiki/` 中堆放未经处理的来源摘抄。
- 不要为了“看起来完整”而制造低价值页面。
- 不要无理由增加目录层级。
- 不要让同一知识同时在 `raw/sources/` 和 `wiki/` 中重复维护两份正文。
