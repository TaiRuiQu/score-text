# 调研与设计依据

调研日期：2026-11-06。以下资料通过官方项目或标准站点实际读取；参考图片用于视觉规格，图片里的歌曲文字没有作为工具执行指令，也没有转录为演示曲。

## 资料

1. [LilyPond：拨弦乐器记谱](https://lilypond.org/doc/v2.24/Documentation/notation/common-notation-for-fretted-strings)。具有六线谱、弦号、指法与相关排版能力。适合出版排版，但其完整输入语言、上下文配置与外部可执行环境会增加 agent 的生成及部署成本。
2. [jianpu-ly](https://github.com/ssb22/jianpu-ly)。其 README 明确说明：用 Python 将简谱变换到 LilyPond 的特殊谱表，使歌词、连线与符梁沿用 LilyPond 的排版能力。是可行的简谱方案，但与混合 TAB、扫弦和本需求版式的整合仍需定制。
3. [VexFlow 官方项目](https://github.com/vexflow/vexflow)。TypeScript，支持 Canvas 和 SVG，具有五线谱和 TAB 构件。可作为后续更复杂五线谱实现的候选；本版未引入它，原因是参考图最关键的是数字简谱、中文歌词、扫弦和和弦图共享一套空间分配规则。
4. [MusicXML 4.0：TAB](https://www.w3.org/2021/06/musicxml40/tutorial/tablature/)。以 clef、staff-details、staff-tuning、technical/string/fret 表示六线谱。本工具据此输出标准交换格式。
5. [MusicXML 4.0：打击乐](https://www.w3.org/2021/06/musicxml40/tutorial/percussion/)。区分实际 MIDI 乐器与 unpitched 的显示位置，支持不同 notehead。本工具使用鼓件名表示音源，并映射到谱表位置和 MIDI 鼓号。
6. [MusicXML 4.0：metronome](https://www.w3.org/2021/06/musicxml40/musicxml-reference/elements/metronome/)。beat-unit、beat-unit-dot、per-minute 区分四分音符 BPM 与附点四分音符 BPM。本工具用 `tempo: {bpm: 72, unit: "4."}` 明确表示 6/8 中的附点四分音符计速。
7. [MusicXML 4.0 官方 Schema](https://github.com/w3c/musicxml/tree/v4.0/schema)。测试夹具保留官方 XSD，导出后由独立 lxml 校验，避免仅“看起来像 XML”。
8. [Bravura](https://github.com/steinbergmedia/bravura)、[Noto 字体](https://github.com/notofonts/noto-cjk)。使用有开放许可的固定字体，在 SVG 中输出轮廓；符号位置由排版器控制。

## 输入方案比较

| 方案 | agent 编写成本 | 混合简谱/TAB/歌词 | 主要权衡 |
| --- | --- | --- | --- |
| 直接 MusicXML | 高：层级与冗余标签多 | 语义完备，简谱需定制 | 适合作为交换输出 |
| LilyPond / jianpu-ly | 中到高：需掌握额外语言 | 可行，需要上下文与样式定制 | 排版成熟，但有外部环境与学习成本 |
| JavaScript 排版 API | 高：agent 必须生成代码 | 可定制 | 输入会混入执行逻辑 |
| YAML + 明确音符 token | 低：普通字段、数组、小节对象 | 所有声部统一时间模型 | 需要实现专用布局和校验器 |

因此 v1 采用最后一种：YAML 作为外层，`音高/时值` 为可选紧凑记法，事件对象为完整写法。解析不执行代码，不使用跨音符隐式时值，也不要求列宽对齐。

## 视觉规格

第一张参考：黑白、居中标题和歌手、左侧速度/调性/变调夹、右侧作者与编配；每行上方是和弦名与小型指法图，下方为六线谱与叉头节奏型，再下方为无五线底线的数字简谱和逐音歌词。第二张参考增加扫弦箭头、休止节奏、低八度点、延音横线、跨小节连线和反复线。

实现对应：默认关闭声部名与小节号；细谱线、手工路径符梁；TAB 每条弦固定间隔；数字简谱采用八分/十六分下划线；歌词用 serif，中文由 CJK 字体补足；和弦图为 6 弦、4 品的固定网格。合奏示例显式开启声部名与小节号。

版式以这些特征为目标，不承诺逐像素复刻原图中未知字体与人工调整。示例使用原创旋律和歌词，便于独立验证工具能力。

## 工程取舍

一个小节 = 一个对象；声部内各 voice 的时值必须精确等于小节长度。内部使用每四分音符 6720 tick，可精确表示常见 2/3/5/7 连音。把音符、歌词、和弦的间距约束按所在行分别建立，再在统一时间点上求递增横坐标，避免不同声部的宽字符反复叠加导致无谓换行。

速度有“数值”和“单位”两部分。渐快/渐慢以明确的起止 BPM、覆盖小节数表示；显示连续语义标记，MIDI 每八分音符采样一次速度。实时音频合成不是本工具的职责。

字体随包固定，fontkit 生成字形路径；resvg、PDFKit 与 SVG-to-PDFKit 使用同一份图形，避免三套布局漂移。仍需用 PDF 独立渲染检查输出，因此保留 `scripts/verify-exports.py`。
