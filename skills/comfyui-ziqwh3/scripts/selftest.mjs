#!/usr/bin/env node
/**
 * selftest — 不调模型、不花额度，验证 22 道质量门与 fix / render 的行为。
 * 夹具就是 examples 里那份真样例（8 镜全过门的 EP01），逐条改坏它，看门认不认。
 *   node scripts/selftest.mjs
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GATES, runGates, fixSpec, buildDocx, docxParas, zipRead } from "./ziqwh3.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const EXAMPLE = path.join(HERE, "..", "examples", "道祖重修记-青石镇-漫剧剧本-manju.json");

let pass = 0, fail = 0;
const failures = [];
function t(name, fn) {
  try { fn(); pass += 1; } catch (e) { fail += 1; failures.push(`${name} — ${e.message}`); }
}
const ok = (cond, msg) => { if (!cond) throw new Error(msg || "断言失败"); };
const clone = (o) => JSON.parse(JSON.stringify(o));
const errs = (spec, gate) => runGates(spec).filter((v) => v.gate === gate && v.level === "error");
const warns = (spec, gate) => runGates(spec).filter((v) => v.gate === gate && v.level === "warn");
const BASE = JSON.parse(fs.readFileSync(EXAMPLE, "utf8"));

/* ---------- 0. 门表与基准 ---------- */
t("22 道质量门、其中逻辑 11 / 提示词 11", () => {
  ok(GATES.length === 22, `门数 ${GATES.length}`);
  ok(GATES.filter((g) => g.group === "逻辑").length === 11, "逻辑层门数不对");
  ok(GATES.filter((g) => g.group === "提示词").length === 11, "提示词层门数不对");
});
t("样例本身全过（0 错 0 警）", () => {
  const v = runGates(BASE);
  ok(v.length === 0, `样例有 ${v.length} 处违规：${v.slice(0, 3).map((x) => x.gate + " " + x.msg).join(" / ")}`);
});

/* ---------- 1. 逻辑层 11 道 ---------- */
t("ep-continuity：episodes 条目缺失要拦", () => {
  const s = clone(BASE); s.episodes = [];
  ok(errs(s, "ep-continuity").length > 0);
});
t("ep-continuity：params.episodes 对不上镜头要拦", () => {
  const s = clone(BASE); s.params.episodes = Number(BASE.params.episodes) + 2;
  ok(errs(s, "ep-continuity").length > 0);
  const t2 = clone(BASE); t2.shots = t2.shots.filter((x) => Number(x.ep) !== Number(BASE.params.episodes));
  ok(errs(t2, "ep-continuity").length > 0, "末集镜头被删空也该被拦");
});
t("refs-valid：引用未登记角色要拦", () => {
  const s = clone(BASE); s.shots[1].characterIds = ["C99"];
  ok(errs(s, "refs-valid").length > 0);
});
t("refs-valid：引用未登记场景要拦", () => {
  const s = clone(BASE); s.shots[0].sceneId = "S99";
  ok(errs(s, "refs-valid").length > 0);
});
t("time-budget：单集超出 ±15% 要拦", () => {
  const s = clone(BASE); s.shots[0].seconds = 15;
  ok(errs(s, "time-budget").length > 0);
});
t("shot-seconds：超 15 秒、mode 非法的要拦", () => {
  const a = clone(BASE); a.shots[0].seconds = 20;
  ok(errs(a, "shot-seconds").length > 0);
  const b = clone(BASE); b.shots[0].mode = "I2V";
  ok(errs(b, "shot-seconds").length > 0);
});
t("line-length：单句超 35 字要拦", () => {
  const s = clone(BASE);
  s.shots[2].beats.push({ type: "line", speaker: "C01", line: "这是一句故意写得很长很长的台词，用来测试字数上限是不是真的会被这道门拦下来，顺便看看三十五字到底有多长", delivery: "平静" });
  ok(errs(s, "line-length").length > 0);
});
t("line-density：单镜台词总量超秒数×5 要拦", () => {
  const s = clone(BASE);
  for (let i = 0; i < 3; i++) s.shots[2].beats.push({ type: "line", speaker: "C01", line: "一二三四五六七八九十一二三四五六七八九十", delivery: "平静" });
  ok(errs(s, "line-density").length > 0);
});
t("speaker-valid：说话人不在表内要拦", () => {
  const s = clone(BASE); s.shots[3].beats.find((b) => b.type === "line").speaker = "C99";
  ok(errs(s, "speaker-valid").length > 0);
});
t("beat-mix：没有动作节拍要拦、超过 4 个也要拦", () => {
  const a = clone(BASE); a.shots[1].beats = a.shots[1].beats.filter((b) => b.type !== "action");
  ok(errs(a, "beat-mix").length > 0);
  const b = clone(BASE);
  for (let i = 0; i < 4; i++) b.shots[1].beats.push({ type: "action", text: "少年把手指慢慢收拢了一下又松开" });
  ok(errs(b, "beat-mix").length > 0);
});
t("beat-mix：动作节拍不足 8 字（是标签不是画面）要拦", () => {
  const s = clone(BASE); s.shots[1].beats[0].text = "睁眼";
  ok(errs(s, "beat-mix").length > 0);
});
t("ep-hook：钩子没落在首镜要拦", () => {
  const a = clone(BASE); a.episodes[0].hookShotId = "EP01-SH08";
  ok(errs(a, "ep-hook").length > 0);
  const b = clone(BASE); b.episodes[0].hook = "顾家世代以镖行立足，如今进项一年不如一年";
  ok(errs(b, "ep-hook").length > 0);
});
t("ep-hook：悬念没落在末镜要拦", () => {
  const s = clone(BASE); s.episodes[0].suspenseShotId = "EP01-SH01";
  ok(errs(s, "ep-hook").length > 0);
});
t("character-usage：登记了却没用要拦", () => {
  const s = clone(BASE);
  s.characters.push({ id: "C09", name: "路人", role: "测试用", anchors: "一名路人", zImage: { prompt: "横版16:9，超高清，写实风格的立绘路人，纯白背景" } });
  ok(errs(s, "character-usage").length > 0);
});
t("scene-backtrack：同集内角色场次往复要拦", () => {
  const s = clone(BASE); s.shots[5].sceneId = "S03";
  ok(errs(s, "scene-backtrack").length > 0);
});
t("scene-backtrack：标了 flashback 的镜头不算往复", () => {
  ok(errs(BASE, "scene-backtrack").length === 0, "基准样例不该报往复");
  const s = clone(BASE); s.shots[5].flashback = true; s.shots[5].sceneId = "S03";
  ok(errs(s, "scene-backtrack").length === 0, "闪回镜不该算往复");
});

