# Score Text v1 记谱规范

文件建议以 `.score.yaml` 结尾，UTF-8 编码。YAML 字段和乐器事件都是数据，不执行代码。需要 `version: 1`、`title`、`tracks`、`bars`。未知字段、重复字段、超出小节的时值均报错。

## 1. 总谱

```yaml
version: 1
title: 歌名
subtitle: 可选副标题
artist: 演唱者
composer: 词曲作者
lyricist: 词作者
arranger: 编配者
key: E
meter: 4/4
tempo: 122
capo: 4
fingering: C
note: 可选演奏说明
tracks:
  guitar: { type: tab, mode: cross, name: 吉他 }
  vocal: { type: numbered, lyrics: true, name: 人声 }
bars:
  - chords: Am
    guitar: "5:0/8 3:0/8 [1:0,2:0]/8 3:0/8 5:0/8 3:0/8 [1:0,2:0]/8 3:0/8"
    vocal:
      notes: "2/4 3/4 5/4 2/4"
      lyrics: [夜, 色, 正, 深]
```

`key` 默认 C，`meter` 默认 4/4，`tempo` 默认四分音符 100。调性支持 C、F#、Bb、Am 等常用大小调。简谱用首调音级；小调用相对大调的 1，例如 Am 的主音是 6。无八度标记的 1 定义在所属调主音的第 4 八度（C4、E4、G4 等），从而给出确定的 MIDI 音高。

`key` 是旋律的实际调性，和弦标签可以采用 `fingering` 指法调；`capo` 使吉他 MIDI 上移相应半音，不改变简谱音高。工具不自动推断和弦标签与实际调性的对应关系。

## 2. 时值和音高

短写 `音高/时值`，每个音符都写时值；音符之间用空格。`/4` 是四分音符，不是“4 拍”。

| 写法 | 含义 |
| --- | --- |
| `3/4` | 简谱 3，四分音符 |
| `6v/8` | 简谱低八度 6，八分音符 |
| `1^/4.` | 高八度 1，附点四分音符 |
| `1^^/2` | 高两个八度 1，二分音符 |
| `#4/8` / `b7/8` | 当前调内第 4 级升半音 / 第 7 级降半音 |
| `n4/8` | 回到调内第 4 级的原始音高 |
| `0/4` 或 `r/4` | 四分休止符 |
| `C4/4` / `F#5/8` | 绝对音高的五线谱事件 |
| `[C4,E4,G4]/2` | 同时发声的和弦，二分音符 |
| `[1,3,5]/4` | 简谱叠置和弦 |
| `3/8~ 3/8` | 两个同音高音符的延音线 |
| `1/8*3:2` | 八分三连音中的一个音符 |

时值分母支持 `1 2 4 8 16 32 64`，后面可加一个或两个附点。连音比 `*3:2` 表示“3 个本时值放进普通 2 个的时间里”。三连音示例：

```yaml
vocal: "1/8*3:2 2/8*3:2 3/8*3:2 5/4 3/2"
```

支持的连音比例必须能精确表示成整数 tick，常见 2、3、5、7 连音均可。简谱的临时升降号是**逐事件显式生效**，后续不带标记的音恢复调内音，不做传统手写谱的隐式沿用。五线谱 C4、C#4 等也始终表示绝对音高。

`^` / `v` 最多三个，不允许混用。简谱高低八度最终显示为上下圆点，长音显示横线，短音显示下划线。

## 3. 完整事件对象

紧凑写法与对象可以在同一数组中混用。对象必须给出 `duration`，并且恰好包含一种事件内容。

```yaml
vocal:
  notes:
    - { pitch: 3, duration: 8, lyric: 星 }
    - { pitch: 5, duration: "4.", lyric: 光, tie: true }
    - { pitch: 5, duration: 2, lyric: _ }
```

| 内容字段 | 示例 |
| --- | --- |
| `pitch` | `{pitch: "C#4", duration: 4}` |
| `pitches` | `{pitches: [C4, E4, G4], duration: 2}` |
| `rest` | `{rest: true, duration: 4}` |
| `strings` | `{strings: {"5": 3, "2": 1}, duration: 8}` |
| `drums` | `{drums: [kick, hat], duration: 8}` |
| `strum` | `{strum: down, duration: 8}` |

事件修饰字段：`lyric` 单音歌词，`tie: true` 延音到下一个同音高事件，`slur: start` / `slur: stop` 连音线，`dynamic: mf` 力度，`accent: true` 重音。

力度可选 `ppp pp p mp mf f ff fff sfz`。连音线可跨小节和换行；单个 voice 内不允许嵌套。延音线必须连接完全相同的音或和弦，可以跨小节。

## 4. 歌词

推荐用数组，一条事件对应一项，休止与延音也占一项：

```yaml
vocal:
  notes: "2/8 3/8 5/4~ 5/4 0/4"
  lyrics: [Sing-, ing, home, _, _]
```

