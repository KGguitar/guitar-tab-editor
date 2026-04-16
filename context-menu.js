/* ================================================================
   context-menu.js — 右クリック・コンテキストメニュー
   ================================================================
   責務: selection.typeに応じたメニュー項目構築、メニュー表示/非表示/位置補正。
   依存: グローバル変数 song, sel, cur, clipboard, playback, state,
         getCurrentMeasure, getSelectedEvent, getEventsAtTick,
         isNoteSelected, isTickSelected, isRangeSelected, isMeasureSelected,
         hasLinkType, getLinkByType, getTickAttrs, hasCopied,
         TLB, TECH_MAP,
         pH, toggleAttr, toggleTech, deleteSelection, copySelection,
         pasteSelection, pasteSelectionOverwrite, insertPasteAtSelection,
         duplicateRangeSelection, transposeBy, setTickAttr, clearRange,
         addSpan, removeSpan, toggleMeasureAttr, setMeasureEnding,
         dupM, delM, render, save, toast, closeContextMenu
   
   メニュー項目がアクションを呼ぶが、編集ロジック本体はselection-edit.js側。
   このファイルは state.js, model.js, selection-edit.js の後に読み込む。
*/

function buildContextMenuItems(){
  const m=getCurrentMeasure();const ne=getSelectedEvent();
  const items=[];
  const S=sel;

  if(S.type==="note"&&ne){
    items.push({type:"header",label:"Note: "+TLB.standard[ne.stringIndex]+ne.fret+"F @M"+(S.measureIdx+1)+" T"+S.tick});
    items.push({label:"削除",key:"Del",action:()=>{deleteSelection();closeContextMenu()}});
    items.push({label:"コピー",key:"Ctrl+C",action:()=>{copySelection();closeContextMenu()}});
    items.push({type:"sep"});
    items.push({label:"半音↑",key:"+",action:()=>{transposeBy(1);closeContextMenu()}});
    items.push({label:"半音↓",key:"-",action:()=>{transposeBy(-1);closeContextMenu()}});
    items.push({type:"sep"});
    const attrItems=["accent","ghost","dead","harmonic","vibrato","mute"];
    attrItems.forEach(a=>{
      items.push({label:a.charAt(0).toUpperCase()+a.slice(1),checked:!!(ne.attrs&&ne.attrs[a]),action:()=>{pH();toggleAttr(ne,a);render();save();closeContextMenu()}});
    });
    items.push({type:"sep"});
    ["tie","hammer","pull","slide"].forEach(t=>{
      const has=hasLinkType(ne,t);
      items.push({label:t.charAt(0).toUpperCase()+t.slice(1)+(has&&getLinkByType(ne,t)&&getLinkByType(ne,t).toEventId?" →":""),checked:has,action:()=>{toggleTech(t);closeContextMenu()}});
    });
  }
  else if(S.type==="tick"){
    const ev=m?getEventsAtTick(m,S.tick):[];
    items.push({type:"header",label:"Tick: M"+(S.measureIdx+1)+" T"+S.tick+" ("+ev.length+"音)"});
    items.push({label:"削除",key:"Del",action:()=>{deleteSelection();closeContextMenu()},disabled:!ev.length});
    items.push({label:"コピー",key:"Ctrl+C",action:()=>{copySelection();closeContextMenu()},disabled:!ev.length});
    items.push({label:"貼付",key:"Ctrl+V",action:()=>{pasteSelection();closeContextMenu()},disabled:!hasCopied()});
    items.push({label:"右複製",key:"Ctrl+D",action:()=>{duplicateSelection();closeContextMenu()},disabled:!ev.length});
    items.push({type:"sep"});
    const ta=m?getTickAttrs(m,S.tick):null;
    items.push({label:"Strum ↓",checked:!!(ta&&ta.strum==="down"),action:()=>{pH();setTickAttr(m,S.tick,{strum:ta&&ta.strum==="down"?null:"down"});render();save();closeContextMenu()}});
    items.push({label:"Strum ↑",checked:!!(ta&&ta.strum==="up"),action:()=>{pH();setTickAttr(m,S.tick,{strum:ta&&ta.strum==="up"?null:"up"});render();save();closeContextMenu()}});
    items.push({label:"Rest",checked:!!(ta&&ta.rest),action:()=>{pH();setTickAttr(m,S.tick,{rest:!(ta&&ta.rest)});render();save();closeContextMenu()}});
    if(ev.length){items.push({type:"sep"});items.push({label:"全音 半音↑",action:()=>{transposeBy(1);closeContextMenu()}});items.push({label:"全音 半音↓",action:()=>{transposeBy(-1);closeContextMenu()}})}
    if(hasCopied()){items.push({type:"sep"});items.push({label:"挿入貼付(押出)",action:()=>{insertPasteAtSelection();closeContextMenu()}});items.push({label:"上書き貼付",action:()=>{pasteSelectionOverwrite();closeContextMenu()}})}
  }
  else if(S.type==="range"&&isRangeSelected()){
    items.push({type:"header",label:"Range: M"+(S.rangeStart.measureIdx+1)+"T"+S.rangeStart.tick+" → M"+(S.rangeEnd.measureIdx+1)+"T"+S.rangeEnd.tick});
    items.push({label:"コピー",key:"Ctrl+C",action:()=>{copySelection();closeContextMenu()}});
    items.push({label:"右複製",key:"Ctrl+D",action:()=>{duplicateRangeSelection();closeContextMenu()}});
    items.push({label:"削除",key:"Del",action:()=>{deleteSelection();closeContextMenu()}});
    items.push({label:"範囲解除",key:"Esc",action:()=>{clearRange();closeContextMenu()}});
    items.push({type:"sep"});
    if(hasCopied()){
      items.push({label:"貼付(非破壊)",action:()=>{pasteSelection();closeContextMenu()}});
      items.push({label:"上書き貼付",action:()=>{pasteSelectionOverwrite();closeContextMenu()}});
      items.push({label:"挿入貼付(押出)",action:()=>{insertPasteAtSelection();closeContextMenu()}});
      items.push({type:"sep"});
    }
    items.push({label:"Palm Mute span作成",action:()=>{pH();addSpan("palmMute",S.rangeStart,S.rangeEnd);render();save();toast("PM span作成");closeContextMenu()}});
    items.push({label:"Let Ring span作成",action:()=>{pH();addSpan("letRing",S.rangeStart,S.rangeEnd);render();save();toast("LR span作成");closeContextMenu()}});
    const overlapping=(song.spans||[]).filter(sp=>{
      return sp.start.measureIdx<=S.rangeEnd.measureIdx&&sp.end.measureIdx>=S.rangeStart.measureIdx;
    });
    if(overlapping.length){items.push({type:"sep"});overlapping.forEach(sp=>{items.push({label:"解除: "+(sp.type==="palmMute"?"P.M.":"let ring"),action:()=>{pH();removeSpan(sp.id);render();save();toast("Span解除");closeContextMenu()}})})}
  }
  else if(S.type==="measure"){
    items.push({type:"header",label:"Measure: "+(S.measureIdx+1)});
    items.push({label:"小節複製",action:()=>{dupM();closeContextMenu()}});
    items.push({label:"小節削除",action:()=>{delM();closeContextMenu()}});
    items.push({label:"コピー",key:"Ctrl+C",action:()=>{copySelection();closeContextMenu()}});
    items.push({type:"sep"});
    const ma=m?m.attrs:{};
    items.push({label:"Repeat Start",checked:!!(ma&&ma.repeatStart),action:()=>{pH();toggleMeasureAttr(m,"repeatStart");render();save();closeContextMenu()}});
    items.push({label:"Repeat End",checked:!!(ma&&ma.repeatEnd),action:()=>{pH();toggleMeasureAttr(m,"repeatEnd");render();save();closeContextMenu()}});
    items.push({label:"Ending "+(ma&&ma.ending?ma.ending:"OFF"),action:()=>{const ce=ma?ma.ending:null;pH();setMeasureEnding(m,ce?ce<3?ce+1:null:1);render();save();closeContextMenu()}});
  }
  return items;
}

