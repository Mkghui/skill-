#!/usr/bin/env node
/**
 * comfyui-ziqwh3 — 小说 → 短剧漫剧剧本（Word 交付）+ 三类模型提示词
 * 子命令：validate / fix / render
 * 零依赖：只用 node 标准库（fs / path / zlib）
 *
 * 三类提示词的格式标准来自：
 *   E:\2.漫剧制作\提示词\1.z-image(文生图)\*.docx
 *   E:\2.漫剧制作\提示词\2.qwen-image（图生图）\*.docx
 *   E:\2.漫剧制作\提示词\3.minimaxH3（图生视频）\*.docx
 * 提炼结果见 references/，本脚本按其中的硬规则做确定性校验与机械校正。
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { pathToFileURL } from "node:url";

/* ========================================================================
 * 常量：三份提示词标准里的词表与模板固定项
 * ====================================================================== */

const MODES = ["T2VA", "I2VA", "FL2VA", "L2VA", "R2VA"];
const MODE_ALIAS = {
  T2V: "T2VA", T2VA: "T2VA", TXT2VA: "T2VA",
  I2V: "I2VA", I2VA: "I2VA",
  FL2V: "FL2VA", FL2VA: "FL2VA",
  L2V: "L2VA", L2VA: "L2VA",
  R2V: "R2VA", R2VA: "R2VA", REF2VA: "R2VA",
};

// z-image：主体 + 细节 + 风格 + 画面质量（1.z-image 的结构指南）
const Z_QUALITY = ["8k", "高清", "超清", "4k", "电影级", "高分辨率", "细节清晰", "细节丰富", "细节拉满", "超高清"];
const Z_STYLE = ["写实", "插画", "厚涂", "工笔", "水墨", "国风", "仙侠", "二次元", "概念艺术", "3d", "动漫", "真人质感", "电影质感", "摄影风格", "风格", "古风"];
const Z_RATIO = ["16:9", "9:16", "1:1", "4:5", "3:4", "21:9", "横版", "竖版", "宽银幕", "超宽幅", "纵向构图", "横向构图"];
// z-image 人物资产卡：修仙人物标准给的版式（左半身像 + 右三视图）
const Z_CARD = ["三视图", "立绘", "大头照", "角色资产卡片", "人物设定图", "资产卡片"];
// 微表情权重写法：上眼睑下垂:1.6
const Z_WEIGHT = /[:：（(]\s*1\.\d/;

// qwen-image 图生图：修改指令 + 保留细节（人与场景标准）
const Q_PRESERVE = ["preserve", "keep", "maintain", "retain", "unchanged", "without changing", "stay the same", "保留", "不变", "维持", "不改变", "沿用", "锁定"];
const Q_EDIT = ["replace", "extend", "transform", "composite", "dress", "convert", "recreate", "insert", "combine", "add ", "替换", "更换", "扩展", "合成", "改为", "补全", "融合", "叠加"];
const Q_REF = ["image 1", "image 2", "image 3", "image 4", "image 5", "picture 1", "picture 2", "reference image", "参考图", "图1", "图 1", "原图", "图二", "图一"];

// minimaxH3：万能提示词模板（0.minimaxH3 万能提示词）
const H3_SECTIONS = ["全局设定：", "稳定约束："];
const H3_BOILER = ["镜头方式：", "声音：", "字幕："];
const H3_SUBTITLE_LINE = "字幕：无任何文字、水印、字幕。";
const H3_STABILIZE_BLOCK =
  "稳定约束：全程保持人物外貌、发型、服装、场景、色调、画风完全一致；动作符合人体结构，连续丝滑；" +
  "镜头平稳匀速，无抖动、无变焦错乱；无人物变形、面部崩坏、穿模、画面闪烁；无新增人物、无多余物体、无场景跳变；" +
  "音效全程贴合画面节奏，自然适配、无杂音、无爆音、无突兀启停。";
const H3_EN_FIELDS = ["integrated_multimodal_description:", "overall_soundscape:", "non_diegetic_music:"];
const H3_EN_ALIGN_I2VA =
  "For the target video, at 0.00 seconds into the target video, <Picture 1> (from [Shot 1]) is fully referenced.";
const H3_EN_ALIGN_FRAME = "How the reference pictures align with the target video — ";
const H3_MAX_CHARS = 7000; // 5.minimaxH3 的硬上限

// z-image 器物资产（道具 / 武器 / 符箓 / 阵盘 / 秘籍）：白描五要素
const PROP_MATERIAL = ["玉", "木", "竹", "纸", "金", "铁", "石", "布", "绸", "瓷", "骨", "铜", "羊皮", "宣纸", "竹简", "檀木", "青铜", "玄铁", "黑金", "琉璃", "绢", "银", "紫金", "寒玉", "草", "绳", "皮", "陶", "墨"];
const PROP_LIGHT = ["灵光", "微光", "烛光", "幽蓝", "冷光", "柔光", "暖光", "光影", "发光", "光晕", "雷光", "霞光", "光效", "辉光", "折射", "逆光", "高光", "光线", "光斑", "亮起", "泛着", "斜光"];
const PROP_CARRIER = ["置于", "悬浮", "平铺", "背景", "白底", "白背景", "落在", "散落", "案台", "书案", "桌面", "祭坛", "古碑", "掌中"];
const PROP_BAN = ["好看", "厉害", "炫酷", "帅气", "漂亮", "很棒", "超帅", "酷炫", "霸气"];

// 阵法 / 结界类场景
const ARRAY_WORDS = ["阵", "结界", "禁制", "法域", "符阵", "封印"];
const ARRAY_FEATURES = ["符文", "图腾", "能量", "光效", "流转", "阵纹", "锁链", "亮起", "旋转", "灵光", "光纹"];

// H3 动作镜（打斗 / 施法 / 飞行 / 炼丹 / 突破）
const ACTION_SNIFF = ["打斗", "交手", "厮杀", "斗法", "施法", "结印", "掐诀", "御剑", "剑气", "法术", "符箓", "符纸", "雷劫", "渡劫", "炼丹", "丹炉", "拳脚", "掌风", "御空", "腾空", "拔剑", "出剑", "剑阵"];
const ACTION_CAUSE = ["蓄力", "发力", "受力", "传导", "接触", "惯性", "反震", "反馈", "震荡", "炸开", "回弹", "下沉", "重心", "绽开", "爆开", "冲击"];
const ACTION_FX = ["光效", "粒子", "流光", "电弧", "灵气", "光晕", "涟漪", "波纹", "霞光", "符文", "剑气", "墨痕", "气流", "碎光", "能量", "光尘"];
const ACTION_SFX = ["破空", "碰撞", "炸散", "轰鸣", "碎裂", "断裂", "尖锐", "嗡", "闷响", "刮擦", "撞击", "飞溅", "砰", "轰", "呼啸"];
const ACTION_RHYTHM = ["慢动作", "减速", "定格", "收尾", "放缓"];
const SHOT_SIZE_WORDS = ["特写", "近景", "中景", "全景", "远景", "大远景", "微距", "过肩", "半身", "全身",
  "close-up", "close up", "medium shot", "wide shot", "full shot", "macro", "long shot"];
const QWEN_ACT_WORDS = ["对峙", "碰撞", "搏斗", "结印", "腾跃", "挥", "劈", "斩", "刺", "拳", "掌", "飞行", "升空", "揭盖", "甩出", "格挡", "反杀", "跃起", "拔出", "推", "拽",
  "fight", "clash", "strike", "slash", "thrust", "punch", "cast", "seal", "fly", "soar", "swing", "grab", "pull", "push", "spin", "step"];

// 微表情词表：用于提示「这一镜有情绪，建议配权重写法」
const MOOD_WORDS = ["悲伤", "委屈", "喜悦", "开心", "大笑", "惊讶", "错愕", "温柔", "深情", "坚定", "冷峻", "冷淡", "心虚", "冷笑", "破防", "愤怒", "恐惧", "厌恶", "轻蔑", "疑惑", "微醺", "慵懒", "凝重", "黯然", "释然", "震惊", "得意", "挑衅", "绝望", "哀求"];

const H3_MODE_HINT = {
  I2VA: { need: ["首帧", "原图"], msg: "I2VA 必须写明从首帧/原图画面启动（0-2 秒「严格贴合首帧画面」）" },
  FL2VA: { need: ["尾帧"], msg: "FL2VA 必须写明首帧起步、逐步收敛到尾帧" },
  L2VA: { need: ["尾帧"], msg: "L2VA 必须写明最终收敛到尾帧" },
  R2VA: { need: ["参考图"], msg: "R2VA 必须写明每张参考图的唯一职责与保留项" },
  T2VA: { need: null, msg: "" },
};

/* ========================================================================
 * 小工具
 * ====================================================================== */

const readJson = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
function writeJson(p, o) {
  fs.mkdirSync(path.dirname(path.resolve(p)), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(o, null, 2) + "\n", "utf8");
}
const isStr = (s) => typeof s === "string" && s.trim().length > 0;
const len = (s) => (typeof s === "string" ? s.replace(/\s/g, "").length : 0);
const lc = (s) => String(s == null ? "" : s).toLowerCase();
const has = (s, list) => { const t = lc(s); return list.some((w) => t.includes(lc(w))); };
const uniq = (a) => [...new Set(a)];

function parseArgs(argv) {
  const a = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t.startsWith("--")) {
      const k = t.slice(2);
      const n = argv[i + 1];
      if (n === undefined || n.startsWith("--")) a[k] = true;
      else { a[k] = n; i++; }
    } else a._.push(t);
  }
  return a;
}

/** 最长公共子串长度（钩子/悬念是否落在纸上） */
function lcsLen(a, b) {
  a = String(a || "").replace(/[，。！？、；：""''（）\s]/g, "");
  b = String(b || "").replace(/[，。！？、；：""''（）\s]/g, "");
  if (!a || !b) return 0;
  let best = 0;
  const dp = new Array(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    let prev = 0;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prev + 1 : 0;
      if (dp[j] > best) best = dp[j];
      prev = tmp;
    }
  }
  return best;
}

/** 把提示词里的分时段标签统一成 `0-2秒：`；返回 [文本, 真正改动的处数] */
function normalizeBuckets(text) {
  let n = 0;
  const fix = (m, a, b) => { const want = `${parseInt(a, 10)}-${parseInt(b, 10)}秒：`; if (want !== m) n += 1; return want; };
  let out = String(text || "").replace(
    /(\d+)\s*(?:-|~|—|–|至|到|to)\s*(\d+)\s*(?:秒|s|S|sec|seconds)\s*[:：]/g, fix);
  out = out.replace(/^\s*(\d+)\s*(?:-|~|—|–|至|到)\s*(\d+)\s*[:：]/gm, fix);
  return [out, n];
}

/** 按镜头时长算出标准时间桶标签 */
function bucketsFor(seconds) {
  if (seconds === 8) return ["0-2秒：", "2-5秒：", "5-8秒："];
  const cut = [Math.max(1, Math.round(seconds * 0.25)), Math.max(2, Math.round(seconds * 0.62))];
  return [`0-${cut[0]}秒：`, `${cut[0]}-${cut[1]}秒：`, `${cut[1]}-${seconds}秒：`];
}

/** 解析文本里出现的分时段桶：[{a,b,label}] */
function parseBuckets(text) {
  const out = [];
  const re = /(\d+)\s*-\s*(\d+)\s*秒\s*[:：]/g;
  let m;
  while ((m = re.exec(String(text || "")))) out.push({ a: +m[1], b: +m[2], label: m[0] });
  return out;
}
/* ========================================================================
 * 质量门（20 道，全部确定性）
 * ====================================================================== */

