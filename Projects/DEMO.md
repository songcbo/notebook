---
type: project
status: active
owner: songqiutao
start_date: 2026-03-01
milestone: M1
tags:
  - project
  - agent
---

# Agent 平台重构

## 项目目标
- 交付一个支持任务拆解、工具调用、结果汇总的 Agent 工作流 v0.1。

## 范围与里程碑
- M1：任务编排（截止 2026-03-06）
- M2：评测与回归（截止 2026-03-13）

## 任务清单
- [ ] 完成任务编排接口定义 📅 2026-03-04 🔺
- [ ] 接入日志追踪与错误分类 📅 2026-03-05
- [ ] 输出本周周报到 [[Planning/Weekly/2026-W10]]

## 决策记录（Decision Log）
- 2026-03-02：先用规则路由，再引入模型路由。
- 原因：先保证可控性和可调试性。

## 实验记录（Experiment Log）
- 2026-03-03：测试 3 种工具调用重试策略。
- 结果：指数退避 + 最大 3 次重试最稳定。

## 相关知识
- [[Knowledge/Work/多Agent编排框架对比]]
