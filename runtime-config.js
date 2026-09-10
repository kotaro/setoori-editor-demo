"use strict";
/*
  Runtime configuration bridge for the PoC.
  The editor's original constants remain the factory defaults. This file is loaded
  after app.js has declared them but before safeBoot() runs, then applies local
  admin overrides and restores Fabric.js.

  Production note: localStorage is intentionally PoC-only. Move this config to an
  authenticated API/DB before multi-tenant deployment.
*/
(function(){
  const CONFIG_KEY = "setoori_admin_config_v1";
  const META_KEY = "setoori_builtin_template_meta_v1";

  function clone(v){ return JSON.parse(JSON.stringify(v)); }
  function assignObject(target, patch){
    if (!patch || typeof patch !== "object") return;
    Object.keys(patch).forEach(k=>{
      const pv = patch[k];
      if (pv && typeof pv === "object" && !Array.isArray(pv) && target[k] && typeof target[k] === "object" && !Array.isArray(target[k])) {
        assignObject(target[k], pv);
      } else {
        target[k] = clone(pv);
      }
    });
  }
  function replaceArray(target, values){
    if (!Array.isArray(values)) return;
    target.splice(0, target.length, ...clone(values));
  }

  function captureTemplateMeta(){
    try {
      const meta = {};
      Object.keys(TEMPLATES).forEach(product=>{
        meta[product] = (TEMPLATES[product] || []).map((t, index)=>({
          key: `${product}:${index}:${t.name || "template"}`,
          index,
          name: t.name || `Template ${index+1}`,
          category: t.category || "その他",
          title: t.title || ""
        }));
      });
      localStorage.setItem(META_KEY, JSON.stringify(meta));
    } catch(e){ console.warn("template meta snapshot failed", e); }
  }

  function applyTemplateRules(rules){
    if (!rules || typeof rules !== "object") return;
    Object.keys(rules).forEach(product=>{
      const list = TEMPLATES[product];
      if (!Array.isArray(list)) return;
      const rlist = Array.isArray(rules[product]) ? rules[product] : [];
      const decorated = list.map((tpl, index)=>{
        const rule = rlist.find(r=>Number(r.index)===index || r.name===tpl.name) || {};
        if (rule.rename) tpl.name = String(rule.rename);
        if (rule.category) tpl.category = String(rule.category);
        if (rule.title != null) tpl.title = String(rule.title);
        return { tpl, index, hidden: !!rule.hidden, order: Number.isFinite(Number(rule.order)) ? Number(rule.order) : index };
      });
      TEMPLATES[product] = decorated
        .filter(x=>!x.hidden)
        .sort((a,b)=>a.order-b.order || a.index-b.index)
        .map(x=>x.tpl);
    });
  }

  function appendCustomTemplates(items){
    if (!Array.isArray(items)) return;
    items.filter(x=>x && x.enabled !== false && TEMPLATES[x.product]).forEach(item=>{
      const product = item.product;
      const name = item.name || "カスタムテンプレート";
      const category = item.category || "カスタム";
      const title = item.title || item.text || name;
      const bg = item.fabric || "#f7f5ef";
      const fg = item.thread || "#211f1c";
      const font = item.font || "Noto Sans JP";
      const weight = Number(item.weight || 600);
      const spacing = Number(item.spacing || 20);
      const text = item.text || title;
      const sub = item.subtext || "";
      const widthMm = item.widthMm == null ? null : Number(item.widthMm);
      const lengthMm = item.lengthMm == null ? null : Number(item.lengthMm);
      const presetIdx = item.presetIdx == null ? 1 : Number(item.presetIdx);
      const weave = item.weave || "satin";
      const sizeRatio = Number(item.sizeRatio || 0.38);
      const thumb = tplThumb(text, font, fg, bg, sub ? { lines:[{t:text,color:fg,size:15,weight}], sub, subColor:fg } : {});
      TEMPLATES[product].push({
        name, category, title, thumb,
        build:()=>{
          const p = PRODUCTS[product];
          if (p && p.widths && widthMm != null) state.widthMm = widthMm;
          if (p && p.widths && lengthMm != null) state.lengthMm = lengthMm;
          if (p && !p.widths) state.presetIdx = presetIdx;
          if (p && p.weaves) state.weave = weave;
          state.fabric = bg;
          state.thread = fg;
          if (sub){
            tT(text, font, fg, weight, sizeRatio, 0.38, spacing);
            tT(sub, font, fg, 500, Math.max(0.14, sizeRatio*0.45), 0.72, spacing);
          } else {
            tT(text, font, fg, weight, sizeRatio, 0.5, spacing);
          }
        }
      });
    });
  }

  try {
    captureTemplateMeta();
    const raw = localStorage.getItem(CONFIG_KEY);
    const cfg = raw ? JSON.parse(raw) : null;
    if (cfg){
      assignObject(PRODUCTS, cfg.products);
      assignObject(PF, cfg.preflight);
      assignObject(EST, cfg.estimate);
      assignObject(FOLDING, cfg.folding);
      assignObject(WEAVE, cfg.weave);
      if (cfg.threadBook) replaceArray(THREAD_BOOK, cfg.threadBook);
      if (cfg.fabricBook) assignObject(FABRIC_BOOK, cfg.fabricBook);
      if (cfg.wappenPresets) replaceArray(WAPPEN_PRESETS, cfg.wappenPresets);
      applyTemplateRules(cfg.templateRules);
      appendCustomTemplates(cfg.customTemplates);
    }

    // Maintenance entry point for operators. It is visually secondary to customer actions.
    const actions = document.querySelector(".topbar-actions");
    if (actions && !document.getElementById("systemAdminLink")){
      const a = document.createElement("a");
      a.id = "systemAdminLink";
      a.href = "admin.html";
      a.className = "text-btn nav-link";
      a.title = "商品仕様・プリフライト・価格・テンプレートを管理";
      a.innerHTML = '<span class="btn-label">システム管理</span>';
      actions.appendChild(a);
    }
  } catch(e){
    console.error("Seto runtime config failed", e);
  } finally {
    if (window.__setoFabricHold) {
      window.fabric = window.__setoFabricHold;
      window.__setoFabricHold = null;
    }
  }
})();