/* ---------- 2. 提示词层 9 道 ---------- */
t("zimage-structure：缺画质/风格词、太短要拦", () => {
  const a = clone(BASE); a.characters[0].zImage.prompt = "少年立绘，纯白背景";
  ok(errs(a, "zimage-structure").length > 0);
  const b = clone(BASE); b.shots[1].zImage.prompt = "少年躺在床上睁眼，油灯照着他的半边脸，氛围安静，画面很暗";
  ok(errs(b, "zimage-structure").length > 0, "缺画质词与风格词该被拦");
});
t("zimage-structure：没写画幅只警告不出错", () => {
  const s = clone(BASE);
  s.scenes[0].zImage.prompt = s.scenes[0].zImage.prompt.replace(/横版16:9，|16:9。/g, "");
  ok(errs(s, "zimage-structure").length === 0, "画幅缺失不该是错误");
  ok(warns(s, "zimage-structure").length > 0, "画幅缺失该有警告");
});
t("zimage-asset：人物不是资产卡版式要拦", () => {
  const s = clone(BASE);
  s.characters[0].zImage.prompt = s.characters[0].zImage.prompt.replace(/角色资产卡片|画面右侧水平并排3张全身立绘：正面、45°侧面、背面/g, "全身像");
  ok(errs(s, "zimage-asset").length > 0);
});
t("zimage-asset：场景没写光要拦", () => {
  const s = clone(BASE);
  s.scenes[1].zImage.prompt = "横版16:9，超高清，东方修仙场景概念图，悬空白玉台立在云海之上，国风仙侠概念艺术，8K高清。";
  ok(errs(s, "zimage-asset").length > 0);
});
t("zimage-microexpr：微表情没带权重要拦", () => {
  const s = clone(BASE); s.characters[0].expr[0].prompt = "上眼睑下垂，下眼睑紧绷，目光看向左下方，无泪流满面，无张嘴。";
  ok(errs(s, "zimage-microexpr").length > 0);
});
t("zimage-microexpr：情绪戏而无微表情登记只警告", () => {
  const s = clone(BASE); s.characters[0].expr = [];
  s.shots[1].beats[0].text = "少年仰面躺着，眼睛里是压着的悲伤，目光直直落在上方发黑的房梁上。";
  ok(errs(s, "zimage-microexpr").length === 0, "无微表情不该是错误");
  ok(warns(s, "zimage-microexpr").length > 0, "情绪戏该有警告");
});
t("qwen-structure：没写修改指令/保留从句/参考分工要拦", () => {
  const s = clone(BASE); s.shots[1].qwenImage.prompt = "换个动作，让他坐起来。";
  const v = errs(s, "qwen-structure");
  ok(v.length >= 2, `该拦多条，实际 ${v.length}`);
});
t("h3-structure：缺稳定约束 / 分时段不连续 / 末段对不上秒数要拦", () => {
  const a = clone(BASE); a.shots[0].h3.zh = a.shots[0].h3.zh.replace("稳定约束：", "补充说明：");
  ok(errs(a, "h3-structure").length > 0);
  const b = clone(BASE); b.shots[0].h3.zh = b.shots[0].h3.zh.replace("2-5秒：", "2-6秒：");
  ok(errs(b, "h3-structure").length > 0);
  const c = clone(BASE); c.shots[0].h3.zh = c.shots[0].h3.zh.replace("5-8秒：", "5-9秒：");
  ok(errs(c, "h3-structure").length > 0);
});
t("h3-structure：h3Format=zh-en 而镜头没有英文版要拦", () => {
  const s = clone(BASE); s.params.h3Format = "zh-en";
  ok(errs(s, "h3-structure").length > 0);
});
t("h3-boilerplate：缺声音/字幕固定行要拦", () => {
  const s = clone(BASE); s.shots[0].h3.zh = s.shots[0].h3.zh.replace(/声音：[^\n]*\n/, "");
  ok(errs(s, "h3-boilerplate").length > 0);
});
t("h3-mode-align：I2VA 没写首帧/原图要拦", () => {
  const s = clone(BASE);
  s.shots[1].h3.zh = s.shots[1].h3.zh.replace(/首帧/g, "画面").replace(/原图/g, "底图");
  ok(errs(s, "h3-mode-align").length > 0);
});
t("h3-mode-align：R2VA 没写参考图分工要拦", () => {
  const s = clone(BASE); s.shots[3].h3.zh = s.shots[3].h3.zh.replace(/参考图/g, "素材");
  ok(errs(s, "h3-mode-align").length > 0);
});
t("h3-mode-align：en3 的对齐句与模式不符要拦", () => {
  const s = clone(BASE);
  s.params.h3Format = "en3";
  s.shots.forEach((sh) => {
    sh.h3.en = "integrated_multimodal_description: [Shot 1] The room is quiet.\n\noverall_soundscape: Night wind.\n\nnon_diegetic_music: N/A";
  });
  ok(errs(s, "h3-mode-align").length > 0, "I2VA/FL2VA 缺对齐句该被拦");
  const good = clone(s);
  good.shots[1].h3.en = "For the target video, at 0.00 seconds into the target video, <Picture 1> (from [Shot 1]) is fully referenced.\n\nintegrated_multimodal_description: [Shot 1] The boy opens his eyes.\n\noverall_soundscape: Night wind and the lamp wick.\n\nnon_diegetic_music: N/A";
  ok(errs(good, "h3-mode-align").length < errs(s, "h3-mode-align").length, "补上逐字对齐句应当减少违规");
});
t("h3-refs：Picture 编号不连续 / I2VA 缺 Picture 1 要拦", () => {
  const a = clone(BASE); a.shots[1].refs = { "Picture 2": "本镜首帧" };
  ok(errs(a, "h3-refs").length > 0);
  const b = clone(BASE); b.shots[4].refs = { "Picture 1": "首帧" };
  ok(errs(b, "h3-refs").length > 0, "FL2VA 缺尾帧该被拦");
});
t("h3-length：英文提示词超 7000 字符要拦", () => {
  const s = clone(BASE); s.shots[1].h3.en = "x".repeat(7001);
  ok(errs(s, "h3-length").length > 0);
});