也可写 `lyrics: "Sing- ing home _ _"`。中文请显式分音节，例如 `[我, 们, 出, 发]`，不会自动切字。一个音符唱多个字可写一个字符串，如 `"星光"`。英文单词末尾 `-` 在相邻音节之间显示连字符。

`_` 表示不打印歌词；`~` 表示从本小节的前一歌词音延续下划线。跨小节拖腔推荐直接使用 tie 加 `_`。若同时给出事件的 `lyric` 和外层 `lyrics`，外层数组覆盖事件内的歌词。

## 5. 声部

`tracks` 的对象顺序就是垂直排版顺序。ID 使用英文字母开头的字母、数字、下划线、连字符，不与 `meter`、`tempo` 等控制字段重名。

```yaml
tracks:
  voice: { type: numbered, name: 主唱, lyrics: true }
  guitar: { type: tab, name: 吉他, mode: frets }
  piano: { type: piano, name: 钢琴 }
  bass: { type: staff, name: 贝斯, clef: bass }
  drums: { type: drums, name: 鼓 }
```

`numbered` 默认启用歌词。其他声部可指定 `lyrics: true`。`name` 是显示名，默认不打印；设置 `layout.showTrackNames: true` 显示所有名字，或给单个 track 设置 `showName: true`。

### 多 voice

每个 voice 独立填满小节，不用用休止填“其他声部的空档”。同一 track 内 voice 的 `id` 唯一，跨小节请保持 ID，供连线定位。

```yaml
voice:
  voices:
    - id: lead
      notes: "1/4 2/4 3/2"
      lyrics: [我, 们, 唱]
    - id: harmony
      notes: "3/4 4/4 5/2"
      lyrics: [我, 们, 唱]
```

简谱多 voice 纵向分行；五线谱与鼓的多个 voice 共用谱表，交替使用向上/向下符干。

## 6. 吉他六线谱

`type: tab`，默认标准调弦。弦号 1 为最细的高音弦，6 为低音弦；谱面从上到下是 1 到 6 弦。`tuning` 按 **1→6 弦** 列出：

```yaml
tracks:
  guitar:
    type: tab
    mode: frets
    tuning: [E4, B3, G3, D3, A2, E2]
```

三种模式：

- `frets`：`5:3/8` 显示第 5 弦第 3 品，`[3:0,2:1,1:0]/4` 同时发声。
- `cross`：输入同上，音头显示叉号，对应第一张参考图的节奏/指弹谱。MIDI 在已知和弦图中按弦号取音，无可用图时使用写入的品位。
- `strum`：使用 `down/8 up/8 mute/8 r/8`；扫弦方向按手的动作命名，`down` 从低音弦扫向高音弦，因此在 TAB 页面上箭头向上。

死音可用 `3:x/8`，可用 `x` 的品位不会产生 MIDI 音。支持六弦吉他，品位 0–36。和弦图与弦事件各自定义，工具不自动生成指法或节奏型。

## 7. 和弦及指法图

单和弦：`chords: Am`，位于小节开头。多个和弦用 `beat` 显式定位：

```yaml
chords:
  - { name: C, beat: 1 }
  - { name: G, beat: 3 }
```

内置 C、Cm、C7、Cmaj7、D、Dm、D7、Dsus4、E、Em、E7、Em7、F、Fm、Fmaj7、G、G7、Gsus4、A、Am、A7、Am7、B、Bm、B7、Bm7、F#、F#m、Bb、C/G、D/F# 等常见指法。未知和弦仍打印名称；需要指法图时显式提供：

```yaml
chordShapes:
  Cadd9: [x, 3, 2, 0, 3, 0]
bars:
  - chords:
      - name: Cadd9
        beat: 1
        diagram: [x, 3, 2, 0, 3, 0]
        baseFret: 1
    # 此处继续填写本小节声部
```

指法图数组顺序是 **6→1 弦**，`0` 空弦，`x` 不弹，正整数是品位。与 `tuning` 顺序相反，采用常见吉他和弦图的左右顺序。`baseFret` 可显式给出起始品位，高把位默认按最小按弦品位推断。

## 8. 钢琴和打击乐

钢琴 `right` / `left` 分别映射高音和低音谱表，自动加大括号。可省略一只手，自动补全小节休止。

```yaml
piano:
  right: "[C4,E4,G4]/2 [D4,F4,A4]/2"
  left: "C3/4 G2/4 C3/4 G2/4"
```

同一只手多个 voice：

```yaml
piano:
  voices:
    - { id: melody, staff: right, notes: "G4/4 A4/4 C5/2" }
    - { id: inner, staff: right, notes: "E4/1" }
    - { id: bass, staff: left, notes: "C3/1" }
```

鼓件名：`kick snare hat openhat pedal crash ride tom1 tom2 floor`。示例：

```yaml
drums:
  voices:
    - { id: upper, notes: "hat/8 hat/8 [snare,hat]/8 hat/8 hat/8 hat/8 [snare,hat]/8 hat/8" }
    - { id: lower, notes: "kick/4 r/4 kick/4 r/4" }
```