export const GATES = [
  { id: "ep-continuity", group: "逻辑", title: "分集连续、每集有镜头、集梗概齐备" },
  { id: "refs-valid", group: "逻辑", title: "镜头引用的角色/场景/道具都已登记" },
  { id: "time-budget", group: "逻辑", title: "每集时长在目标 ±15% 内" },
  { id: "shot-seconds", group: "逻辑", title: "单镜 4–15 秒整数（H3 上限）" },
  { id: "line-length", group: "逻辑", title: "单句台词 ≤ 35 字" },
  { id: "line-density", group: "逻辑", title: "单镜台词总量 ≤ 秒数 × 5 字" },
  { id: "speaker-valid", group: "逻辑", title: "说话人在人物表内（或 VO）" },
  { id: "beat-mix", group: "逻辑", title: "每镜 1–4 个动作节拍（一镜只做一件事）" },
  { id: "ep-hook", group: "逻辑", title: "钩子落首镜、悬念落末镜" },
  { id: "character-usage", group: "逻辑", title: "每个角色至少一镜、每个场景至少一次" },
  { id: "scene-backtrack", group: "逻辑", title: "同集内角色场次不往复（闪回标 flashback）" },
  { id: "zimage-structure", group: "提示词", title: "Z-Image：主体+细节+风格+画质" },
  { id: "zimage-asset", group: "提示词", title: "Z-Image：人物是资产卡、场景带环境光影" },
  { id: "zimage-microexpr", group: "提示词", title: "Z-Image：微表情用权重写法" },
  { id: "zimage-prop", group: "提示词", title: "Z-Image：器物白描（材质 / 光影 / 承载 / 具象）" },
  { id: "qwen-structure", group: "提示词", title: "Qwen-Image：修改指令 + 保留细节 + 参考图分工" },
  { id: "h3-structure", group: "提示词", title: "H3：全局设定 + 连续分时段 + 稳定约束" },
  { id: "h3-boilerplate", group: "提示词", title: "H3：镜头方式/声音/字幕三行固定项" },
  { id: "h3-action", group: "提示词", title: "H3：动作镜（力因果链 / 特效 / 音效 / 节奏）" },
  { id: "h3-mode-align", group: "提示词", title: "H3：模式与首尾帧/参考分工对齐" },
  { id: "h3-refs", group: "提示词", title: "H3：Picture 编号连续、职责写清" },
  { id: "h3-length", group: "提示词", title: "H3：英文提示词 ≤ 7000 字符、字段齐" },
];
const GATE_BY_ID = Object.fromEntries(GATES.map((g) => [g.id, g]));

const err = (gate, msg, at) => ({ gate, level: "error", msg, at: at || "" });
const warn = (gate, msg, at) => ({ gate, level: "warn", msg, at: at || "" });

const shotsOf = (spec, ep) => (spec.shots || []).filter((s) => Number(s.ep) === Number(ep));
const actionBeats = (s) => (s.beats || []).filter((b) => b && b.type === "action");
const lineBeats = (s) => (s.beats || []).filter((b) => b && b.type === "line");

function gate_ep_continuity(spec) {
  const v = [];
  const pr = spec.params || {};
  const onlyEp = Number(pr.onlyEp) || 0;
  const eps = Number(pr.episodes);
  if (!Number.isInteger(eps) || eps < 1) v.push(err("ep-continuity", "params.episodes 必须是 ≥1 的整数"));
  const used = uniq((spec.shots || []).map((s) => Number(s.ep))).sort((a, b) => a - b);
  if (!used.length) v.push(err("ep-continuity", "没有任何镜头"));
  const top = Math.max(eps || 0, used.length ? used[used.length - 1] : 0);
  for (let i = onlyEp || 1; i <= (onlyEp || top); i++) {
    if (!used.includes(i)) v.push(err("ep-continuity", `第 ${i} 集没有任何镜头`));
    if (!shotsOf(spec, i).length) v.push(err("ep-continuity", `第 ${i} 集镜头列表为空`));
    const e = (spec.episodes || []).find((x) => Number(x.ep) === i);
    if (!e) v.push(err("ep-continuity", `第 ${i} 集缺 episodes 条目（title/hook/suspense/hookShotId/suspenseShotId）`));
  }
  if (!onlyEp && eps && top !== eps) v.push(err("ep-continuity", `params.episodes=${eps}，实际镜头只覆盖到第 ${top} 集`));
  for (const e of spec.episodes || []) {
    for (const k of ["title", "hook", "suspense"]) if (!isStr(e[k])) v.push(err("ep-continuity", `第 ${e.ep} 集 ${k} 为空`));
    if (len(e.hook) > 40) v.push(warn("ep-continuity", `第 ${e.ep} 集 hook 超过 40 字，钩子该是一句具象动作`, `EP${e.ep}`));
  }
  return v;
}

function gate_refs_valid(spec) {
  const v = [];
  const cIds = new Set((spec.characters || []).map((c) => c.id));
  const sIds = new Set((spec.scenes || []).map((s) => s.id));
  const pIds = new Set((spec.props || []).map((p) => p.id));
  if (!cIds.size) v.push(err("refs-valid", "人物表为空"));
  if (!sIds.size) v.push(err("refs-valid", "场景表为空"));
  for (const c of spec.characters || []) for (const k of ["id", "name", "role", "anchors"]) if (!isStr(c[k])) v.push(err("refs-valid", `人物 ${c.id || "?"} 缺 ${k}`));
  for (const s of spec.scenes || []) for (const k of ["id", "name", "anchors"]) if (!isStr(s[k])) v.push(err("refs-valid", `场景 ${s.id || "?"} 缺 ${k}`));
  for (const s of spec.shots || []) {
    if (!sIds.has(s.sceneId)) v.push(err("refs-valid", `镜头 ${s.id} 引用了未登记的场景 ${s.sceneId}`, s.id));
    for (const c of s.characterIds || []) if (!cIds.has(c)) v.push(err("refs-valid", `镜头 ${s.id} 引用了未登记的人物 ${c}`, s.id));
    for (const p of s.propIds || []) if (!pIds.has(p)) v.push(err("refs-valid", `镜头 ${s.id} 引用了未登记的道具 ${p}`, s.id));
  }
  return v;
}

function gate_time_budget(spec) {
  const v = [];
  const target = Number(spec.params && spec.params.minutesPerEpisode) * 60;
  if (!(target > 0)) return [err("time-budget", "params.minutesPerEpisode 缺失或非法")];
  const eps = uniq((spec.shots || []).map((s) => Number(s.ep)));
  for (const ep of eps) {
    const total = shotsOf(spec, ep).reduce((a, s) => a + Number(s.seconds || 0), 0);
    const off = (total - target) / target;
    if (Math.abs(off) > 0.15) {
      v.push(err("time-budget", `第 ${ep} 集 ${total}s，目标 ${target}s（${off > 0 ? "+" : ""}${(off * 100).toFixed(1)}%，容差 ±15%），${off > 0 ? "砍动作节拍" : "补戏不注水"}`, `EP${ep}`));
    } else if (Math.abs(off) > 0.1) {
      v.push(warn("time-budget", `第 ${ep} 集 ${total}s 贴着容差边（${(off * 100).toFixed(1)}%）`, `EP${ep}`));
    }
  }
  return v;
}

function gate_shot_seconds(spec) {
  const v = [];
  for (const s of spec.shots || []) {
    const n = Number(s.seconds);
    if (!Number.isInteger(n)) v.push(err("shot-seconds", `镜头 ${s.id} seconds 必须是整数（当前 ${s.seconds}）`, s.id));
    else if (n < 4 || n > 15) v.push(err("shot-seconds", `镜头 ${s.id} ${n}s 超出 H3 的 4–15 秒`, s.id));
    if (!MODES.includes(s.mode)) v.push(err("shot-seconds", `镜头 ${s.id} mode=${s.mode} 非法（只能 ${MODES.join("/")}）`, s.id));
  }
  return v;
}

function gate_line_length(spec) {
  const v = [];
  for (const s of spec.shots || []) for (const b of lineBeats(s)) {
    if (!isStr(b.line)) { v.push(err("line-length", `镜头 ${s.id} 有台词节拍但 line 为空`, s.id)); continue; }
    const n = len(b.line);
    if (n > 35) v.push(err("line-length", `镜头 ${s.id} 台词 ${n} 字 > 35：「${String(b.line).slice(0, 18)}…」`, s.id));
  }
  return v;
}

function gate_line_density(spec) {
  const v = [];
  for (const s of spec.shots || []) {
    const total = lineBeats(s).reduce((a, b) => a + len(b.line), 0);
    const cap = Number(s.seconds) * 5;
    if (total > cap) v.push(err("line-density", `镜头 ${s.id} 台词共 ${total} 字 > ${Number(s.seconds)}s × 5 = ${cap} 字`, s.id));
    if (lineBeats(s).length > 3) v.push(warn("line-density", `镜头 ${s.id} 有 ${lineBeats(s).length} 句台词，8 秒镜口播塞不下`, s.id));
  }
  return v;
}

function gate_speaker_valid(spec) {
  const v = [];
  const cIds = new Set((spec.characters || []).map((c) => c.id));
  for (const s of spec.shots || []) for (const b of lineBeats(s)) {
    const sp = b.speaker;
    if (!sp) v.push(err("speaker-valid", `镜头 ${s.id} 台词缺 speaker`, s.id));
    else if (sp !== "VO" && !cIds.has(sp)) v.push(err("speaker-valid", `镜头 ${s.id} 说话人 ${sp} 不在人物表`, s.id));
    if (!isStr(b.delivery)) v.push(warn("speaker-valid", `镜头 ${s.id} 台词缺 delivery（语气），TTS 与表演提示都靠它`, s.id));
  }
  return v;
}

function gate_beat_mix(spec) {
  const v = [];
  for (const s of spec.shots || []) {
    if (!(s.beats || []).length) { v.push(err("beat-mix", `镜头 ${s.id} 没有节拍`, s.id)); continue; }
    const acts = actionBeats(s);
    if (!acts.length) v.push(err("beat-mix", `镜头 ${s.id} 只有台词没有动作节拍——AI 生成时没有画面可写`, s.id));
    for (const b of acts) if (len(b.text) < 8) v.push(err("beat-mix", `镜头 ${s.id} 动作节拍只有 ${len(b.text)} 字，是标签不是画面：「${b.text}」`, s.id));
    if (acts.length > 4) v.push(err("beat-mix", `镜头 ${s.id} 有 ${acts.length} 个动作节拍——一镜只做一件事，超过 4 个生成必崩`, s.id));
    else if (acts.length > 3) v.push(warn("beat-mix", `镜头 ${s.id} 有 ${acts.length} 个动作节拍，${s.seconds} 秒镜偏满`, s.id));
    for (const b of s.beats) if (!["action", "line"].includes(b.type)) v.push(err("beat-mix", `镜头 ${s.id} 节拍 type=${b.type} 非法（只能 action/line）`, s.id));
  }
  return v;
}

