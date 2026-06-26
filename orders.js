"use strict";
/*
  瀬戸織ネーム 受注キャッチ画面(コンセプトデモ / PoC)
  エディタ(app.js)が見積もり依頼確定時に localStorage "seto_orders" に追記した
  受注レコードを読み、瀬戸社(受注者)側のビューとして新着順に一覧表示する。
  別タブのエディタからの依頼を storage イベント+ポーリングでライブにキャッチする。

  受注フロー(status):
    見積依頼 →(差し戻し ⇄ 再依頼)/(見積提示 → 承認=生産着手)→ 生産中 → 完了
  瀬戸社側の操作:
    「確定見積を提示」: 確定価格・確定納期・一言メモを入力 → status="見積提示"、quote に保存
    「差し戻し」: 理由を入力 → status="差し戻し"、reworkReason に保存
    承認(顧客側)後の「承認済み(生産着手)」以降のみ 生産中・完了 へ進める
  レコードの項目は app.js の buildOrderRecord と一致させること。
  実データ連携は localStorage による擬似表現。本番は受発注 API に置換[要確認]。
*/

const ORDERS_KEY = "seto_orders";

const $ = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));
const esc = (s) => String(s).replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c]));

// ステータスごとの表示クラス(色分けバッジ)
const STATUS_CLASS = {
  "見積依頼":"s-req", "差し戻し":"s-rework", "見積提示":"s-quote",
  "承認済み(生産着手)":"s-approved", "生産中":"s-prod", "完了":"s-done",
};
// 承認(=生産着手)以降のみ生産進行を許可。生産進行の循環。
const PROD_FLOW = ["承認済み(生産着手)", "生産中", "完了"];

// 直近にレンダリングした受注 ID 集合(新着ハイライトの判定用)
let knownIds = new Set();
let firstRender = true;

/* ============================================================
   localStorage 入出力
   ============================================================ */
function loadOrders(){ try{ return JSON.parse(localStorage.getItem(ORDERS_KEY)||"[]"); }catch(e){ return []; } }
function saveOrders(arr){ localStorage.setItem(ORDERS_KEY, JSON.stringify(arr.slice(0,60))); }

// 履歴(タイムライン)を1件積む補助
function pushHistory(o, status, by, note){
  if (!Array.isArray(o.history)) o.history = [];
  o.history.push({ at: new Date().toISOString(), status, by: by||"瀬戸社", note: note||"" });
}

/* ============================================================
   表示ユーティリティ
   ============================================================ */
