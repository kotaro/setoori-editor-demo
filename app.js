"use strict";
/*
  瀬戸織ネーム デザインスタジオ(動作デモ / PoC)
  Fabric.js ベースのリッチエディター。瀬戸社の6品目の実仕様を網羅し、
  入稿前プリフライト(製造可否判定)を備える。
  仕様値・閾値の出典と[要確認]事項は同フォルダの SPEC.md を参照。
*/

/* ============================================================
   1. データ定義
   ============================================================ */

// 1mm を内部 px に換算する係数(画面表示と書き出し基準)
const PX_PER_MM = 7;

// 糸色見本帳(織り用の限定パレット。色名と糸番号付き)
// metal=true は金糸・銀糸(織ネームでは可、プリント/刺繍では不可)
// fluo=true は蛍光相当(高彩度・高明度。プリント/アイロン/プリントワッペンで不可)
const THREAD_BOOK = [
  { no: "W-01", name: "オフ白",   hex: "#f4f1e8" },
  { no: "K-90", name: "墨黒",     hex: "#211f1c" },
  { no: "G-30", name: "鼠",       hex: "#8b8780" },
  { no: "R-12", name: "紅",       hex: "#b3122a" },
  { no: "R-40", name: "臙脂",     hex: "#7c1c2c" },
  { no: "O-20", name: "橙",       hex: "#d4711f" },
  { no: "Y-15", name: "山吹",     hex: "#d6a324" },
  { no: "Y-50", name: "金茶",     hex: "#a9802f" },
  { no: "B-22", name: "藍",       hex: "#243f73" },
  { no: "B-60", name: "浅葱",     hex: "#2f7d97" },
  { no: "G-44", name: "常磐緑",   hex: "#1f6b46" },
  { no: "G-70", name: "若草",     hex: "#7aa83f" },
  { no: "P-33", name: "古代紫",   hex: "#6b4a86" },
  { no: "P-66", name: "桜",       hex: "#e6a5b4" },
  { no: "M-08", name: "金糸",     hex: "#c7a14a", metal: true },
  { no: "M-09", name: "銀糸",     hex: "#c9ccce", metal: true },
  { no: "F-01", name: "蛍光黄",   hex: "#eaff00", fluo: true },
  { no: "F-02", name: "蛍光橙",   hex: "#ff5a00", fluo: true },
  { no: "F-03", name: "蛍光ピンク", hex: "#ff2d8a", fluo: true },
  { no: "F-04", name: "蛍光緑",   hex: "#39ff5a", fluo: true },
];

// 生地(地)スウォッチ
// 織ネームの地色は白・黒が標準(setoori.co.jp 織ネーム)。織り方により他色可[要確認]。
// 標準外の地色は preflight で[注意]扱いとするため std:true を白黒に付す。
const FABRIC_BOOK = {
  woven: [
    { name: "地 白",     hex: "#f7f5ef", std: true },
    { name: "地 黒",     hex: "#23211d", std: true },
    { name: "繻子 生成", hex: "#efe9da" },
    { name: "繻子 紺",   hex: "#1f2c4a" },
    { name: "繻子 臙脂", hex: "#5e1722" },
    { name: "繻子 常磐", hex: "#123e2c" },
    { name: "繻子 金茶", hex: "#8a6a2e" },
  ],
  print: [
    { name: "サテン白",   hex: "#fbfaf7" },
    { name: "サテン生成", hex: "#f1ece1" },
    { name: "ナイロン黒", hex: "#1a1a1c" },
    { name: "ナイロン紺", hex: "#16243f" },
    { name: "ナイロン灰", hex: "#cfcdc7" },
  ],
};

// エンブレム形状(ワッペン用。刺繍ワッペンは形状自由のため代表形状+自由)
const EMBLEM_SHAPES = ["circle", "ellipse", "shield", "roundrect", "diamond"];
const EMBLEM_LABEL = { circle:"丸", ellipse:"楕円", shield:"盾", roundrect:"角丸長方形", diamond:"ひし形" };

// 仕立て(folding)定義。瀬戸社の各商品ページの仕立て選択肢に対応。
// safetyMm は折返し代/縫い代として文字を避けるべき安全マージン(片側 mm)[要確認]。
// view は見え方の近似表現の種別。
const FOLDING = {
  roll:        { label: "ロール巻き仕上げ(加工なし)", view: "raw",       safetyMm: 0 },
  endfold:     { label: "両端折り(エンドフォールド)", view: "endfold",   safetyMm: 4 },
  centerfold:  { label: "センター折り",                view: "centerfold",safetyMm: 0, topBottom: true },
  bookcover:   { label: "ブックカバーホールド",        view: "endfold",   safetyMm: 5 },
  manhattan:   { label: "マンハッタンホールド",        view: "endfold",   safetyMm: 5 },
  heatcut:     { label: "ヒートカット(切りっぱなし)", view: "raw",       safetyMm: 1 },
  mello:       { label: "メロー始末(かがり縁)",      view: "mello",     safetyMm: 2 },
  diecut:      { label: "ダイカット(任意形状抜き)",  view: "diecut",    safetyMm: 2 },
};

// 地組織(weave。織ネームの実選択肢)。tex はステージのテクスチャ種別。
const WEAVE = {
  plain:    { label: "平織(マット)",        tex: "plain" },
  satin:    { label: "朱子織(サテン光沢)",  tex: "satin" },
  twill:    { label: "綾織(光沢抑制)",      tex: "twill" },
  highdens: { label: "高密度織",              tex: "highdens" },
  double:   { label: "二重織",                tex: "double" },
  rapier:   { label: "レピア織",              tex: "rapier" },
};

// 商品定義(setoori.co.jp 各商品ページを正とする。価格は載せない。各値は[瀬戸社確認待ち])
// family は質感系統(woven=織り / print=印刷 / iron=圧着 / embroidery=刺繍)。
// widths が配列なら規格幅選択+丈自由入力、null ならサイズ自由(ワッペン系)。
// foldings は選べる仕立てキー。weaves は織ネームのみ。
// allowMetal=金銀可、allowFluo=蛍光可。minLot=最小ロット、leadTime=納期。
const PRODUCTS = {
  woven_name: {
    label: "織ネーム", kind: "name", family: "woven", weave: "woven",
    widths: [9,12,15,18,24,30,36,40,45,51],
    defWidthIdx: 3, lengthMm: 30, lengthRange: [10, 300],
    foldings: ["roll","endfold","centerfold","bookcover","manhattan","heatcut"],
    defFolding: "endfold",
    weaves: ["plain","satin","twill","highdens","double","rapier"], defWeave: "satin",
    allowMetal: true, allowFluo: true,
    monThreadGuide: 3,
    attach: "縫付け(標準) / アイロン圧着(オプション)",
    minLot: 100, leadTime: "約4週間",
    desc: "地に糸で文字を織り込む定番ネーム。規格織幅から選び丈は自由。地組織と仕立て、糸色を選択。",
  },
  print_name: {
    label: "昇華プリントネーム", kind: "name", family: "print", weave: "print",
    widths: [10,13,16,19,22,25,30,35,40,45,50,100,200],
    defWidthIdx: 4, lengthMm: 30, lengthRange: [10, 400],
    foldings: ["endfold","centerfold","bookcover","manhattan","heatcut"],
    defFolding: "endfold",
    allowMetal: false, allowFluo: false,
    attach: "縫付け",
    minLot: 30, leadTime: "約10日",
    desc: "昇華転写でフルカラー印刷。多色・写真・グラデーション可。金銀・蛍光は不可。堅牢性が高い。",
  },
  iron_name: {
    label: "アイロンネーム", kind: "name", family: "iron", weave: "print",
    widths: [10,15,20,25,30,35,40,45,50,60],
    defWidthIdx: 3, lengthMm: 25, lengthRange: [8, 300],
    foldings: ["heatcut"], defFolding: "heatcut",
    allowMetal: false, allowFluo: false,
    attach: "家庭用アイロン圧着(中温140度・20秒・当て布)",
    minLot: 10, leadTime: "[要確認]",
    desc: "アイロン圧着のネーム。約460種の規格形+カスタム可。色数制限なし。金銀・蛍光は不可。",
  },
  embroidery_wappen: {
    label: "刺繍ワッペン", kind: "wappen", family: "embroidery", weave: "embroidery",
    widths: null,
    foldings: ["mello"], defFolding: "mello",
    allowMetal: false, allowFluo: false,
    attach: "縫付け / アイロン圧着[要確認]",
    minLot: 10, leadTime: "約3週間",
    desc: "サイズ・形状自由の刺繍エンブレム。色数制限なし。メロー縁色自由。小さい文字・漢字は困難。",
  },
  woven_wappen: {
    label: "織ワッペン", kind: "wappen", family: "woven", weave: "woven",
    widths: null,
    foldings: ["mello"], defFolding: "mello",
    allowMetal: true, allowFluo: true,
    monThreadGuide: 4,
    attach: "縫付け / アイロン圧着[要確認]",
    minLot: 100, leadTime: "[要確認]",
    desc: "刺繍ステッチ質感の織りエンブレム。形状を選びメロー始末を付けられます。色は織り基準。",
  },
  print_wappen: {
    label: "プリントワッペン", kind: "wappen", family: "print", weave: "print",
    widths: null,
    foldings: ["diecut","mello"], defFolding: "diecut",
    allowMetal: false, allowFluo: false,
    attach: "縫付け / アイロン圧着[要確認]",
    minLot: 30, leadTime: "[要確認]",
    desc: "フルカラー印刷のダイカットワッペン。任意形状で抜けます。金銀・蛍光は不可。",
  },
};

// ワッペン系の代表サイズ(規格幅を持たない品目の初期/プリセット mm)
const WAPPEN_PRESETS = [ {w:50,h:50}, {w:65,h:65}, {w:80,h:80} ];

/* ============================================================
   1b. プリフライト閾値(すべて[要確認]= 瀬戸社ヒアリングで差し替え前提)
   ============================================================ */
const PF = {
  // 文字の実寸高さ下限(mm)。これ未満は細部再現に限界の[注意][要確認]
  minCharMm: { woven: 2.5, print: 1.5, iron: 2.0, embroidery: 4.0 },
  // 漢字・斜体・円環(回転)文字に推奨する実寸高さ下限(mm)[要確認]
  minCharMmKanji: { woven: 4.0, print: 2.5, iron: 3.0, embroidery: 6.0 },
  // 斜体・回転とみなす角度のしきい値(度)
  rotateDeg: 8,
  // 蛍光の近似判定。HSV で彩度・明度がともに高い領域を蛍光相当とみなす[要確認]
  fluoSat: 0.80, fluoVal: 0.85,
  // 金属(金銀)の近似判定はスウォッチの metal フラグを正とし、色味近似は補助
};

/* ============================================================
   1c. 概算見積もり仮係数(すべて[要確認]= 瀬戸社確定価格表で差し替え前提)
   ------------------------------------------------------------
   実価格・実係数は瀬戸社の価格表が正であり、ここはあくまで顧客に
   「概算レンジ」を見せて期待値を合わせるための仮の定数。最終価格・納期は
   瀬戸様が確定見積で確定する(顧客側エディタでは確定しない)。PF と同様に
   1か所に集約し、本番は価格表/受発注 API へ差し替える。金額は円。
   ============================================================ */
const EST = {
  // 品目別の基準単価(1枚あたり円、標準仕様・標準サイズ前提の仮値)[要確認]
  basePrice: {
    woven_name: 60, print_name: 45, iron_name: 40,
    embroidery_wappen: 220, woven_wappen: 180, print_wappen: 120,
  },
  // 品目別の基準納期日数(下限・上限の中央値の目安。leadTime 表記の数値化)[要確認]
  baseLeadDays: {
    woven_name: 28, print_name: 10, iron_name: 14,
    embroidery_wappen: 21, woven_wappen: 24, print_wappen: 14,
  },
  // 数量による単価逓減(段階表現)。閾値以上で base にこの係数を掛ける[要確認]
  qtyTiers: [
    { min: 1,    priceMul: 1.0,  label: "小ロット" },
    { min: 100,  priceMul: 0.85, label: "標準" },
    { min: 300,  priceMul: 0.72, label: "中ロット" },
    { min: 1000, priceMul: 0.60, label: "大ロット" },
    { min: 3000, priceMul: 0.50, label: "量産" },
  ],
  // 概算レンジ幅(下限・上限を中心値から ±この割合)[要確認]
  priceSpread: 0.18,
  leadSpread: 0.20,
  // サイズ係数の基準。面積(mm2)がこの基準を超えると面積比で割増[要確認]
  refAreaMm2: { name: 18*70, wappen: 65*65 },
  sizeMaxMul: 1.8,   // サイズ割増の上限
  // 複雑さ係数: 要素数・色数・画像の重み[要確認]
  perElement: 0.05,  // 要素1点ごとの割増
  perColorOver: 0.08,// 色数が基準(品目の色数ガイド)を超えた1色ごとの割増
  imageMul: 0.20,    // 画像を含む場合の割増(版起こし相当)
  complexMax: 0.9,   // 複雑さ割増の上限
  // ギミック係数: 仕立て・メロー・金銀糸[要確認]
  foldingMul: {
    roll: 0, endfold: 0.06, centerfold: 0.05, bookcover: 0.10,
    manhattan: 0.10, heatcut: 0.03, mello: 0.12, diecut: 0.15,
  },
  metalMul: 0.20,    // 金糸・銀糸使用時の割増
  // 複雑さ・ギミックは納期にも効く(係数 x この割合を納期割増へ)[要確認]
  leadComplexFactor: 0.5,
  // 最小ロット未満でも概算は出すが、注意表示する(発注可否は瀬戸様判断)
};

// 数量に応じた単価逓減ティアを返す
function qtyTier(qty){
  let t = EST.qtyTiers[0];
  for (const tier of EST.qtyTiers){ if (qty >= tier.min) t = tier; }
  return t;
}

/* 概算見積もりレンジ(価格・納期)を算出する。
   価格 = 基準単価 x 数量ティア係数 x (1 + サイズ割増 + 複雑さ割増 + ギミック割増) x 数量。
   納期 = 基準納期日数 x (1 + 複雑さ・ギミックの一部) を下限上限レンジに。
   算定根拠(basis 配列)も返し、UI で「何で増減したか」を見せる。
   すべて概算[要確認]であり、最終は瀬戸様が確定見積で確定する。 */
function estimateRange(qty){
  const p = curProduct();
  const d = curDim();
  const objs = canvas ? canvas.getObjects() : [];
  const q = Math.max(1, Math.floor(qty || p.minLot || 1));
  const basis = [];

  const base = EST.basePrice[state.product] || 60;
  const tier = qtyTier(q);
  basis.push(`基準単価 約 ${base} 円 x 数量 ${q} 枚(${tier.label}単価 x${tier.priceMul})[要確認]`);

  // サイズ係数(面積比。基準超で割増、上限あり)
  const area = d.w * d.h;
  const refArea = p.kind === "name" ? EST.refAreaMm2.name : EST.refAreaMm2.wappen;
  let sizeMul = 1;
  if (area > refArea){
    sizeMul = Math.min(EST.sizeMaxMul, 1 + (area / refArea - 1) * 0.6);
    basis.push(`サイズ ${d.w} x ${d.h} mm が基準(約 ${refArea} mm2)より大きく x${sizeMul.toFixed(2)}`);
  } else {
    basis.push(`サイズ ${d.w} x ${d.h} mm(基準内)`);
  }

  // 複雑さ係数(要素数・色数・画像)
  const fg = canvas ? collectColors(objs).filter(c=>toHex(c)!==toHex(state.fabric)) : [];
  const colorGuide = p.monThreadGuide || 2;
  const hasImage = objs.some(o=>o.type==="image");
  let complex = objs.length * EST.perElement;
  if (fg.length > colorGuide) complex += (fg.length - colorGuide) * EST.perColorOver;
  if (hasImage) complex += EST.imageMul;
  complex = Math.min(EST.complexMax, complex);
  basis.push(`複雑さ: 要素 ${objs.length} 点 / 色 ${fg.length} 色${hasImage?" / 画像あり":""}(割増 +${(complex*100).toFixed(0)}%)`);

  // ギミック係数(仕立て・金銀糸)
  let gimmick = EST.foldingMul[state.folding] || 0;
  const usesMetal = fg.some(c=>isMetalColor(c));
  if (usesMetal) gimmick += EST.metalMul;
  const foldLabel = (FOLDING[state.folding]||{}).label || "-";
  basis.push(`ギミック: 仕立て「${foldLabel}」${usesMetal?" / 金銀糸あり":""}(割増 +${(gimmick*100).toFixed(0)}%)`);

  const unit = base * tier.priceMul * sizeMul * (1 + complex + gimmick);
  const total = unit * q;
  const priceMin = Math.round(total * (1 - EST.priceSpread) / 100) * 100;
  const priceMax = Math.round(total * (1 + EST.priceSpread) / 100) * 100;

  // 納期(基準日数 x 複雑さギミックの一部 + 数量大なら微増)
  const leadBase = EST.baseLeadDays[state.product] || 14;
  const leadComplex = (complex + gimmick) * EST.leadComplexFactor;
  const qtyLeadAdd = q >= 1000 ? 0.25 : (q >= 300 ? 0.12 : 0);
  const leadMid = leadBase * (1 + leadComplex + qtyLeadAdd);
  const leadMin = Math.max(1, Math.round(leadMid * (1 - EST.leadSpread)));
  const leadMax = Math.round(leadMid * (1 + EST.leadSpread));
  basis.push(`納期 基準 約 ${leadBase} 日 x 複雑さギミック・数量(${leadMin} から ${leadMax} 日)[要確認]`);

  const belowLot = q < (p.minLot || 1);
  return { qty: q, priceMin, priceMax, leadMin, leadMax, basis, belowLot, minLot: p.minLot };
}

// 書体一覧(織りに向く明朝/ゴシック中心 + 装飾)
const FONTS = [
  { css: "'Shippori Mincho', serif",   name: "しっぽり明朝", sample: "瀬戸 織" },
  { css: "'Noto Serif JP', serif",     name: "明朝体",       sample: "瀬戸 織" },
  { css: "'Noto Sans JP', sans-serif", name: "ゴシック体",   sample: "瀬戸 織" },
  { css: "'Zen Maru Gothic', sans-serif", name: "丸ゴシック", sample: "瀬戸 織" },
  { css: "'Yuji Syuku', serif",        name: "筆書き(楷書)", sample: "瀬戸 織" },
  { css: "'Playfair Display', serif",  name: "Playfair (英)", sample: "Seto" },
  { css: "'Dancing Script', cursive",  name: "筆記体 (英)",  sample: "Seto" },
];

/* ============================================================
   2. 状態
   ============================================================ */
const state = {
  product: "woven_name",
  widthMm: 18,        // 規格幅(ネーム系)。ワッペン系では presetIdx を使う
  lengthMm: 30,       // 丈(自由入力 mm)
  presetIdx: 1,       // ワッペン系の代表サイズ index
  folding: "endfold", // 仕立て
  weave: "satin",     // 地組織(織ネームのみ可変)
  fabric: FABRIC_BOOK.woven[0].hex,
  thread: THREAD_BOOK[1].hex,   // 既定の糸色(墨黒)
  emblem: "shield",
  mello: true,
  melloColor: THREAD_BOOK[0].hex,
  zoom: 1,
  tplCategory: "すべて",   // テンプレート一覧の絞り込みカテゴリ(activeRail とは別管理)
  tplQuery: "",           // テンプレート検索キーワード(name/category/tags を部分一致)
  // AI生成(デモ版)の入力状態。renderRail をまたいで保持する。
  ai: { text: "", mood: "modern", candidates: [], chosen: -1 },
  // 見積もり依頼モーダルの入力状態(数量・要望メモ)。openOrder の都度プリセット。
  order: { quantity: 0, memo: "", customer: "" },
};

let canvas;                 // fabric.Canvas
let history = [];           // Undo/Redo スナップショット
let histIdx = -1;
let suppressHistory = false;
let activeRail = "templates";
// 差し戻しからの再依頼の対象 ID(再編集中のレコード)。null なら新規依頼。
let reworkTargetId = null;

/* ============================================================
   3. ユーティリティ
   ============================================================ */
const $ = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));
const esc = (s) => String(s).replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c]));

function curProduct(){ return PRODUCTS[state.product]; }

// 仕上がり寸法(mm)。ネーム系は規格幅(=h)x 丈(=w)、ワッペン系は代表サイズ。
function curDim(){
  const p = curProduct();
  if (p.widths){
    // ネーム系は「丈(長手方向 w)x 幅(短手方向 h)」で扱う(横長ネーム)
    return { w: state.lengthMm, h: state.widthMm };
  }
  const ps = WAPPEN_PRESETS[state.presetIdx] || WAPPEN_PRESETS[1];
  return { w: ps.w, h: ps.h };
}
// 旧名互換(プレビュー等で参照)
function curPreset(){ return curDim(); }
function canvasPx(){ const d = curDim(); return { w: d.w*PX_PER_MM, h: d.h*PX_PER_MM }; }

// 色が暗いか(文字色の自動コントラスト用)
function isDark(hex){
  const c = hex.replace("#",""); const r=parseInt(c.substr(0,2),16),g=parseInt(c.substr(2,2),16),b=parseInt(c.substr(4,2),16);
  return (0.299*r+0.587*g+0.114*b) < 140;
}

// HEX を HSV に変換(蛍光近似判定用)
function hexToHsv(hex){
  const c = toHex(hex).replace("#","");
  const r=parseInt(c.substr(0,2),16)/255, g=parseInt(c.substr(2,2),16)/255, b=parseInt(c.substr(4,2),16)/255;
  const mx=Math.max(r,g,b), mn=Math.min(r,g,b), d=mx-mn;
  let hh=0;
  if(d!==0){ if(mx===r) hh=((g-b)/d)%6; else if(mx===g) hh=(b-r)/d+2; else hh=(r-g)/d+4; hh*=60; if(hh<0)hh+=360; }
  return { h: hh, s: mx===0?0:d/mx, v: mx };
}
// 蛍光相当か(近似)。スウォッチに fluo フラグがあればそれを優先。
function isFluoColor(hex){
  const t = THREAD_BOOK.find(x=>toHex(x.hex)===toHex(hex));
  if (t) return !!t.fluo;
  const v = hexToHsv(hex);
  return v.s >= PF.fluoSat && v.v >= PF.fluoVal;
}
// 金属(金銀)相当か。スウォッチの metal フラグを正とする。
function isMetalColor(hex){
  const t = THREAD_BOOK.find(x=>toHex(x.hex)===toHex(hex));
  return t ? !!t.metal : false;
}

/* ============================================================
   4. 織り質感 SVG フィルタ(ステージへ注入)
   ============================================================ */
function ensureDefs(){
  if ($("#st-defs")) return;
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.id = "st-defs"; svg.setAttribute("width","0"); svg.setAttribute("height","0");
  svg.style.cssText = "position:absolute;width:0;height:0;overflow:hidden";
  svg.innerHTML = `
    <defs>
      <filter id="weaveText" x="-5%" y="-5%" width="110%" height="110%">
        <feTurbulence type="turbulence" baseFrequency="0.9 0.18" numOctaves="2" seed="7" result="n"/>
        <feDisplacementMap in="SourceGraphic" in2="n" scale="1.4" xChannelSelector="R" yChannelSelector="G"/>
      </filter>
    </defs>`;
  document.body.appendChild(svg);
}