t("zimage-prop：器物缺材质 / 光效 / 承载 要拦", () => {
  const a = clone(BASE);
  a.props[0].zImage.prompt = "一块巴掌大的旧东西，成色极差，表面磨得温润发亮，边角缺了一块。白底居中，斜上方柔光照射，微距镜头，锐利对焦，工作室灯光，8K高清，写实风格，细节清晰。";
  ok(errs(a, "zimage-prop").some((x) => x.msg.includes("材质")), "缺材质该被拦");
  const b = clone(BASE);
  b.props[0].zImage.prompt = "一块巴掌大的旧玉佩，玉质浑浊，边角缺了一块，孔里穿着一截旧绳，白底居中，微距镜头，工作室灯光，8K高清，写实风格，细节清晰。";
  ok(errs(b, "zimage-prop").some((x) => x.msg.includes("光效")), "缺光效该被拦");
  const c = clone(BASE);
  c.props[0].zImage.prompt = "一块巴掌大的旧玉佩，玉质浑浊偏灰白，边角缺了一块，孔里穿着一截旧绳，斜上方柔光照射，微距镜头，工作室灯光，8K高清，写实风格，细节清晰。";
  ok(errs(c, "zimage-prop").some((x) => x.msg.includes("没交代它放在哪")), "缺承载该被拦");
});
t("zimage-prop：抽象词要拦（标准点名好看/厉害）", () => {
  const s = clone(BASE);
  s.props[1].zImage.prompt = "一块很厉害的旧木牌，超级好看，8K高清，写实风格，置于桌面，柔光照射，木质纹理。";
  ok(errs(s, "zimage-prop").length > 0);
});
t("zimage-prop：缺 note 要拦", () => {
  const s = clone(BASE); delete s.props[0].note;
  ok(errs(s, "zimage-prop").length > 0);
});
t("zimage-asset：阵法/结界类场景必须写符文/能量", () => {
  const s = clone(BASE);
  s.scenes.push({ id: "S09", name: "青云剑阵", inOut: "外", time: "夜", anchors: "铺满青石的符阵",
    zImage: { prompt: "横版16:9，超高清，古风仙侠外景，地面铺满青石的广场，四周立着石柱，月光斜照，写实国风，电影级光影，8K高清。" } });
  s.shots[3].sceneId = "S09";
  ok(errs(s, "zimage-asset").length > 0, "阵法场景没写符文/能量该被拦");
  const ok1 = clone(s);
  const sc = ok1.scenes.find((x) => x.id === "S09");
  sc.zImage.prompt = sc.zImage.prompt.replace("写实国风", "金色符文在地面流转，阵纹亮起，写实国风");
  ok(errs(ok1, "zimage-asset").length === 0, "补上符文流转就该过");
});
t("h3-action：动作镜缺力因果链 / 特效 / 具体音效要拦", () => {
  const s = clone(BASE); s.shots[4].actionShot = true;
  const v = errs(s, "h3-action");
  ok(v.some((x) => x.msg.includes("特效")), "缺特效该被拦");
  ok(v.some((x) => x.msg.includes("景别")), "图生图缺景别该被拦");
  const s2 = clone(s);
  s2.shots[4].h3.zh = s2.shots[4].h3.zh.replace(/发力|重心|破空/g, "地");
  const v2 = errs(s2, "h3-action");
  ok(v2.some((x) => x.msg.includes("力因果链")), "缺力因果链该被拦");
  ok(v2.some((x) => x.msg.includes("音效匹配")), "音效没写具体声响该被拦");
});
t("h3-action：规范写法的动作镜要过", () => {
  const s = clone(BASE);
  const sh = s.shots[4];
  sh.actionShot = true;
  sh.h3.zh = sh.h3.zh
    .replace("攥住手腕的那只手发力向外一送", "攥住手腕的那只手蓄力一沉，力量顺着腕骨传导，掌心接触皮肤的瞬间发力向外一送")
    .replace("衣袖与衣摆被风轻轻带动", "衣袖与衣摆被风轻轻带动，衣料边缘泛出细碎光尘与气流涟漪")
    .replace(/音效匹配：/g, "音效匹配：飞剑破空般的衣料破空声、");
  sh.qwenImage.prompt = "Create a two-frame edit at medium shot scale: keep image 1's sleeve, the gripping hand and the stone step unchanged, then change only the boy's pose — the hand grabs and pulls, his upper body tips backward, the hem swings up with the motion. Preserve his face, hairstyle and clothing between the two states, keep the same camera angle and the same dusk lighting direction, and do not add any character.";
  const v = errs(s, "h3-action");
  ok(v.length === 0, `规范写法该过：${v.map((x) => x.msg).join(" / ")}`);
});
t("h3-action：看着像动作镜却没标 actionShot 只警告", () => {
  const s = clone(BASE);
  s.shots[1].beats.push({ type: "action", text: "少年抬手结印，指诀亮起一缕剑气朝门外飞去" });
  ok(errs(s, "h3-action").length === 0, "没标不该是错误");
  ok(warns(s, "h3-action").length > 0, "该给一条嗅探警告");
});

