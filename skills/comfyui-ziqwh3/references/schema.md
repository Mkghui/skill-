# manju.json 结构

唯一的数据契约。**模型只管填这份 JSON**，Word 由 `render` 渲染、机械校正由 `fix` 做、质量门由 `validate` 跑——三者都不需要模型再介入。

```json
{
  "title": "剧名",
  "source": "原著书名",
  "params": {
    "episodes": 1,
    "minutesPerEpisode": 1,
    "genre": "东方仙侠 / 重修流",
    "aspectRatio": "16:9",
    "visualStyle": "全剧统一画风一句话",
    "shotSeconds": 8,
    "h3Format": "zh"
  },
  "characters": [
    {
      "id": "C01", "name": "顾清", "role": "男主，重修的道祖，寄居顾家旁支",
      "anchors": "十六岁少年，身形瘦削单薄，肤色苍白，黑发半长用旧布条松松束起，左腕内侧一圈青紫指印，洗得发白的青灰粗布儒衫。",
      "zImage": { "prompt": "…人物资产卡…", "negative": "…可选…" },
      "expr": [ { "emotion": "强装冷淡", "prompt": "眼皮半垂:1.4，嘴角拉平:1.5，眼神保持距离，下巴微收，无笑意。" } ],
      "qwenEdit": { "prompt": "…角色级换装/改装指令…", "note": "中文说明" }
    }
  ],
  "scenes": [
    { "id": "S01", "name": "顾家·西厢破屋", "inOut": "内", "time": "夜",
      "anchors": "土墙，破窗糊纸，缺角木桌，上方发黑房梁从梁心裂开，一盏将熄的油灯。",
      "zImage": { "prompt": "…场景环境图…" } }
  ],
  "props": [
    { "id": "P01", "name": "半块旧玉", "note": "原主母亲留下的唯一东西，压在木牌旁",
      "zImage": { "prompt": "…道具白底图…" } }
  ],
  "episodes": [
    { "ep": 1, "title": "残躯",
      "hook": "一粒道种穿过层层界壁，坠进少年心口",
      "hookShotId": "EP01-SH01",
      "suspense": "门外两人压低声音：那批货里头，到底装的是什么",
      "suspenseShotId": "EP01-SH08" }
  ],
  "shots": [
    {
      "id": "EP01-SH02", "ep": 1, "sceneId": "S01", "seconds": 8, "mode": "I2VA",
      "summary": "少年在破屋里睁眼，看见一根发黑的房梁",
      "shotSize": "中景", "camera": "固定机位，极缓前推",
      "characterIds": ["C01"], "propIds": [],
      "refs": { "Picture 1": "本镜首帧（Z-Image 场景图）" },
      "beats": [
        { "type": "action", "text": "少年仰面躺着，眼皮颤了两下，慢慢睁开一条缝，目光直直落在上方发黑的房梁上。" },
        { "type": "line", "speaker": "C01", "line": "……不是摔死的。", "delivery": "内心独白，极轻的气声" }
      ],
      "zImage": { "prompt": "…本镜首帧画面…", "negative": "…可选…" },
      "qwenImage": { "prompt": "…英文或中文的图生图指令…", "note": "中文说明" },
      "h3": { "zh": "全局设定：…\n0-2秒：…\n2-5秒：…\n5-8秒：…\n稳定约束：…", "en": "…可选，h3Format 需要时必填…" }
    }
  ]
}
```

## id 约定

| 对象 | 格式 | 备注 |
| --- | --- | --- |
| 人物 | `C01` | 说话人靠它引用；画外音说话人也建号，别用 `VO` 糊过去（`VO` 只留给「未露面、不建号」的旁白） |
| 场景 | `S01` | 同一地点换时段算同一个场景，时段写进 `time` |
| 道具 | `P01` | 只收有特写、承载剧情的；场景陈设留在 `scenes[].anchors` |
| 镜头 | `EP01-SH01` | 集号 + 两位镜号，全局唯一；数组顺序就是全片顺序 |

## params

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `episodes` | 是 | 总集数，正整数；镜头必须覆盖 1..episodes 每一集 |
| `minutesPerEpisode` | 是 | 单集分钟数，门按 `×60` 秒做 ±15% 时长对账 |
| `genre` | 是 | 题材，决定钩子与爽点写法 |
| `aspectRatio` | 是 | 画幅，写进每张图的提示词；缺省回落 `16:9` |
| `visualStyle` | 是 | 全剧统一画风一句话，跨镜一致性的总闸 |
| `shotSeconds` | 是 | 默认单镜秒数（漫剧用 8） |
| `h3Format` | 是 | `zh`（默认）/ `zh-en` / `en3`，见 `minimax-h3-standard.md` |

## characters 人物表

`id` / `name` / `role` / `anchors` 必填。`anchors` 是**一致性锚点**：每一镜的提示词都要逐字复用它，写不具体就等于放弃跨镜一致性。

- `zImage.prompt`：人物资产卡（版式要求见 `z-image-standard.md`）
- `expr[]`：该角色会用到的微表情，每条 `{emotion, prompt}`，prompt 必须带权重
- `qwenEdit`：角色级的换装 / 改装指令，可选（只在需要时写）

## scenes 场景表

`id` / `name` / `anchors` 必填；`inOut`（内 / 外）与 `time`（夜 / 黄昏 / 清晨）决定剧本里的场次标题，也提醒提示词写对光源。`zImage.prompt` 必须写光。

## props 道具表