/* 織り目テクスチャ(ステージ上のオーバーレイ用)。
   family が woven なら地組織(weave キー)ごとに糸目を少し変える。
   embroidery は刺繍の細かいステッチ目、print/iron はサテンの光沢。 */
function weaveOverlayCss(family, weaveKey){
  if (family === "woven"){
    const tex = (WEAVE[weaveKey] && WEAVE[weaveKey].tex) || "satin";
    // 縦横の糸目(共通)
    const warp = `repeating-linear-gradient(0deg, rgba(0,0,0,.05) 0 1px, rgba(255,255,255,.04) 1px 2.4px),
      repeating-linear-gradient(90deg, rgba(0,0,0,.045) 0 1px, rgba(255,255,255,.05) 1px 2.4px)`;
    if (tex === "plain")    return `${warp}, repeating-linear-gradient(45deg, rgba(0,0,0,.03) 0 1px, rgba(255,255,255,.03) 1px 2px)`;
    if (tex === "twill")    return `${warp}, repeating-linear-gradient(63deg, rgba(0,0,0,.07) 0 1.5px, rgba(255,255,255,.05) 1.5px 4px)`;
    if (tex === "highdens") return `repeating-linear-gradient(0deg, rgba(0,0,0,.06) 0 1px, rgba(255,255,255,.05) 1px 1.6px),
      repeating-linear-gradient(90deg, rgba(0,0,0,.055) 0 1px, rgba(255,255,255,.06) 1px 1.6px)`;
    if (tex === "double")   return `${warp}, repeating-linear-gradient(0deg, rgba(0,0,0,.04) 0 3px, rgba(255,255,255,.04) 3px 6px)`;
    if (tex === "rapier")   return `${warp}, repeating-linear-gradient(90deg, rgba(0,0,0,.05) 0 2px, rgba(255,255,255,.04) 2px 5px)`;
    // satin(朱子): 斜めの長い浮き糸で光沢
    return `${warp}, repeating-linear-gradient(45deg, rgba(255,255,255,.08) 0 2px, rgba(0,0,0,.03) 2px 4px)`;
  }
  if (family === "embroidery"){
    // 刺繍の密なサテンステッチ目(短い斜め)
    return `repeating-linear-gradient(80deg, rgba(0,0,0,.06) 0 1.5px, rgba(255,255,255,.06) 1.5px 3px),
      repeating-linear-gradient(0deg, rgba(0,0,0,.03) 0 2px, rgba(255,255,255,.03) 2px 4px)`;
  }
  // print / iron はサテンの控えめな光沢
  return `linear-gradient(105deg, rgba(255,255,255,.18) 0%, rgba(255,255,255,0) 22%, rgba(255,255,255,0) 70%, rgba(255,255,255,.12) 100%)`;
}

/* ============================================================
   5. キャンバス初期化と背景・縁の再構成
   ============================================================ */
function initCanvas(){
  ensureDefs();
  canvas = new fabric.Canvas("c", {
    preserveObjectStacking: true,
    backgroundColor: "transparent",
    selection: true,
  });
  // 選択ハンドル・枠の見た目をブランド色で上品に統一(触り心地の質感)
  try {
    const ACC = "#b08544";
    fabric.Object.prototype.set({
      transparentCorners: false,
      cornerColor: "#ffffff",
      cornerStrokeColor: ACC,
      cornerStyle: "circle",
      cornerSize: 10,
      borderColor: ACC,
      borderScaleFactor: 1.4,
      padding: 2,
    });
  } catch(e){ /* スタイル設定失敗は致命的でないため無視 */ }
  canvas.on("object:modified", pushHistory);
  canvas.on("object:added", () => { if(!suppressHistory) pushHistory(); });
  canvas.on("object:removed", () => { if(!suppressHistory) pushHistory(); });
  canvas.on("selection:created", renderProps);
  canvas.on("selection:updated", renderProps);
  canvas.on("selection:cleared", renderProps);
  canvas.on("object:scaling", liveProps);
  canvas.on("object:moving", liveProps);
  canvas.on("object:rotating", liveProps);
}

// 背景(地)とエンブレム形状・縁を表すクリップ/装飾を再構成
function rebuildStage(){
  const { w, h } = canvasPx();
  const z = state.zoom;
  canvas.setWidth(w * z);
  canvas.setHeight(h * z);
  canvas.setZoom(z);

  const shell = $("#canvasShell");
  shell.style.width = (w*z) + "px";
  shell.style.height = (h*z) + "px";

  // センター折りの折り線(なければ生成)
  if (!$("#foldLine")){
    const fl = document.createElement("div");
    fl.id = "foldLine"; fl.className = "fold-line"; fl.style.display = "none";
    shell.appendChild(fl);
  }

  const p = curProduct();

  // 地色
  canvas.setBackgroundColor(state.fabric, canvas.renderAll.bind(canvas));

  // 形状クリップ(ワッペン)
  applyShapeClip();

  // ステージ形状(角丸/円/盾)を shell に反映
  applyShellShape();

  // 縁(メロー)とテクスチャ overlay
  applyEdgeAndTexture();

  updateStageFoot();
  canvas.requestRenderAll();
}

// canvas-shell に形状(見た目の外形)を反映
function applyShellShape(){
  const shell = $("#canvasShell");
  const p = curProduct();
  shell.style.borderRadius = "4px";
  shell.style.clipPath = "none";
  if (p.kind === "name"){
    // 仕立て(folding)を角丸で近似表現
    const view = (FOLDING[state.folding] || {}).view;
    shell.style.borderRadius = (view === "raw") ? "1px" : "3px";
  } else {
    // ワッペン形状
    const map = {
      circle: "50%",
      ellipse: "50%",
      roundrect: "16%",
      shield: "none",
      diamond: "none",
    };
    if (state.emblem === "diamond"){
      shell.style.clipPath = "polygon(50% 0,100% 50%,50% 100%,0 50%)";
      shell.style.borderRadius = "0";
    } else if (state.emblem === "shield"){
      shell.style.clipPath = "polygon(0 0,100% 0,100% 55%,50% 100%,0 55%)";
      shell.style.borderRadius = "12% 12% 0 0";
    } else {
      shell.style.borderRadius = map[state.emblem] || "4px";
    }
  }
}

// Fabric の clipPath を形状に合わせて設定(描画内容を形状で抜く)
function applyShapeClip(){
  const { w, h } = canvasPx();
  const p = curProduct();
  let clip = null;
  if (p.kind === "wappen"){
    const cx = w/2, cy = h/2;
    if (state.emblem === "circle") clip = new fabric.Circle({ radius: Math.min(w,h)/2, originX:"center", originY:"center", left:cx, top:cy });
    else if (state.emblem === "ellipse") clip = new fabric.Ellipse({ rx:w/2, ry:h/2, originX:"center", originY:"center", left:cx, top:cy });
    else if (state.emblem === "roundrect") clip = new fabric.Rect({ width:w, height:h, rx:w*0.16, ry:h*0.16, originX:"center", originY:"center", left:cx, top:cy });
    else if (state.emblem === "diamond"){ clip = new fabric.Polygon([{x:w/2,y:0},{x:w,y:h/2},{x:w/2,y:h},{x:0,y:h/2}], { originX:"center", originY:"center", left:cx, top:cy }); }
    else if (state.emblem === "shield"){ clip = new fabric.Polygon([{x:0,y:0},{x:w,y:0},{x:w,y:h*0.55},{x:w/2,y:h},{x:0,y:h*0.55}], { originX:"center", originY:"center", left:cx, top:cy }); }
  }
  canvas.clipPath = clip;
}

// 縁(メロー始末)とテクスチャオーバーレイ、仕立ての見え方を描画
function applyEdgeAndTexture(){
  const ov = $("#textureOverlay");
  const p = curProduct();
  const fam = p.family;
  ov.style.background = weaveOverlayCss(fam, state.weave);
  ov.style.backgroundSize = (fam === "woven" || fam === "embroidery") ? "2.4px 2.4px" : "auto";
  ov.style.mixBlendMode = (fam === "woven" || fam === "embroidery") ? "multiply" : "screen";
  ov.style.opacity = fam === "woven" ? "0.85" : (fam === "embroidery" ? "0.7" : "0.55");
  // shell の形状に合わせて overlay も同じ角丸/clip
  const shell = $("#canvasShell");
  ov.style.borderRadius = shell.style.borderRadius;
  ov.style.clipPath = shell.style.clipPath;

  const view = (FOLDING[state.folding] || {}).view;

  // メロー縁(ワッペン)。border で内側にかがり縁を表現
  if (p.kind === "wappen" && view === "mello" && state.mello){
    const c = state.melloColor;
    shell.style.boxShadow = `var(--shadow-lg), inset 0 0 0 6px ${c}, inset 0 0 0 7px rgba(0,0,0,.18)`;
  } else {
    shell.style.boxShadow = "var(--shadow-lg)";
  }
  // 仕立ての近似表現(ネーム系)
  if (p.kind === "name"){
    if (view === "endfold"){
      // 両端折り/ホールド: 左右端の折返しを内側ラインで表現
      shell.style.boxShadow = "var(--shadow-lg), inset 6px 0 6px -4px rgba(0,0,0,.28), inset -6px 0 6px -4px rgba(0,0,0,.28)";
    } else if (view === "centerfold"){
      // センター折り: 上下二面(中央の折り線)を表現
      shell.style.boxShadow = "var(--shadow-lg), inset 0 0 0 1px rgba(0,0,0,.06)";
    } else if (view === "raw"){
      // ロール巻き/ヒートカット: 切りっぱなし
      shell.style.boxShadow = "var(--shadow-lg)";
    }
  }
  // センター折りの折り線(上下二面)を overlay 上の中央線で示す
  const fold = $("#foldLine");
  if (fold){
    if (p.kind === "name" && view === "centerfold"){
      fold.style.display = "block";
    } else {
      fold.style.display = "none";
    }
  }
}

function updateStageFoot(){
  const pr = curProduct(); const d = curDim();
  const specs = [];
  specs.push(`<span class="dim-pill">${esc(pr.label)}</span>`);
  if (pr.widths) specs.push(`<span class="dim-pill">幅 <b>${state.widthMm} mm</b> / 丈 <b>${state.lengthMm} mm</b></span>`);
  else specs.push(`<span class="dim-pill">仕上がり <b>${d.w} x ${d.h} mm</b></span>`);
  if (pr.kind === "name") specs.push(`<span class="dim-pill">仕立て <b>${(FOLDING[state.folding]||{}).label||"-"}</b></span>`);
  if (pr.family === "woven" && pr.kind === "name") specs.push(`<span class="dim-pill">地組織 <b>${(WEAVE[state.weave]||{}).label||"-"}</b></span>`);
  if (pr.kind === "wappen") specs.push(`<span class="dim-pill">形状 <b>${EMBLEM_LABEL[state.emblem]}</b>${state.mello&&pr.defFolding==="mello"?" / メロー縁":""}</span>`);
  specs.push(`<span class="dim-pill">要素 <b>${canvas.getObjects().length}</b></span>`);
  // プリフライト要約バッジ
  const pf = runPreflight();
  const cls = pf.level==="fail"?"pf-bad":(pf.level==="warn"?"pf-warn":"pf-ok");
  const lab = pf.level==="fail"?"不可":(pf.level==="warn"?"注意":"合格");
  specs.push(`<span class="dim-pill pf-pill ${cls}" id="footPf" title="クリックで詳細">プリフライト <b>${lab}</b></span>`);
  $("#stageFoot").innerHTML = specs.join("");
  const fp = $("#footPf"); if (fp) fp.onclick = ()=>{ reworkTargetId=null; openOrder(); };
}

/* ============================================================
   6. 要素の追加(テキスト・図形・画像)
   ============================================================ */