镲片为叉头，鼓为实心/空心音头，使用打击乐谱号。MIDI 映射采用常用 GM 鼓号；`openhat` 与 `hat` 发声不同，v1 的显示位置和音头相同。

## 9. 拍号、速度和弱起

拍号分子 1–32，分母 `1 2 4 8 16 32 64`。每小节时值 = 分子 × 一个分母音符。4/4 一小节 4 个四分音符，6/8 一小节 6 个八分音符。

```yaml
bars:
  - meter: 6/8
    tempo: { bpm: 72, unit: "4." }
    vocal: "1/8 2/8 3/8 5/4."
  - vocal: "4/4. 3/4."
    tempoChanges:
      - { beat: 4, bpm: 80, unit: "4.", text: poco accel. }
```

`beat` 从 1 开始，单位是**当前拍号分母音符**：6/8 中的 `beat: 4` 是第四个八分音符，即第二个附点四分拍的开头。可用小数，例如 4/4 的 `beat: 2.5`。`tempo` 的单位若不写，始终是四分音符；不会因 6/8 自动变成附点四分。

小节 `meter` 和 `key` 从该处持续到下次变更；小节 `tempo` 从该处持续。`tempoChanges` 在指定点更换速度，并打印标记。输入数值 BPM 在 10–400 之间。

```yaml
bars:
  - tempo: 96
    ramp: { to: 120, bars: 2, text: accel. }
    vocal: "1/1"
  - vocal: "2/1"
  - ramp: { to: 72, bars: 1, text: rit. }
    vocal: "1/1"
```

`ramp` 从该小节起点的当前速度渐变，跨越指定小节数；在下一小节起点达到 `to`。默认显示 accel. / rit.。MIDI 每八分音符采样一次线性 BPM。渐变不能重叠、不能超出歌曲，也不能在覆盖范围另设 `tempo` 或 `tempoChanges`。显示标记由 `text` 定义，MIDI 的节拍单位沿用渐变起点。

弱起：给小节 `pickup: 4` 表示此小节只有一个四分音符，其他 voice 也必须恰好填满该时值。`pickup: "8"` 表示一个八分音符。不能超过当前拍号正常小节长度。

## 10. 重复片段、小节标记和排版

普通 YAML 对象，`patterns` 提供一层命名片段复用。`use` 是浅合并：小节显式字段覆盖 pattern 的整个字段，音符不会隐式拼接。

```yaml
patterns:
  groove:
    chords: C
    guitar: "5:3/4 3:0/4 2:1/4 1:0/4"
bars:
  - use: groove
    section: Verse
    vocal: "1/4 2/4 3/2"
  - use: groove
    chords: Am
    vocal: "3/4 2/4 1/2"
```

不允许 pattern 内嵌套 `use`。`section` 会在新的一行开始并显示名称。`expression` 显示演奏文字，例如 `espressivo`；它不改变 MIDI 速度。

`break: true` 在该小节前换行，`pageBreak: true` 换页。`repeatStart` / `repeatEnd` 打印反复线；`final: true` 打印终止线，最后一小节总是自动加终止线。反复线不展开 MIDI。

```yaml
layout:
  width: 1240
  height: 1754
  margin: 42
  barsPerSystem: 4
  systemGap: 40
  lyricSize: 27
  lyricFont: serif
  noteSize: 32
  titleSize: 42
  showBarNumbers: false
  showTrackNames: false
  chordDiagrams: true
  justifyLast: true
```

尺寸使用逻辑像素，PNG 可用 `--scale 2` 提升分辨率。过宽的单小节和过高的总谱会给出容量诊断，不会静默裁切。`barsPerSystem` 是上限而非固定数量；歌词宽时自动少放小节。

`lyricFont: serif` 使用参考图二的衬线英文歌词样式；`sans` 使用参考图一的无衬线歌词样式。

## 11. CLI 与边界

`validate` 校验语义并实际布局；`validate --syntax-only` 跳过页面容量校验。`inspect` 输出规范化 JSON 与时间轴，`schema` 输出编辑器 Schema，`guide` 输出本说明。`render` 输出单个格式，扩展名推断格式；用 `--format midi` 可覆盖推断。`init --template reference|strum|ensemble` 写入例子，除非 `--force`，否则拒绝覆盖。

所有示例都是完整可运行文件，见 `examples/`。大小限制：输入 5 MB、32 个 track、10000 小节；适用正常歌曲和小型合奏。源码 API：`parseScore(source)`、`renderScore(score)`、`exportScore(score, output)`、`toMidi(score)`、`toMusicXml(score)`。

v1 未覆盖完整出版雕版的所有避碰规则。建议把一首歌分成合理短句、避免同一五线谱 voice 的极密和弦与大量相邻临时记号，并检查最终 PNG/PDF。复杂五线谱编辑可导出 MusicXML 后接续专业软件。