function openContextMenu(x,y,items){
  const el=document.getElementById("ctx-menu");el.innerHTML="";
  if(!items.length){el.style.display="none";return}
  items.forEach(it=>{
    if(it.type==="header"){const h=document.createElement("div");h.className="ctx-header";h.textContent=it.label;el.appendChild(h);return}
    if(it.type==="sep"){const s=document.createElement("div");s.className="ctx-sep";el.appendChild(s);return}
    const d=document.createElement("div");d.className="ctx-item"+(it.disabled?" disabled":"");
    const chk=document.createElement("span");chk.className="ctx-check";chk.textContent=it.checked?"✓":"";d.appendChild(chk);
    const lbl=document.createElement("span");lbl.textContent=it.label;d.appendChild(lbl);
    if(it.key){const k=document.createElement("span");k.className="ctx-key";k.textContent=it.key;d.appendChild(k)}
    if(!it.disabled&&it.action)d.addEventListener("click",it.action);
    el.appendChild(d);
  });
  /* 位置補正 */
  el.style.display="block";el.style.left="0";el.style.top="0";
  const rect=el.getBoundingClientRect();
  const mx=Math.min(x,window.innerWidth-rect.width-8);
  const my=Math.min(y,window.innerHeight-rect.height-8);
  el.style.left=Math.max(4,mx)+"px";el.style.top=Math.max(4,my)+"px";
}

function closeContextMenu(){document.getElementById("ctx-menu").style.display="none"}

/* ================================================================ KEYBOARD — Phase 9: 5カテゴリ分離 ================================================================ */