function gate_ep_hook(spec) {
  const v = [];
  const eps = uniq((spec.shots || []).map((s) => Number(s.ep)));
  for (const ep of eps) {
    const list = shotsOf(spec, ep);
    const e = (spec.episodes || []).find((x) => Number(x.ep) === ep);
    if (!e || !list.length) continue;
    const first = list[0], last = list[list.length - 1];
    if (e.hookShotId !== first.id) v.push(err("ep-hook", `第 ${ep} 集 hookShotId=${e.hookShotId || "空"}，必须是首镜 ${first.id}`, `EP${ep}`));
    if (e.suspenseShotId !== last.id) v.push(err("ep-hook", `第 ${ep} 集 suspenseShotId=${e.suspenseShotId || "空"}，必须是末镜 ${last.id}`, `EP${ep}`));
    const firstText = [first.summary, ...(first.beats || []).map((b) => b.text || b.line || "")].join(" ");
    if (isStr(e.hook) && lcsLen(e.hook, firstText) < 3) v.push(err("ep-hook", `第 ${ep} 集钩子没落在首镜画面里（钩子与首镜最长公共串 < 3 字）：换首镜，或把钩子的具象写进首镜节拍`, `EP${ep}`));
    const lastText = [last.summary, ...(last.beats || []).map((b) => b.text || b.line || "")].join(" ");
    if (isStr(e.suspense) && lcsLen(e.suspense, lastText) < 3) v.push(err("ep-hook", `第 ${ep} 集悬念没落在末镜画面里`, `EP${ep}`));
  }
  return v;
}

function gate_character_usage(spec) {
  const v = [];
  const usedC = new Set((spec.shots || []).flatMap((s) => s.characterIds || []));
  const usedS = new Set((spec.shots || []).map((s) => s.sceneId));
  for (const c of spec.characters || []) if (!usedC.has(c.id)) v.push(err("character-usage", `角色 ${c.id} ${c.name} 登记了但一镜都没用`, c.id));
  for (const s of spec.scenes || []) if (!usedS.has(s.id)) v.push(err("character-usage", `场景 ${s.id} ${s.name} 登记了但一镜都没用`, s.id));
  return v;
}

function gate_scene_backtrack(spec) {
  const v = [];
  const eps = uniq((spec.shots || []).map((s) => Number(s.ep)));
  for (const ep of eps) {
    const list = shotsOf(spec, ep).filter((s) => !s.flashback);
    const seqOf = new Map();
    for (const s of list) for (const c of s.characterIds || []) {
      if (!seqOf.has(c)) seqOf.set(c, []);
      const seq = seqOf.get(c);
      if (seq[seq.length - 1] !== s.sceneId) seq.push(s.sceneId);
    }
    for (const [c, seq] of seqOf) {
      const dup = seq.find((x, i) => seq.indexOf(x) !== i);
      if (dup) v.push(err("scene-backtrack", `第 ${ep} 集角色 ${c} 的场次往复（${seq.join(" → ")}）：不是闪回就把同场次镜头并到一起，是闪回就给镜头标 flashback:true`, `EP${ep}`));
    }
  }
  return v;
}

function gate_zimage_structure(spec) {
  const v = [];
  const check = (label, at, prompt) => {
    if (!isStr(prompt)) { v.push(err("zimage-structure", `${label} 缺 zImage.prompt`, at)); return; }
    const n = len(prompt);
    if (n < 40) v.push(err("zimage-structure", `${label} 提示词只有 ${n} 字——Z-Image 支持长句，写得越具象越准`, at));
    if (!has(prompt, Z_QUALITY)) v.push(err("zimage-structure", `${label} 缺画质词（高清/超清/8K/电影感 之一）`, at));
    if (!has(prompt, Z_STYLE)) v.push(err("zimage-structure", `${label} 缺风格词（写实/插画/厚涂/工笔/水墨/国风…）`, at));
    if (n < 80) v.push(warn("zimage-structure", `${label} 提示词偏短（${n} 字），细节与光影可以再具体`, at));
    if (!has(prompt, Z_RATIO)) v.push(warn("zimage-structure", `${label} 没写画幅（横版16:9 / 竖版9:16…），ComfyUI 出图比例会飘`, at));
  };
  for (const c of spec.characters || []) check(`人物 ${c.id}`, c.id, c.zImage && c.zImage.prompt);
  for (const s of spec.scenes || []) check(`场景 ${s.id}`, s.id, s.zImage && s.zImage.prompt);
  for (const p of spec.props || []) check(`道具 ${p.id}`, p.id, p.zImage && p.zImage.prompt);
  for (const s of spec.shots || []) check(`镜头 ${s.id} 首帧`, s.id, s.zImage && s.zImage.prompt);
  return v;
}

function gate_zimage_asset(spec) {
  const v = [];
  for (const c of spec.characters || []) {
    const t = c.zImage && c.zImage.prompt;
    if (isStr(t) && !has(t, Z_CARD)) v.push(err("zimage-asset", `人物 ${c.id} 的提示词不是资产卡版式：缺「三视图/立绘/大头照」（参照 zimage（修仙人物）提示词.docx 的版式）`, c.id));
    if (isStr(t) && !has(t, ["纯白背景", "纯色背景", "白色背景", "干净背景", "影棚"])) v.push(warn("zimage-asset", `人物 ${c.id} 建议指定纯白背景，方便抠图与统一资产`, c.id));
  }
  for (const s of spec.scenes || []) {
    const t = s.zImage && s.zImage.prompt;
    if (isStr(t) && !has(t, ["光影", "光线", "体积光", "丁达尔", "布光", "晨光", "烛光", "月光", "天光", "光照", "斜光", "逆光"])) v.push(err("zimage-asset", `场景 ${s.id} 的提示词没写光影——场景资产的成败在光`, s.id));
    if (isStr(t) && has(`${s.name}${s.anchors || ""}`, ARRAY_WORDS) && !has(t, ARRAY_FEATURES)) v.push(err("zimage-asset", `场景 ${s.id} 是阵法/结界类（${s.name}），提示词必须写到符文/图腾/能量/光效/流转之一——见 z-image-props-standard.md`, s.id));
  }
  return v;
}

function gate_zimage_microexpr(spec) {
  const v = [];
  for (const c of spec.characters || []) {
    for (const e of c.expr || []) {
      if (!isStr(e.prompt)) v.push(err("zimage-microexpr", `人物 ${c.id} 的微表情「${e.emotion}」缺 prompt`, c.id));
      else if (!Z_WEIGHT.test(e.prompt)) v.push(err("zimage-microexpr", `人物 ${c.id} 的微表情「${e.emotion}」没有权重写法（如 上眼睑下垂:1.6），Z-Image 抓不住`, c.id));
      if (isStr(e.prompt) && !/无[^，。；\s]{1,8}/.test(e.prompt) && !/非卡通/.test(e.prompt)) {
        v.push(warn("zimage-microexpr", `人物 ${c.id} 的微表情「${e.emotion}」建议补反向约束（如「无张嘴、无眼睛睁大」），标准里每条情绪都带`, c.id));
      }
    }
  }
  for (const s of spec.shots || []) {
    const txt = (s.beats || []).map((b) => `${b.text || ""}${b.line || ""}${b.delivery || ""}`).join(" ");
    if (isStr(txt) && has(txt, MOOD_WORDS)) {
      const cids = s.characterIds || [];
      const covered = cids.some((id) => {
        const c = (spec.characters || []).find((x) => x.id === id);
        return c && (c.expr || []).length;
      });
      if (covered === false && cids.length) v.push(warn("zimage-microexpr", `镜头 ${s.id} 有情绪戏（${MOOD_WORDS.filter((m) => txt.includes(m)).join("/")}），但相关人物没有登记微表情提示词`, s.id));
    }
  }
  return v;
}

function gate_qwen_structure(spec) {
  const v = [];
  const check = (label, at, q) => {
    if (!q || !isStr(q.prompt)) { v.push(err("qwen-structure", `${label} 缺 qwenImage.prompt`, at)); return; }
    const t = q.prompt;
    if (!has(t, Q_EDIT)) v.push(err("qwen-structure", `${label} 没写清要改什么（Replace/Extend/Transform/Composite…）——图生图的提示词是修改指令`, at));
    if (!has(t, Q_PRESERVE)) v.push(err("qwen-structure", `${label} 没有保留细节从句（Preserve/保留 面部、发型、服装、姿势、光线…）`, at));
    if (!has(t, Q_REF)) v.push(err("qwen-structure", `${label} 没指明参考图分工（image 1 / 参考图 / 原图）`, at));
    if (len(t) < 30) v.push(warn("qwen-structure", `${label} 图生图指令偏短（${len(t)} 字），保留项和融合光线要说清`, at));
  };
  for (const c of spec.characters || []) if (c.qwenEdit) {
    if (typeof c.qwenEdit === "string") v.push(err("qwen-structure", `人物 ${c.id} qwenEdit 应该带 prompt/note 的对象`, c.id));
    else check(`人物 ${c.id} 图生图`, c.id, c.qwenEdit);
  }
  for (const s of spec.shots || []) check(`镜头 ${s.id} 图生图`, s.id, s.qwenImage);
  return v;
}

function gate_zimage_prop(spec) {
  const v = [];
  for (const x of spec.props || []) {
    const t = x.zImage && x.zImage.prompt;
    if (!isStr(t)) continue;
    const n = len(t);
    if (!has(t, PROP_MATERIAL)) v.push(err("zimage-prop", `道具 ${x.id} 没写材质——这一份器物标准的第一件事就是材质（黑金 / 羊脂白玉 / 泛黄宣纸 / 残破竹简）`, x.id));
    if (!has(t, PROP_LIGHT)) v.push(err("zimage-prop", `道具 ${x.id} 没写光效（柔和暖光 / 冷调光效 / 边缘泛着微光）`, x.id));
    if (!has(t, PROP_CARRIER)) v.push(err("zimage-prop", `道具 ${x.id} 没交代它放在哪 / 悬浮在什么前（置于 / 悬浮 / 平铺 / 背景 / 白底）`, x.id));
    const bad = PROP_BAN.filter((w) => t.includes(w));
    if (bad.length) v.push(err("zimage-prop", `道具 ${x.id} 用了抽象词「${bad.join("、")}」——标准要求细节具象化（黑金斧身、紫色雷电纹路）`, x.id));
    if (!isStr(x.note)) v.push(err("zimage-prop", `道具 ${x.id} 缺 note（它承载什么剧情）`, x.id));
    if (n < 60) v.push(warn("zimage-prop", `道具 ${x.id} 提示词只有 ${n} 字，标准建议 100–200 字`, x.id));
    if (n > 240) v.push(warn("zimage-prop", `道具 ${x.id} 提示词 ${n} 字偏长，核心主体靠前、细节修饰靠后`, x.id));
  }
  return v;
}

function gate_h3_action(spec) {
  const v = [];
  for (const s of spec.shots || []) {
    const zh = (s.h3 && s.h3.zh) || "";
    const txt = `${s.summary || ""} ${(s.beats || []).map((b) => `${b.text || ""}${b.line || ""}`).join(" ")}`;
    const sniff = ACTION_SNIFF.filter((w) => txt.includes(w));
    if (!s.actionShot) {
      if (sniff.length) v.push(warn("h3-action", `镜头 ${s.id} 看着是动作镜（${sniff.join("、")}），没标 actionShot——标了才按打斗施法标准查`, s.id));
      continue;
    }
    if (!isStr(zh)) continue;
    if (!has(zh, ACTION_CAUSE)) v.push(err("h3-action", `动作镜 ${s.id} 没写力因果链（蓄力 → 传导 → 接触 → 反馈）——标准说否则动作发飘`, s.id));
    if (!has(zh, ACTION_FX)) v.push(err("h3-action", `动作镜 ${s.id} 没写特效/光效（粒子、流光、剑气、能量…），动作镜的视觉冲击全靠这一块`, s.id));
    const sfx = (zh.match(/音效匹配：[^\n]*/g) || []).join(" ");
    if (!has(sfx, ACTION_SFX)) v.push(err("h3-action", `动作镜 ${s.id} 的「音效匹配」没写具体声响（破空 / 碰撞 / 轰鸣 / 碎裂…），只写音量不算`, s.id));
    if (!has(zh, ACTION_RHYTHM)) v.push(warn("h3-action", `动作镜 ${s.id} 没写慢动作或定格收尾——标准要求撞击瞬间切慢动作（≤1.5 秒）、末段定格或收尾`, s.id));
    const fxCount = uniq(ACTION_FX.filter((w) => zh.includes(w))).length;
    if (fxCount > 6) v.push(warn("h3-action", `动作镜 ${s.id} 特效词 ${fxCount} 个，堆砌会让画面混乱——特效要与动作、场景绑在一起写`, s.id));
    const qp = (s.qwenImage && s.qwenImage.prompt) || "";
    if (isStr(qp)) {
      if (!has(qp, SHOT_SIZE_WORDS)) v.push(err("h3-action", `动作镜 ${s.id} 的图生图指令没写景别——动作六件套：风格 + 景别 + 场景 + 时间 + 动作 + 物理反馈`, s.id));
      if (!has(qp, QWEN_ACT_WORDS)) v.push(err("h3-action", `动作镜 ${s.id} 的图生图指令没写清动作本体`, s.id));
    }
  }
  return v;
}

