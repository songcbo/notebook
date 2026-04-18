# Inbox 目录说明

## 目录定位
- 这个目录是输入缓冲区，不是长期存储。
- 分为两类：`Unprocessed`（未处理）与 `Processed`（已处理）。

## 怎么写
1. 所有临时输入先放 `Unprocessed`，不要求格式完美。
2. 看过并做最小整理后移到 `Processed`。
3. 有长期价值的内容再转入 `Knowledge`。
4. 无长期价值的信息可直接归档或删除，不强制沉淀。

## 流转关系
- 输入：浏览器链接、会议碎片、临时想法、待阅读资料。
- 输出：
  - 高价值 -> `Knowledge`
  - 任务导向 -> `Planning` 或 `Projects`
  - 低价值 -> 归档/删除

## 常见误区
- 把 Inbox 当资料库，长期不清理。
- 处理后不写结论，导致重复阅读。

## 字段说明（中文注释）
- `type`: 笔记类型，收件项用 `inbox`。
- `status`: `unprocessed` 或 `processed`。
- `captured_at`: 捕获时间。
- `source`: 来源链接或来源说明。
- `next_action`: 下一步动作，如 `move_to_knowledge`。
