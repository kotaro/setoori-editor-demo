"use strict";
/*
  瀬戸織ネーム 受注キャッチ画面(コンセプトデモ / PoC)
  エディタ(app.js)が入稿確定時に localStorage "seto_orders" に追記した受注
  レコードを読み、瀬戸社(受注者)側のビューとして新着順に一覧表示する。
  別タブのエディタからの入稿を storage イベント+ポーリングでライブにキャッチする。
  レコードの項目は app.js の buildOrderRecord と一致させること。
  実データ連携は localStorage による擬似表現。本番は受発注 API に置換[要確認]。
*/

const ORDERS_KEY = "seto_orders";

const $ = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));
const esc = (s) => String(s).replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c]));

// ステータスの定義(クリックで 新着 から 生産中 から 完了 を循環)
const STATUS_ORDER = ["新着", "生産中", "完了"];
const STATUS_CLASS = { "新着":"s-new", "生産中":"s-prod", "完了":"s-done" };

// 直近にレンダリングした受注 ID 集合(新着ハイライトの判定用)
let knownIds = new Set();
let firstRender = true;

/* ============================================================
   localStorage 入出力
   ============================================================ */
function loadOrders(){ try{ return JSON.parse(localStorage.getItem(ORDERS_KEY)||"[]"); }catch(e){ return []; } }
function saveOrders(arr){ localStorage.setItem(ORDERS_KEY, JSON.stringify(arr.slice(0,60))); }

/* ============================================================
   表示ユーティリティ
   ============================================================ */