function gate_h3_structure(spec) {
  const v = [];
  const fmt = (spec.params && spec.params.h3Format) || "zh";
  const needZh = fmt !== "en3";
  const wantEn = fmt === "zh-en" || fmt === "en3";
  for (const s of spec.shots || []) {
    const seconds = Number(s.seconds || 8);
    const h3 = s.h3 || {};
    if (needZh) {
      const t = h3.zh;
      if (!isStr(t)) { v.push(err("h3-structure", `镜头 ${s.id} 缺 H3 中文落地版（h3.zh）`, s.id)); continue; }
      for (const sec of H3_SECTIONS) if (!t.includes(sec)) v.push(err("h3-structure", `镜头 ${s.id} 的 H3 缺「${sec}」段`, s.id));
      const bs = parseBuckets(t);
      if (bs.length < 3) v.push(err("h3-structure", `镜头 ${s.id} 的 H3 分时段只有 ${bs.length} 段，标准是 3 段（0-2/2-5/5-8 秒）`, s.id));
      if (bs.length) {
        if (bs[0].a !== 0) v.push(err("h3-structure", `镜头 ${s.id} 的 H3 第一段从 ${bs[0].a} 秒起，必须从 0 秒起`, s.id));
        for (let i = 1; i < bs.length; i++) if (bs[i - 1].b !== bs[i].a) v.push(err("h3-structure", `镜头 ${s.id} 的 H3 分时段不连续：${bs[i - 1].label} → ${bs[i].label}`, s.id));
        const last = bs[bs.length - 1];
        if (last.b !== seconds) v.push(err("h3-structure", `镜头 ${s.id} 是 ${seconds} 秒，但 H3 末段收在 ${last.label.replace(/[:：]$/, "")}`, s.id));
      }
      if (t.includes("稳定约束：") && len(t.split("稳定约束：")[1] || "") < 20) v.push(err("h3-structure", `镜头 ${s.id} 的稳定约束是空的`, s.id));
    }
    if (wantEn) {
      const t = h3.en;
      if (!isStr(t)) { v.push(err("h3-structure", `h3Format=${fmt}，镜头 ${s.id} 缺 h3.en`, s.id)); continue; }
      const isPro = H3_EN_FIELDS.every((f) => t.includes(f));
      const isMirror = t.includes("Global setting:") && t.includes("Stability constraints:");
      if (!isPro && !isMirror) v.push(err("h3-structure", `镜头 ${s.id} 的 h3.en 既不是三字段专业版（integrated_multimodal_description/overall_soundscape/non_diegetic_music），也不是模板镜像版（Global setting/Stability constraints）`, s.id));
      if (isPro && !isMirror) {
        for (const f of H3_EN_FIELDS) if (!t.includes(f)) v.push(err("h3-structure", `镜头 ${s.id} 的 h3.en 缺字段 ${f}`, s.id));
      }
      const bs = parseBuckets(t.replace(/\b(\d+)-(\d+)s\b/g, "$1-$2秒"));
      if (!isPro && bs.length && bs[bs.length - 1].b !== seconds) v.push(err("h3-structure", `镜头 ${s.id} 的 h3.en 末段收在 ${bs[bs.length - 1].b} 秒，与镜头 ${seconds} 秒不符`, s.id));
    }
  }
  return v;
}

function gate_h3_boilerplate(spec) {
  const v = [];
  for (const s of spec.shots || []) {
    const t = (s.h3 && s.h3.zh) || "";
    if (!isStr(t)) continue;
    for (const b of H3_BOILER) if (!t.includes(b)) v.push(err("h3-boilerplate", `镜头 ${s.id} 的 H3 缺固定行「${b}」`, s.id));
    const sub = (t.match(/字幕：([^\n]*)/) || [])[1] || "";
    if (sub && !(sub.includes("无") && (sub.includes("字幕") || sub.includes("文字")))) v.push(err("h3-boilerplate", `镜头 ${s.id} 的字幕行必须写明无字幕（当前「${sub.trim().slice(0, 20)}」）`, s.id));
    const sound = (t.match(/声音：([^\n]*)/) || [])[1] || "";
    if (sound && !sound.includes("无") && !has(sound, ["环境声", "音效", "声"])) v.push(warn("h3-boilerplate", `镜头 ${s.id} 的声音行读不出是无对白还是有环境声`, s.id));
  }
  return v;
}

function gate_h3_mode_align(spec) {
  const v = [];
  const fmt = (spec.params && spec.params.h3Format) || "zh";
  for (const s of spec.shots || []) {
    const zh = (s.h3 && s.h3.zh) || "";
    const en = (s.h3 && s.h3.en) || "";
    const hint = H3_MODE_HINT[s.mode];
    if (hint && hint.need && isStr(zh) && !has(zh, hint.need)) v.push(err("h3-mode-align", `镜头 ${s.id}：${hint.msg}`, s.id));
    if ((fmt === "zh-en" || fmt === "en3") && isStr(en)) {
      const pro = H3_EN_FIELDS.every((f) => en.includes(f));
      if (pro) {
        if (s.mode === "I2VA" && !en.trimStart().startsWith(H3_EN_ALIGN_I2VA)) v.push(err("h3-mode-align", `镜头 ${s.id} I2VA 的首行必须逐字是：${H3_EN_ALIGN_I2VA}`, s.id));
        if ((s.mode === "FL2VA" || s.mode === "L2VA") && !en.trimStart().startsWith(H3_EN_ALIGN_FRAME)) v.push(err("h3-mode-align", `镜头 ${s.id} ${s.mode} 的首行必须以「${H3_EN_ALIGN_FRAME}」开头`, s.id));
        if (s.mode === "L2VA" && !new RegExp(`aligns with the ${Number(s.seconds)}.00-second mark of the target video`).test(en)) v.push(err("h3-mode-align", `镜头 ${s.id} L2VA 的对齐句必须落在 ${Number(s.seconds)}.00 秒`, s.id));
        if ((s.mode === "T2VA" || s.mode === "R2VA") && (en.includes(H3_EN_ALIGN_I2VA) || en.includes(H3_EN_ALIGN_FRAME))) v.push(err("h3-mode-align", `镜头 ${s.id} ${s.mode} 不该出现首尾帧对齐句`, s.id));
      }
    }
  }
  return v;
}

function gate_h3_refs(spec) {
  const v = [];
  for (const s of spec.shots || []) {
    const refs = s.refs || {};
    const keys = Object.keys(refs);
    const nums = keys.map((k) => { const m = /^Picture\s*(\d+)$/i.exec(k.trim()); return m ? Number(m[1]) : NaN; });
    if (keys.some((k, i) => !Number.isInteger(nums[i]))) v.push(err("h3-refs", `镜头 ${s.id} 的 refs 键必须是「Picture 1」这种格式（当前 ${keys.join("/")}）`, s.id));
    const sorted = uniq(nums.filter(Number.isInteger)).sort((a, b) => a - b);
    sorted.forEach((n, i) => { if (n !== i + 1) v.push(err("h3-refs", `镜头 ${s.id} 的 Picture 编号不连续：${sorted.join(",")}`, s.id)); });
    for (const k of keys) if (!isStr(refs[k])) v.push(err("h3-refs", `镜头 ${s.id} 的 ${k} 没写职责`, s.id));
    if (s.mode === "I2VA" && !keys.some((k) => /^Picture\s*1$/i.test(k.trim()))) v.push(err("h3-refs", `镜头 ${s.id} 是 I2VA，必须有 Picture 1（精确首帧）`, s.id));
    if (s.mode === "FL2VA" && keys.length < 2) v.push(err("h3-refs", `镜头 ${s.id} 是 FL2VA，必须同时有 Picture 1（首帧）与 Picture 2（尾帧）`, s.id));
    if ((s.mode === "I2VA" || s.mode === "FL2VA" || s.mode === "L2VA") && !(s.characterIds || []).length) v.push(warn("h3-refs", `镜头 ${s.id} 没有 characterIds，首尾帧锚定的人物身份无法对账`, s.id));
  }
  return v;
}

function gate_h3_length(spec) {
  const v = [];
  for (const s of spec.shots || []) {
    const en = (s.h3 && s.h3.en) || "";
    if (en.length > H3_MAX_CHARS) v.push(err("h3-length", `镜头 ${s.id} 的英文提示词 ${en.length} 字符 > 7000，删重复画质词与同义风格词，绝不删对齐句/对白/关键动作`, s.id));
  }
  return v;
}

const GATE_FNS = {
  "ep-continuity": gate_ep_continuity,
  "refs-valid": gate_refs_valid,
  "time-budget": gate_time_budget,
  "shot-seconds": gate_shot_seconds,
  "line-length": gate_line_length,
  "line-density": gate_line_density,
  "speaker-valid": gate_speaker_valid,
  "beat-mix": gate_beat_mix,
  "ep-hook": gate_ep_hook,
  "character-usage": gate_character_usage,
  "scene-backtrack": gate_scene_backtrack,
  "zimage-structure": gate_zimage_structure,
  "zimage-asset": gate_zimage_asset,
  "zimage-microexpr": gate_zimage_microexpr,
  "zimage-prop": gate_zimage_prop,
  "qwen-structure": gate_qwen_structure,
  "h3-structure": gate_h3_structure,
  "h3-boilerplate": gate_h3_boilerplate,
  "h3-action": gate_h3_action,
  "h3-mode-align": gate_h3_mode_align,
  "h3-refs": gate_h3_refs,
  "h3-length": gate_h3_length,
};

export function runGates(spec) {
  const out = [];
  for (const g of GATES) {
    const fn = GATE_FNS[g.id];
    try { out.push(...fn(spec)); }
    catch (e) { out.push(err(g.id, `门内部报错：${e && e.message}`)); }
  }
  return out;
}
/* ========================================================================
 * fix：机械校正（只做归一化与模板固定项补全，不改内容）
 * ====================================================================== */

function tidyLines(text) {
  if (typeof text !== "string") return text;
  const lines = text.replace(/\r\n?/g, "\n").split("\n").map((l) => l.replace(/[ \t]+$/g, ""));
  const seen = new Set();
  const out = [];
  for (const l of lines) {
    if (l.trim() === "" && (out.length === 0 || out[out.length - 1].trim() === "")) continue;
    if (l.trim() !== "" && seen.has(l.trim())) continue; // 提示词里的整行重复（画质词堆两遍）
    if (l.trim() !== "") seen.add(l.trim());
    out.push(l);
  }
  return out.join("\n").trim();
}

