# ComfyUI-ZIQWH3 剧本创作

仓库 <https://github.com/Mkghui/skill-> ｜ 最新包 [Releases](https://github.com/Mkghui/skill-/releases)

技能名 `comfyui-ziqwh3`（人看的名字：ComfyUI-ZIQWH3 剧本创作）。把**小说正文**改编成**短剧漫剧剧本**：先把小说读成「集 → 场 → 镜 → 节拍 → 台词」，再为**每一镜**配齐三段可直接粘贴进 ComfyUI 的模型提示词，最后交付一份 Word。

| 交付 | 内容 |
| --- | --- |
| **Z-Image（文生图）** | 人物资产卡（左半身像 + 右三视图）、场景分层图、道具白描图，以及每一镜的**首帧** |
| **Qwen-Image（图生图）** | 在资产图上改出这一镜的动作 / 表情 / 换装 / 融合——修改指令 + 保留从句 + 参考图分工 |
| **MiniMax H3（图生视频）** | 官方标准结构（全局设定 + 分时段 + 稳定约束），含 T2VA / I2VA / FL2VA / L2VA / R2VA 五种模式与首尾帧对齐规则 |
| **Word** | 五章一体：人物 / 场景 / 道具 / 分集剧本 / 逐镜提示词，A4 横排，提示词是等宽灰底整块，三击选中即可复制 |

三类提示词的格式标准逐条提炼成本仓库 `references/` 下的五份标准文件；**22 道质量门**全部由脚本确定性检查，机械问题由 `fix` 直接改，内容问题逐条回给模型（`fix` 不造内容）。

## 安装

依赖只有 **node ≥ 18**（只用标准库，无 npm 依赖）。

方式一，拷进技能目录：

```bash
git clone https://github.com/Mkghui/skill-.git
cp -r skill-/skills/comfyui-ziqwh3 ~/.codex/skills/          # Windows: %USERPROFILE%\.codex\skills\
```

方式二，用 skill-installer 从仓库路径安装：

```bash
python skill-installer/scripts/install-skill-from-github.py \
  --repo Mkghui/skill- --path skills/comfyui-ziqwh3
```

## 快速上手

```bash
# 0) 读小说正文（.docx / .txt / .md，带段号，长篇小说可分段读）
node scripts/ziqwh3.mjs readdoc 小说.docx --range 1-200

# 1) 按 references/schema.md 建 manju.json —— 这一步是模型干的活：改编 + 写提示词
#    人物与场景的「一致性锚点」写具体，后面每一镜都逐字复用它

# 2) 校验 → 机械校正 → 逐条改到 0 错（改完重跑，直到通过）
node scripts/ziqwh3.mjs validate manju.json
node scripts/ziqwh3.mjs fix      manju.json --write

# 3) 出 Word
node scripts/ziqwh3.mjs render manju.json --docx 我的剧本.docx
node scripts/ziqwh3.mjs render manju.json --split --docx 我的剧本.docx          # 三段合一 + 三份分模型稿
node scripts/ziqwh3.mjs render manju.json --ep 1,2 --split --docx 我的剧本.docx  # 按集拆，每集一套
node scripts/ziqwh3.mjs render manju.json --page portrait                        # 默认 A4 横排
```

## 22 道质量门

`validate` 全跑，逐条可解释；`render` 有错拒出稿（`--force` 可强出）。

| 层 | 门 |
| --- | --- |
| **逻辑 11** | 分集连续、引用对账、每集时长 ±15%、单镜 4–15 秒、单句台词 ≤35 字、单镜台词 ≤秒数×5 字、说话人合法、每镜 1–4 个动作节拍、钩子落首镜、悬念落末镜、场次不往复（闪回可标）、角色场景登记未用 |
| **提示词 11** | Z-Image 四要素与画幅、人物资产卡版式、器物白描（材质 / 光影 / 承载 / 具象）、微表情权重与反向约束、图生图三件套、动作镜（力因果链 + 特效 + 具体音效 + 景别）、H3 五段结构与分时段边界、镜头方式/声音/字幕固定行、五种模式对齐与参考图分工、Picture 编号连续、英文提示词 ≤7000 字符 |