/* ---------- 3. fix：机械校正 ---------- */
t("fix：分时段标签归一化 + 补字幕行 + 补稳定约束", () => {
  const s = clone(BASE);
  s.shots[0].h3.zh = s.shots[0].h3.zh
    .replace(/0-2秒：/, "0-2s：").replace(/2-5秒：/, "2 至 5 秒：")
    .replace(/字幕：无任何文字、水印、字幕。\n/, "")
    .replace(/稳定约束：[\s\S]*$/, "");
  const r = fixSpec(s);
  const zh = r.spec.shots[0].h3.zh;
  ok(/0-2秒：/.test(zh) && /2-5秒：/.test(zh), "标签没归一化");
  ok(/字幕：无任何文字、水印、字幕。/.test(zh), "字幕行没补上");
  ok(/稳定约束：/.test(zh) && zh.split("稳定约束：")[1].length > 20, "稳定约束没补上");
  ok(errs(r.spec, "h3-structure").length === 0 && errs(r.spec, "h3-boilerplate").length === 0, "补完仍不过门");
});
t("fix：mode 归一化、秒数夹取、refs 键归一化", () => {
  const s = clone(BASE);
  s.shots[1].mode = "i2v";
  s.shots[1].seconds = 20;
  s.shots[1].refs = { "picture2": "首帧" };
  const r = fixSpec(s);
  ok(r.spec.shots[1].mode === "I2VA", "mode 没归一化");
  ok(r.spec.shots[1].seconds === 15, "秒数没夹到 15");
  ok(Object.keys(r.spec.shots[1].refs)[0] === "Picture 1", "refs 键没归一化");
});
t("fix：缺 episodes 条目会自动补，并把 hookShotId 指到各集首镜", () => {
  const s = clone(BASE); s.episodes = [];
  const eps = [...new Set(BASE.shots.map((x) => Number(x.ep)))].sort((a, b) => a - b);
  const r = fixSpec(s);
  ok(r.spec.episodes.length === eps.length, `补出来的集数不对：${r.spec.episodes.length} vs ${eps.length}`);
  for (const ep of eps) {
    const first = BASE.shots.filter((x) => Number(x.ep) === ep)[0].id;
    const e = r.spec.episodes.find((x) => Number(x.ep) === ep);
    ok(e && e.hookShotId === first, `第 ${ep} 集 hookShotId 没指到首镜 ${first}`);
  }
  ok(r.todo.some((x) => x.includes("hook")), "该提示补写 hook/suspense");
});
t("fix：params 缺省回落", () => {
  const s = clone(BASE); delete s.params.h3Format; delete s.params.aspectRatio; delete s.params.shotSeconds;
  const r = fixSpec(s);
  ok(r.spec.params.h3Format === "zh" && r.spec.params.aspectRatio === "16:9" && r.spec.params.shotSeconds === 8);
});
t("fix：提示词里的整行重复会被去掉", () => {
  const s = clone(BASE);
  s.shots[0].zImage.prompt = "8K高清。\n8K高清。\n横版16:9，超高清，8K高清。";
  const r = fixSpec(s);
  ok(r.spec.shots[0].zImage.prompt === "8K高清。\n横版16:9，超高清，8K高清。", `实际：${JSON.stringify(r.spec.shots[0].zImage.prompt)}`);
});