可选。`name` 必填；`note` 写它承载什么（写不出来说明这不是叙事道具）；`zImage.prompt` 走白底 + 无手 + 比例参照的写法。

## episodes 分集

每集都要有：`title`、`hook`（钩子）、`suspense`（结尾悬念）、`hookShotId`、`suspenseShotId`。

**钩子与悬念不是标签，是画面**：`hook` 的具象必须落在该集首镜（`hookShotId` 必须等于首镜 id，且与首镜节拍文本有 ≥3 字的公共串），悬念同理落在末镜。写不出具象的钩子，等于这集没有钩子。

## shots 镜头

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `id` / `ep` / `sceneId` | 是 | 引用必须在表里存在 |
| `seconds` | 是 | 整数，4–15 秒（H3 上限）；漫剧默认 8 |
| `mode` | 是 | `T2VA` / `I2VA` / `FL2VA` / `L2VA` / `R2VA` |
| `summary` | 是 | 这一镜拍什么，一句话 |
| `shotSize` / `camera` | 是 | 景别与运镜，运镜按 `minimax-h3-standard.md` 的写法给「类型 + 幅度 + 速度 + 目标」 |
| `characterIds` / `propIds` | 是 | 数组，可为空数组 |
| `refs` | 是 | `Picture N` → 职责，编号从 1 连续 |
| `beats[]` | 是 | 节拍流：`{type:"action",text}` 与 `{type:"line",speaker,line,delivery}` 交替 |
| `flashback` | 否 | 布尔。标了就是闪回镜，`scene-backtrack` 门不把它算进场次往复 |
| `actionShot` | 否 | 布尔。标了就是动作镜（打斗 / 施法 / 飞行 / 炼丹 / 突破），`h3-action` 门按打斗施法标准逐条查 |
| `zImage` | 是 | 本镜首帧画面 |
| `qwenImage` | 是 | 本镜的图生图指令（在资产图上改出这一镜） |
| `h3` | 是 | `zh` 必有（`h3Format` 为 `en3` 时可省），`en` 按 `h3Format` |

节拍写法：**动作只写 AI 见过千万次的常见动作**（推门、抬头、攥住物件），精巧动作（伸篙一挡、睫毛轻颤）生成必崩；台词口语、单句一口气、谁的话像谁。

## 校验：22 道质量门

```bash
node scripts/ziqwh3.mjs validate manju.json
```

【逻辑层 11 道】

| 门 | 拦什么 |
| --- | --- |
| `ep-continuity` | 分集不连续、某集没镜头、`episodes` 条目或 title/hook/suspense 为空 |
| `refs-valid` | 镜头引用了未登记的角色 / 场景 / 道具；人物或场景缺必填字段 |
| `time-budget` | 单集总时长超出 ±15% |
| `shot-seconds` | 单镜不是 4–15 的整数秒；mode 非法 |
| `line-length` | 单句台词 > 35 字 |
| `line-density` | 单镜台词总量 > 秒数 × 5 字；单镜超过 3 句 |
| `speaker-valid` | 说话人不在人物表；台词缺 `delivery` |
| `beat-mix` | 镜头没有动作节拍（纯对白镜没有画面可写）；动作节拍不足 8 字（是标签不是画面）；动作节拍超过 4 个（一镜只做一件事） |
| `ep-hook` | 钩子没落在首镜、悬念没落在末镜（含公共串 <3 字的检查） |
| `character-usage` | 登记了却一镜没用的角色 / 场景 |
| `scene-backtrack` | 同一集内角色的场次往复（S01 → S03 → S01）：不是闪回就把同场次镜头并到一起，是闪回就标 `flashback` |

【提示词层 9 道】

| 门 | 拦什么 |
| --- | --- |
| `zimage-structure` | 缺画质词 / 风格词、提示词 <40 字、没写画幅（警告） |
| `zimage-asset` | 人物不是资产卡版式；场景没写光；阵法/结界类场景没写符文/图腾/能量/光效/流转 |
| `zimage-microexpr` | 微表情没有权重写法；情绪戏而角色没登记微表情（警告） |
| `zimage-prop` | 器物（道具 / 武器 / 符箓 / 阵盘 / 秘籍）缺材质、缺光效、没交代承载、用了「好看 / 厉害」这类抽象词、缺 `note` |
| `qwen-structure` | 没写修改指令 / 没写保留从句 / 没指明参考图分工 |
| `h3-structure` | H3 缺全局设定或稳定约束段、分时段不是 3 段或边界不连续、末段没落在镜头时长上 |
| `h3-boilerplate` | 缺「镜头方式 / 声音 / 字幕」固定行；字幕行没写明无字幕 |
| `h3-mode-align` | 模式与提示词不匹配（I2VA 没写首帧、FL2VA 没写尾帧、R2VA 没写参考分工；英文专业版的对齐句） |
| `h3-action` | 动作镜（`actionShot: true`）缺力因果链、缺特效/光效、音效行没有具体声响、图生图没写景别；特效词堆砌与没有慢动作/定格收尾给警告；看着像动作镜却没标的给嗅探警告 |
| `h3-refs` | `Picture` 编号不连续、职责为空、I2VA 缺 Picture 1、FL2VA 缺首尾帧 |
| `h3-length` | 英文提示词 > 7000 字符 |

**还有一类代码查不了的剧情逻辑**（因果、信息差、动机、能力边界……）在 `adaptation-pass.md` 的自检清单里，写完戏照着过一遍。