function fixRefKeys(refs, log, at) {
  const out = {};
  const items = [];
  for (const k of Object.keys(refs || {})) {
    const m = /(\d+)/.exec(k);
    items.push({ n: m ? Number(m[1]) : 999, key: k, val: refs[k] });
  }
  items.sort((a, b) => a.n - b.n);
  items.forEach((it, i) => {
    const want = `Picture ${i + 1}`;
    if (it.key !== want) log.push(`${at} refs 键 ${it.key} → ${want}`);
    out[want] = it.val;
  });
  return out;
}

function fixH3Zh(shot, log) {
  const h3 = shot.h3 || (shot.h3 = {});
  if (!isStr(h3.zh)) return;
  const before = h3.zh;
  let t = tidyLines(h3.zh);
  const [norm, n] = normalizeBuckets(t, shot.seconds);
  t = norm;
  if (n) log.push(`${shot.id} H3 分时段标签归一化 ${n} 处`);

  // 标签写在同一行时换行，模板是每段一行
  t = t.replace(/([^\n])\s*(?=(?:0-\d+秒：|\d+-\d+秒：|稳定约束：|全局设定：))/g, "$1\n");

  const secs = Number(shot.seconds || 8);
  const want = bucketsFor(secs);
  const got = parseBuckets(t);
  if (got.length === want.length && got.length === 3) {
    let changed = false;
    want.forEach((w, i) => {
      if (got[i].label !== w) { t = t.replace(got[i].label, w); changed = true; }
    });
    if (changed) log.push(`${shot.id} H3 分时段边界按 ${secs} 秒重写为 ${want.join(" ")}`);
  }

  if (!t.includes("字幕：")) {
    const line = "字幕：无任何文字、水印、字幕。";
    if (/声音：[^\n]*/.test(t)) t = t.replace(/(声音：[^\n]*)/, `$1\n${line}`);
    else if (/镜头方式：[^\n]*/.test(t)) t = t.replace(/(镜头方式：[^\n]*)/, `$1\n${line}`);
    else t = t.replace(/全局设定：/, `全局设定：\n${line}`);
    log.push(`${shot.id} H3 补模板固定行「${line}」`);
  }
  if (!t.includes("稳定约束：")) {
    t += `\n${H3_STABILIZE_BLOCK}`;
    log.push(`${shot.id} H3 补模板固定段「稳定约束」`);
  }
  const pos = t.indexOf("稳定约束：");
  t = `${t.slice(0, pos).trim()}\n${t.slice(pos).trim()}`;
  h3.zh = t;
  if (before !== t) return true;
  return false;
}

/** 本集稿：把全稿裁成第 N 集（只留这一集的镜头与该集用到的资产） */
export function sliceSpec(spec, ep) {
  ep = Number(ep);
  const shots = (spec.shots || []).filter((s) => Number(s.ep) === ep);
  const cIds = new Set(shots.flatMap((s) => s.characterIds || []));
  for (const s of shots) for (const b of s.beats || []) {
    if (b.type === "line" && b.speaker && b.speaker !== "VO") cIds.add(b.speaker);
  }
  const sIds = new Set(shots.map((s) => s.sceneId));
  const pIds = new Set(shots.flatMap((s) => s.propIds || []));
  const out = JSON.parse(JSON.stringify(spec));
  out.shots = shots;
  out.characters = (spec.characters || []).filter((c) => cIds.has(c.id));
  out.scenes = (spec.scenes || []).filter((x) => sIds.has(x.id));
  out.props = (spec.props || []).filter((x) => pIds.has(x.id));
  out.episodes = (spec.episodes || []).filter((e) => Number(e.ep) === ep);
  out.params = { ...spec.params, onlyEp: ep };
  return out;
}

export function fixSpec(input) {
  const spec = JSON.parse(JSON.stringify(input));
  const applied = [];
  const todo = [];
  const log = applied;

  if (!isStr(spec.title)) { spec.title = "未命名"; todo.push("顶层 title 为空，请填剧名"); }
  if (!isStr(spec.source)) { spec.source = ""; todo.push("顶层 source 为空，请填原著书名"); }
  const p = (spec.params = spec.params || {});
  if (!Number.isInteger(Number(p.episodes))) { p.episodes = 1; applied.push("params.episodes 缺省 1"); }
  if (!(Number(p.minutesPerEpisode) > 0)) { p.minutesPerEpisode = 1.5; applied.push("params.minutesPerEpisode 缺省 1.5"); }
  if (!isStr(p.genre)) { p.genre = "未标注"; todo.push("params.genre 为空，短剧的题材决定钩子与爽点写法"); }
  if (!isStr(p.aspectRatio)) { p.aspectRatio = "16:9"; applied.push("params.aspectRatio 缺省 16:9"); }
  if (!isStr(p.visualStyle)) todo.push("params.visualStyle 为空——全剧统一画风要写死，否则跨镜画风会飘");
  if (!Number.isInteger(Number(p.shotSeconds))) { p.shotSeconds = 8; applied.push("params.shotSeconds 缺省 8"); }
  if (!["zh", "zh-en", "en3"].includes(p.h3Format)) { p.h3Format = "zh"; applied.push("params.h3Format 缺省 zh"); }

  spec.characters = Array.isArray(spec.characters) ? spec.characters : [];
  spec.scenes = Array.isArray(spec.scenes) ? spec.scenes : [];
  spec.props = Array.isArray(spec.props) ? spec.props : [];
  spec.episodes = Array.isArray(spec.episodes) ? spec.episodes : [];
  spec.shots = Array.isArray(spec.shots) ? spec.shots : [];

  for (const c of spec.characters) {
    c.zImage = c.zImage || { prompt: "" };
    if (!isStr(c.zImage.prompt)) todo.push(`人物 ${c.id} 缺 Z-Image 资产卡提示词`);
    if (c.expr != null && !Array.isArray(c.expr)) { c.expr = [c.expr]; applied.push(`人物 ${c.id} expr 包成数组`); }
  }
  for (const s of [...spec.scenes, ...spec.props]) {
    s.zImage = s.zImage || { prompt: "" };
    if (!isStr(s.zImage.prompt)) todo.push(`${s.id} 缺 Z-Image 提示词`);
  }
  for (const c of spec.characters) if (!isStr(c.anchors)) todo.push(`人物 ${c.id} 缺 anchors（一致性锚点，要逐字复用到每个镜头）`);
  for (const s of spec.scenes) if (!isStr(s.anchors)) todo.push(`场景 ${s.id} 缺 anchors`);

  for (const s of spec.shots) {
    s.characterIds = Array.isArray(s.characterIds) ? s.characterIds : [];
    s.propIds = Array.isArray(s.propIds) ? s.propIds : [];
    s.beats = Array.isArray(s.beats) ? s.beats : [];
    const m = MODE_ALIAS[String(s.mode || "").trim().toUpperCase()];
    if (m && m !== s.mode) { applied.push(`${s.id} mode ${s.mode} → ${m}`); s.mode = m; }
    if (s.mode === undefined || s.mode === null) { s.mode = "I2VA"; applied.push(`${s.id} mode 缺省 I2VA`); }
    const n = Math.round(Number(s.seconds));
    if (!Number.isFinite(n)) { s.seconds = Number(p.shotSeconds) || 8; applied.push(`${s.id} seconds 非法 → ${s.seconds}`); }
    else {
      const cl = Math.min(15, Math.max(4, n));
      if (cl !== n) { applied.push(`${s.id} seconds ${s.seconds} → ${cl}（H3 限 4–15 秒）`); }
      s.seconds = cl;
    }
    for (const b of s.beats) {
      if (b.type === "action" && isStr(b.text)) b.text = tidyLines(b.text).replace(/\n+/g, " ");
      if (b.type === "line" && isStr(b.line)) b.line = tidyLines(b.line).replace(/\n+/g, " ");
    }
    if (s.zImage && isStr(s.zImage.prompt)) s.zImage.prompt = tidyLines(s.zImage.prompt);
    if (s.zImage && isStr(s.zImage.negative)) s.zImage.negative = tidyLines(s.zImage.negative);
    if (s.qwenImage && isStr(s.qwenImage.prompt)) s.qwenImage.prompt = tidyLines(s.qwenImage.prompt).replace(/\n+/g, " ");
    if (s.h3) {
      if (isStr(s.h3.en)) s.h3.en = tidyLines(s.h3.en);
      fixH3Zh(s, log);
    } else { s.h3 = {}; applied.push(`${s.id} 建 h3 容器`); }
    s.refs = fixRefKeys(s.refs, log, s.id);
    if (!isStr(s.summary)) todo.push(`镜头 ${s.id} 缺 summary（这一镜拍什么，一句话）`);
    if (!isStr(s.shotSize)) { s.shotSize = "中景"; applied.push(`${s.id} shotSize 缺省 中景`); }
  }

  for (const s of spec.shots) {
    if (!spec.episodes.find((e) => Number(e.ep) === Number(s.ep))) {
      const first = shotsOf(spec, s.ep)[0];
      spec.episodes.push({ ep: Number(s.ep), title: "", hook: "", hookShotId: first ? first.id : "", suspense: "", suspenseShotId: "" });
      applied.push(`补第 ${s.ep} 集 episodes 条目（hook/suspense 待写）`);
    }
  }
  for (const e of spec.episodes) {
    if (!isStr(e.title)) todo.push(`第 ${e.ep} 集缺 title`);
    if (!isStr(e.hook)) todo.push(`第 ${e.ep} 集缺 hook（钩子）`);
    if (!isStr(e.suspense)) todo.push(`第 ${e.ep} 集缺 suspense（结尾悬念）`);
  }
  for (const e of spec.episodes) {
    const list = shotsOf(spec, e.ep);
    if (!list.length) continue;
    if (e.hookShotId !== list[0].id) { e.hookShotId = list[0].id; applied.push(`第 ${e.ep} 集 hookShotId → 首镜 ${e.hookShotId}`); }
    if (e.suspenseShotId !== list[list.length - 1].id) { e.suspenseShotId = list[list.length - 1].id; applied.push(`第 ${e.ep} 集 suspenseShotId → 末镜 ${e.suspenseShotId}`); }
  }
  spec.shots.sort((a, b) => Number(a.ep) - Number(b.ep));
  return { spec, applied, todo };
}
/* ========================================================================
 * DOCX：零依赖写出（zipfile + OOXML）
 * ====================================================================== */

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let i = 0; i < 256; i++) { let c = i; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[i] = c; }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function zipWrite(entries) {
  const d = new Date();
  const dosT = ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() / 2 | 0)) & 0xffff;
  const dosD = (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xffff;
  const locals = [], centrals = [];
  let offset = 0;
  for (const e of entries) {
    const nameBuf = Buffer.from(e.name, "utf8");
    const raw = Buffer.isBuffer(e.data) ? e.data : Buffer.from(e.data, "utf8");
    const comp = zlib.deflateRawSync(raw, { level: 9 });
    const crc = crc32(raw);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0800, 6); lh.writeUInt16LE(8, 8);
    lh.writeUInt16LE(dosT, 10); lh.writeUInt16LE(dosD, 12); lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(raw.length, 22);
    lh.writeUInt16LE(nameBuf.length, 26); lh.writeUInt16LE(0, 28);
    locals.push(lh, nameBuf, comp);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x0800, 8);
    ch.writeUInt16LE(8, 10); ch.writeUInt16LE(dosT, 12); ch.writeUInt16LE(dosD, 14);
    ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(comp.length, 20); ch.writeUInt32LE(raw.length, 24);
    ch.writeUInt16LE(nameBuf.length, 28); ch.writeUInt16LE(0, 30); ch.writeUInt16LE(0, 32);
    ch.writeUInt16LE(0, 34); ch.writeUInt16LE(0, 36); ch.writeUInt32LE(0, 38); ch.writeUInt32LE(offset, 42);
    centrals.push(ch, nameBuf);
    offset += 30 + nameBuf.length + comp.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(0, 4); end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16); end.writeUInt16LE(0, 20);
  return Buffer.concat([...locals, cd, end]);
}