function fmtTime(iso){
  try{
    const d = new Date(iso);
    const p = n => String(n).padStart(2, "0");
    return `${d.getFullYear()}/${p(d.getMonth()+1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }catch(e){ return iso || "-"; }
}
function fmtShort(iso){
  try{
    const d = new Date(iso); const p = n=>String(n).padStart(2,"0");
    return `${p(d.getMonth()+1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }catch(e){ return iso || "-"; }
}
function yen(n){ return (n==null?"-":Number(n).toLocaleString("ja-JP")); }

// プリフライトのバッジ(合格 / 注意 / 不可)
function pfBadge(level){
  if (level === "fail") return `<span class="oc-badge b-fail">プリフライト 不可</span>`;
  if (level === "warn") return `<span class="oc-badge b-warn">プリフライト 注意</span>`;
  return `<span class="oc-badge b-ok">プリフライト 合格</span>`;
}

// ステータスのバッジ(色分け)
function statusBadge(status){
  const cls = STATUS_CLASS[status] || "s-req";
  return `<span class="oc-badge ${cls}">${esc(status||"見積依頼")}</span>`;
}

// 寸法の表記(ネーム系は幅/丈、ワッペン系は仕上がり寸法)
function dimText(o){
  if (o.isName && o.widthMm != null) return `幅 ${o.widthMm} mm / 丈 ${o.lengthMm} mm`;
  return `${o.dimW} x ${o.dimH} mm(形状自由)`;
}

// 使用糸色チップ(見本帳番号付き)
function threadChips(threads){
  if (!threads || !threads.length) return "なし";
  return `<div class="oc-chips">` + threads.map(t=>{
    const tag = t.metal ? " / 金銀" : (t.fluo ? " / 蛍光" : "");
    const lbl = t.no ? `${esc(t.no)} ${esc(t.name)}` : esc(t.name);
    return `<span class="oc-chip"><span class="dot" style="background:${esc(t.hex)}"></span>${lbl}${tag}</span>`;
  }).join("") + `</div>`;
}

/* ============================================================
   受注カードの描画
   ============================================================ */
function cardHtml(o, isNew){
  const pf = o.preflight || { level:"ok", items:[] };
  const failItems = (pf.items || []).filter(it=>it.level==="fail");
  const status = o.status || "見積依頼";
  const stCls = STATUS_CLASS[status] || "s-req";

  // 不可の受注は警告ブロックを出す
  let failNote = "";
  if (pf.level === "fail" && failItems.length){
    failNote = `<div class="oc-fail-note"><b>製造不可の指摘があります(要修正)</b><ul>` +
      failItems.map(it=>`<li>${esc(it.msg)}</li>`).join("") + `</ul></div>`;
  }

  // 確定仕様シート(カード内)
  let rows = "";
  rows += `<div class="oc-row"><span class="k">数量</span><span class="v">${o.quantity!=null?o.quantity+" 枚":"-"}${o.estimate&&o.estimate.belowLot?` <span class="lot-flag">最小ロット未満</span>`:""}</span></div>`;
  rows += `<div class="oc-row"><span class="k">仕立て</span><span class="v">${esc(o.foldingLabel || "-")}</span></div>`;
  if (o.weaveLabel) rows += `<div class="oc-row"><span class="k">地組織</span><span class="v">${esc(o.weaveLabel)}</span></div>`;
  if (o.emblemLabel) rows += `<div class="oc-row"><span class="k">形状 / 縁</span><span class="v">${esc(o.emblemLabel)}${o.mello?" / メロー始末あり":""}</span></div>`;
  rows += `<div class="oc-row"><span class="k">地色</span><span class="v"><span class="oc-chip"><span class="dot" style="background:${esc(o.fabricHex)}"></span>${esc(o.fabricName)}</span></span></div>`;
  rows += `<div class="oc-row"><span class="k">使用糸色(${o.colorCount||0}色)</span><span class="v">${threadChips(o.threads)}</span></div>`;
  rows += `<div class="oc-row"><span class="k">取付</span><span class="v">${esc(o.attach || "-")}</span></div>`;
  rows += `<div class="oc-row"><span class="k">最小ロット / 納期</span><span class="v">${o.minLot} 枚から / ${esc(o.leadTime || "-")}</span></div>`;

  // 要望メモ
  const memoBlock = o.memo
    ? `<div class="oc-memo"><b>ご要望</b> ${esc(o.memo)}</div>` : "";

  // 概算レンジ(顧客に提示された目安)
  const est = o.estimate;
  const estBlock = (est && est.priceMin != null)
    ? `<div class="oc-est"><b>顧客提示の概算[要確認]</b> ${yen(est.priceMin)} から ${yen(est.priceMax)} 円 / 約 ${est.leadMin} から ${est.leadMax} 日</div>`
    : "";

  // 確定見積(瀬戸社が提示済み)
  const q = o.quote;
  const quoteBlock = (q && q.price != null)
    ? `<div class="oc-quote"><b>確定見積</b> ${yen(q.price)} 円 / 納期 ${esc(q.lead||"-")}${q.note?`<br><span class="oq-note">${esc(q.note)}</span>`:""}</div>`
    : "";

  // 差し戻し理由
  const reworkBlock = (status==="差し戻し" && o.reworkReason)
    ? `<div class="oc-reworkreason"><b>差し戻し理由</b> ${esc(o.reworkReason)}</div>` : "";

  // 状態履歴(タイムライン)
  const hist = Array.isArray(o.history) ? o.history : [];
  const timeline = hist.length
    ? `<details class="oc-timeline"><summary>状態履歴(${hist.length})</summary><ul>`+
      hist.map(h=>`<li><span class="tl-at">${esc(fmtShort(h.at))}</span><span class="tl-by">${esc(h.by||"")}</span>${esc(h.note||h.status||"")}</li>`).join("")+
      `</ul></details>` : "";

  // アクション(状態で出し分け)
  let actions = "";
  if (status === "見積依頼"){
    actions =
      `<button class="text-btn primary" data-quote="${esc(o.id)}">確定見積を提示</button>`+
      `<button class="text-btn" data-rework="${esc(o.id)}">差し戻し</button>`;
  } else if (status === "見積提示"){
    actions = `<span class="oc-wait">顧客の承認待ち(承認で生産着手)</span>`+
      `<button class="text-btn" data-rework="${esc(o.id)}">差し戻し</button>`;
  } else if (status === "差し戻し"){
    actions = `<span class="oc-wait">顧客の再依頼待ち</span>`;
  } else if (PROD_FLOW.includes(status) && status !== "完了"){
    const next = PROD_FLOW[PROD_FLOW.indexOf(status)+1];
    actions = `<button class="text-btn primary" data-prod="${esc(o.id)}">${esc(next)}へ進める</button>`;
  } else if (status === "完了"){
    actions = `<span class="oc-wait">完了済み</span>`;
  }

  const cls = ["ord-card"];
  if (isNew) cls.push("is-new", "pop");
  if (pf.level === "fail") cls.push("is-fail");
  if (status === "差し戻し") cls.push("is-rework");
  if (status === "見積依頼") cls.push("is-req");

  return `<div class="${cls.join(" ")}" data-id="${esc(o.id)}">
    <div class="oc-top">
      <div class="oc-thumb">${o.thumb ? `<img src="${o.thumb}" alt="入稿サムネイル">` : ""}</div>
      <div class="oc-headinfo">
        <div class="oc-product">${esc(o.productLabel || o.product || "受注")}</div>
        <div class="oc-customer">
          <svg viewBox="0 0 24 24" width="13" height="13"><circle cx="12" cy="8" r="4" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M4 20c0-4 4-6 8-6s8 2 8 6" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>
          ${esc(o.customer || "顧客")}
        </div>
        <div class="oc-time">受付 ${esc(fmtTime(o.createdAt))} / ${esc(dimText(o))}</div>
        <div class="oc-badges">
          ${isNew ? `<span class="oc-badge b-new">新着</span>` : ""}
          ${statusBadge(status)}
          ${pfBadge(pf.level)}
        </div>
      </div>
    </div>
    ${failNote}
    ${memoBlock}
    ${estBlock}
    ${quoteBlock}
    ${reworkBlock}
    <div class="oc-spec">${rows}</div>
    ${timeline}
    <div class="oc-foot">
      ${actions || `<span class="oc-wait">操作なし</span>`}
    </div>
  </div>`;
}

// 受注一覧の再描画。newIds は今回の描画で新着強調するレコード ID。
function render(newIds){
  const orders = loadOrders();
  const grid = $("#ordGrid");
  const empty = $("#ordEmpty");
  $("#ordCount").innerHTML = `受注 <b>${orders.length}</b> 件`;

  if (!orders.length){
    grid.innerHTML = "";
    empty.hidden = false;
    return;
  }
  empty.hidden = true;
  grid.innerHTML = orders.map(o => cardHtml(o, newIds.has(o.id))).join("");
  bindCards();
}

/* ============================================================
   瀬戸社側アクション
   ============================================================ */
// 確定見積を提示(価格・納期・一言メモ)→ status="見積提示"
function doQuote(id){
  const arr = loadOrders();
  const o = arr.find(x=>x.id===id);
  if (!o) return;
  const est = o.estimate || {};
  const defPrice = est.priceMax != null ? String(Math.round((est.priceMin+est.priceMax)/2/100)*100) : "";
  const price = prompt("確定見積の総額(円)を入力してください。", defPrice);
  if (price === null) return;
  const priceNum = parseInt(String(price).replace(/[^0-9]/g,""), 10);
  if (!Number.isFinite(priceNum) || priceNum <= 0){ alert("金額が正しくありません。"); return; }
  const defLead = est.leadMax != null ? `約 ${est.leadMin} から ${est.leadMax} 日` : "";
  const lead = prompt("確定納期を入力してください(例: 約4週間 / 6月末)。", defLead);
  if (lead === null) return;
  const note = prompt("顧客への一言メモ(任意。色味・仕立ての確認など)。", "") || "";
  o.quote = { price: priceNum, lead: String(lead).trim() || "-", note: String(note).trim() };
  o.status = "見積提示";
  pushHistory(o, "見積提示", "瀬戸社", `確定見積を提示しました(${yen(priceNum)} 円 / ${o.quote.lead})。`);
  saveOrders(arr);
  reRenderKnown(arr);
}

// 差し戻し(理由を入力)→ status="差し戻し"
function doRework(id){
  const arr = loadOrders();
  const o = arr.find(x=>x.id===id);
  if (!o) return;
  const reason = prompt("差し戻し理由を入力してください(顧客に表示されます)。\n例: 文字が小さく織りで再現困難です。丈をあと10mm長くしてください。", o.reworkReason||"");
  if (reason === null) return;
  if (!String(reason).trim()){ alert("理由を入力してください。"); return; }
  o.reworkReason = String(reason).trim();
  o.status = "差し戻し";
  pushHistory(o, "差し戻し", "瀬戸社", `差し戻し: ${o.reworkReason}`);
  saveOrders(arr);
  reRenderKnown(arr);
}

// 生産進行(承認済み → 生産中 → 完了)
function doProd(id){
  const arr = loadOrders();
  const o = arr.find(x=>x.id===id);
  if (!o) return;
  const idx = PROD_FLOW.indexOf(o.status);
  if (idx < 0 || idx >= PROD_FLOW.length-1) return;
  o.status = PROD_FLOW[idx+1];
  pushHistory(o, o.status, "瀬戸社", `生産を進めました(${o.status})。`);
  saveOrders(arr);
  reRenderKnown(arr);
}

// 状態変更後は新着ハイライトを引き継がず再描画(既知扱い)
function reRenderKnown(arr){
  knownIds = new Set(arr.map(x=>x.id));
  render(new Set());
}

function bindCards(){
  $$("[data-quote]").forEach(b=>{ b.onclick=()=>doQuote(b.dataset.quote); });
  $$("[data-rework]").forEach(b=>{ b.onclick=()=>doRework(b.dataset.rework); });
  $$("[data-prod]").forEach(b=>{ b.onclick=()=>doProd(b.dataset.prod); });
}

/* ============================================================
   ライブ更新(別タブのエディタ依頼をキャッチ)
   ============================================================ */
function refresh(){
  const orders = loadOrders();
  const ids = new Set(orders.map(o=>o.id));
  let newIds = new Set();
  if (!firstRender){
    orders.forEach(o=>{ if (!knownIds.has(o.id)) newIds.add(o.id); });
  }
  firstRender = false;
  knownIds = ids;
  render(newIds);
}

/* ============================================================
   デモ用サンプル投入 / 全件クリア
   ============================================================ */
function seedSamples(){
  const now = Date.now();
  const mkHist = (steps)=> steps.map((s,i)=>({ at:new Date(now - (steps.length-i)*120000).toISOString(), status:s.status, by:s.by, note:s.note }));
  const samples = [
    // 1) 届いたばかりの見積依頼(瀬戸社の確定見積待ち)
    {
      id: "ord_seed_"+(now+1)+"_a", createdAt: new Date(now-60000).toISOString(),
      customer: "サンプル 角野商店", product: "woven_name", productLabel: "織ネーム",
      quantity: 200, memo: "入学準備に間に合わせたいです。紅は落ち着いた色味で。",
      widthMm: 18, lengthMm: 60, dimW: 60, dimH: 18, isName: true,
      folding: "endfold", foldingLabel: "両端折り(エンドフォールド)",
      weave: "satin", weaveLabel: "朱子織(サテン光沢)", emblem: "", emblemLabel: "", mello: false,
      fabricHex: "#f7f5ef", fabricName: "地 白",
      threads: [{hex:"#211f1c",no:"K-90",name:"墨黒",metal:false,fluo:false},{hex:"#b3122a",no:"R-12",name:"紅",metal:false,fluo:false}],
      colorCount: 2, attach: "縫付け(標準) / アイロン圧着(オプション)", minLot: 100, leadTime: "約4週間",
      estimate: { priceMin: 12000, priceMax: 17300, leadMin: 22, leadMax: 34, belowLot: false, basis: ["基準単価 約 60 円 x 数量 200 枚(標準単価 x0.85)[要確認]"] },
      quote: null, reworkReason: "", designJson: "",
      history: mkHist([{status:"見積依頼",by:"顧客",note:"見積もりを依頼しました。"}]),
      preflight: { level:"ok", items:[] }, thumb: sampleThumb("#f7f5ef","#211f1c","瀬戸 織"), status: "見積依頼",
    },
    // 2) プリフライト不可(蛍光)で差し戻し中
    {
      id: "ord_seed_"+(now+2)+"_b", createdAt: new Date(now-180000).toISOString(),
      customer: "サンプル 山田アパレル", product: "print_name", productLabel: "昇華プリントネーム",
      quantity: 50, memo: "ロゴの黄色を鮮やかにしたいです。",
      widthMm: 25, lengthMm: 70, dimW: 70, dimH: 25, isName: true,
      folding: "centerfold", foldingLabel: "センター折り",
      weave: "", weaveLabel: "", emblem: "", emblemLabel: "", mello: false,
      fabricHex: "#fbfaf7", fabricName: "サテン白",
      threads: [{hex:"#243f73",no:"B-22",name:"藍",metal:false,fluo:false},{hex:"#eaff00",no:"F-01",name:"蛍光黄",metal:false,fluo:true}],
      colorCount: 2, attach: "縫付け", minLot: 30, leadTime: "約10日",
      estimate: { priceMin: 2900, priceMax: 4200, leadMin: 8, leadMax: 13, belowLot: false, basis: [] },
      quote: null,
      reworkReason: "蛍光黄(F-01)は昇華プリントネームでは再現できません。近い色味の山吹(Y-15)等への変更をご検討ください。",
      designJson: "",
      history: mkHist([
        {status:"見積依頼",by:"顧客",note:"見積もりを依頼しました。"},
        {status:"差し戻し",by:"瀬戸社",note:"差し戻し: 蛍光色は昇華プリントでは不可です。"},
      ]),
      preflight: { level:"fail", items:[{level:"fail",msg:"蛍光色は 昇華プリントネーム では使用できません(#eaff00 は蛍光相当)。"}] },
      thumb: sampleThumb("#fbfaf7","#243f73","SAMPLE"), status: "差し戻し",
    },
    // 3) 確定見積を提示済み(顧客の承認待ち)
    {
      id: "ord_seed_"+(now+3)+"_c", createdAt: new Date(now-360000).toISOString(),
      customer: "サンプル 三好クラブ", product: "embroidery_wappen", productLabel: "刺繍ワッペン",
      quantity: 30, memo: "チームのエンブレムです。山吹を一色で。",
      widthMm: null, lengthMm: null, dimW: 65, dimH: 65, isName: false,
      folding: "mello", foldingLabel: "メロー始末(かがり縁)",
      weave: "", weaveLabel: "", emblem: "shield", emblemLabel: "盾", mello: true,
      fabricHex: "#1f2c4a", fabricName: "繻子 紺",
      threads: [{hex:"#d6a324",no:"Y-15",name:"山吹",metal:false,fluo:false}],
      colorCount: 1, attach: "縫付け / アイロン圧着[要確認]", minLot: 10, leadTime: "約3週間",
      estimate: { priceMin: 7400, priceMax: 10700, leadMin: 18, leadMax: 27, belowLot: false, basis: [] },
      quote: { price: 9800, lead: "約3週間(発注確定から)", note: "盾形・メロー縁で承ります。漢字なしのため再現良好です。" },
      reworkReason: "",
      designJson: "",
      history: mkHist([
        {status:"見積依頼",by:"顧客",note:"見積もりを依頼しました。"},
        {status:"見積提示",by:"瀬戸社",note:"確定見積を提示しました(9,800 円 / 約3週間)。"},
      ]),
      preflight: { level:"warn", items:[{level:"warn",msg:"刺繍は漢字・細い文字の再現が難しいため、太め・大きめを推奨します。[要確認]"}] },
      thumb: sampleThumb("#1f2c4a","#d6a324","EMB"), status: "見積提示",
    },
    // 4) 承認済みで生産中(承認後の生産進行)
    {
      id: "ord_seed_"+(now+4)+"_d", createdAt: new Date(now-600000).toISOString(),
      customer: "サンプル みどり幼稚園", product: "woven_name", productLabel: "織ネーム",
      quantity: 500, memo: "園児のお名前ネームです。",
      widthMm: 24, lengthMm: 90, dimW: 90, dimH: 24, isName: true,
      folding: "endfold", foldingLabel: "両端折り(エンドフォールド)",
      weave: "plain", weaveLabel: "平織(マット)", emblem: "", emblemLabel: "", mello: false,
      fabricHex: "#f7f5ef", fabricName: "地 白",
      threads: [{hex:"#1f6b46",no:"G-44",name:"常磐緑",metal:false,fluo:false}],
      colorCount: 1, attach: "縫付け(標準) / アイロン圧着(オプション)", minLot: 100, leadTime: "約4週間",
      estimate: { priceMin: 25000, priceMax: 36000, leadMin: 24, leadMax: 36, belowLot: false, basis: [] },
      quote: { price: 31000, lead: "約4週間", note: "平織・常磐緑1色で承ります。" },
      reworkReason: "",
      designJson: "",
      history: mkHist([
        {status:"見積依頼",by:"顧客",note:"見積もりを依頼しました。"},
        {status:"見積提示",by:"瀬戸社",note:"確定見積を提示しました(31,000 円 / 約4週間)。"},
        {status:"承認済み(生産着手)",by:"顧客",note:"見積もりを承認し、生産着手を依頼しました。"},
        {status:"生産中",by:"瀬戸社",note:"生産を進めました(生産中)。"},
      ]),
      preflight: { level:"ok", items:[] }, thumb: sampleThumb("#f7f5ef","#1f6b46","みどり園"), status: "生産中",
    },
  ];
  const orders = loadOrders();
  saveOrders(samples.concat(orders));
  refresh();
}

// サンプル用の簡易サムネイル(Canvas で地色+文字を描いて dataURL 化)
function sampleThumb(bg, fg, text){
  const c = document.createElement("canvas");
  c.width = 280; c.height = 110;
  const g = c.getContext("2d");
  g.fillStyle = bg; g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = fg; g.font = "bold 34px 'Shippori Mincho', serif";
  g.textAlign = "center"; g.textBaseline = "middle";
  g.fillText(text, c.width/2, c.height/2);
  return c.toDataURL("image/png");
}

function clearAll(){
  if (!confirm("受注を全件クリアします(デモ)。よろしいですか。")) return;
  localStorage.removeItem(ORDERS_KEY);
  knownIds = new Set();
  refresh();
}

/* ============================================================
   起動
   ============================================================ */
function boot(){
  $("#seedBtn").onclick = seedSamples;
  $("#clearBtn").onclick = clearAll;

  refresh();

  window.addEventListener("storage", (e)=>{
    if (e.key === ORDERS_KEY || e.key === null) refresh();
  });
  setInterval(refresh, 2500);
  document.addEventListener("visibilitychange", ()=>{ if (!document.hidden) refresh(); });
}

boot();