t("render：默认 A4 横排，可切竖排", () => {
  const land = zipRead(buildDocx(BASE, "all", "landscape"), "word/document.xml").toString("utf8");
  ok(land.includes('<w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/>'), "横排 pgSz 不对");
  const port = zipRead(buildDocx(BASE, "all", "portrait"), "word/document.xml").toString("utf8");
  ok(port.includes('<w:pgSz w:w="11906" w:h="16838"/>'), "竖排 pgSz 不对");
  ok(!port.includes("landscape"), "竖排不该带 landscape");
  const def = zipRead(buildDocx(BASE), "word/document.xml").toString("utf8");
  ok(def.includes('w:orient="landscape"'), "默认应当是横排");
});
t("render：表格宽度不超出横排版心", () => {
  const land = zipRead(buildDocx(BASE, "all", "landscape"), "word/document.xml").toString("utf8");
  const widths = [...land.matchAll(/<w:tblW w:w="(\d+)"/g)].map((m) => Number(m[1]));
  ok(widths.length >= 1, "文档里没有表格");
  const usable = 16838 - 1418 * 2;
  ok(widths.every((w) => w <= usable), `表格宽度超出版心：${widths.join("/")} > ${usable}`);
  const cellSum = [...land.matchAll(/<w:tcW w:w="(\d+)"/g)].map((m) => Number(m[1]));
  ok(cellSum.every((w) => w <= usable), "单元格宽度超出版心");
});

