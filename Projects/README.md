# Projects 目录说明

## 目录定位
- 这个目录只放“正在推进”的工作项目，尤其是你的 Agent 开发项目。
- 项目页是执行中心：目标、任务、决策、实验都在这里。

## 怎么写
1. 每个项目一篇主文档，文件名建议是项目名，例如 `Agent 平台重构.md`。
2. 每周至少更新一次项目状态，保持和 Planning 同步。
3. 任务统一用 Tasks 语法，方便在 Planning 汇总。
4. 决策与实验先写在项目页，跨项目可复用时再抽象到 Knowledge。

## 推荐章节
- 项目目标
- 范围与里程碑
- 任务清单
- 决策记录（Decision Log）
- 实验记录（Experiment Log）
- 本周状态

## 流转关系
- 输入：来自 Planning 的任务推进、Inbox 处理后的新需求。
- 输出：项目经验和方法沉淀到 `Knowledge/Work`。

## 常见误区
- 给每个小任务单独建项目页，导致维护成本过高。
- 决策和实验散落在 Daily，后续难以回溯。

## 字段说明（中文注释）
- `type`: 笔记类型，项目页用 `project`。
- `status`: `active/paused/done`。
- `owner`: 负责人，个人项目可写自己。
- `start_date`: 开始日期。
- `milestone`: 当前里程碑编号或名称。
- `tags`: 建议包含 `project` 与技术主题。