// 受付日時の表記(ロケール簡易)
function fmtTime(iso){
  try{
    const d = new Date(iso);
    const p = n => String(n).padStart(2, "0");
    return `${d.getFullYear()}/${p(d.getMonth()+1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }catch(e){ return iso || "-"; }
}

// プリフライトのバッジ(合格 / 注意 / 不可)
function pfBadge(level){
  if (level === "fail") return `<span class="oc-badge b-fail">プリフライト 不可</span>`;
  if (level === "warn") return `<span class="oc-badge b-warn">プリフライト 注意</span>`;
  return `<span class="oc-badge b-ok">プリフライト 合格</span>`;
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
  const stCls = STATUS_CLASS[o.status] || "s-new";

  // 不可の受注は警告ブロックを出す
  let failNote = "";
  if (pf.level === "fail" && failItems.length){
    failNote = `<div class="oc-fail-note"><b>製造不可の指摘があります(要修正)</b><ul>` +
      failItems.map(it=>`<li>${esc(it.msg)}</li>`).join("") + `</ul></div>`;
  }

  // 確定仕様シート(カード内)
  let rows = "";
  rows += `<div class="oc-row"><span class="k">仕立て</span><span class="v">${esc(o.foldingLabel || "-")}</span></div>`;
  if (o.weaveLabel) rows += `<div class="oc-row"><span class="k">地組織</span><span class="v">${esc(o.weaveLabel)}</span></div>`;
  if (o.emblemLabel) rows += `<div class="oc-row"><span class="k">形状 / 縁</span><span class="v">${esc(o.emblemLabel)}${o.mello?" / メロー始末あり":""}</span></div>`;
  rows += `<div class="oc-row"><span class="k">地色</span><span class="v"><span class="oc-chip"><span class="dot" style="background:${esc(o.fabricHex)}"></span>${esc(o.fabricName)}</span></span></div>`;
  rows += `<div class="oc-row"><span class="k">使用糸色(${o.colorCount||0}色)</span><span class="v">${threadChips(o.threads)}</span></div>`;
  rows += `<div class="oc-row"><span class="k">取付</span><span class="v">${esc(o.attach || "-")}</span></div>`;
  rows += `<div class="oc-row"><span class="k">最小ロット / 納期</span><span class="v">${o.minLot} 枚から / ${esc(o.leadTime || "-")}</span></div>`;

  const cls = ["ord-card"];
  if (isNew) cls.push("is-new", "pop");
  if (pf.level === "fail") cls.push("is-fail");

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
          ${pfBadge(pf.level)}
        </div>
      </div>
    </div>
    ${failNote}
    <div class="oc-spec">${rows}</div>
    <div class="oc-foot">
      <span class="oc-status-label">ステータス</span>
      <button class="status-pill ${stCls}" data-statusid="${esc(o.id)}">${esc(o.status || "新着")}</button>
      <span class="oc-status-hint">クリックで進行</span>
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

// ステータスピルのクリック(新着 から 生産中 から 完了 を循環し localStorage 保存)
function bindCards(){
  $$("[data-statusid]").forEach(btn=>{
    btn.onclick = ()=>{
      const id = btn.dataset.statusid;
      const orders = loadOrders();
      const o = orders.find(x=>x.id===id);
      if (!o) return;
      const idx = STATUS_ORDER.indexOf(o.status);
      o.status = STATUS_ORDER[(idx+1) % STATUS_ORDER.length];
      saveOrders(orders);
      // 状態変更時は新着ハイライトを引き継がず再描画(既知扱い)
      knownIds = new Set(orders.map(x=>x.id));
      render(new Set());
    };
  });
}

/* ============================================================
   ライブ更新(別タブのエディタ入稿をキャッチ)
   storage イベント(別タブの書込通知)+数秒ポーリングの二重化。
   ============================================================ */
function refresh(){
  const orders = loadOrders();
  const ids = new Set(orders.map(o=>o.id));
  // 初回は新着強調しない。以降は前回未知だった ID を新着として強調。
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
  const samples = [
    {
      id: "ord_seed_"+(now+1)+"_a", createdAt: new Date(now-60000).toISOString(),
      customer: "サンプル 角野商店", product: "woven_name", productLabel: "織ネーム",
      widthMm: 18, lengthMm: 60, dimW: 60, dimH: 18, isName: true,
      folding: "endfold", foldingLabel: "両端折り(エンドフォールド)",
      weave: "satin", weaveLabel: "朱子織(サテン光沢)", emblem: "", emblemLabel: "", mello: false,
      fabricHex: "#f7f5ef", fabricName: "地 白",
      threads: [{hex:"#211f1c",no:"K-90",name:"墨黒",metal:false,fluo:false},{hex:"#b3122a",no:"R-12",name:"紅",metal:false,fluo:false}],
      colorCount: 2, attach: "縫付け(標準) / アイロン圧着(オプション)", minLot: 100, leadTime: "約4週間",
      preflight: { level:"ok", items:[] }, thumb: sampleThumb("#f7f5ef","#211f1c","瀬戸 織"), status: "新着",
    },
    {
      id: "ord_seed_"+(now+2)+"_b", createdAt: new Date(now-180000).toISOString(),
      customer: "サンプル 山田アパレル", product: "print_name", productLabel: "昇華プリントネーム",
      widthMm: 25, lengthMm: 70, dimW: 70, dimH: 25, isName: true,
      folding: "centerfold", foldingLabel: "センター折り",
      weave: "", weaveLabel: "", emblem: "", emblemLabel: "", mello: false,
      fabricHex: "#fbfaf7", fabricName: "サテン白",
      threads: [{hex:"#243f73",no:"B-22",name:"藍",metal:false,fluo:false},{hex:"#eaff00",no:"F-01",name:"蛍光黄",metal:false,fluo:true}],
      colorCount: 2, attach: "縫付け", minLot: 30, leadTime: "約10日",
      preflight: { level:"fail", items:[{level:"fail",msg:"蛍光色は 昇華プリントネーム では使用できません(#eaff00 は蛍光相当)。"}] },
      thumb: sampleThumb("#fbfaf7","#243f73","SAMPLE"), status: "新着",
    },
    {
      id: "ord_seed_"+(now+3)+"_c", createdAt: new Date(now-360000).toISOString(),
      customer: "サンプル 三好クラブ", product: "embroidery_wappen", productLabel: "刺繍ワッペン",
      widthMm: null, lengthMm: null, dimW: 65, dimH: 65, isName: false,
      folding: "mello", foldingLabel: "メロー始末(かがり縁)",
      weave: "", weaveLabel: "", emblem: "shield", emblemLabel: "盾", mello: true,
      fabricHex: "#1f2c4a", fabricName: "繻子 紺",
      threads: [{hex:"#d6a324",no:"Y-15",name:"山吹",metal:false,fluo:false}],
      colorCount: 1, attach: "縫付け / アイロン圧着[要確認]", minLot: 10, leadTime: "約3週間",
      preflight: { level:"warn", items:[{level:"warn",msg:"刺繍は漢字・細い文字の再現が難しいため、太め・大きめを推奨します。[要確認]"}] },
      thumb: sampleThumb("#1f2c4a","#d6a324","EMB"), status: "生産中",
    },
  ];
  const orders = loadOrders();
  // サンプルは newest 優先で先頭へ
  saveOrders(samples.concat(orders));
  refresh();
}

// サンプル用の簡易サムネイル(Canvas で地色+文字を描いて dataURL 化)。
// エディタの canvas.toDataURL の代替。受注画面は Fabric 不要のため素の Canvas を使う。
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

  // 初回描画
  refresh();

  // 別タブのエディタからの書込をキャッチ(storage イベント)
  window.addEventListener("storage", (e)=>{
    if (e.key === ORDERS_KEY || e.key === null) refresh();
  });

  // 補助のポーリング(storage イベントが発火しない環境・同一タブ更新の保険)
  setInterval(refresh, 2500);

  // タブ復帰時にも最新化
  document.addEventListener("visibilitychange", ()=>{ if (!document.hidden) refresh(); });
}

boot();