const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
function rpr(o) {
  if (!o) return "";
  let s = "";
  if (o.font) s += `<w:rFonts w:ascii="${o.font}" w:hAnsi="${o.font}" w:eastAsia="${o.eastAsia || o.font}" w:cs="${o.font}"/>`;
  if (o.bold) s += "<w:b/><w:bCs/>";
  if (o.italic) s += "<w:i/>";
  if (o.color) s += `<w:color w:val="${o.color}"/>`;
  if (o.size) s += `<w:sz w:val="${o.size}"/><w:szCs w:val="${o.size}"/>`;
  return s ? `<w:rPr>${s}</w:rPr>` : "";
}
function runs(text, o) {
  const parts = String(text == null ? "" : text).split("\n");
  let x = "";
  parts.forEach((s, i) => { if (i) x += "<w:br/>"; if (s !== "") x += `<w:t xml:space="preserve">${esc(s)}</w:t>`; });
  return `<w:r>${rpr(o)}${x}</w:r>`;
}
function para(content, o) {
  o = o || {};
  let pp = "";
  if (o.style) pp += `<w:pStyle w:val="${o.style}"/>`;
  if (o.keep) pp += "<w:keepNext/>";
  if (o.border) pp += `<w:pBdr><w:left w:val="single" w:sz="18" w:space="8" w:color="D0D0D0"/></w:pBdr>`;
  if (o.shade) pp += `<w:shd w:val="clear" w:color="auto" w:fill="${o.shade}"/>`;
  if (o.spacing) pp += `<w:spacing ${o.spacing}/>`;
  if (o.ind) pp += `<w:ind ${o.ind}/>`;
  if (o.jc) pp += `<w:jc w:val="${o.jc}"/>`;
  return `<w:p>${pp ? `<w:pPr>${pp}</w:pPr>` : ""}${content || ""}</w:p>`;
}
const P = (text, o, ro) => para(runs(text, ro), o);
const empty = () => para("", { spacing: 'w:before="0" w:after="0" w:line="120" w:lineRule="auto"' });

function tblKV(rows, labelW, totalW) {
  const b = "<w:tblBorders>" + ["top", "left", "bottom", "right", "insideH", "insideV"].map((k) => `<w:${k} w:val="single" w:sz="6" w:space="0" w:color="BFBFBF"/>`).join("") + "</w:tblBorders>";
  const body = rows.map((r) => `<w:tr><w:tc><w:tcPr><w:tcW w:w="${labelW}" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="F4F5F7"/></w:tcPr>${P(r[0], { style: "MjuCell" }, { bold: true, size: 19 })}</w:tc><w:tc><w:tcPr><w:tcW w:w="${totalW - labelW}" w:type="dxa"/></w:tcPr>${P(r[1], { style: "MjuCell" })}</w:tc></w:tr>`).join("");
  return `<w:tbl><w:tblPr><w:tblW w:w="${totalW}" w:type="dxa"/><w:tblLayout w:type="fixed"/>${b}</w:tblPr>${body}</w:tbl>`;
}
function tbl2(rows, w1, w2) {
  const b = "<w:tblBorders>" + ["top", "left", "bottom", "right", "insideH", "insideV"].map((k) => `<w:${k} w:val="single" w:sz="6" w:space="0" w:color="BFBFBF"/>`).join("") + "</w:tblBorders>";
  const body = rows.map((r, i) => `<w:tr><w:tc><w:tcPr><w:tcW w:w="${w1}" w:type="dxa"/>${i === 0 ? '<w:shd w:val="clear" w:color="auto" w:fill="F4F5F7"/>' : ""}</w:tcPr>${P(r[0], { style: "MjuCell" }, { bold: i === 0, size: 19 })}</w:tc><w:tc><w:tcPr><w:tcW w:w="${w2}" w:type="dxa"/>${i === 0 ? '<w:shd w:val="clear" w:color="auto" w:fill="F4F5F7"/>' : ""}</w:tcPr>${P(r[1], { style: "MjuCell" }, { size: 19 })}</w:tc></w:tr>`).join("");
  return `<w:tbl><w:tblPr><w:tblW w:w="9000" w:type="dxa"/><w:tblLayout w:type="fixed"/>${b}</w:tblPr>${body}</w:tbl>`;
}