function addText(opts={}){
  const { w, h } = canvasPx();
  const t = new fabric.IText(opts.text || "テキスト", {
    left: w/2, top: h/2, originX:"center", originY:"center",
    fontFamily: opts.fontFamily || FONTS[0].css.replace(/'/g,""),
    fontSize: opts.fontSize || Math.max(14, Math.round(h*0.4)),
    fill: opts.fill || state.thread,
    fontWeight: opts.fontWeight || "600",
    textAlign: "center",
    charSpacing: opts.charSpacing || 20,
  });
  applyThreadEffect(t);
  canvas.add(t);
  canvas.setActiveObject(t);
  canvas.requestRenderAll();
  setRail("text");
}

// 織り質感を文字オブジェクトに付与(SVGフィルタ + わずかな影で糸の盛り)
function applyThreadEffect(obj){
  const p = curProduct();
  if (p.family === "woven" || p.family === "embroidery"){
    // 織り/刺繍は糸の盛り上がりを影で近似
    obj.set("shadow", new fabric.Shadow({ color: "rgba(0,0,0,.28)", blur: 0.6, offsetX: 0.4, offsetY: 0.7 }));
    obj.set("strokeWidth", 0);
    obj._wovenText = true;
  } else {
    obj.set("shadow", null);
    obj._wovenText = false;
  }
}

function addShape(kind){
  const { w, h } = canvasPx();
  const s = Math.min(w,h)*0.4;
  let o;
  const common = { left:w/2, top:h/2, originX:"center", originY:"center", fill:state.thread };
  if (kind==="rect") o = new fabric.Rect({ ...common, width:s*1.4, height:s, rx:6, ry:6 });
  else if (kind==="circle") o = new fabric.Circle({ ...common, radius:s/2 });
  else if (kind==="triangle") o = new fabric.Triangle({ ...common, width:s, height:s });
  else if (kind==="line") o = new fabric.Rect({ ...common, width:s*1.6, height:Math.max(2,h*0.04) });
  else if (kind==="star") o = makeStar(common, s/2);
  else if (kind==="heart") o = makeHeart(common, s);
  else if (kind==="diamond") o = new fabric.Polygon([{x:0,y:-s/2},{x:s/2,y:0},{x:0,y:s/2},{x:-s/2,y:0}], common);
  else if (kind==="ring") o = new fabric.Circle({ ...common, radius:s/2, fill:"transparent", stroke:state.thread, strokeWidth:Math.max(3,s*0.12) });
  if (o){ canvas.add(o); canvas.setActiveObject(o); canvas.requestRenderAll(); }
}
function makeStar(common, r){
  const pts=[]; const spikes=5; const inner=r*0.42;
  for(let i=0;i<spikes*2;i++){ const rad=(i%2? inner:r); const a=(Math.PI/spikes)*i - Math.PI/2; pts.push({x:Math.cos(a)*rad,y:Math.sin(a)*rad}); }
  return new fabric.Polygon(pts, common);
}
function makeHeart(common, s){
  const path = `M 0 ${s*0.3} C ${-s*0.5} ${-s*0.25} ${-s*0.5} ${-s*0.55} 0 ${-s*0.15} C ${s*0.5} ${-s*0.55} ${s*0.5} ${-s*0.25} 0 ${s*0.3} Z`;
  return new fabric.Path(path, { ...common, scaleX:0.8, scaleY:0.8 });
}

function addImage(dataUrl){
  fabric.Image.fromURL(dataUrl, (img)=>{
    const { w, h } = canvasPx();
    const scale = Math.min(w*0.6/img.width, h*0.7/img.height);
    img.set({ left:w/2, top:h/2, originX:"center", originY:"center", scaleX:scale, scaleY:scale });
    canvas.add(img); canvas.setActiveObject(img); canvas.requestRenderAll();
  });
}

/* ============================================================
   7. レールパネル(左)
   ============================================================ */
function setRail(name){
  activeRail = name;
  $$(".rail-tab").forEach(b => b.classList.toggle("active", b.dataset.rail===name));
  renderRail();
}

function renderRail(){
  const el = $("#railPanel");
  const p = curProduct();
  if (activeRail === "templates") el.innerHTML = railTemplates();
  else if (activeRail === "ai") el.innerHTML = railAi();
  else if (activeRail === "text") el.innerHTML = railText();
  else if (activeRail === "shapes") el.innerHTML = railShapes();
  else if (activeRail === "uploads") el.innerHTML = railUploads();
  else if (activeRail === "material") el.innerHTML = railMaterial();
  else if (activeRail === "gallery") el.innerHTML = railGallery();
  bindRail();
}

/* テンプレ検索用のキーワード(tags)を導出する。
   テンプレ定義に t.tags があればそれを優先し、無ければ name / category / title から
   主要語を抽出して補う。検索は name + category + tags を対象に部分一致(全角半角・大小無視)。
   英字は小文字化、和文はそのまま。検索辞書はメモ化して再計算を避ける。 */
const _tplTagCache = new WeakMap();
function tplTags(t){
  if (_tplTagCache.has(t)) return _tplTagCache.get(t);
  const parts = [];
  if (Array.isArray(t.tags)) parts.push(...t.tags);
  parts.push(t.name || "", t.category || "", t.title || "");
  // カテゴリ内の括弧書き(学校・園 等)も個別語として拾う
  const cat = t.category || "";
  cat.split(/[()・\/]/).forEach(s=>{ if(s.trim()) parts.push(s.trim()); });
  // name 内の語(空白区切り)
  (t.name||"").split(/[\s・]/).forEach(s=>{ if(s.trim()) parts.push(s.trim()); });
  const joined = parts.join(" ").toLowerCase();
  _tplTagCache.set(t, joined);
  return joined;
}
// 検索クエリ(全角空白も区切りに含む)の各語をすべて含むか(AND 一致)
function tplMatches(t, q){
  if (!q) return true;
  const hay = tplTags(t);
  const terms = q.toLowerCase().split(/[\s　]+/).filter(Boolean);
  return terms.every(term => hay.indexOf(term) !== -1);
}

function railTemplates(){
  const p = curProduct();
  const tpls = TEMPLATES[state.product] || [];
  const q = (state.tplQuery || "").trim();
  // カテゴリ一覧(出現順を保ちつつ重複排除)+ 先頭に「すべて」
  const cats = ["すべて"];
  tpls.forEach(t=>{ const c=t.category||"その他"; if(!cats.includes(c)) cats.push(c); });
  // 選択カテゴリが現品目に無ければ「すべて」に戻す
  if (!cats.includes(state.tplCategory)) state.tplCategory = "すべて";
  const active = state.tplCategory;

  const chips = cats.map(c=>
    `<button class="tpl-chip${c===active?" sel":""}" data-tplcat="${esc(c)}">${esc(c)}${c==="すべて"?` (${tpls.length})`:""}</button>`
  ).join("");

  // カテゴリ絞り込み + 検索キーワードの併用(両方を満たすものを表示)
  const visible = tpls.map((t,i)=>({t,i}))
    .filter(({t})=> active==="すべて" || (t.category||"その他")===active)
    .filter(({t})=> tplMatches(t, q));
  let cards = visible.map(({t,i})=>{
    return `<div class="tpl-card" data-tpl="${i}" title="${esc(t.name)} を使う">
      <div class="tpl-thumb">${t.thumb}</div>
      <div class="tpl-overlay"><span class="tpl-use">このデザインを使う</span></div>
      <div class="tpl-name">${esc(t.name)}<small>${esc(t.category||"")}</small></div>
    </div>`;
  }).join("");
  if (!visible.length){
    cards = q
      ? `<div class="empty-hint" style="grid-column:1/-1">「${esc(q)}」に一致するテンプレートはありません。<br>キーワードを短くするか、カテゴリを「すべて」に戻してお試しください。</div>`
      : `<div class="empty-hint" style="grid-column:1/-1">このカテゴリのテンプレートはありません。</div>`;
  }

  // 検索ボックス(レール上部)。入力中も再描画して結果をライブ更新する。
  const searchBox = `<div class="tpl-search">
    <svg viewBox="0 0 24 24" width="16" height="16" class="ts-ic"><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="2"/><path d="M21 21l-4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
    <input type="text" id="tplSearch" placeholder="テンプレを検索(氏名 / 学校 / 和風 / 英字 など)" value="${esc(q)}" autocomplete="off">
    ${q?`<button class="ts-clear" id="tplSearchClear" title="クリア"><svg viewBox="0 0 24 24" width="14" height="14"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg></button>`:""}
  </div>`;
  const countLine = q ? `<p class="tpl-count">検索結果 ${visible.length} 件</p>` : "";

  return `<h3 class="rp-title">${esc(p.label)}のテンプレート</h3>
    <p class="rp-sub">キーワード検索とカテゴリで絞り込み、カードを選ぶとキャンバスに展開します。要素は自由に編集できます。</p>
    ${searchBox}
    <div class="tpl-cats">${chips}</div>
    <div id="tplCount">${countLine}</div>
    <div class="tpl-grid" id="tplGrid">${cards}</div>
    <div class="tip">寸法・仕立て・地組織は「生地」タブで設定できます。現在 ${curDim().w} x ${curDim().h} mm。</div>`;
}

// テンプレ検索の結果部分(カウント+グリッド)だけを再描画する。
// 検索入力中のフォーカス・キャレットを保つため railTemplates 全体は再描画しない。
function refreshTplResults(){
  if (activeRail !== "templates") return;
  const tpls = TEMPLATES[state.product] || [];
  const q = (state.tplQuery || "").trim();
  const active = state.tplCategory;
  const visible = tpls.map((t,i)=>({t,i}))
    .filter(({t})=> active==="すべて" || (t.category||"その他")===active)
    .filter(({t})=> tplMatches(t, q));
  const grid = $("#tplGrid");
  if (grid){
    if (!visible.length){
      grid.innerHTML = q
        ? `<div class="empty-hint" style="grid-column:1/-1">「${esc(q)}」に一致するテンプレートはありません。<br>キーワードを短くするか、カテゴリを「すべて」に戻してお試しください。</div>`
        : `<div class="empty-hint" style="grid-column:1/-1">このカテゴリのテンプレートはありません。</div>`;
    } else {
      grid.innerHTML = visible.map(({t,i})=>
        `<div class="tpl-card" data-tpl="${i}" title="${esc(t.name)} を使う">
          <div class="tpl-thumb">${t.thumb}</div>
          <div class="tpl-overlay"><span class="tpl-use">このデザインを使う</span></div>
          <div class="tpl-name">${esc(t.name)}<small>${esc(t.category||"")}</small></div>
        </div>`).join("");
    }
    $$(".tpl-card", grid).forEach(c=>c.onclick=()=>applyTemplate(parseInt(c.dataset.tpl)));
  }
  const cnt = $("#tplCount");
  if (cnt) cnt.innerHTML = q ? `<p class="tpl-count">検索結果 ${visible.length} 件</p>` : "";
  // クリアボタンの出し入れ(入力欄自体は触らない)
  const box = $(".tpl-search");
  if (box){
    let clr = $("#tplSearchClear");
    if (q && !clr){
      clr = document.createElement("button");
      clr.className = "ts-clear"; clr.id = "tplSearchClear"; clr.title = "クリア";
      clr.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>`;
      clr.onclick = ()=>{ state.tplQuery=""; renderRail(); const ni=$("#tplSearch"); if(ni) ni.focus(); };
      box.appendChild(clr);
    } else if (!q && clr){
      clr.remove();
    }
  }
}

function railText(){
  return `<h3 class="rp-title">テキストを追加</h3>
    <p class="rp-sub">追加後は右パネルで書体・サイズ・色・字間を調整できます。</p>
    <button class="add-btn" data-add="heading"><span class="ab-ic"><svg viewBox="0 0 24 24" width="22" height="22"><text x="3" y="18" font-size="18" font-family="serif" font-weight="700" fill="currentColor">A</text></svg></span><span class="ab-tx"><b>見出しテキスト</b><small>大きめ・太字</small></span></button>
    <button class="add-btn" data-add="body"><span class="ab-ic"><svg viewBox="0 0 24 24" width="22" height="22"><text x="4" y="17" font-size="13" font-family="sans-serif" fill="currentColor">あ</text></svg></span><span class="ab-tx"><b>本文テキスト</b><small>標準サイズ</small></span></button>
    <button class="add-btn" data-add="sub"><span class="ab-ic"><svg viewBox="0 0 24 24" width="22" height="22"><text x="5" y="16" font-size="10" font-family="sans-serif" fill="currentColor">abc</text></svg></span><span class="ab-tx"><b>サブテキスト</b><small>小さめ・英字向き</small></span></button>
    <div class="rp-section"><h4>書体</h4>
      <div class="fontpick" id="railFonts">${FONTS.map((f,i)=>`<div class="font-opt" data-font="${i}" style="font-family:${f.css}">${esc(f.sample)} <small>${esc(f.name)}</small></div>`).join("")}</div>
    </div>`;
}

function railShapes(){
  const items = [
    ["rect","角丸四角"],["circle","円"],["triangle","三角"],["diamond","ひし形"],
    ["star","星"],["heart","ハート"],["ring","リング"],["line","ライン"],
  ];
  const icons = {
    rect:`<rect x="4" y="7" width="16" height="10" rx="2" fill="currentColor"/>`,
    circle:`<circle cx="12" cy="12" r="7" fill="currentColor"/>`,
    triangle:`<path d="M12 5l7 13H5z" fill="currentColor"/>`,
    diamond:`<path d="M12 4l7 8-7 8-7-8z" fill="currentColor"/>`,
    star:`<path d="M12 3l2.5 6 6 .4-4.6 3.9 1.5 6L12 16l-5.4 3.3 1.5-6L3.5 9.4l6-.4z" fill="currentColor"/>`,
    heart:`<path d="M12 20S4 14 4 9a4 4 0 0 1 8-1 4 4 0 0 1 8 1c0 5-8 11-8 11z" fill="currentColor"/>`,
    ring:`<circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" stroke-width="3.5"/>`,
    line:`<rect x="3" y="11" width="18" height="2.6" rx="1.3" fill="currentColor"/>`,
  };
  return `<h3 class="rp-title">図形・装飾</h3>
    <p class="rp-sub">クリックでキャンバスに追加します。色は右パネルで変更できます。</p>
    <div class="shape-grid">${items.map(([k])=>`<div class="shape-cell" data-shape="${k}"><svg viewBox="0 0 24 24" width="26" height="26">${icons[k]}</svg></div>`).join("")}</div>
    <div class="tip">織りの場合、図形も糸色での再現を想定して色数を抑えることを推奨します。</div>`;
}

function railUploads(){
  return `<h3 class="rp-title">画像をアップロード</h3>
    <p class="rp-sub">ロゴやイラストを配置できます。織りの場合は色数の単純化を推奨します。</p>
    <button class="add-btn" id="uploadTrigger"><span class="ab-ic"><svg viewBox="0 0 24 24" width="22" height="22"><path d="M12 16V4m0 0L8 8m4-4l4 4M4 18v2h16v-2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span><span class="ab-tx"><b>画像を選択</b><small>PNG / JPG</small></span></button>
    <div class="tip">PoCではブラウザ内のみで処理します。本番では入稿時にベクター化・色置換の検討フローを通します。</div>`;
}

function railMaterial(){
  const p = curProduct();
  const fb = p.family === "woven" ? FABRIC_BOOK.woven : FABRIC_BOOK.print;
  let out = `<h3 class="rp-title">生地・仕様</h3><p class="rp-sub">${esc(p.desc)}</p>`;

  // 寸法: ネーム系は規格幅選択+丈入力、ワッペン系は代表サイズ
  if (p.widths){
    out += `<div class="rp-section"><h4>規格織幅(必須選択)</h4><div class="preset-line">`;
    out += p.widths.map(w=>`<button class="preset-chip${state.widthMm===w?" sel":""}" data-width="${w}" style="${state.widthMm===w?"border-color:var(--accent);color:var(--accent-deep);background:var(--accent-soft)":""}">${w} mm</button>`).join("");
    out += `</div>`;
    const [lo,hi] = p.lengthRange;
    out += `<div class="field" style="margin-top:14px"><label>丈(長さ・自由入力 mm。${lo} から ${hi} mm)</label>
      ${stepper("lengthInput", state.lengthMm, lo, hi, 1)}</div>`;
    out += `</div>`;
  } else {
    out += `<div class="rp-section"><h4>仕上がり寸法(目安。形状自由)</h4><div class="preset-line">`;
    out += WAPPEN_PRESETS.map((ps,i)=>`<button class="preset-chip${i===state.presetIdx?" sel":""}" data-preset="${i}" style="${i===state.presetIdx?"border-color:var(--accent);color:var(--accent-deep);background:var(--accent-soft)":""}">${ps.w} x ${ps.h} mm</button>`).join("");
    out += `</div></div>`;
  }

  // 仕立て(folding)。品目別の実選択肢
  if (p.foldings && p.foldings.length){
    out += `<div class="rp-section"><h4>仕立て</h4><div class="seg seg-wrap" id="foldSeg" style="flex-wrap:wrap">`;
    out += p.foldings.map(f=>`<button data-fold="${f}" class="${state.folding===f?"active":""}">${esc(FOLDING[f].label)}</button>`).join("");
    out += `</div></div>`;
  }

  // 地組織(weave)。織ネームのみ
  if (p.weaves && p.weaves.length){
    out += `<div class="rp-section"><h4>地組織</h4><div class="seg seg-wrap" id="weaveSeg" style="flex-wrap:wrap">`;
    out += p.weaves.map(w=>`<button data-weave="${w}" class="${state.weave===w?"active":""}">${esc(WEAVE[w].label)}</button>`).join("");
    out += `</div></div>`;
  }

  // 地色
  out += `<div class="rp-section"><h4>生地色 / 地</h4><div class="fabric-row">`;
  out += fb.map(f=>`<div class="fabric-sw${state.fabric===f.hex?" sel":""}" data-fabric="${f.hex}" title="${esc(f.name)}${f.std?"(標準)":""}" style="background:${f.hex}"></div>`).join("");
  out += `</div>`;
  if (p.family === "woven" && p.kind === "name") out += `<div class="tip" style="margin-top:8px">織ネームの地色は白・黒が標準。それ以外は織り方により可[要確認]。</div>`;
  out += `</div>`;

  // 糸色見本帳(織り系)
  if (p.family === "woven"){
    out += `<div class="rp-section"><h4>糸色見本帳${p.allowMetal?"(金銀可)":""}</h4>${threadBookHtml()}</div>`;
  }

  // ワッペン形状
  if (p.kind === "wappen"){
    out += `<div class="rp-section"><h4>形状</h4><div class="seg seg-wrap" id="emblemSeg" style="flex-wrap:wrap">`;
    out += EMBLEM_SHAPES.map(s=>`<button data-emblem="${s}" class="${state.emblem===s?"active":""}">${EMBLEM_LABEL[s]}</button>`).join("");
    out += `</div></div>`;
    if (p.defFolding === "mello"){
      out += `<div class="rp-section"><div class="toggle-row"><label>メロー始末(かがり縁)</label><span class="switch"><input type="checkbox" id="melloToggle" ${state.mello?"checked":""}><span class="sl"></span></span></div>`;
      if (state.mello) out += `<h4 style="margin-top:12px">縁の色</h4>${threadBookHtml("mello")}`;
      out += `</div>`;
    }
  }

  // 取付・ロット・納期(品目別の確定仕様)
  out += `<div class="rp-section"><h4>製造条件</h4>
    <div class="tip" style="margin-top:0">取付: ${esc(p.attach)}<br>最小ロット: ${p.minLot} 枚から / 納期: ${esc(p.leadTime)}</div></div>`;

  if (p.family === "print"){
    out += `<div class="tip">フルカラー印刷。金色・銀色・蛍光色は不可です(プリフライトで検出)。</div>`;
  }
  if (p.family === "embroidery"){
    out += `<div class="tip">刺繍は小さい文字・漢字・繊細なデザインに不適。色数制限なし。金銀蛍光は不可。</div>`;
  }
  return out;
}

function threadBookHtml(target="thread"){
  const sel = target === "mello" ? state.melloColor : state.thread;
  return `<div class="thread-book" data-threadtarget="${target}">` + THREAD_BOOK.map(t=>
    `<div class="thread-chip${sel===t.hex?" sel":""}" data-thread="${t.hex}">
       <span class="thread-dot" style="background:${t.hex}"></span>
       <span class="thread-no">${t.no}</span>
       <span class="thread-nm">${esc(t.name)}</span>
     </div>`).join("") + `</div>`;
}

function railGallery(){
  const items = loadGalleryData();
  let body;
  if (!items.length){
    body = `<div class="empty-hint">まだ保存はありません。<br>右上に保存ボタンはありませんが、下の「現在のデザインを保存」で追加できます。</div>`;
  } else {
    body = `<div class="gal-grid">` + items.map((it,i)=>
      `<div class="gal-card" data-gal="${i}">
        <button class="gc-del" data-galdel="${i}" title="削除"><svg viewBox="0 0 24 24" width="13" height="13"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg></button>
        <img src="${it.thumb}" alt="">
        <div class="gc-meta">${esc(PRODUCTS[it.product].label)} / ${esc((it.title||"無題").slice(0,10))}</div>
      </div>`).join("") + `</div>`;
  }
  return `<h3 class="rp-title">マイギャラリー</h3>
    <p class="rp-sub">このブラウザに保存します(localStorage)。カードを選ぶと呼び出します。</p>
    <button class="add-btn" id="saveCurrent"><span class="ab-ic"><svg viewBox="0 0 24 24" width="22" height="22"><path d="M5 3h11l3 3v15H5z" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M8 3v6h7V3M8 21v-7h8v7" fill="none" stroke="currentColor" stroke-width="1.6"/></svg></span><span class="ab-tx"><b>現在のデザインを保存</b><small>サムネイル付きで記録</small></span></button>
    ${body}`;
}

function bindRail(){
  // テンプレート検索(ライブ更新)。innerHTML 全置換だと入力フォーカスが飛ぶため、
  // 入力中はグリッド等の中身だけを差し替えてフォーカスとキャレットを保つ。
  const ts = $("#tplSearch");
  if (ts){
    ts.oninput = ()=>{
      state.tplQuery = ts.value;
      refreshTplResults();
    };
    const tc = $("#tplSearchClear");
    if (tc) tc.onclick = ()=>{ state.tplQuery=""; renderRail(); const ni=$("#tplSearch"); if(ni) ni.focus(); };
  }
  // テンプレートのカテゴリ絞り込みチップ
  $$("[data-tplcat]").forEach(b=>b.onclick=()=>{ state.tplCategory=b.dataset.tplcat; renderRail(); });
  // テンプレート
  $$(".tpl-card").forEach(c=>c.onclick=()=>applyTemplate(parseInt(c.dataset.tpl)));
  // AI生成(デモ版)パネル
  bindAiRail();
  // テキスト追加
  $$("[data-add]").forEach(b=>b.onclick=()=>{
    const k=b.dataset.add; const {h}=canvasPx();
    if(k==="heading") addText({text:"見出し", fontSize:Math.round(h*0.5), fontWeight:"700"});
    else if(k==="body") addText({text:"テキスト", fontSize:Math.round(h*0.34), fontWeight:"500"});
    else addText({text:"sub text", fontSize:Math.round(h*0.22), fontWeight:"400", fontFamily:"Playfair Display"});
  });
  // 書体プレビュー(選択中オブジェクトに即適用、なければ新規)
  $$("[data-font]").forEach(f=>f.onclick=()=>{
    const css = FONTS[parseInt(f.dataset.font)].css.replace(/'/g,"");
    const a = canvas.getActiveObject();
    if (a && a.type==="i-text"){ a.set("fontFamily", css); canvas.requestRenderAll(); pushHistory(); renderProps(); }
    else addText({ fontFamily: css });
  });
  // 図形
  $$("[data-shape]").forEach(s=>s.onclick=()=>addShape(s.dataset.shape));
  // アップロード
  const ut=$("#uploadTrigger"); if(ut) ut.onclick=()=>$("#fileInput").click();
  // 生地・仕様
  $$("[data-width]").forEach(b=>b.onclick=()=>{ state.widthMm=parseInt(b.dataset.width); rebuildStage(); renderRail(); });
  $$("[data-preset]").forEach(b=>b.onclick=()=>{ state.presetIdx=parseInt(b.dataset.preset); rebuildStage(); renderRail(); });
  // 丈の自由入力(範囲内に丸める)
  const li=$("#lengthInput");
  if(li){
    const apply=()=>{
      const p=curProduct(); const [lo,hi]=p.lengthRange;
      let v=parseInt(li.value)||lo; v=Math.max(lo,Math.min(hi,v));
      state.lengthMm=v; li.value=v; rebuildStage();
    };
    li.onchange=()=>{ apply(); renderRail(); };
  }
  $$("[data-fabric]").forEach(b=>b.onclick=()=>{ state.fabric=b.dataset.fabric; rebuildStage(); renderRail(); });
  const foldSeg=$("#foldSeg"); if(foldSeg) $$("[data-fold]",foldSeg).forEach(b=>b.onclick=()=>{ state.folding=b.dataset.fold; rebuildStage(); renderRail(); });
  const weaveSeg=$("#weaveSeg"); if(weaveSeg) $$("[data-weave]",weaveSeg).forEach(b=>b.onclick=()=>{ state.weave=b.dataset.weave; rebuildStage(); renderRail(); });
  const embSeg=$("#emblemSeg"); if(embSeg) $$("[data-emblem]",embSeg).forEach(b=>b.onclick=()=>{ state.emblem=b.dataset.emblem; rebuildStage(); renderRail(); });
  const mt=$("#melloToggle"); if(mt) mt.onchange=()=>{ state.mello=mt.checked; rebuildStage(); renderRail(); };
  // 糸色見本帳(地色側のターゲット切替)
  $$("[data-threadtarget]").forEach(book=>{
    const target=book.dataset.threadtarget;
    $$("[data-thread]",book).forEach(c=>c.onclick=()=>{
      const hex=c.dataset.thread;
      if(target==="mello"){ state.melloColor=hex; rebuildStage(); }
      else {
        state.thread=hex;
        const a=canvas.getActiveObject();
        if(a){ a.set(a.stroke && a.fill==="transparent" ? "stroke":"fill", hex); canvas.requestRenderAll(); pushHistory(); }
      }
      renderRail();
    });
  });
  // ギャラリー
  const sc=$("#saveCurrent"); if(sc) sc.onclick=saveToGallery;
  $$("[data-gal]").forEach(c=>c.onclick=(e)=>{ if(e.target.closest("[data-galdel]"))return; loadFromGallery(parseInt(c.dataset.gal)); });
  $$("[data-galdel]").forEach(b=>b.onclick=(e)=>{ e.stopPropagation(); deleteFromGallery(parseInt(b.dataset.galdel)); });
}

/* ============================================================
   8. 右プロパティパネル
   ============================================================ */
function renderProps(){
  const a = canvas.getActiveObject();
  const empty=$("#propsEmpty"), body=$("#propsBody");
  if (!a){ empty.hidden=false; body.hidden=true; body.innerHTML=""; return; }
  empty.hidden=true; body.hidden=false;
  const isText = a.type==="i-text";
  let html = "";

  if (isText){
    html += `<div class="pgroup"><div class="pgroup-title">テキスト</div>
      <div class="field"><textarea id="pText">${esc(a.text)}</textarea></div>
      <div class="field"><label>書体</label>
        <select id="pFont">${FONTS.map(f=>`<option value="${f.css.replace(/'/g,"")}" ${a.fontFamily===f.css.replace(/'/g,"")?"selected":""}>${esc(f.name)}</option>`).join("")}</select></div>
      <div class="field-row">
        <div class="field"><label>サイズ</label>${stepper("pSize", Math.round(a.fontSize), 4, 400)}</div>
        <div class="field"><label>字間</label>${stepper("pSpacing", Math.round(a.charSpacing||0), -100, 1200, 20)}</div>
      </div>
      <div class="field"><label>文字揃え</label><div class="seg" id="pAlign">
        ${["left","center","right"].map(al=>`<button data-al="${al}" class="${a.textAlign===al?"active":""}">${({left:"左",center:"中央",right:"右"})[al]}</button>`).join("")}
      </div></div>
    </div>`;
  }

  // 色
  const fillVal = (a.fill && a.fill!=="transparent") ? a.fill : (a.stroke||"#000000");
  html += `<div class="pgroup"><div class="pgroup-title">${isText?"糸色 / 文字色":"色"}</div>
    <div class="color-pick"><span class="cp-current" style="background:${fillVal}"></span>
      <input type="color" id="pColorPicker" value="${toHex(fillVal)}" style="width:42px;height:36px;border:1px solid var(--line);border-radius:8px;padding:0;cursor:pointer">
    </div>`;
  if (curProduct().family==="woven"){
    html += `<div class="thread-mini" style="margin-top:10px">${THREAD_BOOK.map(t=>`<span class="tm${toHex(fillVal)===toHex(t.hex)?" sel":""}" data-pthread="${t.hex}" title="${t.no} ${esc(t.name)}" style="background:${t.hex}"></span>`).join("")}</div>`;
  }
  html += `</div>`;

  // 配置・整列
  html += `<div class="pgroup"><div class="pgroup-title">整列</div>
    <div class="align-row">
      <button class="mini-btn" data-align="left" title="左揃え"><svg viewBox="0 0 24 24" width="18" height="18"><path d="M4 5v14M8 8h11M8 12h7M8 16h9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></button>
      <button class="mini-btn" data-align="centerH" title="左右中央"><svg viewBox="0 0 24 24" width="18" height="18"><path d="M12 4v16M6 9h12M8 14h8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></button>
      <button class="mini-btn" data-align="right" title="右揃え"><svg viewBox="0 0 24 24" width="18" height="18"><path d="M20 5v14M5 8h11M9 12h7M7 16h9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></button>
      <button class="mini-btn" data-align="centerV" title="上下中央"><svg viewBox="0 0 24 24" width="18" height="18"><path d="M4 12h16M9 6v12M14 8v8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></button>
    </div></div>`;

  // 回転
  html += `<div class="pgroup"><div class="pgroup-title">回転</div>
    <div class="range-row"><input type="range" id="pAngle" min="0" max="360" value="${Math.round(a.angle||0)}"><span class="rv" id="pAngleV">${Math.round(a.angle||0)} 度</span></div></div>`;

  // レイヤー
  html += `<div class="pgroup"><div class="pgroup-title">レイヤー / 操作</div>
    <div class="layer-row">
      <button class="mini-btn" data-layer="front" title="最前面へ"><svg viewBox="0 0 24 24" width="18" height="18"><rect x="7" y="7" width="11" height="11" rx="2" fill="currentColor"/><rect x="4" y="4" width="9" height="9" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/></svg></button>
      <button class="mini-btn" data-layer="forward" title="前へ"><svg viewBox="0 0 24 24" width="18" height="18"><path d="M12 5l5 5h-3v8h-4v-8H7z" fill="currentColor"/></svg></button>
      <button class="mini-btn" data-layer="backward" title="後ろへ"><svg viewBox="0 0 24 24" width="18" height="18"><path d="M12 19l-5-5h3V6h4v8h3z" fill="currentColor"/></svg></button>
      <button class="mini-btn" data-layer="back" title="最背面へ"><svg viewBox="0 0 24 24" width="18" height="18"><rect x="4" y="4" width="11" height="11" rx="2" fill="currentColor"/><rect x="11" y="11" width="9" height="9" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/></svg></button>
    </div>
    <div class="layer-row" style="margin-top:8px">
      <button class="mini-btn" data-op="dup" title="複製"><svg viewBox="0 0 24 24" width="18" height="18"><rect x="8" y="8" width="11" height="11" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><rect x="5" y="5" width="9" height="9" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/></svg></button>
      <button class="mini-btn danger" data-op="del" title="削除"><svg viewBox="0 0 24 24" width="18" height="18"><path d="M6 7h12M9 7V5h6v2M7 7l1 13h8l1-13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
      <div></div><div></div>
    </div></div>`;

  body.innerHTML = html;
  bindProps(a, isText);
}

function stepper(id, val, min, max, step=1){
  return `<div class="stepper">
    <button data-step="${id}|-${step}">-</button>
    <input type="number" id="${id}" value="${val}" min="${min}" max="${max}">
    <button data-step="${id}|${step}">+</button></div>`;
}

function toHex(c){
  if(!c) return "#000000";
  if(c[0]==="#") return c.length===4 ? "#"+c[1]+c[1]+c[2]+c[2]+c[3]+c[3] : c.slice(0,7);
  const m=c.match(/\d+/g); if(!m) return "#000000";
  return "#"+m.slice(0,3).map(x=>(+x).toString(16).padStart(2,"0")).join("");
}

function bindProps(a, isText){
  if (isText){
    $("#pText").oninput=e=>{ a.set("text", e.target.value); canvas.requestRenderAll(); };
    $("#pText").onchange=pushHistory;
    $("#pFont").onchange=e=>{ a.set("fontFamily", e.target.value); canvas.requestRenderAll(); pushHistory(); };
    $$("#pAlign [data-al]").forEach(b=>b.onclick=()=>{ a.set("textAlign", b.dataset.al); $$("#pAlign button").forEach(x=>x.classList.remove("active")); b.classList.add("active"); canvas.requestRenderAll(); pushHistory(); });
    bindNum("pSize", v=>{ a.set("fontSize", v); });
    bindNum("pSpacing", v=>{ a.set("charSpacing", v); });
  }
  // ステッパー +/-
  $$("[data-step]").forEach(b=>b.onclick=()=>{
    const [id,d]=b.dataset.step.split("|"); const inp=$("#"+id);
    inp.value = (parseInt(inp.value)||0)+parseInt(d); inp.dispatchEvent(new Event("input")); inp.dispatchEvent(new Event("change"));
  });
  // 色
  $("#pColorPicker").oninput=e=>{ setObjColor(a, e.target.value); canvas.requestRenderAll(); };
  $("#pColorPicker").onchange=pushHistory;
  $$("[data-pthread]").forEach(s=>s.onclick=()=>{ setObjColor(a, s.dataset.pthread); canvas.requestRenderAll(); pushHistory(); renderProps(); });
  // 整列
  $$("[data-align]").forEach(b=>b.onclick=()=>{ alignObj(a, b.dataset.align); canvas.requestRenderAll(); pushHistory(); });
  // 回転
  const ang=$("#pAngle"); if(ang){ ang.oninput=e=>{ a.rotate(parseInt(e.target.value)); $("#pAngleV").textContent=e.target.value+" 度"; canvas.requestRenderAll(); }; ang.onchange=pushHistory; }
  // レイヤー
  $$("[data-layer]").forEach(b=>b.onclick=()=>{ layerOp(a, b.dataset.layer); canvas.requestRenderAll(); pushHistory(); });
  // 操作
  $$("[data-op]").forEach(b=>b.onclick=()=>{
    if(b.dataset.op==="del"){ canvas.remove(a); canvas.discardActiveObject(); canvas.requestRenderAll(); }
    else if(b.dataset.op==="dup"){ a.clone(cl=>{ cl.set({left:a.left+12, top:a.top+12}); canvas.add(cl); canvas.setActiveObject(cl); canvas.requestRenderAll(); }); }
  });
}
function bindNum(id, apply){
  const inp=$("#"+id); if(!inp) return;
  inp.oninput=()=>{ apply(parseInt(inp.value)||0); canvas.requestRenderAll(); };
  inp.onchange=pushHistory;
}
function setObjColor(a, hex){
  if (a.fill && a.fill!=="transparent") a.set("fill", hex);
  else if (a.stroke) a.set("stroke", hex);
  else a.set("fill", hex);
}
function alignObj(a, how){
  const {w,h}=canvasPx(); a.setCoords();
  const b=a.getBoundingRect(true,true);
  if(how==="left") a.set("left", a.left - b.left);
  else if(how==="right") a.set("left", a.left + (w - (b.left+b.width)));
  else if(how==="centerH") a.set("left", a.left + (w/2 - (b.left+b.width/2)));
  else if(how==="centerV") a.set("top", a.top + (h/2 - (b.top+b.height/2)));
  a.setCoords();
}
function layerOp(a, op){
  if(op==="front") canvas.bringToFront(a);
  else if(op==="forward") canvas.bringForward(a);
  else if(op==="backward") canvas.sendBackwards(a);
  else if(op==="back") canvas.sendToBack(a);
}
// ドラッグ中のライブ更新(回転値など)
function liveProps(){
  const a=canvas.getActiveObject(); if(!a) return;
  const av=$("#pAngleV"), ar=$("#pAngle");
  if(av) av.textContent=Math.round(a.angle||0)+" 度";
  if(ar) ar.value=Math.round(a.angle||0);
}

/* ============================================================
   9. Undo / Redo
   ============================================================ */
function snapshot(){ return JSON.stringify(canvas.toJSON(["_wovenText"])); }
function pushHistory(){
  if(suppressHistory) return;
  const snap=snapshot();
  if(history[histIdx]===snap) return;
  history = history.slice(0, histIdx+1);
  history.push(snap); histIdx=history.length-1;
  if(history.length>60){ history.shift(); histIdx--; }
  updateHistButtons(); updateStageFoot();
}
function applySnapshot(snap){
  suppressHistory=true;
  canvas.loadFromJSON(snap, ()=>{
    canvas.getObjects().forEach(o=>{ if(o._wovenText) applyThreadEffect(o); });
    canvas.requestRenderAll(); suppressHistory=false; renderProps(); updateStageFoot();
  });
}
function undo(){ if(histIdx>0){ histIdx--; applySnapshot(history[histIdx]); updateHistButtons(); } }
function redo(){ if(histIdx<history.length-1){ histIdx++; applySnapshot(history[histIdx]); updateHistButtons(); } }
function updateHistButtons(){ $("#undoBtn").disabled=histIdx<=0; $("#redoBtn").disabled=histIdx>=history.length-1; }

/* ============================================================
   10. テンプレート定義
   ============================================================ */
/*
  テンプレート定義。各テンプレは name / category / title / thumb / build を持つ。
  build() 内で state.widthMm / state.lengthMm / state.presetIdx を当該品目の
  regulation 範囲内で安全設定してよい。すべてのテンプレはプリフライト上
  問題が出にくい安全設定(禁止色なし・色数ガイド以下・最小文字を満たす)とする。
  禁止色: print系 / iron / 刺繍 / print ワッペンでは金銀(metal)・蛍光(fluo)の
  THREAD_BOOK hex(#c7a14a #c9ccce #eaff00 #ff5a00 #ff2d8a #39ff5a)を使わない。
*/

// テキスト追加の補助。中央配置の IText を生成して canvas に追加(applyTemplate が織り質感を後付けする)。
function tT(text, font, fill, weight, sizeRatio, topRatio, spacing){
  const { w, h } = canvasPx();
  const t = new fabric.IText(text, {
    left: w/2, top: h*(topRatio==null?0.5:topRatio), originX:"center", originY:"center",
    fontFamily: font, fill, fontWeight: String(weight||600),
    fontSize: Math.round(h*(sizeRatio||0.4)), textAlign:"center", charSpacing: spacing||0,
  });
  canvas.add(t);
  return t;
}

const TEMPLATES = {
  /* ===== 織ネーム(地色は白黒標準。金銀可。紋糸 3 色目安。最小文字 織 2.5mm) ===== */
  woven_name: [
    { name:"氏名 明朝", category:"氏名", title:"山田 太郎", thumb:tplThumb("山田 太郎","Shippori Mincho","#211f1c","#f7f5ef"),
      build:()=>{ state.widthMm=18; state.lengthMm=70; state.weave="satin"; state.fabric="#f7f5ef"; state.thread="#211f1c";
        tT("山田 太郎","Shippori Mincho","#211f1c",600,0.42,0.5,40); } },
    { name:"氏名 ゴシック", category:"氏名", title:"佐藤 花子", thumb:tplThumb("佐藤 花子","Noto Sans JP","#211f1c","#f7f5ef"),
      build:()=>{ state.widthMm=18; state.lengthMm=70; state.weave="plain"; state.fabric="#f7f5ef"; state.thread="#211f1c";
        tT("佐藤 花子","Noto Sans JP","#211f1c",700,0.4,0.5,30); } },
    { name:"氏名 黒地白文字", category:"氏名", title:"鈴木 一郎", thumb:tplThumb("鈴木 一郎","Shippori Mincho","#f4f1e8","#23211d"),
      build:()=>{ state.widthMm=18; state.lengthMm=70; state.weave="satin"; state.fabric="#23211d"; state.thread="#f4f1e8";
        tT("鈴木 一郎","Shippori Mincho","#f4f1e8",600,0.42,0.5,40); } },
    { name:"氏名 二行", category:"氏名", title:"高橋家", thumb:tplThumb("","Shippori Mincho","#7c1c2c","#f7f5ef",{ lines:[{t:"高橋",color:"#7c1c2c",size:16,weight:700},{t:"TAKAHASHI",color:"#7c1c2c",size:9,weight:500}] }),
      build:()=>{ state.widthMm=24; state.lengthMm=60; state.weave="satin"; state.fabric="#f7f5ef"; state.thread="#7c1c2c";
        tT("高橋","Shippori Mincho","#7c1c2c",700,0.42,0.38,40);
        tT("TAKAHASHI","Playfair Display","#7c1c2c",500,0.16,0.72,260); } },
    { name:"屋号 + 英字", category:"ロゴ・屋号", title:"瀬戸織", thumb:tplThumb("","Noto Serif JP","#7c1c2c","#f7f5ef",{ lines:[{t:"瀬戸織",color:"#7c1c2c",size:18,weight:700}], sub:"SETO ORI", subColor:"#7c1c2c" }),
      build:()=>{ state.widthMm=24; state.lengthMm=80; state.weave="satin"; state.fabric="#f7f5ef"; state.thread="#7c1c2c";
        tT("瀬戸織","Noto Serif JP","#7c1c2c",700,0.46,0.4,20);
        tT("SETO ORI","Playfair Display","#7c1c2c",500,0.18,0.74,300); } },
    { name:"枠付き屋号", category:"ロゴ・屋号", title:"Atelier", thumb:tplThumb("Atelier","Playfair Display","#243f73","#f4f1e8"),
      build:()=>{ state.widthMm=24; state.lengthMm=80; state.weave="satin"; state.fabric="#f4f1e8"; state.thread="#243f73"; const {w,h}=canvasPx();
        canvas.add(new fabric.Rect({left:w/2,top:h/2,originX:"center",originY:"center",width:w*0.9,height:h*0.72,fill:"transparent",stroke:"#243f73",strokeWidth:3,rx:4}));
        tT("Atelier","Playfair Display","#243f73",600,0.4,0.5,40); } },
    { name:"和風 縦書き調", category:"和風", title:"京 染", thumb:tplThumb("京 染","Yuji Syuku","#211f1c","#efe9da"),
      build:()=>{ state.widthMm=24; state.lengthMm=70; state.weave="twill"; state.fabric="#efe9da"; state.thread="#211f1c";
        tT("京 染","Yuji Syuku","#211f1c",700,0.46,0.5,80); } },
    { name:"和風 朱印風", category:"和風", title:"誂", thumb:tplThumb("誂","Yuji Syuku","#f4f1e8","#7c1c2c"),
      build:()=>{ state.widthMm=30; state.lengthMm=40; state.weave="satin"; state.fabric="#7c1c2c"; state.thread="#f4f1e8"; const {w,h}=canvasPx();
        canvas.add(new fabric.Rect({left:w/2,top:h/2,originX:"center",originY:"center",width:h*0.78,height:h*0.78,fill:"transparent",stroke:"#f4f1e8",strokeWidth:3,rx:4}));
        tT("誂","Yuji Syuku","#f4f1e8",700,0.5,0.5,0); } },
    { name:"スクール 校名", category:"スクール(学校・園)", title:"みどり幼稚園", thumb:tplThumb("みどり園","Zen Maru Gothic","#1f6b46","#f7f5ef"),
      build:()=>{ state.widthMm=24; state.lengthMm=90; state.weave="plain"; state.fabric="#f7f5ef"; state.thread="#1f6b46";
        tT("みどり幼稚園","Zen Maru Gothic","#1f6b46",700,0.34,0.5,20); } },
    { name:"介護 施設名", category:"介護・施設", title:"やすらぎ苑", thumb:tplThumb("やすらぎ苑","Zen Maru Gothic","#243f73","#f7f5ef"),
      build:()=>{ state.widthMm=24; state.lengthMm=90; state.weave="plain"; state.fabric="#f7f5ef"; state.thread="#243f73";
        tT("やすらぎ苑","Zen Maru Gothic","#243f73",700,0.34,0.5,20); } },
    { name:"ブランド 金糸", category:"ブランド", title:"MAISON", thumb:tplThumb("MAISON","Playfair Display","#c7a14a","#23211d"),
      build:()=>{ state.widthMm=18; state.lengthMm=80; state.weave="satin"; state.fabric="#23211d"; state.thread="#c7a14a";
        tT("MAISON","Playfair Display","#c7a14a",600,0.36,0.5,200); } },
    { name:"モダン 細字英字", category:"モダン", title:"linen & co", thumb:tplThumb("linen & co","Playfair Display","#211f1c","#efe9da"),
      build:()=>{ state.widthMm=15; state.lengthMm=90; state.weave="plain"; state.fabric="#efe9da"; state.thread="#211f1c";
        tT("linen & co","Playfair Display","#211f1c",500,0.3,0.5,80); } },
    { name:"英字 筆記体", category:"英字", title:"Hana", thumb:tplThumb("Hana","Dancing Script","#6b4a86","#f7f5ef"),
      build:()=>{ state.widthMm=18; state.lengthMm=70; state.weave="satin"; state.fabric="#f7f5ef"; state.thread="#6b4a86";
        tT("Hana","Dancing Script","#6b4a86",600,0.5,0.5,0); } },
  ],

  /* ===== 昇華プリントネーム(フルカラー可。金銀蛍光は不可。最小文字 印刷 1.5mm) ===== */
  print_name: [
    { name:"フルカラー屋号", category:"ロゴ・屋号", title:"Atelier Nico", thumb:tplThumb("Atelier Nico","Playfair Display","#d4711f","#fbfaf7"),
      build:()=>{ state.widthMm=25; state.lengthMm=90; state.fabric="#fbfaf7"; state.thread="#d4711f";
        tT("Atelier Nico","Playfair Display","#d4711f",600,0.34,0.5,40); } },
    { name:"二段組ロゴ", category:"ロゴ・屋号", title:"GREEN farm", thumb:tplThumb("","Noto Sans JP","#1f6b46","#f1ece1",{ lines:[{t:"GREEN",color:"#1f6b46",size:16,weight:700}], sub:"organic farm", subColor:"#7c1c2c" }),
      build:()=>{ state.widthMm=25; state.lengthMm=90; state.fabric="#f1ece1"; state.thread="#1f6b46";
        tT("GREEN","Noto Sans JP","#1f6b46",700,0.42,0.38,20);
        tT("organic farm","Playfair Display","#7c1c2c",500,0.18,0.72,150); } },
    { name:"グラデ見出し", category:"モダン", title:"Sakura", thumb:tplThumb("Sakura","Dancing Script","#b3122a","#fbfaf7"),
      build:()=>{ state.widthMm=30; state.lengthMm=90; state.fabric="#fbfaf7"; const {w,h}=canvasPx();
        const t=new fabric.IText("Sakura",{left:w/2,top:h/2,originX:"center",originY:"center",fontFamily:"Dancing Script",fontSize:Math.round(h*0.5),fontWeight:"600",textAlign:"center"});
        t.set("fill", new fabric.Gradient({type:"linear",coords:{x1:0,y1:0,x2:t.width||w,y2:0},colorStops:[{offset:0,color:"#b3122a"},{offset:1,color:"#d4711f"}]}));
        canvas.add(t); } },
    { name:"氏名 明朝", category:"氏名", title:"山田 太郎", thumb:tplThumb("山田 太郎","Noto Serif JP","#211f1c","#fbfaf7"),
      build:()=>{ state.widthMm=22; state.lengthMm=80; state.fabric="#fbfaf7"; state.thread="#211f1c";
        tT("山田 太郎","Noto Serif JP","#211f1c",600,0.4,0.5,30); } },
    { name:"氏名 ポップ", category:"氏名", title:"はなこ", thumb:tplThumb("はなこ","Zen Maru Gothic","#d4711f","#fbfaf7"),
      build:()=>{ state.widthMm=22; state.lengthMm=70; state.fabric="#fbfaf7"; state.thread="#d4711f";
        tT("はなこ","Zen Maru Gothic","#d4711f",700,0.46,0.5,20); } },
    { name:"スクール 横長", category:"スクール(学校・園)", title:"さくら小学校", thumb:tplThumb("さくら小学校","Zen Maru Gothic","#b3122a","#fbfaf7"),
      build:()=>{ state.widthMm=25; state.lengthMm=110; state.fabric="#fbfaf7"; state.thread="#b3122a";
        tT("さくら小学校","Zen Maru Gothic","#b3122a",700,0.32,0.5,15); } },
    { name:"スクール チーム", category:"スクール(学校・園)", title:"FC AOZORA", thumb:tplThumb("FC AOZORA","Noto Sans JP","#16243f","#cfcdc7"),
      build:()=>{ state.widthMm=25; state.lengthMm=100; state.fabric="#cfcdc7"; state.thread="#16243f";
        tT("FC AOZORA","Noto Sans JP","#16243f",700,0.32,0.5,60); } },
    { name:"介護 施設名", category:"介護・施設", title:"ひだまりの家", thumb:tplThumb("ひだまりの家","Zen Maru Gothic","#d4711f","#fbfaf7"),
      build:()=>{ state.widthMm=25; state.lengthMm=100; state.fabric="#fbfaf7"; state.thread="#d4711f";
        tT("ひだまりの家","Zen Maru Gothic","#d4711f",700,0.32,0.5,15); } },
    { name:"イベント 日付", category:"イベント", title:"2026 FESTA", thumb:tplThumb("","Playfair Display","#6b4a86","#fbfaf7",{ lines:[{t:"FESTA",color:"#6b4a86",size:16,weight:700}], sub:"2026.05.03", subColor:"#211f1c" }),
      build:()=>{ state.widthMm=30; state.lengthMm=110; state.fabric="#fbfaf7"; state.thread="#6b4a86";
        tT("FESTA","Playfair Display","#6b4a86",700,0.4,0.38,120);
        tT("2026.05.03","Noto Sans JP","#211f1c",500,0.18,0.72,80); } },
    { name:"ブランド モノトーン", category:"ブランド", title:"NOIR", thumb:tplThumb("NOIR","Playfair Display","#fbfaf7","#1a1a1c"),
      build:()=>{ state.widthMm=19; state.lengthMm=80; state.fabric="#1a1a1c"; state.thread="#fbfaf7";
        tT("NOIR","Playfair Display","#fbfaf7",600,0.4,0.5,260); } },
    { name:"モダン 二色帯", category:"モダン", title:"STUDIO", thumb:tplThumb("STUDIO","Noto Sans JP","#fbfaf7","#243f73"),
      build:()=>{ state.widthMm=25; state.lengthMm=90; state.fabric="#fbfaf7"; const {w,h}=canvasPx();
        canvas.add(new fabric.Rect({left:w/2,top:h/2,originX:"center",originY:"center",width:w,height:h*0.5,fill:"#243f73"}));
        tT("STUDIO","Noto Sans JP","#fbfaf7",700,0.3,0.5,80); } },
    { name:"英字 筆記体", category:"英字", title:"Merci", thumb:tplThumb("Merci","Dancing Script","#b3122a","#fbfaf7"),
      build:()=>{ state.widthMm=22; state.lengthMm=80; state.fabric="#fbfaf7"; state.thread="#b3122a";
        tT("Merci","Dancing Script","#b3122a",600,0.5,0.5,0); } },
    { name:"お祝い 名入れ", category:"お祝い", title:"祝 御結婚", thumb:tplThumb("祝 御結婚","Shippori Mincho","#7c1c2c","#fbfaf7"),
      build:()=>{ state.widthMm=30; state.lengthMm=100; state.fabric="#fbfaf7"; state.thread="#7c1c2c";
        tT("祝 御結婚","Shippori Mincho","#7c1c2c",700,0.34,0.5,30); } },
  ],

  /* ===== アイロンネーム(色数制限なしだが金銀蛍光は不可。最小文字 アイロン 2.0mm) ===== */
  iron_name: [
    { name:"園児 氏名", category:"スクール(学校・園)", title:"やまだ はなこ", thumb:tplThumb("やまだ はなこ","Zen Maru Gothic","#d4711f","#fbfaf7"),
      build:()=>{ state.widthMm=30; state.lengthMm=80; state.fabric="#fbfaf7"; state.thread="#d4711f";
        tT("やまだ はなこ","Zen Maru Gothic","#d4711f",700,0.32,0.5,10); } },
    { name:"園児 ひらがな大", category:"スクール(学校・園)", title:"たろう", thumb:tplThumb("たろう","Zen Maru Gothic","#243f73","#fbfaf7"),
      build:()=>{ state.widthMm=30; state.lengthMm=60; state.fabric="#fbfaf7"; state.thread="#243f73";
        tT("たろう","Zen Maru Gothic","#243f73",700,0.5,0.5,20); } },
    { name:"氏名 ゴシック", category:"氏名", title:"鈴木 一郎", thumb:tplThumb("鈴木 一郎","Noto Sans JP","#211f1c","#fbfaf7"),
      build:()=>{ state.widthMm=30; state.lengthMm=70; state.fabric="#fbfaf7"; state.thread="#211f1c";
        tT("鈴木 一郎","Noto Sans JP","#211f1c",700,0.4,0.5,30); } },
    { name:"氏名 明朝", category:"氏名", title:"佐藤 花子", thumb:tplThumb("佐藤 花子","Shippori Mincho","#211f1c","#fbfaf7"),
      build:()=>{ state.widthMm=30; state.lengthMm=70; state.fabric="#fbfaf7"; state.thread="#211f1c";
        tT("佐藤 花子","Shippori Mincho","#211f1c",600,0.4,0.5,30); } },
    { name:"アルファベット", category:"英字", title:"TARO", thumb:tplThumb("TARO","Noto Sans JP","#1f6b46","#fbfaf7"),
      build:()=>{ state.widthMm=25; state.lengthMm=70; state.fabric="#fbfaf7"; state.thread="#1f6b46";
        tT("TARO","Noto Sans JP","#1f6b46",700,0.46,0.5,80); } },
    { name:"スポーツ 背番号", category:"スクール(学校・園)", title:"10 KENTA", thumb:tplThumb("","Noto Sans JP","#16243f","#fbfaf7",{ lines:[{t:"10",color:"#b3122a",size:20,weight:700},{t:"KENTA",color:"#16243f",size:11,weight:700}] }),
      build:()=>{ state.widthMm=40; state.lengthMm=80; state.fabric="#fbfaf7";
        tT("10","Noto Sans JP","#b3122a",700,0.46,0.38,0);
        tT("KENTA","Noto Sans JP","#16243f",700,0.2,0.74,60); } },
    { name:"介護 施設名", category:"介護・施設", title:"ひだまり苑", thumb:tplThumb("ひだまり苑","Zen Maru Gothic","#243f73","#fbfaf7"),
      build:()=>{ state.widthMm=30; state.lengthMm=80; state.fabric="#fbfaf7"; state.thread="#243f73";
        tT("ひだまり苑","Zen Maru Gothic","#243f73",700,0.34,0.5,15); } },
    { name:"屋号 ロゴ調", category:"ロゴ・屋号", title:"CAMP BASE", thumb:tplThumb("CAMP BASE","Noto Sans JP","#1f6b46","#fbfaf7"),
      build:()=>{ state.widthMm=35; state.lengthMm=90; state.fabric="#fbfaf7"; state.thread="#1f6b46";
        tT("CAMP BASE","Noto Sans JP","#1f6b46",700,0.3,0.5,40); } },
    { name:"枠付き名入れ", category:"氏名", title:"NAME", thumb:tplThumb("NAME","Noto Sans JP","#7c1c2c","#fbfaf7"),
      build:()=>{ state.widthMm=30; state.lengthMm=80; state.fabric="#fbfaf7"; state.thread="#7c1c2c"; const {w,h}=canvasPx();
        canvas.add(new fabric.Rect({left:w/2,top:h/2,originX:"center",originY:"center",width:w*0.9,height:h*0.7,fill:"transparent",stroke:"#7c1c2c",strokeWidth:3,rx:6}));
        tT("NAME","Noto Sans JP","#7c1c2c",700,0.34,0.5,60); } },
    { name:"イベント 名札", category:"イベント", title:"STAFF", thumb:tplThumb("STAFF","Noto Sans JP","#fbfaf7","#243f73"),
      build:()=>{ state.widthMm=30; state.lengthMm=80; state.fabric="#243f73"; state.thread="#fbfaf7";
        tT("STAFF","Noto Sans JP","#fbfaf7",700,0.4,0.5,120); } },
    { name:"モダン 細字", category:"モダン", title:"daily", thumb:tplThumb("daily","Playfair Display","#211f1c","#fbfaf7"),
      build:()=>{ state.widthMm=20; state.lengthMm=70; state.fabric="#fbfaf7"; state.thread="#211f1c";
        tT("daily","Playfair Display","#211f1c",500,0.4,0.5,40); } },
    { name:"お祝い のし調", category:"お祝い", title:"寿", thumb:tplThumb("寿","Shippori Mincho","#7c1c2c","#fbfaf7"),
      build:()=>{ state.widthMm=30; state.lengthMm=40; state.fabric="#fbfaf7"; state.thread="#7c1c2c";
        tT("寿","Shippori Mincho","#7c1c2c",700,0.5,0.5,0); } },
  ],

  /* ===== 刺繍ワッペン(色数制限なし。金銀蛍光は不可。最小文字 刺繍 4.0mm・漢字は太め大きめ) ===== */
  embroidery_wappen: [
    { name:"盾エンブレム", category:"スクール(学校・園)", title:"SCHOOL", thumb:tplThumb("","Playfair Display","#fbfaf7","#16243f",{ shape:"shield", edge:"#d4711f", lines:[{t:"SCHOOL",color:"#fbfaf7",size:13,weight:700}], sub:"1998", subColor:"#d4711f" }),
      build:()=>{ state.presetIdx=2; state.emblem="shield"; state.mello=true; state.melloColor="#d4711f"; state.fabric="#16243f";
        tT("SCHOOL","Playfair Display","#fbfaf7",700,0.18,0.42,80);
        tT("1998","Playfair Display","#d4711f",600,0.14,0.62,200); } },
    { name:"丸ロゴ 英字", category:"ロゴ・屋号", title:"WORKS", thumb:tplThumb("WORKS","Noto Sans JP","#fbfaf7","#7c1c2c",{ shape:"circle", edge:"#d4711f" }),
      build:()=>{ state.presetIdx=1; state.emblem="circle"; state.mello=true; state.melloColor="#d4711f"; state.fabric="#7c1c2c";
        tT("WORKS","Noto Sans JP","#fbfaf7",700,0.18,0.5,60); } },
    { name:"丸ロゴ 漢字大", category:"和風", title:"匠", thumb:tplThumb("匠","Yuji Syuku","#f4f1e8","#5e1722",{ shape:"circle", edge:"#d4711f" }),
      build:()=>{ state.presetIdx=2; state.emblem="circle"; state.mello=true; state.melloColor="#d4711f"; state.fabric="#5e1722";
        tT("匠","Yuji Syuku","#f4f1e8",700,0.46,0.5,0); } },
    { name:"星章", category:"ブランド", title:"STAR", thumb:tplThumb("","Noto Sans JP","#fbfaf7","#243f73",{ shape:"circle", edge:"#fbfaf7", lines:[{t:"★",color:"#d4711f",size:22,weight:700},{t:"STAR",color:"#fbfaf7",size:11,weight:700}] }),
      build:()=>{ state.presetIdx=1; state.emblem="circle"; state.mello=true; state.melloColor="#fbfaf7"; state.fabric="#243f73"; const {w,h}=canvasPx();
        canvas.add(makeStar({left:w/2,top:h*0.42,originX:"center",originY:"center",fill:"#d4711f"}, h*0.2));
        tT("STAR","Noto Sans JP","#fbfaf7",700,0.16,0.74,120); } },
    { name:"盾 漢字", category:"和風", title:"和", thumb:tplThumb("和","Yuji Syuku","#fbfaf7","#123e2c",{ shape:"shield", edge:"#d4711f" }),
      build:()=>{ state.presetIdx=2; state.emblem="shield"; state.mello=true; state.melloColor="#d4711f"; state.fabric="#123e2c";
        tT("和","Yuji Syuku","#fbfaf7",700,0.4,0.46,0); } },
    { name:"角丸 チーム名", category:"スクール(学校・園)", title:"TEAM", thumb:tplThumb("TEAM","Noto Sans JP","#fbfaf7","#1f6b46",{ shape:"roundrect", edge:"#fbfaf7" }),
      build:()=>{ state.presetIdx=1; state.emblem="roundrect"; state.mello=true; state.melloColor="#fbfaf7"; state.fabric="#1f6b46";
        tT("TEAM","Noto Sans JP","#fbfaf7",700,0.2,0.5,40); } },
    { name:"ひし形 イニシャル", category:"ブランド", title:"M", thumb:tplThumb("M","Playfair Display","#23211d","#d6a324",{ shape:"diamond" }),
      build:()=>{ state.presetIdx=1; state.emblem="diamond"; state.mello=true; state.melloColor="#23211d"; state.fabric="#d6a324";
        tT("M","Playfair Display","#23211d",700,0.4,0.5,0); } },
    { name:"楕円 屋号", category:"ロゴ・屋号", title:"BAKERY", thumb:tplThumb("BAKERY","Playfair Display","#fbfaf7","#7c1c2c",{ shape:"ellipse", edge:"#d4711f" }),
      build:()=>{ state.presetIdx=2; state.emblem="ellipse"; state.mello=true; state.melloColor="#d4711f"; state.fabric="#7c1c2c";
        tT("BAKERY","Playfair Display","#fbfaf7",600,0.2,0.5,80); } },
    { name:"丸 ワンポイント", category:"モダン", title:"●", thumb:tplThumb("","Noto Sans JP","#fbfaf7","#1f2c4a",{ shape:"circle", edge:"#fbfaf7", lines:[{t:"GOOD",color:"#fbfaf7",size:13,weight:700}] }),
      build:()=>{ state.presetIdx=0; state.emblem="circle"; state.mello=true; state.melloColor="#fbfaf7"; state.fabric="#1f2c4a";
        tT("GOOD","Noto Sans JP","#fbfaf7",700,0.22,0.5,40); } },
    { name:"丸 介護施設", category:"介護・施設", title:"care", thumb:tplThumb("care","Zen Maru Gothic","#fbfaf7","#2f7d97",{ shape:"circle", edge:"#fbfaf7" }),
      build:()=>{ state.presetIdx=1; state.emblem="circle"; state.mello=true; state.melloColor="#fbfaf7"; state.fabric="#2f7d97";
        tT("care","Zen Maru Gothic","#fbfaf7",700,0.24,0.5,20); } },
    { name:"盾 お祝い", category:"お祝い", title:"祝", thumb:tplThumb("祝","Shippori Mincho","#fbfaf7","#7c1c2c",{ shape:"shield", edge:"#d6a324" }),
      build:()=>{ state.presetIdx=2; state.emblem="shield"; state.mello=true; state.melloColor="#d6a324"; state.fabric="#7c1c2c";
        tT("祝","Shippori Mincho","#fbfaf7",700,0.4,0.46,0); } },
    { name:"角丸 イベント", category:"イベント", title:"FES", thumb:tplThumb("FES","Noto Sans JP","#23211d","#7aa83f",{ shape:"roundrect", edge:"#23211d" }),
      build:()=>{ state.presetIdx=1; state.emblem="roundrect"; state.mello=true; state.melloColor="#23211d"; state.fabric="#7aa83f";
        tT("FES","Noto Sans JP","#23211d",700,0.24,0.5,40); } },
  ],

  /* ===== 織ワッペン(金銀可。紋糸 4 色目安。最小文字 織 2.5mm) ===== */
  woven_wappen: [
    { name:"盾エンブレム 金", category:"ブランド", title:"EST 1998", thumb:tplThumb("","Playfair Display","#d6a324","#123e2c",{ shape:"shield", edge:"#d6a324", lines:[{t:"EST",color:"#d6a324",size:14,weight:700}], sub:"1998", subColor:"#f4f1e8" }),
      build:()=>{ state.presetIdx=2; state.emblem="shield"; state.mello=true; state.melloColor="#d6a324"; state.fabric="#123e2c";
        tT("EST","Playfair Display","#d6a324",700,0.22,0.42,40);
        tT("1998","Playfair Display","#f4f1e8",600,0.16,0.62,200); } },
    { name:"丸ロゴ 漢字", category:"和風", title:"匠", thumb:tplThumb("匠","Yuji Syuku","#f4f1e8","#5e1722",{ shape:"circle", edge:"#d6a324" }),
      build:()=>{ state.presetIdx=2; state.emblem="circle"; state.mello=true; state.melloColor="#d6a324"; state.fabric="#5e1722";
        tT("匠","Yuji Syuku","#f4f1e8",700,0.46,0.5,0); } },
    { name:"星章", category:"ブランド", title:"STAR", thumb:tplThumb("","Noto Sans JP","#d6a324","#243f73",{ shape:"circle", edge:"#f4f1e8", lines:[{t:"★",color:"#d6a324",size:22,weight:700},{t:"STAR",color:"#f4f1e8",size:11,weight:700}] }),
      build:()=>{ state.presetIdx=1; state.emblem="circle"; state.mello=true; state.melloColor="#f4f1e8"; state.fabric="#243f73"; const {w,h}=canvasPx();
        canvas.add(makeStar({left:w/2,top:h*0.42,originX:"center",originY:"center",fill:"#d6a324"}, h*0.2));
        tT("STAR","Noto Sans JP","#f4f1e8",700,0.16,0.74,120); } },
    { name:"丸ロゴ 英字", category:"ロゴ・屋号", title:"WORKS", thumb:tplThumb("WORKS","Noto Sans JP","#f4f1e8","#1f6b46",{ shape:"circle", edge:"#d6a324" }),
      build:()=>{ state.presetIdx=1; state.emblem="circle"; state.mello=true; state.melloColor="#d6a324"; state.fabric="#1f6b46";
        tT("WORKS","Noto Sans JP","#f4f1e8",700,0.18,0.5,60); } },
    { name:"盾 校章", category:"スクール(学校・園)", title:"SCHOOL", thumb:tplThumb("SCHOOL","Playfair Display","#f4f1e8","#1f2c4a",{ shape:"shield", edge:"#d6a324" }),
      build:()=>{ state.presetIdx=2; state.emblem="shield"; state.mello=true; state.melloColor="#d6a324"; state.fabric="#1f2c4a";
        tT("SCHOOL","Playfair Display","#f4f1e8",700,0.16,0.46,40); } },
    { name:"角丸 屋号", category:"ロゴ・屋号", title:"工房", thumb:tplThumb("工房","Shippori Mincho","#f4f1e8","#5e1722",{ shape:"roundrect", edge:"#d6a324" }),
      build:()=>{ state.presetIdx=1; state.emblem="roundrect"; state.mello=true; state.melloColor="#d6a324"; state.fabric="#5e1722";
        tT("工房","Shippori Mincho","#f4f1e8",700,0.3,0.5,30); } },
    { name:"ひし形 紋", category:"和風", title:"紋", thumb:tplThumb("紋","Yuji Syuku","#23211d","#d6a324",{ shape:"diamond" }),
      build:()=>{ state.presetIdx=1; state.emblem="diamond"; state.mello=true; state.melloColor="#23211d"; state.fabric="#d6a324";
        tT("紋","Yuji Syuku","#23211d",700,0.38,0.5,0); } },
    { name:"楕円 ブランド", category:"ブランド", title:"MAISON", thumb:tplThumb("MAISON","Playfair Display","#23211d","#c7a14a",{ shape:"ellipse", edge:"#23211d" }),
      build:()=>{ state.presetIdx=2; state.emblem="ellipse"; state.mello=true; state.melloColor="#23211d"; state.fabric="#c7a14a";
        tT("MAISON","Playfair Display","#23211d",600,0.18,0.5,80); } },
    { name:"丸 漢字一文字", category:"和風", title:"和", thumb:tplThumb("和","Yuji Syuku","#7c1c2c","#efe9da",{ shape:"circle", edge:"#7c1c2c" }),
      build:()=>{ state.presetIdx=1; state.emblem="circle"; state.mello=true; state.melloColor="#7c1c2c"; state.fabric="#efe9da";
        tT("和","Yuji Syuku","#7c1c2c",700,0.46,0.5,0); } },
    { name:"丸 介護", category:"介護・施設", title:"care", thumb:tplThumb("care","Zen Maru Gothic","#f4f1e8","#2f7d97",{ shape:"circle", edge:"#f4f1e8" }),
      build:()=>{ state.presetIdx=1; state.emblem="circle"; state.mello=true; state.melloColor="#f4f1e8"; state.fabric="#2f7d97";
        tT("care","Zen Maru Gothic","#f4f1e8",700,0.24,0.5,20); } },
    { name:"盾 お祝い", category:"お祝い", title:"寿", thumb:tplThumb("寿","Shippori Mincho","#d6a324","#7c1c2c",{ shape:"shield", edge:"#d6a324" }),
      build:()=>{ state.presetIdx=2; state.emblem="shield"; state.mello=true; state.melloColor="#d6a324"; state.fabric="#7c1c2c";
        tT("寿","Shippori Mincho","#d6a324",700,0.4,0.46,0); } },
    { name:"角丸 イベント", category:"イベント", title:"FES", thumb:tplThumb("FES","Noto Sans JP","#23211d","#7aa83f",{ shape:"roundrect", edge:"#23211d" }),
      build:()=>{ state.presetIdx=1; state.emblem="roundrect"; state.mello=true; state.melloColor="#23211d"; state.fabric="#7aa83f";
        tT("FES","Noto Sans JP","#23211d",700,0.24,0.5,40); } },
  ],

  /* ===== プリントワッペン(フルカラー。金銀蛍光は不可。最小文字 印刷 1.5mm) ===== */
  print_wappen: [
    { name:"フルカラー円章", category:"ロゴ・屋号", title:"MOUNTAIN", thumb:tplThumb("","Playfair Display","#fbfaf7","#2f7d97",{ shape:"circle", lines:[{t:"MOUNTAIN",color:"#fbfaf7",size:11,weight:600}] }),
      build:()=>{ state.presetIdx=1; state.emblem="circle"; state.mello=false; state.fabric="#2f7d97"; const {w,h}=canvasPx();
        canvas.add(new fabric.Circle({left:w/2,top:h*0.4,originX:"center",originY:"center",radius:h*0.13,fill:"#d4711f"}));
        canvas.add(new fabric.Triangle({left:w/2,top:h*0.62,originX:"center",originY:"center",width:w*0.5,height:h*0.3,fill:"#1f6b46"}));
        tT("MOUNTAIN","Playfair Display","#fbfaf7",600,0.13,0.84,120); } },
    { name:"ダイカット ひし形", category:"モダン", title:"GOOD", thumb:tplThumb("GOOD","Noto Sans JP","#fbfaf7","#b3122a",{ shape:"diamond" }),
      build:()=>{ state.presetIdx=1; state.emblem="diamond"; state.mello=false; state.fabric="#b3122a";
        tT("GOOD","Noto Sans JP","#fbfaf7",700,0.18,0.5,20); } },
    { name:"楕円 ラベル", category:"ロゴ・屋号", title:"Coffee", thumb:tplThumb("Coffee","Dancing Script","#f4f1e8","#5e3a22",{ shape:"ellipse" }),
      build:()=>{ state.presetIdx=2; state.emblem="ellipse"; state.mello=false; state.fabric="#5e3a22";
        tT("Coffee","Dancing Script","#f4f1e8",600,0.3,0.5,0); } },
    { name:"丸 スクール", category:"スクール(学校・園)", title:"FC", thumb:tplThumb("","Noto Sans JP","#fbfaf7","#16243f",{ shape:"circle", lines:[{t:"FC",color:"#fbfaf7",size:18,weight:700},{t:"AOZORA",color:"#d4711f",size:10,weight:700}] }),
      build:()=>{ state.presetIdx=1; state.emblem="circle"; state.mello=false; state.fabric="#16243f";
        tT("FC","Noto Sans JP","#fbfaf7",700,0.34,0.42,40);
        tT("AOZORA","Noto Sans JP","#d4711f",700,0.13,0.7,120); } },
    { name:"盾 チーム", category:"スクール(学校・園)", title:"WIN", thumb:tplThumb("WIN","Noto Sans JP","#fbfaf7","#1f6b46",{ shape:"shield" }),
      build:()=>{ state.presetIdx=2; state.emblem="shield"; state.mello=false; state.fabric="#1f6b46";
        tT("WIN","Noto Sans JP","#fbfaf7",700,0.2,0.44,40); } },
    { name:"角丸 屋号", category:"ロゴ・屋号", title:"STUDIO", thumb:tplThumb("STUDIO","Noto Sans JP","#16243f","#cfcdc7",{ shape:"roundrect" }),
      build:()=>{ state.presetIdx=1; state.emblem="roundrect"; state.mello=false; state.fabric="#cfcdc7";
        tT("STUDIO","Noto Sans JP","#16243f",700,0.18,0.5,40); } },
    { name:"丸 イラスト", category:"モダン", title:"SUN", thumb:tplThumb("","Noto Sans JP","#23211d","#fbfaf7",{ shape:"circle", lines:[{t:"SUN",color:"#d4711f",size:14,weight:700}] }),
      build:()=>{ state.presetIdx=1; state.emblem="circle"; state.mello=false; state.fabric="#fbfaf7"; const {w,h}=canvasPx();
        canvas.add(new fabric.Circle({left:w/2,top:h*0.4,originX:"center",originY:"center",radius:h*0.16,fill:"#d4711f"}));
        tT("SUN","Noto Sans JP","#23211d",700,0.16,0.76,80); } },
    { name:"ひし形 イニシャル", category:"ブランド", title:"R", thumb:tplThumb("R","Playfair Display","#fbfaf7","#6b4a86",{ shape:"diamond" }),
      build:()=>{ state.presetIdx=1; state.emblem="diamond"; state.mello=false; state.fabric="#6b4a86";
        tT("R","Playfair Display","#fbfaf7",700,0.4,0.5,0); } },
    { name:"楕円 介護", category:"介護・施設", title:"care home", thumb:tplThumb("care","Zen Maru Gothic","#fbfaf7","#2f7d97",{ shape:"ellipse" }),
      build:()=>{ state.presetIdx=2; state.emblem="ellipse"; state.mello=false; state.fabric="#2f7d97";
        tT("care home","Zen Maru Gothic","#fbfaf7",700,0.16,0.5,15); } },
    { name:"丸 漢字", category:"和風", title:"祭", thumb:tplThumb("祭","Shippori Mincho","#fbfaf7","#7c1c2c",{ shape:"circle" }),
      build:()=>{ state.presetIdx=1; state.emblem="circle"; state.mello=false; state.fabric="#7c1c2c";
        tT("祭","Shippori Mincho","#fbfaf7",700,0.46,0.5,0); } },
    { name:"角丸 イベント", category:"イベント", title:"2026", thumb:tplThumb("","Noto Sans JP","#23211d","#7aa83f",{ shape:"roundrect", lines:[{t:"FESTA",color:"#23211d",size:12,weight:700},{t:"2026",color:"#7c1c2c",size:10,weight:700}] }),
      build:()=>{ state.presetIdx=1; state.emblem="roundrect"; state.mello=false; state.fabric="#7aa83f";
        tT("FESTA","Noto Sans JP","#23211d",700,0.2,0.42,40);
        tT("2026","Noto Sans JP","#7c1c2c",700,0.16,0.68,80); } },
    { name:"丸 お祝い", category:"お祝い", title:"祝", thumb:tplThumb("祝","Shippori Mincho","#7c1c2c","#fbfaf7",{ shape:"circle" }),
      build:()=>{ state.presetIdx=1; state.emblem="circle"; state.mello=false; state.fabric="#fbfaf7"; state.thread="#7c1c2c";
        tT("祝","Shippori Mincho","#7c1c2c",700,0.46,0.5,0); } },
  ],
};

/* テンプレートのサムネイル SVG を生成。
   旧シグネチャ tplThumb(text, font, fg, bg, round) を維持しつつ、
   仕上がりが掴めるよう地色・形状・複数行・縁色を反映した大きめプレビューにする。
   第5引数 round は後方互換のため真偽値も受けるが、オプションオブジェクト
   { shape, lines, edge, sub, subColor } を渡すとより細かく表現できる。 */
function tplThumb(text, font, fg, bg, opt){
  // 後方互換: 第5引数が真偽値(旧 round)なら丸ワッペン形状とみなす
  if (opt === true) opt = { shape: "circle" };
  else if (opt === false || opt == null) opt = {};
  const shape = opt.shape || "name";
  const lines = opt.lines || [{ t: text, color: fg, size: 17, font, weight: 600 }];
  const edge = opt.edge || null;     // メロー縁色
  const sub = opt.sub || null;       // 補助の英字など
  const subColor = opt.subColor || fg;
  const W = 150, H = 96;
  let bgShape = "";
  let clipId = "tc" + Math.random().toString(36).slice(2, 8);
  // 地の形状(ネームは横長角丸 / ワッペンは形状別)
  if (shape === "circle"){
    bgShape = `<circle cx="${W/2}" cy="${H/2}" r="40" fill="${bg}"/>`;
    if (edge) bgShape += `<circle cx="${W/2}" cy="${H/2}" r="40" fill="none" stroke="${edge}" stroke-width="4"/>`;
  } else if (shape === "ellipse"){
    bgShape = `<ellipse cx="${W/2}" cy="${H/2}" rx="56" ry="36" fill="${bg}"/>`;
    if (edge) bgShape += `<ellipse cx="${W/2}" cy="${H/2}" rx="56" ry="36" fill="none" stroke="${edge}" stroke-width="4"/>`;
  } else if (shape === "shield"){
    const p = `M35 22 H115 V58 L75 84 L35 58 Z`;
    bgShape = `<path d="${p}" fill="${bg}"/>` + (edge ? `<path d="${p}" fill="none" stroke="${edge}" stroke-width="4"/>` : "");
  } else if (shape === "diamond"){
    const p = `M75 14 L121 48 L75 82 L29 48 Z`;
    bgShape = `<path d="${p}" fill="${bg}"/>` + (edge ? `<path d="${p}" fill="none" stroke="${edge}" stroke-width="4"/>` : "");
  } else if (shape === "roundrect"){
    bgShape = `<rect x="22" y="20" width="106" height="56" rx="14" fill="${bg}"/>` + (edge ? `<rect x="22" y="20" width="106" height="56" rx="14" fill="none" stroke="${edge}" stroke-width="4"/>` : "");
  } else {
    // ネーム(横長)
    bgShape = `<rect x="8" y="20" width="134" height="56" rx="6" fill="${bg}"/>`;
  }
  // 文字行(中央寄せ・複数行対応)
  const n = lines.length + (sub ? 1 : 0);
  const startY = H/2 - (n - 1) * 11;
  let texts = lines.map((ln, i)=>{
    const y = startY + i * 22;
    return `<text x="${W/2}" y="${y}" font-size="${ln.size||16}" font-family="${(ln.font||font)},serif" font-weight="${ln.weight||600}" fill="${ln.color||fg}" text-anchor="middle" dominant-baseline="middle">${esc(ln.t)}</text>`;
  }).join("");
  if (sub){
    const y = startY + lines.length * 20;
    texts += `<text x="${W/2}" y="${y}" font-size="10" font-family="${font},serif" font-weight="500" fill="${subColor}" text-anchor="middle" dominant-baseline="middle" letter-spacing="1.5">${esc(sub)}</text>`;
  }
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">${bgShape}${texts}</svg>`;
}

function applyTemplate(i){
  const t = (TEMPLATES[state.product]||[])[i]; if(!t) return;
  suppressHistory=true;
  canvas.clear();
  canvas.setBackgroundColor(state.fabric, ()=>{});
  t.build();
  suppressHistory=false;
  rebuildStage();
  // 織りの場合、テンプレ生成テキストにも質感付与
  canvas.getObjects().forEach(o=>{ if(o.type==="i-text") applyThreadEffect(o); });
  canvas.discardActiveObject();
  canvas.requestRenderAll();
  pushHistory();
  $("#props") && renderProps();
  flashStage();
}

// キャンバスへの反映時に、さりげない登場演出を一度だけ走らせる(やりすぎない)。
function flashStage(){
  const shell = $("#canvasShell");
  if (!shell) return;
  shell.classList.remove("flash");
  // リフローを挟んでアニメを再起動
  void shell.offsetWidth;
  shell.classList.add("flash");
}

/* ============================================================
   10b. AIデザイン生成(デモ版・オフライン安全)
   ------------------------------------------------------------
   入力(文言+雰囲気)から、現在品目の仕様内で書体・配色・レイアウトを
   決めて候補を組み立てる。デモはローカルのルールベース生成で、乱数は使わず
   入力文字列のハッシュで決定的にばらつかせる(同じ入力なら同じ結果)。
   生成結果は必ず現在品目のプリフライト制約を満たす範囲で作る:
     - 禁止色(print/iron/刺繍/print ワッペンで金銀・蛍光)を使わない
       (許可パレットからのみ前景色を選ぶ)。
     - 紋糸色数ガイド以下(前景色は地色除きで最大2色に抑える)。
     - 最小文字サイズ以上(見出し/サブのサイズ比を品目下限から逆算して下限保証)。
     - 寸法は規格幅・lengthRange / WAPPEN_PRESETS の範囲内。
   本番フック: generateAiDesign() が唯一の差し替えポイント。オンライン時に
   LLM API(Anthropic、プレミアム)へ置き換えられるよう関数を1箇所に分離し、
   API 未設定/オフライン時は localAiGenerate() にフォールバックする構造にする。
   ============================================================ */

// 文字列を 32bit のハッシュに(決定的なばらつき源。Math.random の代替)。
function hashStr(s){
  let h = 2166136261 >>> 0;
  s = String(s||"");
  for (let i=0;i<s.length;i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}

// 雰囲気(mood)定義。書体候補・配色傾向・字間・装飾の方針を持つ。
const AI_MOODS = {
  modern:   { label:"モダン",     fonts:["Playfair Display","Noto Sans JP"], spacing:120, deco:"none",  desc:"細字・広い字間の洗練" },
  japanese: { label:"和風",       fonts:["Yuji Syuku","Shippori Mincho"],     spacing:30,  deco:"frame", desc:"明朝・筆書きの落ち着き" },
  cute:     { label:"かわいい",   fonts:["Zen Maru Gothic","Noto Sans JP"],   spacing:15,  deco:"none",  desc:"丸ゴシックの親しみ" },
  formal:   { label:"フォーマル", fonts:["Noto Serif JP","Shippori Mincho"],  spacing:40,  deco:"frame", desc:"明朝の端正" },
  pop:      { label:"ポップ",     fonts:["Noto Sans JP","Zen Maru Gothic"],   spacing:20,  deco:"bar",   desc:"太字・帯の元気" },
};

// 品目で使える前景色(地色を除く)の許可パレット。禁止色を必ず除外する。
// 織り系のみ金銀(metal)を許可。蛍光(fluo)は全品目で除外。色数は最大2色に抑える。
function aiAllowedPalette(p){
  const base = THREAD_BOOK.filter(t=>{
    if (t.fluo) return false;               // 蛍光は全品目で不可
    if (t.metal && !p.allowMetal) return false; // 金銀は許可品目のみ
    return true;
  });
  return base;
}

// 地色候補(品目の地色帳から。織ネームは白黒標準を先頭に)。
function aiFabricChoices(p){
  return (p.family === "woven" ? FABRIC_BOOK.woven : FABRIC_BOOK.print);
}

// 前景色を地色とのコントラストで選ぶ。地が暗ければ明色、明るければ暗色から。
function aiPickForeground(palette, fabricHex, seed){
  const dark = isDark(fabricHex);
  // コントラストが取れる候補に絞る
  let pool = palette.filter(t => isDark(t.hex) !== dark);
  if (!pool.length) pool = palette;
  return pool[seed % pool.length].hex;
}

// アクセント色(2色目)。前景と異なり、地色ともコントラストが取れる色。
function aiPickAccent(palette, fabricHex, fgHex, seed){
  const dark = isDark(fabricHex);
  let pool = palette.filter(t => isDark(t.hex) !== dark && toHex(t.hex) !== toHex(fgHex));
  if (!pool.length) pool = palette.filter(t => toHex(t.hex) !== toHex(fgHex));
  if (!pool.length) return fgHex;
  return pool[seed % pool.length].hex;
}

// 入力文言から「見出し」と「サブ」を切り出す。改行/全角空白/読点で分割。
function aiSplitText(raw){
  const s = String(raw||"").trim();
  if (!s) return { head:"サンプル", sub:"" };
  const parts = s.split(/[\n,、\/]/).map(x=>x.trim()).filter(Boolean);
  if (parts.length >= 2) return { head: parts[0], sub: parts.slice(1).join(" ") };
  // 1語のみ: 空白があれば後半をサブにしない(氏名想定)。サブなし。
  return { head: s, sub: "" };
}

// 見出しの安全フォントサイズ(px)を品目の最小文字下限から逆算して下限保証する。
// 漢字を含む見出しは漢字下限を、含まなければ通常下限を用い、さらに余裕を持たせる。
function aiSafeHeadSize(p, headText){
  const { h } = canvasPx();
  const famKey = p.family === "embroidery" ? "embroidery" : (p.family === "iron" ? "iron" : (p.family === "woven" ? "woven" : "print"));
  const minMm = hasKanji(headText) ? PF.minCharMmKanji[famKey] : PF.minCharMm[famKey];
  // 下限 mm を px に。最小の 1.35 倍を確実な下限として、キャンバス高さの比率と大きい方を採る。
  const floorPx = minMm * PX_PER_MM * 1.35;
  let size = Math.round(h * 0.42);
  // 文字数が多いほど縮むが、下限は割らない
  const len = [...String(headText||"サンプル")].length;
  if (len > 4) size = Math.round(h * (0.42 - Math.min(0.22, (len-4)*0.03)));
  return Math.max(Math.round(floorPx), size);
}

// サブテキストの安全サイズ(見出しの 0.45 倍。ただし品目下限以上)。
function aiSafeSubSize(p, headSize){
  const famKey = p.family === "embroidery" ? "embroidery" : (p.family === "iron" ? "iron" : (p.family === "woven" ? "woven" : "print"));
  const minPx = PF.minCharMm[famKey] * PX_PER_MM * 1.25;
  return Math.max(Math.round(minPx), Math.round(headSize * 0.45));
}

/* 本番フック(差し替えポイント)。
   オンライン時はここから LLM API(Anthropic、プレミアム)を呼び、構造化された
   デザイン候補(plan の配列)を受け取る実装に置換する想定。
   現状はキー不要でデモが動くよう、常に localAiGenerate にフォールバックする。
   実 API 呼び出しコードは含めず、配線位置のみを示す。 */
async function generateAiDesign(input){
  // 本番例(擬似コード。実装時に有効化):
  //   if (navigator.onLine && AI_CONFIG.apiKey){
  //     try { return await callAnthropicDesign(input, AI_CONFIG); }
  //     catch(e){ /* 失敗時はローカル生成にフォールバック */ }
  //   }
  return localAiGenerate(input);
}

// AI生成の本番設定の置き場(デモでは空。本番でキー・モデル等を注入)。
const AI_CONFIG = { apiKey: "", model: "", endpoint: "" };

// ローカル(オフライン)ルールベース生成。入力 { text, mood } から候補 plan 配列を返す。
// plan は { layout, fabric, fg, accent, font, spacing, deco, head, sub } のオブジェクト。
function localAiGenerate(input){
  const p = curProduct();
  const mood = AI_MOODS[input.mood] || AI_MOODS.modern;
  const palette = aiAllowedPalette(p);
  const fabrics = aiFabricChoices(p);
  const { head, sub } = aiSplitText(input.text);
  const baseSeed = hashStr((input.text||"") + "|" + input.mood + "|" + state.product);

  // 候補を3案。案ごとにシードをずらして配色・地色・書体・レイアウトを決定的に変える。
  const plans = [];
  const variants = 3;
  for (let v=0; v<variants; v++){
    const seed = (baseSeed + v*2654435761) >>> 0;
    const fabric = fabrics[(seed >>> 3) % fabrics.length].hex;
    const fg = aiPickForeground(palette, fabric, (seed >>> 5));
    const accent = aiPickAccent(palette, fabric, fg, (seed >>> 9));
    const font = mood.fonts[(seed >>> 7) % mood.fonts.length];
    // レイアウト: サブがあれば見出し+サブ、無ければ案により中央/枠/帯
    let layout;
    if (sub) layout = "headsub";
    else layout = ["center","framed","centered2"][v % 3];
    // ワッペンは中央寄せ主体(形状内に収める)
    if (p.kind === "wappen") layout = sub ? "headsub" : "center";
    plans.push({ layout, fabric, fg, accent, font, spacing: mood.spacing, deco: mood.deco, head, sub, mood: input.mood });
  }
  return plans;
}

// plan を現在の canvas に展開する(プリフライト安全な範囲で構築)。
// テンプレ build と同様に suppressHistory で囲み、最後に質感付与+履歴記録する。
function applyAiPlan(plan){
  const p = curProduct();
  suppressHistory = true;
  canvas.clear();
  // 寸法を品目の規格内に安全設定(ネームは横長、ワッペンは中サイズ)
  if (p.widths){
    // 見出しが収まる程度の規格幅・丈(範囲内)
    const wIdx = Math.min(p.widths.length-1, p.defWidthIdx + 1);
    state.widthMm = p.widths[wIdx];
    const [lo,hi] = p.lengthRange;
    const want = plan.sub ? 100 : 80;
    state.lengthMm = Math.max(lo, Math.min(hi, want));
  } else {
    state.presetIdx = 2; // やや大きめ(文字を収めやすい)
    if (p.kind === "wappen") state.emblem = (plan.mood === "japanese") ? "circle" : "shield";
    state.mello = (p.defFolding === "mello");
    state.melloColor = plan.accent;
  }
  state.fabric = plan.fabric;
  state.thread = plan.fg;
  if (p.weaves) state.weave = (plan.mood === "modern" || plan.mood === "formal") ? "satin" : (p.defWeave || "satin");

  canvas.setBackgroundColor(state.fabric, ()=>{});
  const { w, h } = canvasPx();
  const headSize = aiSafeHeadSize(p, plan.head);

  // 装飾(枠/帯)。禁止色を避けるためアクセント=許可パレット由来で安全。
  if (plan.deco === "frame" && plan.layout !== "bar"){
    canvas.add(new fabric.Rect({ left:w/2, top:h/2, originX:"center", originY:"center",
      width:w*0.9, height:h*0.78, fill:"transparent", stroke:plan.accent, strokeWidth:Math.max(2,Math.round(h*0.03)), rx:6 }));
  } else if (plan.deco === "bar"){
    canvas.add(new fabric.Rect({ left:w/2, top:h/2, originX:"center", originY:"center",
      width:w, height:h*0.5, fill:plan.accent }));
  }

  if (plan.layout === "headsub" && plan.sub){
    const subSize = aiSafeSubSize(p, headSize);
    // サブが英字のみなら Playfair で英字らしく、和文を含むなら見出しと同系書体で崩れを防ぐ。
    const subFont = /[^\x00-\x7F]/.test(plan.sub) ? plan.font : "Playfair Display";
    aiAddText(plan.head, plan.font, plan.fg, 700, Math.round(headSize*0.9), 0.40, plan.spacing);
    aiAddText(plan.sub, subFont, plan.accent, 500, subSize, 0.70, Math.round(plan.spacing*1.4));
  } else {
    const fill = (plan.deco === "bar") ? (isDark(plan.accent) ? "#fbfaf7" : "#211f1c") : plan.fg;
    aiAddText(plan.head, plan.font, fill, 700, headSize, 0.5, plan.spacing);
  }

  suppressHistory = false;
  rebuildStage();
  canvas.getObjects().forEach(o=>{ if(o.type==="i-text") applyThreadEffect(o); });
  canvas.discardActiveObject();
  canvas.requestRenderAll();
  pushHistory();
  renderProps();
  flashStage();
}

// AI生成テキストの追加ヘルパー(中央寄せ・縦位置比で配置)。
function aiAddText(text, font, fill, weight, sizePx, topRatio, spacing){
  const { w, h } = canvasPx();
  const t = new fabric.IText(text, {
    left: w/2, top: h*topRatio, originX:"center", originY:"center",
    fontFamily: font, fill, fontWeight: String(weight||600),
    fontSize: Math.max(8, Math.round(sizePx)), textAlign:"center", charSpacing: spacing||0,
  });
  canvas.add(t);
  return t;
}

// AI生成の候補プレビュー(小さな SVG サムネ)。tplThumb を流用して仕上がりを掴ませる。
function aiPlanThumb(plan){
  const p = curProduct();
  const shape = p.kind === "wappen" ? (state.emblem || "circle") : "name";
  if (plan.layout === "headsub" && plan.sub){
    return tplThumb("", plan.font, plan.fg, plan.fabric, {
      shape: p.kind==="wappen" ? shape : "name",
      lines:[{t:plan.head, color:plan.fg, size:16, weight:700}],
      sub: plan.sub, subColor: plan.accent,
      edge: (p.kind==="wappen" && state.mello) ? plan.accent : null,
    });
  }
  return tplThumb(plan.head, plan.font, (plan.deco==="bar"?"#fbfaf7":plan.fg), plan.fabric, {
    shape: p.kind==="wappen" ? shape : "name",
    edge: (p.kind==="wappen" && state.mello) ? plan.accent : null,
  });
}

// AI生成パネル(レール)。入力欄・雰囲気選択・生成ボタン・候補・注記。
function railAi(){
  const p = curProduct();
  const ai = state.ai;
  const moodChips = Object.entries(AI_MOODS).map(([k,m])=>
    `<button class="ai-mood${ai.mood===k?" sel":""}" data-aimood="${k}" title="${esc(m.desc)}">${esc(m.label)}</button>`
  ).join("");

  let candidatesHtml = "";
  if (ai.candidates && ai.candidates.length){
    candidatesHtml = `<div class="rp-section"><h4>生成候補(選ぶとキャンバスに展開)</h4>
      <div class="ai-cands">` + ai.candidates.map((pl,i)=>
        `<div class="ai-cand${ai.chosen===i?" sel":""}" data-aicand="${i}" title="この案を使う">
           <div class="ai-cand-thumb">${aiPlanThumb(pl)}</div>
           <div class="ai-cand-meta">案 ${i+1}<small>${esc((AI_MOODS[pl.mood]||{}).label||"")} / ${esc(pl.font)}</small></div>
         </div>`).join("") + `</div></div>`;
  }

  return `<h3 class="rp-title">AIでデザインを作る</h3>
    <p class="rp-sub">用途や文言と雰囲気を入れると、${esc(p.label)}の仕様内で配色・書体・レイアウトを提案します。候補から選んで展開できます。</p>
    <div class="ai-demo-note">デモ版(オフライン簡易生成)。本番は AI 生成(プレミアム)で、より自由な提案に対応します。</div>
    <div class="rp-section"><h4>文言(店名 / 氏名 / 施設名 など)</h4>
      <textarea id="aiText" class="ai-textarea" placeholder="例: 山田太郎&#10;例: みどり幼稚園&#10;例: Atelier, since 1998(読点や改行でサブ文字に分けられます)">${esc(ai.text)}</textarea>
    </div>
    <div class="rp-section"><h4>雰囲気</h4>
      <div class="ai-moods">${moodChips}</div>
    </div>
    <button class="ai-gen-btn" id="aiGenerate"><svg viewBox="0 0 24 24" width="18" height="18"><path d="M12 3l1.8 4.6L18 9l-4.2 1.4L12 15l-1.8-4.6L6 9l4.2-1.4L12 3Z" fill="currentColor"/></svg>AIで3案つくる</button>
    ${candidatesHtml}
    <div class="tip">生成結果は現在品目のプリフライト制約(規格内寸法・色数ガイド以下・最小文字以上・禁止色なし)を満たす範囲で作ります。展開後も自由に編集でき、入稿前に再判定されます。</div>`;
}

// AI生成パネルのイベントバインド(bindRail から呼ぶ)。
function bindAiRail(){
  const at = $("#aiText");
  if (at) at.oninput = ()=>{ state.ai.text = at.value; };
  $$("[data-aimood]").forEach(b=>b.onclick=()=>{ state.ai.mood = b.dataset.aimood; renderRail(); restoreAiFocus(); });
  const gen = $("#aiGenerate");
  if (gen) gen.onclick = ()=>{
    // 唯一の差し替えポイント generateAiDesign 経由(デモはローカル生成へフォールバック)
    Promise.resolve(generateAiDesign({ text: state.ai.text, mood: state.ai.mood }))
      .then(plans=>{ state.ai.candidates = plans || []; state.ai.chosen = -1; renderRail(); })
      .catch(()=>{ state.ai.candidates = localAiGenerate({ text: state.ai.text, mood: state.ai.mood }); state.ai.chosen = -1; renderRail(); });
  };
  $$("[data-aicand]").forEach(c=>c.onclick=()=>{
    const i = parseInt(c.dataset.aicand);
    state.ai.chosen = i;
    const pl = state.ai.candidates[i];
    if (pl) applyAiPlan(pl);
    renderRail();
  });
}

// renderRail 後に AI 文言入力欄へフォーカスを戻す(雰囲気切替で入力が途切れない配慮)。
function restoreAiFocus(){ /* テキストは onclick 経由のみ再描画のため通常は不要。将来用のフック */ }

/* ============================================================
   11. 商品切替
   ============================================================ */
function buildProductSwitch(){
  const el=$("#productSwitch");
  el.innerHTML=Object.entries(PRODUCTS).map(([k,p])=>`<button data-prod="${k}" class="${k===state.product?"active":""}">${esc(p.label)}</button>`).join("");
  $$("[data-prod]",el).forEach(b=>b.onclick=()=>switchProduct(b.dataset.prod));
}
function switchProduct(key){
  if(key===state.product) return;
  if(canvas.getObjects().length && !confirm("商品を切り替えると現在のデザインはクリアされます。よろしいですか。")){ return; }
  state.product=key;
  const p=PRODUCTS[key];
  // 寸法・仕立て・地組織の既定を品目に合わせて設定
  if (p.widths){ state.widthMm=p.widths[p.defWidthIdx]; state.lengthMm=p.lengthMm; }
  else { state.presetIdx=1; }
  state.folding=p.defFolding;
  if (p.weaves) state.weave=p.defWeave;
  state.fabric=(p.family==="woven"?FABRIC_BOOK.woven:FABRIC_BOOK.print)[0].hex;
  if(p.family!=="woven") state.thread="#211f1c";
  state.tplCategory="すべて";   // 品目切替時はカテゴリ絞り込みをリセット
  state.tplQuery="";            // 検索キーワードもリセット
  state.ai.candidates=[]; state.ai.chosen=-1;  // AI生成候補は品目依存のためクリア
  $$("#productSwitch button").forEach(b=>b.classList.toggle("active", b.dataset.prod===key));
  suppressHistory=true; canvas.clear(); suppressHistory=false;
  history=[]; histIdx=-1;
  rebuildStage(); renderRail(); renderProps();
  pushHistory();
}

/* ============================================================
   12. ズーム
   ============================================================ */
function setZoom(z){
  state.zoom=Math.max(0.3, Math.min(3, z));
  $("#zoomVal").textContent=Math.round(state.zoom*100)+"%";
  rebuildStage();
}

/* ============================================================
   12b. プリフライト(入稿前 製造可否判定)エンジン
   ------------------------------------------------------------
   品目ごとに物理的に作れるかを判定する。結果は ok/warn/fail の3段階。
   各ルールの閾値は PF 定数(すべて[要確認])。根拠は SPEC.md。
   差別化の核(ADR-005)であるため、ルールは独立関数として追加しやすくする。
   ============================================================ */

// オブジェクトから使用色(fill/stroke)を収集
function collectColors(objs){
  const set = new Set();
  objs.forEach(o=>{
    if (o.fill && typeof o.fill==="string" && o.fill!=="transparent") set.add(toHex(o.fill));
    if (o.stroke && typeof o.stroke==="string" && o.stroke!=="transparent") set.add(toHex(o.stroke));
    // グラデーション fill は多色扱い(印刷想定)。色数集計には個別反映しない。
  });
  return Array.from(set);
}

// テキストの実寸文字高さ(mm)。fontSize(px)を mm に換算。
function textHeightMm(o){
  const sc = o.scaleY || 1;
  return (o.fontSize * sc) / PX_PER_MM;
}
// 回転/斜体(円環・斜め文字)とみなすか
function isRotatedText(o){
  const a = Math.abs(((o.angle||0) % 360));
  return (a > PF.rotateDeg && a < 360-PF.rotateDeg) || o.fontStyle==="italic";
}
// 漢字を含むか(CJK 統合漢字の簡易判定)
function hasKanji(s){ return /[一-龯㐀-䶿]/.test(String(s||"")); }

// メインのプリフライト。{ level, items:[{level,msg}] } を返す。
function runPreflight(){
  if (!canvas) return { level:"ok", items:[] };
  const p = curProduct();
  const objs = canvas.getObjects();
  const items = [];
  const add = (level,msg)=>items.push({ level, msg });

  // 1. 寸法チェック
  if (p.widths){
    if (!p.widths.includes(state.widthMm)) add("fail", `規格幅 ${state.widthMm}mm は規格外です。規格織幅から選択してください。`);
    const [lo,hi] = p.lengthRange;
    if (state.lengthMm < lo || state.lengthMm > hi) add("fail", `丈 ${state.lengthMm}mm は範囲外です(${lo} から ${hi}mm)。`);
    else if (state.lengthMm < state.widthMm*0.8 && state.widthMm >= 24) add("warn", "丈が幅に対して短く、文字が窮屈になる可能性があります。[要確認]");
  }

  // 2. 要素・色数集計
  const textObjs = objs.filter(o=>o.type==="i-text");
  const colors = collectColors(objs);
  if (!objs.length) add("warn", "要素がありません。文字や図形を追加してください。");

  // 紋糸色数(織り系)。地色を除いた前景色数。
  if (p.family === "woven"){
    const fgColors = colors.filter(c => toHex(c) !== toHex(state.fabric));
    const guide = p.monThreadGuide || 3;
    if (fgColors.length > guide) add("warn", `紋糸の色数が ${fgColors.length} 色です(目安 ${guide} 色まで)。色数が多いと費用・難度が上がります。[要確認]`);
  }

  // 3. 禁止色(金・銀・蛍光)。品目の allowMetal / allowFluo に従う。
  colors.forEach(c=>{
    if (!p.allowMetal && isMetalColor(c)) add("fail", `金色・銀色は ${p.label} では使用できません(${c})。`);
    if (!p.allowFluo && isFluoColor(c)) add("fail", `蛍光色は ${p.label} では使用できません(${c} は蛍光相当)。`);
  });
  // 織りでの金銀は可だが注意喚起
  if (p.allowMetal && colors.some(c=>isMetalColor(c))) add("warn", "金糸・銀糸を使用しています。使用可ですが追加費用・納期に影響する場合があります。[要確認]");

  // 4. 最小文字サイズ
  const famKey = p.family === "embroidery" ? "embroidery" : (p.family === "iron" ? "iron" : (p.family === "woven" ? "woven" : "print"));
  const minMm = PF.minCharMm[famKey];
  const minKanji = PF.minCharMmKanji[famKey];
  textObjs.forEach(o=>{
    const hMm = textHeightMm(o);
    const txt = (o.text||"").slice(0,8);
    if (hMm < minMm){
      add("warn", `文字「${esc(txt)}」が約 ${hMm.toFixed(1)}mm[推定]。${minMm}mm 未満は細部再現に限界があります。[要確認]`);
    } else if ((hasKanji(o.text) || isRotatedText(o)) && hMm < minKanji){
      const why = hasKanji(o.text) ? "漢字" : "斜体・円環文字";
      add("warn", `${why}「${esc(txt)}」は約 ${hMm.toFixed(1)}mm。${minKanji}mm 以上を推奨します。[要確認]`);
    }
  });
  if (p.family === "embroidery" && textObjs.some(o=>hasKanji(o.text))) add("warn", "刺繍は漢字・細い文字の再現が難しいため、太め・大きめを推奨します。[要確認]");

  // 5. 安全マージン(折返し代・縫い代)。仕立ての safetyMm 内に要素がかかるか。
  const fold = FOLDING[state.folding] || {};
  const safe = fold.safetyMm || 0;
  if (safe > 0 && objs.length){
    const d = curDim();
    const safePx = safe * PX_PER_MM;
    let hit = false;
    objs.forEach(o=>{
      o.setCoords && o.setCoords();
      const b = o.getBoundingRect ? o.getBoundingRect(true,true) : null;
      if (!b) return;
      if (fold.topBottom){
        // センター折りは上下に折返し代
        if (b.top < safePx || (b.top+b.height) > d.h*PX_PER_MM - safePx) hit = true;
      } else {
        // 両端折り等は左右に折返し代
        if (b.left < safePx || (b.left+b.width) > d.w*PX_PER_MM - safePx) hit = true;
      }
    });
    if (hit) add("warn", `仕立て「${fold.label}」の折返し代/縫い代(片側 ${safe}mm[要確認])に要素がかかっています。安全域の内側に収めてください。`);
  }

  // 総合判定
  let level = "ok";
  if (items.some(i=>i.level==="fail")) level = "fail";
  else if (items.some(i=>i.level==="warn")) level = "warn";
  return { level, items };
}

/* ============================================================
   13. 書き出し / プレビュー / 入稿
   ============================================================ */
function exportPNG(multiplier=4){
  const z=state.zoom; canvas.setZoom(1); const {w,h}=canvasPx(); canvas.setWidth(w); canvas.setHeight(h);
  const url=canvas.toDataURL({format:"png", multiplier});
  canvas.setZoom(z); rebuildStage();
  return url;
}
function download(){
  const url=exportPNG(4);
  const a=document.createElement("a");
  a.href=url; a.download=`setoori_${state.product}_${Date.now()}.png`; a.click();
}

/* ============================================================
   仕上がりモックアップ(プレビュー)
   ------------------------------------------------------------
   エディタの canvas を PNG 化し、品目に応じたシーン SVG の所定位置に
   <image> として重ねて、実際の使われ方に合成して見せる。
   画像に依存せずインライン SVG の簡易シーンで表現(オフライン維持)。
   ============================================================ */

// 現在の品目に対応するシーン定義配列を返す。
// 各シーンは { id, label, svg(url, dim) } 。svg はネーム/ワッペンの PNG を
// 適切なアスペクト比・位置で重ねたシーン全体の SVG 文字列を返す関数。
function previewScenes(){
  const p = curProduct();
  // 素材単体シーン(高解像度書き出しイメージ。既存表示を残す)
  const bare = {
    id:"bare", label:"素材単体",
    svg:(url,dim)=>{
      const ar = dim.w / dim.h;
      const bw = ar>=1 ? 360 : 360*ar, bh = ar>=1 ? 360/ar : 360;
      return `<svg viewBox="0 0 420 360" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">
        <rect x="0" y="0" width="420" height="360" fill="none"/>
        <g transform="translate(${210-bw/2},${180-bh/2})">
          <rect x="-6" y="-6" width="${bw+12}" height="${bh+12}" rx="6" fill="#ffffff" opacity="0.0"/>
          <image href="${url}" x="0" y="0" width="${bw}" height="${bh}" preserveAspectRatio="none"/>
        </g>
      </svg>`;
    }
  };

  // ネーム系シーン(細長く重ねる)
  const nameScenes = [
    { id:"collar", label:"シャツの襟元", svg:(url,dim)=>sceneCollar(url,dim) },
    { id:"apron",  label:"エプロン胸",   svg:(url,dim)=>sceneApron(url,dim) },
    { id:"kids",   label:"子供服の裾",   svg:(url,dim)=>sceneKidsHem(url,dim) },
    { id:"bag",    label:"カバンの持ち手", svg:(url,dim)=>sceneBagHandle(url,dim) },
    { id:"towel",  label:"タオルの端",   svg:(url,dim)=>sceneTowel(url,dim) },
  ];
  // ワッペン系シーン(形状に応じて重ねる)
  const wappenScenes = [
    { id:"uniform", label:"ユニフォーム胸", svg:(url,dim)=>sceneUniform(url,dim) },
    { id:"backpack",label:"リュック前面",   svg:(url,dim)=>sceneBackpack(url,dim) },
    { id:"cap",     label:"制帽",           svg:(url,dim)=>sceneCap(url,dim) },
    { id:"tote",    label:"トートバッグ",   svg:(url,dim)=>sceneTote(url,dim) },
  ];
  const list = (p.kind==="name" ? nameScenes : wappenScenes).slice();
  list.push(bare);
  return list;
}

// ネームを細長く配置する共通ヘルパー。中心 (cx,cy)・幅 targetW・回転 rot で重ねる。
function placeName(url, dim, cx, cy, targetW, rot){
  const ar = dim.w / dim.h;            // 横長(丈/幅)
  const w = targetW, h = targetW / ar;
  return `<g transform="translate(${cx},${cy}) rotate(${rot||0})">
    <rect x="${-w/2-2}" y="${-h/2-2}" width="${w+4}" height="${h+4}" rx="2" fill="#000" opacity="0.10"/>
    <image href="${url}" x="${-w/2}" y="${-h/2}" width="${w}" height="${h}" preserveAspectRatio="none"/>
  </g>`;
}
// ワッペンを配置する共通ヘルパー。
function placeWappen(url, dim, cx, cy, targetW){
  const ar = dim.w / dim.h;
  const w = targetW, h = targetW / ar;
  return `<g transform="translate(${cx},${cy})">
    <ellipse cx="0" cy="${h/2+4}" rx="${w*0.45}" ry="5" fill="#000" opacity="0.08"/>
    <image href="${url}" x="${-w/2}" y="${-h/2}" width="${w}" height="${h}" preserveAspectRatio="none"/>
  </g>`;
}

function sceneFrame(inner){
  return `<svg viewBox="0 0 420 360" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">${inner}</svg>`;
}

// シャツの襟元(内側ネーム)
function sceneCollar(url, dim){
  return sceneFrame(`
    <rect x="0" y="0" width="420" height="360" fill="#eef1f4"/>
    <path d="M120 60 Q210 30 300 60 L320 150 Q210 130 100 150 Z" fill="#dfe5ea"/>
    <path d="M150 70 Q210 110 270 70 L300 60 Q210 30 120 60 Z" fill="#cdd6dd"/>
    <path d="M100 150 L90 320 Q210 350 330 320 L320 150 Q210 175 100 150 Z" fill="#f2f5f8"/>
    <rect x="150" y="178" width="120" height="64" rx="6" fill="#e7ecf0"/>
    ${placeName(url,dim,210,210,120,0)}
    <text x="210" y="300" font-size="12" fill="#8a93a0" text-anchor="middle" font-family="'Noto Sans JP',sans-serif">襟元の内側ネーム</text>`);
}
// エプロン胸
function sceneApron(url, dim){
  return sceneFrame(`
    <rect x="0" y="0" width="420" height="360" fill="#efeae1"/>
    <path d="M150 40 L270 40 L290 110 L290 320 L130 320 L130 110 Z" fill="#b9986f"/>
    <path d="M150 40 L130 110 L150 120 L165 55 Z" fill="#a8855c"/>
    <path d="M270 40 L290 110 L270 120 L255 55 Z" fill="#a8855c"/>
    <rect x="170" y="150" width="80" height="44" rx="3" fill="#cdb288"/>
    ${placeName(url,dim,210,172,90,0)}
    <text x="210" y="300" font-size="12" fill="#7a6a52" text-anchor="middle" font-family="'Noto Sans JP',sans-serif">エプロン胸の名入れ</text>`);
}
// 子供服の裾
function sceneKidsHem(url, dim){
  return sceneFrame(`
    <rect x="0" y="0" width="420" height="360" fill="#f3eef0"/>
    <path d="M120 60 Q210 40 300 60 L300 280 L120 280 Z" fill="#e8b9c6"/>
    <path d="M120 280 L300 280 L300 300 L120 300 Z" fill="#d99bad"/>
    <rect x="150" y="246" width="120" height="34" rx="3" fill="#f0d4dc"/>
    ${placeName(url,dim,210,263,120,0)}
    <text x="210" y="330" font-size="12" fill="#a06b7c" text-anchor="middle" font-family="'Noto Sans JP',sans-serif">子供服の裾(お名前)</text>`);
}
// カバン・リュックの持ち手
function sceneBagHandle(url, dim){
  return sceneFrame(`
    <rect x="0" y="0" width="420" height="360" fill="#eceae4"/>
    <rect x="120" y="150" width="180" height="150" rx="14" fill="#5a6b7a"/>
    <path d="M160 150 Q160 70 210 70 Q260 70 260 150" fill="none" stroke="#46535f" stroke-width="18"/>
    <rect x="186" y="100" width="48" height="40" rx="4" fill="#3c4651"/>
    ${placeName(url,dim,210,120,46,90)}
    <text x="210" y="330" font-size="12" fill="#5a6b7a" text-anchor="middle" font-family="'Noto Sans JP',sans-serif">カバンの持ち手ネーム</text>`);
}
// タオル・ブランケットの端
function sceneTowel(url, dim){
  return sceneFrame(`
    <rect x="0" y="0" width="420" height="360" fill="#e8eef0"/>
    <rect x="70" y="80" width="280" height="200" rx="8" fill="#d6e6ea"/>
    <rect x="70" y="80" width="280" height="22" fill="#bcd4da"/>
    <rect x="70" y="258" width="280" height="22" fill="#bcd4da"/>
    <rect x="120" y="238" width="180" height="34" rx="3" fill="#e6f1f3"/>
    ${placeName(url,dim,210,255,170,0)}
    <text x="210" y="320" font-size="12" fill="#5e7a82" text-anchor="middle" font-family="'Noto Sans JP',sans-serif">タオルの端の織りネーム</text>`);
}
// ユニフォーム胸(ワッペン)
function sceneUniform(url, dim){
  return sceneFrame(`
    <rect x="0" y="0" width="420" height="360" fill="#eef1f4"/>
    <path d="M130 60 L210 90 L290 60 L320 110 L290 140 L290 320 L130 320 L130 140 L100 110 Z" fill="#3a5fa0"/>
    <path d="M130 60 L100 110 L130 140 L155 90 Z" fill="#2f4d85"/>
    <path d="M290 60 L320 110 L290 140 L265 90 Z" fill="#2f4d85"/>
    ${placeWappen(url,dim,170,180,84)}
    <text x="210" y="305" font-size="12" fill="#33507f" text-anchor="middle" font-family="'Noto Sans JP',sans-serif">ユニフォーム胸のワッペン</text>`);
}
// リュック前面
function sceneBackpack(url, dim){
  return sceneFrame(`
    <rect x="0" y="0" width="420" height="360" fill="#ece9e4"/>
    <rect x="130" y="70" width="160" height="220" rx="28" fill="#566b54"/>
    <rect x="150" y="190" width="120" height="90" rx="14" fill="#485a47"/>
    <path d="M150 80 Q120 60 120 120" fill="none" stroke="#3c4a3b" stroke-width="14"/>
    <path d="M270 80 Q300 60 300 120" fill="none" stroke="#3c4a3b" stroke-width="14"/>
    ${placeWappen(url,dim,210,140,96)}
    <text x="210" y="320" font-size="12" fill="#4a5a48" text-anchor="middle" font-family="'Noto Sans JP',sans-serif">リュック前面のワッペン</text>`);
}
// 制帽
function sceneCap(url, dim){
  return sceneFrame(`
    <rect x="0" y="0" width="420" height="360" fill="#eef0ec"/>
    <path d="M110 200 Q110 110 210 110 Q310 110 310 200 Z" fill="#9c2b2b"/>
    <path d="M100 200 Q210 180 320 200 L330 230 Q210 215 90 230 Z" fill="#7e2121"/>
    <rect x="178" y="150" width="64" height="50" rx="4" fill="#86241f"/>
    ${placeWappen(url,dim,210,172,60)}
    <text x="210" y="300" font-size="12" fill="#7e2121" text-anchor="middle" font-family="'Noto Sans JP',sans-serif">制帽のワッペン</text>`);
}
// トートバッグ
function sceneTote(url, dim){
  return sceneFrame(`
    <rect x="0" y="0" width="420" height="360" fill="#efece4"/>
    <rect x="120" y="120" width="180" height="180" rx="6" fill="#dcd3bf"/>
    <path d="M160 120 Q160 60 185 60" fill="none" stroke="#c4b89c" stroke-width="12"/>
    <path d="M260 120 Q260 60 235 60" fill="none" stroke="#c4b89c" stroke-width="12"/>
    ${placeWappen(url,dim,210,205,92)}
    <text x="210" y="330" font-size="12" fill="#9a8f72" text-anchor="middle" font-family="'Noto Sans JP',sans-serif">トートバッグのワッペン</text>`);
}

// 現在選択中のプレビューシーン id(モーダルを開くたびに先頭へ初期化)
let _previewSceneId = null;

function openPreview(){
  const url=exportPNG(3);
  const p=curProduct(); const dim=curDim();
  const scenes=previewScenes();
  if (!_previewSceneId || !scenes.some(s=>s.id===_previewSceneId)) _previewSceneId = scenes[0].id;
  renderPreview(url, dim, scenes);
  $("#previewModal").hidden=false;
}

function renderPreview(url, dim, scenes){
  const p=curProduct();
  const stage=$("#previewStage");
  const cur=scenes.find(s=>s.id===_previewSceneId) || scenes[0];
  const tabs=scenes.map(s=>
    `<button class="pv-tab${s.id===cur.id?" sel":""}" data-scene="${s.id}">${esc(s.label)}</button>`
  ).join("");
  const dimText = p.widths ? `幅 ${state.widthMm} x 丈 ${state.lengthMm} mm` : `${dim.w} x ${dim.h} mm`;
  stage.innerHTML=`<div class="pv-wrap">
    <div class="pv-tabs">${tabs}</div>
    <div class="pv-scene">${cur.svg(url,dim)}</div>
    <div class="pv-note">${esc(p.label)} / 仕上がり ${dimText} 相当${cur.id==="bare"?"(高解像度書き出しイメージ)":"(使われ方の合成イメージ。実寸比で配置)"}</div>
  </div>`;
  $$(".pv-tab",stage).forEach(b=>b.onclick=()=>{ _previewSceneId=b.dataset.scene; renderPreview(url,dim,scenes); });
}

function openOrder(){
  const p=curProduct(); const d=curDim();
  const objs=canvas.getObjects();
  // 使用色の収集(前景)。地色は別行で示す。
  const fg=collectColors(objs);
  const colorChips=fg.map(c=>{
    const t=THREAD_BOOK.find(x=>toHex(x.hex)===c);
    const tag = isMetalColor(c)?" / 金銀":(isFluoColor(c)?" / 蛍光":"");
    return `<span class="spec-chip"><span class="sc-dot" style="background:${c}"></span>${t?`${t.no} ${esc(t.name)}`:c}${tag}</span>`;
  }).join("");
  const fabT=[...FABRIC_BOOK.woven,...FABRIC_BOOK.print].find(x=>toHex(x.hex)===toHex(state.fabric));
  const fabChip=`<span class="spec-chip"><span class="sc-dot" style="background:${state.fabric}"></span>${fabT?esc(fabT.name):toHex(state.fabric)}</span>`;
  const elemList=objs.map(o=>{
    if(o.type==="i-text") return `テキスト「${esc((o.text||"").slice(0,16))}」`;
    if(o.type==="image") return "画像";
    return "図形("+o.type+")";
  });

  // 確定仕様シート
  let rows=`
    <tr><th>品目</th><td>${esc(p.label)}</td></tr>`;
  if (p.widths) rows+=`<tr><th>規格幅 / 丈</th><td>幅 ${state.widthMm} mm / 丈 ${state.lengthMm} mm</td></tr>`;
  else rows+=`<tr><th>仕上がり寸法</th><td>${d.w} x ${d.h} mm(形状自由)</td></tr>`;
  rows+=`<tr><th>仕立て</th><td>${esc((FOLDING[state.folding]||{}).label||"-")}</td></tr>`;
  if (p.kind==="name" && p.family==="woven") rows+=`<tr><th>地組織</th><td>${esc((WEAVE[state.weave]||{}).label||"-")}</td></tr>`;
  if (p.kind==="wappen") rows+=`<tr><th>形状 / 縁</th><td>${EMBLEM_LABEL[state.emblem]}${(p.defFolding==="mello"&&state.mello)?" / メロー始末あり":""}</td></tr>`;
  rows+=`<tr><th>地色</th><td><div class="spec-chiplist">${fabChip}</div></td></tr>`;
  rows+=`<tr><th>${p.family==="woven"?"使用糸色":"使用色"}(${fg.length}色)</th><td><div class="spec-chiplist">${colorChips||"なし"}</div></td></tr>`;
  rows+=`<tr><th>取付</th><td>${esc(p.attach)}</td></tr>`;
  rows+=`<tr><th>最小ロット / 納期</th><td>${p.minLot} 枚から / ${esc(p.leadTime)}</td></tr>`;
  rows+=`<tr><th>要素一覧</th><td>${elemList.length?esc(elemList.join(" / ")):"(要素なし)"}</td></tr>`;

  // プリフライト結果
  const pf=runPreflight();
  const headCls=pf.level==="fail"?"pf-bad":(pf.level==="warn"?"pf-warn":"pf-ok");
  const headLab=pf.level==="fail"?"製造不可(要修正)":(pf.level==="warn"?"注意あり(確認推奨)":"プリフライト合格");
  let pfHtml=`<div class="pf-head ${headCls}"><span class="pf-badge">${headLab}</span></div>`;
  if (pf.items.length){
    pfHtml+=`<ul class="pf-list">`+pf.items.map(it=>{
      const c=it.level==="fail"?"pf-i-bad":(it.level==="warn"?"pf-i-warn":"pf-i-ok");
      const m=it.level==="fail"?"不可":(it.level==="warn"?"注意":"良");
      return `<li class="${c}"><span class="pf-tag">${m}</span>${it.msg}</li>`;
    }).join("")+`</ul>`;
  } else {
    pfHtml+=`<p class="pf-none">指摘はありません。物理仕様の自動判定上は問題なしです。</p>`;
  }

  // 数量の初期値(最小ロットを既定値に)。再オープン時は前回入力を保持。
  if (!state.order.quantity) state.order.quantity = p.minLot || 1;

  $("#orderBody").innerHTML=
    `<div class="pf-block">${pfHtml}</div>`+
    `<h4 class="spec-h">確定仕様シート</h4>`+
    `<table class="spec-table">${rows}</table>`+
    `<h4 class="spec-h">数量と要望</h4>`+
    `<div class="field-row" style="margin-top:4px">`+
      `<div class="field" style="flex:0 0 150px"><label>数量(枚。最小ロット ${p.minLot} 枚)</label>`+
        `<input type="number" id="orderQty" min="1" step="1" value="${state.order.quantity}" inputmode="numeric"></div>`+
      `<div class="field" style="flex:1"><label>お名前 / 会社名(任意。受注画面に表示)</label>`+
        `<input type="text" id="customerName" value="${esc(state.order.customer||"")}" placeholder="例: 株式会社サンプル / 山田太郎"></div>`+
    `</div>`+
    `<div id="lotWarn"></div>`+
    `<div class="field"><label>ご要望メモ(自由記述。納期希望・用途・色味の指定など)</label>`+
      `<textarea id="orderMemo" placeholder="例: 入学式に間に合わせたい。紅はもう少し落ち着いた色味で。">${esc(state.order.memo||"")}</textarea></div>`+
    `<h4 class="spec-h">概算お見積もり<span class="est-flag">概算[要確認]</span></h4>`+
    `<div id="estBox"></div>`+
    `<p class="spec-note">概算は数量・サイズ・複雑さ・ギミックから自動算出した目安です。実価格・係数は仮値[要確認]で、最終価格・納期は瀬戸様が確定見積で確定します。見積もりを依頼すると瀬戸社側(orders.html)に「見積依頼」として届きます。</p>`;

  // 数量・メモの入力で概算を即時更新し、state に保持する
  const qtyEl = $("#orderQty"), memoEl = $("#orderMemo"), custEl = $("#customerName");
  const syncEst = ()=>{
    let q = parseInt(qtyEl.value, 10);
    if (!Number.isFinite(q) || q < 1) q = 1;
    state.order.quantity = q;
    state.order.memo = memoEl ? memoEl.value : "";
    state.order.customer = custEl ? custEl.value : "";
    renderEstBox();
  };
  if (qtyEl) qtyEl.oninput = syncEst;
  if (memoEl) memoEl.oninput = ()=>{ state.order.memo = memoEl.value; };
  if (custEl) custEl.oninput = ()=>{ state.order.customer = custEl.value; };
  renderEstBox();

  // 不可がある場合は依頼ボタンを抑止(デモ)
  const cf=$("#orderConfirm");
  if (cf){ cf.disabled = (pf.level==="fail"); cf.textContent = pf.level==="fail" ? "修正が必要です" : "この内容で見積もりを依頼"; }
  $("#orderModal").hidden=false;
}

// 概算ボックスとロット注意の再描画(数量入力でライブ更新)。
function renderEstBox(){
  const box = $("#estBox"); if (!box) return;
  const est = estimateRange(state.order.quantity);
  const yen = n => n.toLocaleString("ja-JP");
  box.innerHTML =
    `<div class="est-range">`+
      `<div class="est-cell"><span class="est-k">概算価格(総額)</span><span class="est-v">${yen(est.priceMin)} 円 から ${yen(est.priceMax)} 円</span></div>`+
      `<div class="est-cell"><span class="est-k">概算納期</span><span class="est-v">約 ${est.leadMin} 日 から ${est.leadMax} 日</span></div>`+
    `</div>`+
    `<details class="est-basis"><summary>算定根拠を見る</summary><ul>`+
      est.basis.map(b=>`<li>${esc(b)}</li>`).join("")+
    `</ul></details>`;
  const lw = $("#lotWarn");
  if (lw){
    lw.innerHTML = est.belowLot
      ? `<div class="lot-warn">数量 ${est.qty} 枚は最小ロット ${est.minLot} 枚を下回ります。少量対応の可否・割増は瀬戸様の確定見積でご案内します。[要確認]</div>`
      : "";
  }
}

/* ============================================================
   13b. 受注キャッチ連携(localStorage 経由の擬似入稿)
   PoC/コンセプト: エディタの入稿確定で受注レコードを localStorage
   "seto_orders" に追記する。受注画面(orders.html)が同じキーを読み、
   storage イベント+ポーリングで別タブの入稿を「キャッチ」して表示する。
   本番は認証付きの受発注 API に置き換える前提[要確認]。
   ============================================================ */
const ORDERS_KEY = "seto_orders";

function loadOrders(){ try{ return JSON.parse(localStorage.getItem(ORDERS_KEY)||"[]"); }catch(e){ return []; } }
function saveOrders(arr){ localStorage.setItem(ORDERS_KEY, JSON.stringify(arr.slice(0,60))); }

// 現在のデザインから受注レコード(確定仕様シート相当)を組み立てる。
// openOrder の確定仕様シートと同じ項目をデータとして抜き出す。
function buildOrderRecord(){
  const p = curProduct();
  const d = curDim();
  const objs = canvas.getObjects();
  // 使用糸色(地色を除く前景色)を見本帳番号付きで配列化
  const fg = collectColors(objs);
  const threads = fg.map(c=>{
    const t = THREAD_BOOK.find(x=>toHex(x.hex)===toHex(c));
    return {
      hex: toHex(c),
      no: t ? t.no : "",
      name: t ? t.name : toHex(c),
      metal: isMetalColor(c),
      fluo: isFluoColor(c),
    };
  });
  const fabT = [...FABRIC_BOOK.woven, ...FABRIC_BOOK.print].find(x=>toHex(x.hex)===toHex(state.fabric));
  const pf = runPreflight();
  // 顧客名: エディタに簡易入力欄があれば採用、無ければデモ顧客+連番
  const orders = loadOrders();
  let customer = (state.order.customer||"").trim();
  if (!customer) customer = "デモ顧客 " + (orders.length + 1);

  const qty = Math.max(1, Math.floor(state.order.quantity || p.minLot || 1));
  const est = estimateRange(qty);
  const memo = (state.order.memo||"").trim();
  const nowIso = new Date().toISOString();

  return {
    id: "ord_" + Date.now() + "_" + Math.floor(Math.random()*1e4),
    createdAt: nowIso,
    customer,
    // 新フロー: 数量・要望・概算・確定見積・差し戻し理由・再編集用デザイン・状態履歴
    quantity: qty,
    memo,
    estimate: {
      priceMin: est.priceMin, priceMax: est.priceMax,
      leadMin: est.leadMin, leadMax: est.leadMax,
      basis: est.basis, belowLot: est.belowLot,
    },
    quote: null,          // 瀬戸社が確定見積で埋める {price, lead, note}
    reworkReason: "",     // 瀬戸社が差し戻し時に埋める
    designJson: snapshot(),   // 差し戻し時の再編集用(canvas.toJSON 相当)
    history: [{ at: nowIso, status: "見積依頼", by: "顧客", note: "見積もりを依頼しました。" }],
    product: state.product,
    productLabel: p.label,
    widthMm: p.widths ? state.widthMm : null,
    lengthMm: p.widths ? state.lengthMm : null,
    dimW: d.w, dimH: d.h,
    isName: p.kind === "name",
    folding: state.folding,
    foldingLabel: (FOLDING[state.folding]||{}).label || "-",
    weave: state.weave,
    weaveLabel: (p.kind==="name" && p.family==="woven") ? ((WEAVE[state.weave]||{}).label || "-") : "",
    emblem: state.emblem,
    emblemLabel: p.kind==="wappen" ? EMBLEM_LABEL[state.emblem] : "",
    mello: p.kind==="wappen" && p.defFolding==="mello" && state.mello,
    fabricHex: toHex(state.fabric),
    fabricName: fabT ? fabT.name : toHex(state.fabric),
    threads,
    colorCount: fg.length,
    attach: p.attach,
    minLot: p.minLot,
    leadTime: p.leadTime,
    preflight: { level: pf.level, items: pf.items.map(it=>({ level: it.level, msg: it.msg })) },
    thumb: exportPNG(1),
    status: "見積依頼",
  };
}

// 見積依頼の確定: 受注レコードを localStorage に追記(または再依頼で更新)し、
// トーストと受注画面導線を出す。
function submitOrder(){
  const rec = buildOrderRecord();
  const arr = loadOrders();
  if (reworkTargetId){
    // 差し戻しからの再依頼: 既存レコードを更新し、履歴を引き継いで「再依頼」を積む。
    const idx = arr.findIndex(o=>o.id===reworkTargetId);
    if (idx >= 0){
      const prev = arr[idx];
      const nowIso = new Date().toISOString();
      const hist = Array.isArray(prev.history) ? prev.history.slice() : [];
      hist.push({ at: nowIso, status: "見積依頼", by: "顧客", note: "差し戻しを受けて修正し、再依頼しました。" });
      arr[idx] = {
        ...prev,
        quantity: rec.quantity, memo: rec.memo, estimate: rec.estimate,
        designJson: rec.designJson, thumb: rec.thumb, preflight: rec.preflight,
        // 仕様も最新のデザインに合わせて差し替え
        product: rec.product, productLabel: rec.productLabel,
        widthMm: rec.widthMm, lengthMm: rec.lengthMm, dimW: rec.dimW, dimH: rec.dimH,
        isName: rec.isName, folding: rec.folding, foldingLabel: rec.foldingLabel,
        weave: rec.weave, weaveLabel: rec.weaveLabel,
        emblem: rec.emblem, emblemLabel: rec.emblemLabel, mello: rec.mello,
        fabricHex: rec.fabricHex, fabricName: rec.fabricName,
        threads: rec.threads, colorCount: rec.colorCount,
        attach: rec.attach, minLot: rec.minLot, leadTime: rec.leadTime,
        reworkReason: "", status: "見積依頼", history: hist,
        reRequestedAt: nowIso,
      };
      saveOrders(arr);
      reworkTargetId = null;
      $("#orderModal").hidden = true;
      showOrderToast("再依頼を送信しました(デモ)。瀬戸社側で再度見積もりされます。");
      return;
    }
    // 対象が見つからなければ新規扱いにフォールバック
    reworkTargetId = null;
  }
  arr.unshift(rec);          // newest 優先
  saveOrders(arr);
  $("#orderModal").hidden = true;
  showOrderToast("見積もりを依頼しました(デモ)。瀬戸社側に「見積依頼」として届きます。");
}

// トースト+受注画面リンク導線(メッセージ可変)。
function showOrderToast(msg){
  let t = $("#orderToast");
  if (!t){
    t = document.createElement("div");
    t.id = "orderToast";
    t.className = "order-toast";
    document.body.appendChild(t);
  }
  t.innerHTML =
    `<span class="ot-ic"><svg viewBox="0 0 24 24" width="18" height="18"><path d="M5 12l5 5L20 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg></span>` +
    `<span class="ot-tx">${esc(msg || "見積もりを依頼しました(デモ)。")}</span>` +
    `<a class="ot-link" href="orders.html" target="_blank" rel="noopener">受注画面を開く</a>`;
  t.classList.add("show");
  clearTimeout(showOrderToast._tm);
  showOrderToast._tm = setTimeout(()=>{ t.classList.remove("show"); }, 6000);
}

/* ============================================================
   13c. 見積・注文状況ビュー(顧客側)
   自分(このブラウザ)が依頼した受注の状況を一覧表示する。
   見積提示は「承認して生産へ」、差し戻しは「修正して再依頼」を出す。
   ============================================================ */
const CUST_STATUS_LABEL = {
  "見積依頼":"見積もり依頼中", "差し戻し":"差し戻し(要修正)", "見積提示":"見積もり提示済み",
  "承認済み(生産着手)":"承認済み・生産着手", "生産中":"生産中", "完了":"完了",
};
const CUST_STATUS_CLS = {
  "見積依頼":"st-req", "差し戻し":"st-rework", "見積提示":"st-quote",
  "承認済み(生産着手)":"st-approved", "生産中":"st-prod", "完了":"st-done",
};

function openMyOrders(){
  renderMyOrders();
  $("#myOrdersModal").hidden = false;
}

function renderMyOrders(){
  const body = $("#myOrdersBody"); if (!body) return;
  const orders = loadOrders();
  if (!orders.length){
    body.innerHTML = `<div class="empty-hint">まだ依頼はありません。デザインを作って「見積もり依頼」を押すと、ここに状況が表示されます。</div>`;
    return;
  }
  const yen = n => (n==null?"-":Number(n).toLocaleString("ja-JP"));
  body.innerHTML = orders.map(o=>{
    const st = o.status || "見積依頼";
    const cls = CUST_STATUS_CLS[st] || "st-req";
    const lab = CUST_STATUS_LABEL[st] || st;
    const est = o.estimate || {};
    const q = o.quote;
    // 概算 or 確定見積
    let priceRow = "";
    if (q && q.price != null){
      priceRow = `<div class="mo-row"><span class="mo-k">確定見積</span><span class="mo-v"><b>${yen(q.price)} 円</b> / 納期 ${esc(q.lead||"-")}</span></div>`;
    } else if (est.priceMin != null){
      priceRow = `<div class="mo-row"><span class="mo-k">概算[要確認]</span><span class="mo-v">${yen(est.priceMin)} から ${yen(est.priceMax)} 円 / 約 ${est.leadMin} から ${est.leadMax} 日</span></div>`;
    }
    const noteRow = (q && q.note) ? `<div class="mo-note"><b>瀬戸社より</b> ${esc(q.note)}</div>` : "";
    const reworkRow = (st==="差し戻し" && o.reworkReason) ? `<div class="mo-rework"><b>差し戻し理由</b> ${esc(o.reworkReason)}</div>` : "";

    // 状態履歴(タイムライン)
    const hist = Array.isArray(o.history) ? o.history : [];
    const timeline = hist.length
      ? `<details class="mo-timeline"><summary>状態履歴(${hist.length})</summary><ul>`+
        hist.map(h=>`<li><span class="tl-at">${esc(fmtShort(h.at))}</span><span class="tl-by">${esc(h.by||"")}</span>${esc(h.note||h.status||"")}</li>`).join("")+
        `</ul></details>` : "";

    // アクション
    let actions = "";
    if (st === "見積提示"){
      actions = `<button class="text-btn primary mo-approve" data-approve="${esc(o.id)}">承認して生産へ</button>`;
    } else if (st === "差し戻し"){
      actions = `<button class="text-btn mo-rework-btn" data-rework="${esc(o.id)}">このデザインを修正して再依頼</button>`;
    }

    return `<div class="mo-card">
      <div class="mo-top">
        <div class="mo-thumb">${o.thumb?`<img src="${o.thumb}" alt="">`:""}</div>
        <div class="mo-head">
          <div class="mo-product">${esc(o.productLabel||o.product||"依頼")}</div>
          <div class="mo-meta">数量 ${o.quantity!=null?o.quantity:"-"} 枚 / ${esc(fmtShort(o.createdAt))}</div>
          <span class="mo-status ${cls}">${esc(lab)}</span>
        </div>
      </div>
      <div class="mo-body">
        ${priceRow}
        ${o.memo?`<div class="mo-row"><span class="mo-k">要望</span><span class="mo-v">${esc(o.memo)}</span></div>`:""}
        ${noteRow}
        ${reworkRow}
        ${timeline}
      </div>
      ${actions?`<div class="mo-foot">${actions}</div>`:""}
    </div>`;
  }).join("");

  // 承認(見積提示 → 承認済み(生産着手))
  $$("[data-approve]", body).forEach(btn=>{
    btn.onclick = ()=>{
      const id = btn.dataset.approve;
      const arr = loadOrders();
      const o = arr.find(x=>x.id===id);
      if (!o) return;
      o.status = "承認済み(生産着手)";
      o.history = (o.history||[]).concat({ at:new Date().toISOString(), status:"承認済み(生産着手)", by:"顧客", note:"見積もりを承認し、生産着手を依頼しました。" });
      saveOrders(arr);
      renderMyOrders();
      showOrderToast("承認しました(デモ)。瀬戸社側で生産に進めます。");
    };
  });

  // 差し戻し → 修正して再依頼(デザイン復元 + モーダル遷移)
  $$("[data-rework]", body).forEach(btn=>{
    btn.onclick = ()=>{ startRework(btn.dataset.rework); };
  });
}

// 差し戻されたデザインをキャンバスに復元し、見積もり依頼モーダルを開く。
function startRework(id){
  const arr = loadOrders();
  const o = arr.find(x=>x.id===id);
  if (!o){ return; }
  // 品目・仕様を復元
  const pr = PRODUCTS[o.product] || PRODUCTS.woven_name;
  state.product = o.product;
  state.widthMm = o.widthMm || (pr.widths?pr.widths[pr.defWidthIdx]:18);
  state.lengthMm = o.lengthMm || (pr.lengthMm||30);
  if (!pr.widths){
    const idx = WAPPEN_PRESETS.findIndex(ps=>ps.w===o.dimW && ps.h===o.dimH);
    state.presetIdx = idx>=0 ? idx : 1;
  }
  state.folding = o.folding || pr.defFolding;
  state.weave = o.weave || (pr.defWeave||"satin");
  state.fabric = o.fabricHex || state.fabric;
  if (o.emblem) state.emblem = o.emblem;
  state.mello = o.mello !== false;
  // 見積もり依頼モーダルの入力欄を復元
  state.order.quantity = o.quantity || pr.minLot || 1;
  state.order.memo = o.memo || "";
  state.order.customer = o.customer && o.customer.indexOf("デモ顧客")!==0 ? o.customer : "";

  $$("#productSwitch button").forEach(b=>b.classList.toggle("active", b.dataset.prod===o.product));
  $("#myOrdersModal").hidden = true;

  // デザイン JSON を復元 → ステージ再構成 → 履歴初期化
  const restore = ()=>{
    rebuildStage(); renderRail(); renderProps();
    history = [snapshot()]; histIdx = 0; updateHistButtons();
    reworkTargetId = id;
    openOrder();   // 概算再計算のうえ見積もり依頼モーダルを開く
  };
  if (o.designJson){
    applySnapshot(o.designJson);
    // applySnapshot は非同期(loadFromJSON)なので少し待ってから再構成
    setTimeout(restore, 60);
  } else {
    restore();
  }
}

// 短い日時表記(状態履歴・カード用)
function fmtShort(iso){
  try{
    const d = new Date(iso); const p = n=>String(n).padStart(2,"0");
    return `${p(d.getMonth()+1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }catch(e){ return iso || "-"; }
}

/* ============================================================
   14. ギャラリー(localStorage)
   ============================================================ */
const GAL_KEY="setoori_gallery_v2";
function loadGalleryData(){ try{ return JSON.parse(localStorage.getItem(GAL_KEY)||"[]"); }catch(e){ return []; } }
function saveGalleryData(arr){ localStorage.setItem(GAL_KEY, JSON.stringify(arr.slice(0,24))); }
function saveToGallery(){
  const thumb=exportPNG(1);
  const json=snapshot();
  const firstText=(canvas.getObjects().find(o=>o.type==="i-text")||{}).text||"";
  const arr=loadGalleryData();
  arr.unshift({ product:state.product, widthMm:state.widthMm, lengthMm:state.lengthMm, presetIdx:state.presetIdx, folding:state.folding, weave:state.weave, fabric:state.fabric, thread:state.thread, emblem:state.emblem, mello:state.mello, melloColor:state.melloColor, json, thumb, title:firstText });
  saveGalleryData(arr); renderRail();
}
function loadFromGallery(i){
  const arr=loadGalleryData(); const it=arr[i]; if(!it) return;
  const p=PRODUCTS[it.product]||PRODUCTS.woven_name;
  state.product=it.product; state.fabric=it.fabric; state.thread=it.thread;
  state.widthMm=it.widthMm || (p.widths?p.widths[p.defWidthIdx]:18);
  state.lengthMm=it.lengthMm || (p.lengthMm||30);
  state.presetIdx=it.presetIdx!=null?it.presetIdx:1;
  state.folding=it.folding||p.defFolding;
  state.weave=it.weave||(p.defWeave||"satin");
  state.emblem=it.emblem||"shield"; state.mello=it.mello!==false; state.melloColor=it.melloColor||THREAD_BOOK[0].hex;
  $$("#productSwitch button").forEach(b=>b.classList.toggle("active", b.dataset.prod===it.product));
  applySnapshot(it.json);
  rebuildStage(); renderRail();
  history=[it.json]; histIdx=0; updateHistButtons();
}
function deleteFromGallery(i){
  const arr=loadGalleryData(); arr.splice(i,1); saveGalleryData(arr); renderRail();
}

/* ============================================================
   15. 起動
   ============================================================ */
function boot(){
  initCanvas();
  buildProductSwitch();
  rebuildStage();
  setRail("templates");
  renderProps();
  pushHistory();

  // 上部バー
  $("#undoBtn").onclick=undo;
  $("#redoBtn").onclick=redo;
  $("#zoomIn").onclick=()=>setZoom(state.zoom+0.1);
  $("#zoomOut").onclick=()=>setZoom(state.zoom-0.1);
  $("#downloadBtn").onclick=download;
  $("#previewBtn").onclick=openPreview;
  $("#orderBtn").onclick=()=>{ reworkTargetId=null; openOrder(); };
  const moBtn=$("#myOrdersBtn"); if (moBtn) moBtn.onclick=openMyOrders;
  $("#previewClose").onclick=()=>$("#previewModal").hidden=true;
  $("#orderClose").onclick=()=>{ reworkTargetId=null; $("#orderModal").hidden=true; };
  const moClose=$("#myOrdersClose"); if (moClose) moClose.onclick=()=>$("#myOrdersModal").hidden=true;
  $("#orderConfirm").onclick=submitOrder;
  $$(".modal-back").forEach(m=>m.onclick=e=>{ if(e.target===m) m.hidden=true; });

  // レールタブ
  $$(".rail-tab").forEach(b=>b.onclick=()=>setRail(b.dataset.rail));

  // 画像アップロード
  $("#fileInput").onchange=e=>{
    const f=e.target.files[0]; if(!f) return;
    const r=new FileReader(); r.onload=ev=>addImage(ev.target.result); r.readAsDataURL(f); e.target.value="";
  };

  // キーボード(Delete / Undo / Redo)
  document.addEventListener("keydown",e=>{
    if(e.target.matches("input,textarea")) return;
    if((e.key==="Delete"||e.key==="Backspace")){ const a=canvas.getActiveObject(); if(a){ canvas.remove(a); canvas.discardActiveObject(); canvas.requestRenderAll(); e.preventDefault(); } }
    if((e.ctrlKey||e.metaKey)&&e.key==="z"){ e.shiftKey?redo():undo(); e.preventDefault(); }
    if((e.ctrlKey||e.metaKey)&&e.key==="y"){ redo(); e.preventDefault(); }
  });

  // 初期テンプレートを1つ展開して空状態を避ける
  applyTemplate(0);

  // 初回オンボーディング(localStorage フラグで2回目以降は出さない)。
  // 起動ガードを壊さないよう、boot の最終ステップで try/catch 内から起動する。
  try { maybeShowOnboarding(); } catch(e){ /* オンボーディング失敗は致命的でないため握りつぶす */ }
}

/* ============================================================
   15b. 初回オンボーディング(Canva 的な迷わなさ)
   ============================================================ */
const ONBOARD_KEY = "seto_onboarded";
const ONBOARD_STEPS = [
  { t:"テンプレートを選ぶ", d:"左の「テンプレート」からキーワード検索やカテゴリで絞り込み、好きなデザインを選んでキャンバスに展開します。文言から作るなら「AI生成」も使えます。",
    ic:`<svg viewBox="0 0 24 24" width="24" height="24"><rect x="3" y="3" width="8" height="8" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.8"/><rect x="13" y="3" width="8" height="8" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.8"/><rect x="3" y="13" width="8" height="8" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.8"/><rect x="13" y="13" width="8" height="8" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>` },
  { t:"文字を変える", d:"キャンバス上の文字をダブルクリック、または右パネルの「テキスト」欄で内容を書き換えます。",
    ic:`<svg viewBox="0 0 24 24" width="24" height="24"><path d="M5 6h14M9 6v13M15 6v13" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>` },
  { t:"色と書体を選ぶ", d:"右パネルで糸色・文字色・書体・サイズを調整できます。織りは糸色見本帳から選べます。",
    ic:`<svg viewBox="0 0 24 24" width="24" height="24"><circle cx="9" cy="9" r="5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M14 14l6 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="9" cy="9" r="1.6" fill="currentColor"/></svg>` },
  { t:"仕上がりを確認", d:"上部の「プレビュー」で、シャツやワッペンに付いた使われ方の仕上がりイメージを確認できます。",
    ic:`<svg viewBox="0 0 24 24" width="24" height="24"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>` },
  { t:"入稿する", d:"「入稿する」で寸法・色・プリフライト(製造可否)を確認し、瀬戸社の受注画面に届けます。",
    ic:`<svg viewBox="0 0 24 24" width="24" height="24"><path d="M5 12l5 5L20 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>` },
];
let _onboardIdx = 0;

function maybeShowOnboarding(){
  let seen = false;
  try { seen = localStorage.getItem(ONBOARD_KEY) === "1"; } catch(e){ seen = false; }
  if (seen) return;
  _onboardIdx = 0;
  renderOnboarding();
}

function dismissOnboarding(remember){
  const back = $("#onboardBack");
  if (back) back.remove();
  if (remember){ try { localStorage.setItem(ONBOARD_KEY, "1"); } catch(e){} }
}

function renderOnboarding(){
  let back = $("#onboardBack");
  if (!back){
    back = document.createElement("div");
    back.id = "onboardBack";
    back.className = "onboard-back";
    document.body.appendChild(back);
  }
  const s = ONBOARD_STEPS[_onboardIdx];
  const total = ONBOARD_STEPS.length;
  const dots = ONBOARD_STEPS.map((_,i)=>`<span class="ob-dot${i===_onboardIdx?" on":""}"></span>`).join("");
  const last = _onboardIdx === total-1;
  back.innerHTML = `
    <div class="onboard-card" role="dialog" aria-label="使い方ガイド">
      <div class="ob-ic">${s.ic||""}</div>
      <div class="ob-step">STEP ${_onboardIdx+1} / ${total}</div>
      <h3 class="ob-title">${esc(s.t)}</h3>
      <p class="ob-desc">${esc(s.d)}</p>
      <div class="ob-dots">${dots}</div>
      <div class="ob-foot">
        <button class="ob-skip" id="obSkip">スキップ</button>
        <div class="ob-nav">
          ${_onboardIdx>0?`<button class="ob-back" id="obBack">戻る</button>`:""}
          <button class="ob-next text-btn primary" id="obNext">${last?"はじめる":"次へ"}</button>
        </div>
      </div>
      <label class="ob-nomore"><input type="checkbox" id="obNoMore"> 次回から表示しない</label>
    </div>`;
  $("#obSkip").onclick = ()=>dismissOnboarding($("#obNoMore") && $("#obNoMore").checked);
  const bk = $("#obBack"); if (bk) bk.onclick = ()=>{ _onboardIdx=Math.max(0,_onboardIdx-1); renderOnboarding(); };
  $("#obNext").onclick = ()=>{
    if (last){ dismissOnboarding(true); }   // 完了時は記録(再表示しない)
    else { _onboardIdx++; renderOnboarding(); }
  };
}

// 起動ガード: Fabric.js が無い/初期化で例外が出た場合に「無言で固まる」のを防ぎ、画面に理由を表示する。
function showBootError(msg){
  let el = document.getElementById("bootError");
  if (!el){ el = document.createElement("div"); el.id = "bootError"; document.body.appendChild(el); }
  el.style.cssText = "position:fixed;left:50%;top:24px;transform:translateX(-50%);z-index:99999;max-width:720px;width:calc(100% - 32px);background:#fff;border:1px solid #e0b4b4;border-left:5px solid #c0392b;border-radius:10px;padding:16px 18px;box-shadow:0 12px 40px rgba(0,0,0,.18);font:14px/1.7 system-ui,'Noto Sans JP',sans-serif;color:#7c2020";
  el.innerHTML = "<b>エディタを起動できませんでした</b><br>" + msg;
}
function safeBoot(){
  if (!window.fabric){
    showBootError("実行に必要なライブラリ(Fabric.js)が読み込めませんでした。index.html と同じ場所に vendor/fabric.min.js があるか、オンライン環境かをご確認ください。");
    return;
  }
  try {
    boot();
  } catch (err){
    showBootError("初期化中にエラーが発生しました: " + (err && err.message ? err.message : String(err)) + "<br><small>この文言をそのままお知らせいただければ修正します。</small>");
    throw err; // コンソールにも残す
  }
}
if (window.fabric) safeBoot();
else window.addEventListener("load", safeBoot);