**门之外的剧情逻辑**（因果、信息差、动机、能力边界、时间线）代码查不了，`references/adaptation-pass.md` 里有十条自检清单。

```bash
node scripts/selftest.mjs      # 51 项断言，不调模型、不花额度
```

## 目录

```text
skills/comfyui-ziqwh3/
├── SKILL.md                          工作流：定范围 → 读小说 → 建 manju.json → 校验循环 → 出 Word
├── agents/openai.yaml                平台 UI 元数据
├── references/
│   ├── schema.md                     manju.json 唯一数据契约 + 22 道门清单
│   ├── z-image-standard.md           人物 / 场景 / 微表情
│   ├── z-image-props-standard.md     道具 / 武器 / 符箓 / 阵法结界 / 功法秘籍（白描五要素）
│   ├── qwen-image-standard.md        修改指令 + 保留从句 + 参考图分工，动作戏六件套
│   ├── minimax-h3-standard.md        官方标准结构 + 五种模式的坑 + 英文三字段专业版
│   ├── h3-action-standard.md         打斗 / 施法 / 飞行 / 炼丹 / 突破（力因果链等四条调优）
│   ├── adaptation-pass.md            小说→剧本的方法 + 剧情逻辑自检清单
│   └── docx-format.md                Word 版式（默认 A4 横排）与两种交付形态
├── scripts/
│   ├── ziqwh3.mjs              readdoc / validate / fix / render（零依赖）
│   └── selftest.mjs                  51 项断言
└── examples/
    └── 道祖重修记-青石镇-漫剧剧本-manju.json    3 集 24 镜的真实试片稿，22 道门 0 错 0 警
```

## 自带样例

`examples/道祖重修记-青石镇-漫剧剧本-manju.json` 取自《道祖重修记之人界篇》第一卷前三章：3 集 × 8 镜 × 8 秒，8 人物 / 8 场景 / 6 道具，含一镜标 `actionShot` 的识海推演（走打斗施法标准），是质量基准也是自测夹具。

## 与其它技能的关系

本技能自带「改编 + 写提示词 + 出 Word」一条线。若同一套小说已经过 `novel-outline`（大纲）/ `novel-characters`（角色）/ `novel-art`（美术）等上游技能，人物与场景的锚点可以直接搬进 `characters[].anchors` 与 `scenes[].anchors`——锚点是跨技能一致性的通用货币。

## 维护者：发版与打包

```bash
# 1) 打包（UTF-8 文件名 + 0x800 标记，跨平台可正确解压）
python tools/pack.py comfyui-ziqwh3            # 版本号自动读 SKILL.md 的 metadata.version
python tools/pack.py comfyui-ziqwh3 1.0.1      # 或显式指定
# 产物 dist/comfyui-ziqwh3-<version>.zip 与 .sha256；dist/ 已 gitignore，作为 Release 资产上传。
# 别用 `tar -a`：中文 Windows 的 bsdtar 会按 GBK 写条目名且不打 UTF-8 标记，别的机器解出来是乱码。

# 2) 自检
node skills/comfyui-ziqwh3/scripts/selftest.mjs
python skill-creator/scripts/quick_validate.py skills/comfyui-ziqwh3            # 需要 PYTHONUTF8=1

# 3) 推送到 GitHub（首次）
git init && git add -A
git commit -m "feat: comfyui-ziqwh3 1.0.0 — 小说→漫剧剧本 + 三类模型提示词 + Word 交付"
git branch -M main
git remote add origin https://github.com/Mkghui/skill-.git
git push -u origin main
```

有 `gh` 时更省事：`gh repo create Mkghui/skill- --public --source . --push`。

## 许可

Apache-2.0，见 `LICENSE`。