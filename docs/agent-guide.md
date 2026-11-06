# Agent 使用约定

此工具不调用任何大模型。agent 生成 YAML，调用 CLI 校验，根据诊断修复，再输出文件即可。不要让用户手动对齐文本列。

## 可作为 agent 提示词的核心规则

你使用 Score Text v1 编写乐谱。输出 UTF-8 YAML；字段必须来自 `score-text schema`。包含 `version: 1`、`title`、`tracks` 和 `bars`。

1. 每个 bars 元素是一个小节。每个 voice 独立填满当前拍号。4/4 = 4 个四分音符，6/8 = 6 个八分音符。
2. 音符显式写时值。简谱 `3/8`；休止 `r/4`；五线谱 `C#4/4`；吉他 `5:3/8`；鼓 `hat/8`。同时音 `[C4,E4,G4]/4`；复杂事件用 `{pitch: C4, duration: 4}`。
3. 吉他 `mode: cross` 用弦号/品位输入、显示叉头。`mode: strum` 用 down/up/mute/r。五线谱与钢琴用绝对音高，简谱用 1–7、^/v、#/b/n。
4. 歌词推荐数组，每个事件一项，休止和延音用 `_`。中文每音节单独一项；英文音节用末尾 `-`。歌词绝不靠空格列宽定位。
5. 多 voice 用 `voices` 数组，每个 voice 的 id 跨小节保持稳定。钢琴可用 `right`/`left` 或指定 `staff: right|left` 的 voices。
6. `meter`/`key` 在小节开头变更并持续；`tempo` 可为 BPM 数字或 `{bpm: 72, unit: "4."}`。小节内速度用 `tempoChanges`；渐变用 `ramp: {to: 120, bars: 2}`。
7. 先调用 `validate --json`，只在成功后 `render --json`；遇到诊断修复目标路径后重试。不得通过删除用户要求的声部或歌词来消除错误。
8. 需要精确版式时读取 `layout` 和示例，渲染 PNG 后检查；不要通过篡改音符时值来调整横向间距。

## 推荐工作流

```sh
score-text guide
score-text init draft.score.yaml --template ensemble
# 编辑 draft.score.yaml
score-text validate draft.score.yaml --json
score-text render draft.score.yaml -o preview.png --json
# 看图检查后输出最终格式
score-text render draft.score.yaml -o final.pdf --json
score-text render draft.score.yaml -o audition.mid --json
```

当总时值有误，诊断中的数值以四分音符为单位。比如 6/8 应为 3；要补的不是“3 个拍号计数”而是缺少的 tick 时长。可以 `inspect` 查看每个事件的 `start`、`ticks`。

输入可通过 stdin 提交：

```sh
score-text validate - --json
score-text render - -o final.pdf --json
```

同一 stdout 仅返回成功 JSON，诊断 JSON 在 stderr，便于程序分别处理。检查退出码并解析 `ok`，多页输出按返回的 `files` 使用，不能假设 SVG 总是只生成一个文件。

## 结果检查

- 每个 voice 的总时值符合当前小节，歌词数与事件数一致。
- 6/8 的速度单位明确是四分还是附点四分，beat 定位按八分音符计算。
- 和弦指法图数组 6→1 弦，调弦数组 1→6 弦。
- 转拍、转调、反复线、歌词拖腔与跨行连线的位置合理。
- PDF/PNG 视觉结果符合需要。MusicXML 是可编辑语义输出，外部软件会重新排版。

本工具不从原始音频或图片推断音符，agent 应具备用户提供的音符数据或明确说明编写的是原创示例/改编。