/* ---------- 4. render：Word ---------- */
t("render：docx 是合法 zip，关键部件齐、XML 合法", () => {
  const buf = buildDocx(BASE);
  ok(buf.readUInt32LE(0) === 0x04034b50, "不是 zip");
  const s = BASE.title;
  const doc = zipRead(buf, "word/document.xml").toString("utf8");
  ok(doc.includes("<w:p>"), "document.xml 没有段落");
  ok(doc.includes(s), "文档里没有剧名");
  ok(doc.includes("EP01-SH01") && doc.includes("EP01-SH08"), "镜头号没进文档");
  ok(doc.includes("全局设定：") && doc.includes("稳定约束："), "H3 提示词没进文档");
  ok(doc.includes("Qwen-Image 图生图") && doc.includes("Z-Image 文生图"), "三类提示词标题不全");
  ok(doc.includes("【闪回】"), "闪回镜没在场次/镜头标出来");
  ok(zipRead(buf, "[Content_Types].xml").length > 100, "缺 Content_Types");
  ok(zipRead(buf, "word/styles.xml").length > 500, "缺 styles");
});
t("render：写出文件后能读回正文（readdoc 通路）", () => {
  const out = path.join(os.tmpdir(), "manju-selftest.docx");
  fs.writeFileSync(out, buildDocx(BASE));
  const paras = docxParas(out);
  ok(paras.length > 100, `段落只有 ${paras.length}`);
  const text = paras.join("\n");
  ok(text.includes("第 1 集"), "剧本层没渲染");
  ok(text.includes("……不是摔死的。"), "台词没渲染");
  ok(text.includes("【悬念】"), "悬念没渲染");
  fs.unlinkSync(out);
});
t("render：--force 之外，有错误时拒绝出稿（用样例改坏再修）", () => {
  const bad = clone(BASE);
  bad.shots[0].seconds = 20;
  ok(errs(bad, "shot-seconds").length > 0, "改坏的样例该报错");
  const fixed = fixSpec(bad).spec;
  ok(errs(fixed, "shot-seconds").length === 0, "fix 后该能出稿");
});

t("render：分模型稿（--scope）各只装自己那一段提示词", () => {
  const xml = (scope) => zipRead(buildDocx(BASE, scope), "word/document.xml").toString("utf8");
  const z = xml("z"), q = xml("q"), h = xml("h3");
  ok(z.includes("① Z-Image 文生图 ｜ 首帧"), "z 稿缺逐镜首帧提示词");
  ok(!z.includes("② Qwen-Image 图生图 ｜"), "z 稿不该装图生图指令");
  ok(q.includes("② Qwen-Image 图生图 ｜"), "q 稿缺逐镜图生图指令");
  ok(!q.includes("全局设定："), "q 稿不该装 H3 提示词");
  ok(h.includes("全局设定：") && h.includes("稳定约束："), "h3 稿缺 H3 提示词");
  ok(!h.includes("① Z-Image 文生图 ｜"), "h3 稿不该装文生图提示词");
  ok(!q.includes("四、分集剧本"), "分模型稿不带分集剧本");
  ok(xml("all").includes("四、分集剧本"), "三段合一稿该带分集剧本");
});

/* ---------- 汇总 ---------- */
console.log(`\ncomfyui-ziqwh3 selftest ｜ 通过 ${pass} ｜ 失败 ${fail}`);
if (fail) {
  console.log("\n失败清单：");
  for (const x of failures) console.log(`  ✗ ${x}`);
  process.exitCode = 1;
} else {
  console.log("22 道质量门、fix、render 全部符合预期。");
}