function stylesXml() {
  const ST = (id, name, pPr, rPr, opts) => {
    opts = opts || {};
    return `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${name}"/>${opts.def ? "" : '<w:basedOn w:val="Normal"/>'}<w:qFormat/>${pPr ? `<w:pPr>${pPr}</w:pPr>` : ""}${rPr ? `<w:rPr>${rPr}</w:rPr>` : ""}</w:style>`;
  };
  const F = (f, ea) => `<w:rFonts w:ascii="${f}" w:hAnsi="${f}" w:eastAsia="${ea || f}" w:cs="${f}"/>`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults><w:rPrDefault><w:rPr>${F("Times New Roman", "宋体")}<w:sz w:val="21"/><w:szCs w:val="21"/><w:lang w:val="en-US" w:eastAsia="zh-CN"/></w:rPr></w:rPrDefault>
<w:pPrDefault><w:pPr><w:spacing w:line="330" w:lineRule="auto" w:after="90"/><w:jc w:val="both"/></w:pPr></w:pPrDefault></w:docDefaults>
${ST("Normal", "Normal", "", "", { def: true })}
${ST("Title", "Title", '<w:spacing w:before="0" w:after="120"/><w:jc w:val="center"/>', F("微软雅黑") + "<w:b/><w:sz w:val=\"44\"/><w:szCs w:val=\"44\"/>")}
${ST("MjuSub", "Mju Sub", '<w:spacing w:before="0" w:after="240"/><w:jc w:val="center"/>', F("微软雅黑") + '<w:sz w:val="22"/><w:color w:val="595959"/>')}
${ST("Heading1", "heading 1", '<w:keepNext/><w:outlineLvl w:val="0"/><w:spacing w:before="360" w:after="180"/><w:jc w:val="left"/><w:pBdr><w:bottom w:val="single" w:sz="8" w:space="4" w:color="1F4E79"/></w:pBdr>', F("微软雅黑") + "<w:b/><w:sz w:val=\"32\"/><w:szCs w:val=\"32\"/><w:color w:val=\"1F4E79\"/>")}
${ST("Heading2", "heading 2", '<w:keepNext/><w:outlineLvl w:val="1"/><w:spacing w:before="260" w:after="120"/><w:jc w:val="left"/>', F("微软雅黑") + "<w:b/><w:sz w:val=\"26\"/><w:szCs w:val=\"26\"/>")}
${ST("Heading3", "heading 3", '<w:keepNext/><w:outlineLvl w:val="2"/><w:spacing w:before="180" w:after="80"/><w:jc w:val="left"/>', F("微软雅黑") + "<w:b/><w:sz w:val=\"23\"/><w:szCs w:val=\"23\"/>")}
${ST("MjuMeta", "Mju Meta", '<w:spacing w:before="0" w:after="200"/><w:jc w:val="center"/>', F("宋体") + '<w:sz w:val="19"/><w:color w:val="595959"/>')}
${ST("MjuLabel", "Mju Label", '<w:keepNext/><w:spacing w:before="160" w:after="60"/><w:jc w:val="left"/>', F("微软雅黑") + "<w:b/><w:sz w:val=\"21\"/><w:color w:val=\"1F4E79\"/>")}
${ST("MjuPrompt", "Mju Prompt", '<w:pBdr><w:left w:val="single" w:sz="18" w:space="6" w:color="D0D0D0"/></w:pBdr><w:shd w:val="clear" w:color="auto" w:fill="F4F5F7"/><w:spacing w:before="0" w:after="60" w:line="280" w:lineRule="auto"/><w:ind w:left="200" w:right="120"/><w:jc w:val="left"/>', F("Consolas", "宋体") + '<w:sz w:val="19"/><w:szCs w:val="19"/>')}
${ST("MjuNote", "Mju Note", '<w:spacing w:before="0" w:after="60"/><w:ind w:left="200"/><w:jc w:val="left"/>', F("宋体") + '<w:sz w:val="19"/><w:color w:val="595959"/>')}
${ST("MjuCell", "Mju Cell", '<w:spacing w:before="20" w:after="20" w:line="260" w:lineRule="auto"/><w:jc w:val="left"/>', F("宋体") + '<w:sz w:val="19"/>')}
${ST("MjuAction", "Mju Action", '<w:spacing w:after="40"/><w:ind w:firstLine="0"/><w:jc w:val="both"/>', F("宋体") + '<w:sz w:val="21"/>')}
${ST("MjuLine", "Mju Line", '<w:spacing w:after="40"/><w:ind w:left="420"/><w:jc w:val="left"/>', F("宋体") + '<w:sz w:val="21"/>')}
${ST("MjuHook", "Mju Hook", '<w:spacing w:after="60"/><w:jc w:val="left"/>', F("微软雅黑") + "<w:b/><w:sz w:val=\"21\"/><w:color w:val=\"C00000\"/>")}
</w:styles>`;
}
/* ========================================================================
 * 文档正文
 * ====================================================================== */

const LBL = { style: "MjuLabel" };
const PROMPT = { style: "MjuPrompt" };
const NOTE = { style: "MjuNote" };
const ACT = { style: "MjuAction" };
const HOOK = { style: "MjuHook" };
const H1 = { style: "Heading1" };
const H2 = { style: "Heading2" };
const H3S = { style: "Heading3" };

// 纸型：默认 A4 横排（剧本是拿来对着屏幕抄提示词的，横排一行放得下更多）
const PAGE = {
  landscape: { w: 16838, h: 11906, orient: ' w:orient="landscape"', kv: [2600, 13400], expr: [2600, 10800], name: "A4 横排" },
  portrait: { w: 11906, h: 16838, orient: "", kv: [2000, 9000], expr: [1700, 7300], name: "A4 竖排" },
};

const SCOPE_LABEL = { all: "", z: "① Z-Image 文生图", q: "② Qwen-Image 图生图", h3: "③ MiniMax H3 图生视频" };
const SCOPE_NOTE = {
  z: "本文档只装① Z-Image 文生图这一段：人物资产卡、场景环境图、道具图，以及每一镜的首帧画面提示词。",
  q: "本文档只装② Qwen-Image 图生图这一段：每一镜在资产图上改出动作、表情、换装、合成的修改指令。",
  h3: "本文档只装③ MiniMax H3 图生视频这一段：每一镜把首帧出成视频的官方标准结构提示词。",
};

function buildBody(spec, scope, pg) {
  scope = scope || "all";
  pg = pg || PAGE.landscape;
  const isAll = scope === "all";
  const out = [];
  const p = spec.params || {};
  const eps = uniq((spec.shots || []).map((s) => Number(s.ep))).sort((a, b) => a - b);
  const cName = (id) => { const c = (spec.characters || []).find((x) => x.id === id); return c ? `${c.name}` : id; };
  const sName = (id) => { const s = (spec.scenes || []).find((x) => x.id === id); return s ? `${s.name}${s.inOut ? `（${s.inOut}·${s.time || ""}）` : ""}` : id; };
  const pName = (id) => { const x = (spec.props || []).find((y) => y.id === id); return x ? x.name : id; };
  const target = Number(p.minutesPerEpisode) * 60;
  const onlyEp = Number(p.onlyEp) || 0;
  const epTag = onlyEp ? ` · 第 ${onlyEp} 集` : "";
  const title = `${spec.title}${epTag} · 漫剧剧本${isAll ? "" : " · " + SCOPE_LABEL[scope]}`;

  out.push(P(title, { style: "Title" }, { font: "微软雅黑" }));
  out.push(P(`改编自《${spec.source || "—"}》 ｜ ${onlyEp ? `第 ${onlyEp} 集 / 全剧 ${p.episodes} 集` : `${p.episodes} 集`} × ${p.minutesPerEpisode} 分钟 ｜ 画幅 ${p.aspectRatio} ｜ ${p.genre}`, { style: "MjuSub" }, { font: "微软雅黑", size: 22, color: "595959" }));
  out.push(tblKV([
    ["剧名", spec.title],
    ["原著", spec.source || "—"],
    ["题材", p.genre],
    ["规格", `${onlyEp ? `第 ${onlyEp} 集（全剧共 ${p.episodes} 集）` : `${p.episodes} 集 × ${p.minutesPerEpisode} 分钟`}（容差 ±15%） ｜ 单镜 ${p.shotSeconds} 秒 ｜ 画幅 ${p.aspectRatio}`],
    ["全剧画风", p.visualStyle || "—"],
    ["镜头", `${(spec.shots || []).length} 镜（${eps.map((e) => `第 ${e} 集 ${shotsOf(spec, e).length} 镜`).join("、")}）`],
    ["人物 / 场景 / 道具", `${(spec.characters || []).length} / ${(spec.scenes || []).length} / ${(spec.props || []).length}`],
    ["提示词", isAll
      ? `Z-Image 文生图 + Qwen-Image 图生图 + MiniMax H3 图生视频（H3 格式 ${p.h3Format}）`
      : `${SCOPE_LABEL[scope]}（三段合一见《${spec.title}·漫剧剧本.docx》）`],
  ], pg.kv[0], pg.kv[1]));
  out.push(empty());

  out.push(P(isAll ? "交付说明" : "说明", H1));
  if (isAll) {
    out.push(P("本文件是可直接投产的漫剧剧本：第一章到第三章是与剧情绑定的图像资产（人物 / 场景 / 道具的 Z-Image 文生图提示词，含一致性锚点），第四章是分集剧本（场次、动作节拍、台词与语气），第五章是逐镜提示词——每一镜都配齐 Z-Image 文生图、Qwen-Image 图生图、MiniMax H3 图生视频三段提示词。", ACT));
  } else {
    out.push(P(SCOPE_NOTE[scope], ACT));
    out.push(P(`与之配套的另两段提示词、人物 / 场景 / 道具资产与分集剧本，见同目录的《${spec.title}·漫剧剧本.docx》（三段合一稿）。`, ACT));
  }
  out.push(P("投产三步：① ComfyUI-Z-Image 按人物 / 场景资产提示词出资产图（每个角色一张资产卡、每个场景一张环境图，全剧复用）；② ComfyUI-Qwen-Image 按每镜的图生图指令，在资产图上改出该镜的动作、表情与构图（即首帧）；③ ComfyUI-MiniMax H3 按每镜的 H3 提示词，把首帧出成一段视频。提示词均可整段复制进对应节点的提示词框。", ACT));
  out.push(empty());

  if (isAll || scope === "z") {
    const n = isAll ? ["一、人物设定", "二、场景设定", "三、道具设定"] : ["一、人物设定", "二、场景设定", "三、道具设定"];
    out.push(P(`${n[0]}（一致性锚点 + Z-Image 资产卡）`, H1));
    for (const c of spec.characters || []) {
      out.push(P(`${c.id} ｜ ${c.name}`, { ...H2, keep: true }));
      out.push(P(`定位：${c.role}`, NOTE));
      out.push(P(`一致性锚点（每一镜的提示词都要逐字复用）：${c.anchors}`, ACT));
      out.push(P("Z-Image 文生图 ｜ 人物资产卡（粘贴进 ComfyUI-Z-Image 提示词框）", LBL));
      out.push(P((c.zImage && c.zImage.prompt) || "", PROMPT));
      if ((c.expr || []).length) {
        out.push(P("Z-Image 微表情（带权重的表情片段，按戏拼在人物提示词后）", LBL));
        out.push(tbl2([["情绪", "提示词（权重写法）"], ...c.expr.map((e) => [e.emotion, e.prompt])], pg.expr[0], pg.expr[1]));
      }
      out.push(empty());
    }

    out.push(P(n[1], H1));
    for (const s of spec.scenes || []) {
      out.push(P(`${s.id} ｜ ${s.name}${s.inOut ? `（${s.inOut}·${s.time || ""}）` : ""}`, { ...H2, keep: true }));
      out.push(P(`一致性锚点：${s.anchors}`, ACT));
      out.push(P("Z-Image 文生图 ｜ 场景环境图", LBL));
      out.push(P((s.zImage && s.zImage.prompt) || "", PROMPT));
      out.push(empty());
    }

    if ((spec.props || []).length) {
      out.push(P(n[2], H1));
      for (const x of spec.props) {
        out.push(P(`${x.id} ｜ ${x.name}`, { ...H2, keep: true }));
        if (x.note) out.push(P(`叙事作用：${x.note}`, ACT));
        out.push(P("Z-Image 文生图 ｜ 道具", LBL));
        out.push(P((x.zImage && x.zImage.prompt) || "", PROMPT));
        out.push(empty());
      }
    }
  }

  if (scope === "q") {
    const withEdit = (spec.characters || []).filter((c) => c.qwenEdit);
    if (withEdit.length) {
      out.push(P("附：角色级换装 / 改装（Qwen-Image 图生图，全剧只做一次的那种改动）", H1));
      for (const c of withEdit) {
        out.push(P(`${c.id} ｜ ${c.name}`, { ...H2, keep: true }));
        out.push(P(c.qwenEdit.prompt || "", PROMPT));
        if (c.qwenEdit.note) out.push(P(`说明：${c.qwenEdit.note}`, NOTE));
        out.push(empty());
      }
    }
  }

  if (isAll) {
    out.push(P("四、分集剧本", H1));
    for (const e of [...(spec.episodes || [])].sort((a, b) => Number(a.ep) - Number(b.ep))) {
      const list = shotsOf(spec, e.ep);
      if (!list.length) continue;
      const secs = list.reduce((a, s) => a + Number(s.seconds || 0), 0);
      const scCount = uniq(list.map((s) => s.sceneId)).length;
      out.push(P(`第 ${e.ep} 集 ｜ ${e.title}`, { ...H2, keep: true }));
      out.push(P(`时长 ${secs} 秒（目标 ${target} 秒）｜ ${list.length} 镜 ｜ ${scCount} 场`, NOTE));
      out.push(P(`【钩子】${e.hook}`, HOOK));
      let cur = null, si = 0;
      for (const s of list) {
        if (s.sceneId !== cur) {
          cur = s.sceneId;
          si += 1;
          out.push(P(`第 ${si} 场 ｜ ${s.flashback ? "【闪回】" : ""}${sName(s.sceneId)}`, { ...H3S, keep: true }));
        }
        for (const b of s.beats || []) {
          if (b.type === "action") out.push(P(b.text, ACT));
          else out.push(para(runs(`${cName(b.speaker)}（${b.delivery || "—"}）：`, { bold: true }) + runs(b.line), { style: "MjuLine" }));
        }
      }
      out.push(P(`【悬念】${e.suspense}`, HOOK));
      out.push(empty());
    }
  }

  out.push(P(isAll ? "五、分镜提示词" : "一、逐镜提示词", H1));
  out.push(P(isAll
    ? "每一镜三段提示词：Z-Image 出首帧（需要动作、表情或构图变化时，用 Qwen-Image 图生图在资产图上改），MiniMax H3 把首帧出成视频。H3 里的「固定不变元素」与「稳定约束」是跨镜一致性条款，逐字保留，不要改写。"
    : `${SCOPE_NOTE[scope]}提示词可整段复制进 ComfyUI 对应节点的提示词框；H3 里的「固定不变元素」与「稳定约束」逐字保留，不要改写。`, ACT));
  out.push(empty());
  for (const s of spec.shots || []) {
    out.push(P(`${s.id} ｜ ${s.seconds} 秒 ｜ ${s.mode}${s.flashback ? " ｜ 【闪回】" : ""} ｜ ${s.shotSize} ｜ ${s.sceneId} ${sName(s.sceneId)}`, { ...H2, keep: true }));
    out.push(P(`这镜拍什么：${s.summary}`, ACT));
    out.push(P(`运镜：${s.camera || "—"} ｜ 人物：${(s.characterIds || []).map(cName).join("、") || "—"} ｜ 道具：${(s.propIds || []).map(pName).join("、") || "—"}`, NOTE));
    const refs = Object.entries(s.refs || {});
    if (refs.length) out.push(P(`参考图：${refs.map(([k, v]) => `${k} = ${v}`).join(" ｜ ")}`, NOTE));
    if (isAll || scope === "z") {
      out.push(P("① Z-Image 文生图 ｜ 首帧", LBL));
      out.push(P((s.zImage && s.zImage.prompt) || "", PROMPT));
      if (s.zImage && s.zImage.negative) out.push(P(`负面提示词：${s.zImage.negative}`, NOTE));
    }
    if (isAll || scope === "q") {
      out.push(P("② Qwen-Image 图生图 ｜ 在资产图上做动作 / 换装 / 融合", LBL));
      out.push(P((s.qwenImage && s.qwenImage.prompt) || "", PROMPT));
      if (s.qwenImage && s.qwenImage.note) out.push(P(`说明：${s.qwenImage.note}`, NOTE));
    }
    if (isAll || scope === "h3") {
      out.push(P("③ MiniMax H3 图生视频 ｜ 中文落地版（直接粘贴，按秒分段）", LBL));
      out.push(P((s.h3 && s.h3.zh) || "", PROMPT));
      if (s.h3 && s.h3.en) {
        out.push(P("④ MiniMax H3 图生视频 ｜ 英文适配版（英文模型识别更准时用）", LBL));
        out.push(P(s.h3.en, PROMPT));
      }
    }
    out.push(empty());
  }
  return out.join("");
}

export function buildDocx(spec, scope, page) {
  const pg = PAGE[page] || PAGE.landscape;
  const CT = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`;
  const RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`;
  const DOCRELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
  const now = new Date().toISOString().replace(/\.\d+Z$/, "Z");
  const CORE = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${esc(spec.title)} · 漫剧剧本</dc:title><dc:subject>${esc(spec.source || "")}</dc:subject><dc:creator>comfyui-ziqwh3</dc:creator><cp:lastModifiedBy>comfyui-ziqwh3</cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>`;
  const DOC = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>${buildBody(spec, scope, pg)}<w:sectPr><w:pgSz w:w="${pg.w}" w:h="${pg.h}"${pg.orient}/><w:pgMar w:top="1440" w:right="1418" w:bottom="1440" w:left="1418" w:header="851" w:footer="992" w:gutter="0"/><w:cols w:space="425"/><w:docGrid w:linePitch="312"/></w:sectPr></w:body></w:document>`;
  return zipWrite([
    { name: "[Content_Types].xml", data: CT },
    { name: "_rels/.rels", data: RELS },
    { name: "docProps/core.xml", data: CORE },
    { name: "word/document.xml", data: DOC },
    { name: "word/_rels/document.xml.rels", data: DOCRELS },
    { name: "word/styles.xml", data: stylesXml() },
  ]);
}

/* ========================================================================
 * readdoc：从 .docx / .txt / .md 里取正文（读小说那一层的入口）
 * ====================================================================== */

export function zipRead(buf, wantName) {
  let p = buf.length - 22;
  while (p >= 0 && buf.readUInt32LE(p) !== 0x06054b50) p -= 1;
  if (p < 0) throw new Error('不是合法的 docx/zip');
  const count = buf.readUInt16LE(p + 10);
  let off = buf.readUInt32LE(p + 16);
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(off) !== 0x02014b50) break;
    const method = buf.readUInt16LE(off + 10);
    const csize = buf.readUInt32LE(off + 20);
    const namelen = buf.readUInt16LE(off + 28);
    const extralen = buf.readUInt16LE(off + 30);
    const commentlen = buf.readUInt16LE(off + 32);
    const lho = buf.readUInt32LE(off + 42);
    const name = buf.slice(off + 46, off + 46 + namelen).toString('utf8');
    if (name === wantName) {
      const lnlen = buf.readUInt16LE(lho + 26);
      const lextra = buf.readUInt16LE(lho + 28);
      const start = lho + 30 + lnlen + lextra;
      const data = buf.slice(start, start + csize);
      return method === 0 ? data : zlib.inflateRawSync(data);
    }
    off += 46 + namelen + extralen + commentlen;
  }
  throw new Error('docx 里找不到 ' + wantName);
}

export function docxParas(file) {
  const xml = zipRead(fs.readFileSync(file), 'word/document.xml').toString('utf8');
  return xml.split('</w:p>').map((chunk) => {
    const parts = chunk.replace(/<w:br\s*\/>/g, '\n').replace(/<w:tab\s*\/>/g, '\t')
      .match(/<w:t[^>]*>[\s\S]*?<\/w:t>/g);
    if (!parts) return '';
    return parts.map((x) => x.replace(/^<w:t[^>]*>/, '').replace(/<\/w:t>$/, '')).join('')
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
  });
}

function cmdReadDoc(file, args) {
  if (!file) { console.error('用法：readdoc <小说.docx|txt|md> [--range 1-200] [--out f]'); process.exitCode = 1; return; }
  const paras0 = /\.docx$/i.test(file)
    ? docxParas(file)
    : fs.readFileSync(file, 'utf8').replace(/\r\n?/g, '\n').split('\n');
  const paras = paras0.map((x) => x.trim()).filter((x) => x !== '');
  let a = 1, b = paras.length;
  if (typeof args.range === 'string') {
    const m = /^(\d+)\s*-\s*(\d+)$/.exec(args.range.trim());
    if (m) { a = Math.max(1, +m[1]); b = Math.min(paras.length, +m[2]); }
  }
  const text = `# ${path.basename(file)} ｜ 共 ${paras.length} 段 ｜ 第 ${a}-${b} 段\n`
    + paras.slice(a - 1, b).map((t, i) => `[${a + i}] ${t}`).join('\n') + '\n';
  if (args.out && args.out !== true) { fs.writeFileSync(String(args.out), text, 'utf8'); console.log(`已写出 ${args.out}（${text.length} 字符）`); }
  else process.stdout.write(text);
}

/* ========================================================================
 * CLI
 * ====================================================================== */

function gateReport(violations) {
  const by = new Map();
  for (const v of violations) { if (!by.has(v.gate)) by.set(v.gate, []); by.get(v.gate).push(v); }
  const lines = [];
  let group = "";
  for (const g of GATES) {
    if (g.group !== group) { group = g.group; lines.push(`\n【${group}层】`); }
    const vs = by.get(g.id) || [];
    const e = vs.filter((x) => x.level === "error").length;
    const w = vs.filter((x) => x.level === "warn").length;
    const mark = e ? "✗" : w ? "△" : "✓";
    const pad = g.id + " ".repeat(Math.max(1, 20 - g.id.length));
    lines.push(`  ${mark} ${pad}${g.title}${vs.length ? `　${vs.length} 条（错 ${e} / 警 ${w}）` : ""}`);
  }
  return lines.join("\n");
}

function gateDetails(violations) {
  if (!violations.length) return "";
  const lines = ["\n违规明细："];
  for (const v of violations) lines.push(`  [${v.level === "error" ? "错误" : "警告"}] ${v.gate}${v.at ? ` ${v.at}` : ""}：${v.msg}`);
  return lines.join("\n");
}

function cmdValidate(specPath) {
  const spec = readJson(specPath);
  const v = runGates(spec);
  const e = v.filter((x) => x.level === "error").length;
  const w = v.length - e;
  console.log(`\ncomfyui-ziqwh3 validate ｜ ${path.basename(specPath)} ｜ 镜头 ${(spec.shots || []).length} ｜ 22 道质量门`);
  console.log(gateReport(v));
  console.log(gateDetails(v));
  console.log(`\n${e ? "✗ 未通过" : "✓ 通过"}：错误 ${e} 处、警告 ${w} 处`);
  if (e) {
    console.log("逐条修，改完重跑；机械性归一化先跑 `fix`。");
    process.exitCode = 1;
  }
  return e;
}

function cmdFix(specPath, args) {
  const src = readJson(specPath);
  const { spec, applied, todo } = fixSpec(src);
  const out = args.out ? String(args.out) : args.write ? specPath : specPath.replace(/\.json$/i, "") + ".fixed.json";
  writeJson(out, spec);
  console.log(`\ncomfyui-ziqwh3 fix ｜ ${path.basename(specPath)}`);
  console.log(`\n机械校正 ${applied.length} 处：`);
  for (const x of applied) console.log(`  · ${x}`);
  if (todo.length) {
    console.log(`\n需要补写内容 ${todo.length} 处（机械校正不造内容）：`);
    for (const x of todo) console.log(`  · ${x}`);
  }
  console.log(`\n写入 ${out}`);
  const v = runGates(spec);
  const e = v.filter((x) => x.level === "error").length;
  console.log(`校正后复检：错误 ${e} 处、警告 ${v.length - e} 处${e ? "（内容问题请按 validate 明细改）" : ""}`);
  return spec;
}

function cmdRender(specPath, args) {
  const spec = readJson(specPath);
  const v = runGates(spec);
  const e = v.filter((x) => x.level === "error").length;
  if (e && !args.force) {
    console.log(gateDetails(v.filter((x) => x.level === "error")));
    console.error(`\n✗ 还有 ${e} 处错误，不出文档。先 validate/fix 改到通过，或加 --force 强行出稿。`);
    process.exitCode = 1;
    return;
  }
  const dir = args.docx && args.docx !== true
    ? path.dirname(path.resolve(String(args.docx)))
    : path.dirname(path.resolve(specPath));
  fs.mkdirSync(dir, { recursive: true });
  const shots = (spec.shots || []).length;
  const page = args.page && args.page !== true ? String(args.page) : "landscape";
  const written = [];
  const emit = (target, scope, file) => {
    const buf = buildDocx(target, scope, page);
    fs.writeFileSync(file, buf);
    written.push([scope, file, buf.length]);
    return buf;
  };
  const SUFFIX = { all: "漫剧剧本.docx", z: "①Z-Image文生图.docx", q: "②Qwen-Image图生图.docx", h3: "③MiniMaxH3图生视频.docx" };
  const SCOPE_ORDER = args.split ? ["all", "z", "q", "h3"] : [args.scope && args.scope !== true ? String(args.scope) : "all"];
  const epArg = args.ep && args.ep !== true ? String(args.ep) : "";
  const eps = epArg
    ? uniq(epArg.split(/[,，\s]+/).map((x) => Number(x)).filter((n) => Number.isInteger(n) && n > 0)).sort((a, b) => a - b)
    : [];
  console.log(`\ncomfyui-ziqwh3 render ｜ ${path.basename(specPath)}`);
  console.log(`  集数 ${(spec.episodes || []).length} ｜ 镜头 ${shots} ｜ 人物 ${(spec.characters || []).length} ｜ 场景 ${(spec.scenes || []).length} ｜ 道具 ${(spec.props || []).length}`);
  console.log(`  纸型 ${(PAGE[page] || PAGE.landscape).name} ｜ 交付形态 ${args.split ? "三段合一 + 三份分模型稿" : args.scope && args.scope !== true ? "分模型稿" : "三段合一"}`);
  const base = args.docx && args.docx !== true
    ? String(args.docx).replace(/\.docx$/i, "")
    : path.join(dir, spec.title);
  if (eps.length) {
    for (const ep of eps) {
      const one = sliceSpec(spec, ep);
      const vv = runGates(one);
      const ee = vv.filter((x) => x.level === "error");
      if (ee.length) {
        console.log(gateDetails(ee));
        console.error(`✗ 第 ${ep} 集裁剪稿过门失败（${ee.length} 处错误），跳过这一集。`);
        process.exitCode = 1;
        continue;
      }
      const epBase = `${base}-EP${String(ep).padStart(2, "0")}`;
      const used = one.shots.length;
      const assets = `${(one.characters || []).length} 人 / ${(one.scenes || []).length} 景 / ${(one.props || []).length} 物`;
      for (const sc of SCOPE_ORDER) emit(one, sc, `${epBase}-${SUFFIX[sc]}`);
      console.log(`  ✓ 第 ${ep} 集：${used} 镜 ｜ ${assets} ｜ 过门 0 错（裁剪稿单独过了一遍 22 道门）`);
    }
  } else if (args.split) {
    for (const sc of SCOPE_ORDER) emit(spec, sc, `${base}-${SUFFIX[sc]}`);
  } else if (args.scope && args.scope !== true) {
    emit(spec, String(args.scope), args.docx && args.docx !== true
      ? String(args.docx)
      : path.join(dir, `${spec.title}·漫剧剧本.docx`));
  } else {
    emit(spec, "all", args.docx && args.docx !== true
      ? String(args.docx)
      : path.join(dir, `${spec.title}·漫剧剧本.docx`));
  }
  for (const [scope, file, size] of written) {
    const tag = scope === "all" ? "三段合一" : SCOPE_LABEL[scope];
    console.log(`  Word 已写出：[${tag}] ${file}（${(size / 1024).toFixed(0)} KB）`);
  }
  if (e) console.log(`  注意：有 ${e} 处错误未修，是 --force 出稿。`);
}

function usage() {
  console.log(`
comfyui-ziqwh3 — 小说 → 短剧漫剧剧本（Word）+ Z-Image / Qwen-Image / MiniMax H3 三类提示词

  node ziqwh3.mjs readdoc  <小说.docx> [--range 1-200]    # 取小说正文（docx/txt/md，带段号）
  node ziqwh3.mjs validate <manju.json>                  # 22 道质量门（逻辑 11 + 提示词 11）
  node ziqwh3.mjs fix      <manju.json> [--out f|--write] # 机械校正：归一化 + 模板固定项补全
  node ziqwh3.mjs render   <manju.json> [--docx out.docx] [--force] [--page landscape|portrait]
  node ziqwh3.mjs render   <manju.json> --split          # 出 4 份：三段合一 + ①Z-Image / ②Qwen-Image / ③H3 各一份
  node ziqwh3.mjs render   <manju.json> --scope z|q|h3   # 只出一份分模型稿
  node ziqwh3.mjs render   <manju.json> --ep 1,2 --split --docx <基名>   # 按集拆：每集一套（三段合一 + 三份分模型稿）
`);
}

export function main(argv) {
  const cmd = argv[0];
  const args = parseArgs(argv.slice(1));
  if (cmd === "validate") cmdValidate(args._[0]);
  else if (cmd === "fix") cmdFix(args._[0], args);
  else if (cmd === "render") cmdRender(args._[0], args);
  else if (cmd === "readdoc") cmdReadDoc(args._[0], args);
  else usage();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv.slice(2));