/* ================================================================
   io.js — 保存 / 読込 / 変換 / 出力責務
   ================================================================
   依存: グローバル変数 song, sel, cur, editorMeta, state, playback,
         SK, TPB, GS, NSTR, SH, SP, LANE, TUN,
         dc, mTk, nAttrs, nLinks, nMeasureAttrs, nM, uid, srt, sfn,
         nSpan, cleanupDanglingLinks, cleanupInvalidSpans,
         migrateEvent, normalizeSong (model系 — まだ分離していない),
         toast, pushActionLog, render, renderFB, renderSlotPanel,
         reconcileSelection, syncUI,
         drawStaff, drawNotes, drawRhythm, drawLinks, drawSpans,
         drawTickAttrs, drawRests, drawMeasureAttrs (PNG出力用)
   
   将来: state.js から state.song/state.editorMeta を受け取る形へ移行。
         normalizeSong/migrateEvent は model.js 分離時に import へ変更。
   
   このファイルは単独では動かない。index.html から <script src="io.js"> で読み込む。
*/

/* ================================================================ SAVE/LOAD/EXPORT ================================================================ */
/* ================================================================ SAVE/LOAD/EXPORT — Phase 10 ================================================================
   保存フォーマットは schemaVersion で管理する。
   読み込み時は migrateSong → normalizeSong を通す。
   内部状態は normalize 済み新構造のみを使う。
   export 用整形は serializeSong で別責務。
   localStorage は作業中下書き、JSON export は持ち出し/バックアップ。
*/
const CURRENT_SCHEMA_VERSION=3;

/* --- Serialize: 内部状態 → 保存用JSONオブジェクト --- */
function serializeSong(s){
  cleanupSongForSave(s);
  return{
    schemaVersion:CURRENT_SCHEMA_VERSION,
    meta:dc(s.meta),
    measures:s.measures.map(m=>({
      id:m.id,events:m.events.map(e=>({id:e.id,stringIndex:e.stringIndex,fret:e.fret,startTick:e.startTick,durationTick:e.durationTick,attrs:dc(e.attrs||nAttrs()),links:dc(e.links||nLinks())})),
      attrs:dc(m.attrs||nMeasureAttrs()),tickAttrs:dc(m.tickAttrs||{})
    })),
    spans:dc(s.spans||[])
  };
}

/* --- Deserialize: raw JSON → 正規化済み内部状態 --- */
function deserializeSong(raw){
  const migrated=migrateSong(dc(raw));
  return normalizeSong(migrated);
}

/* --- Migrate: schemaVersionに基づく段階移行 --- */
function migrateSong(data){
  const v=data.schemaVersion||1;
  /* v1→v2: technique が残っている可能性。migrateEventで対応。 */
  /* v2→v3: technique完全除去、spans/tickAttrs/measure.attrs確立。 */
  /* migrateEvent内でtechnique→attrs/links変換+delete済み。
     normalizeSongで構造補完するため、ここでは schemaVersion を更新するだけ。 */
  data.schemaVersion=CURRENT_SCHEMA_VERSION;
  return data;
}

/* --- Normalize: 構造補完・整合 --- */
function normalizeSong(data){
  if(!data.meta)data.meta={};if(!data.meta.title)data.meta.title="";if(!data.meta.tempo)data.meta.tempo=120;
  if(!data.meta.timeSignature)data.meta.timeSignature={beats:4,beatUnit:4};
  if(!data.meta.tuningPreset)data.meta.tuningPreset="standard";if(!data.meta.tuning)data.meta.tuning=[...TUN.standard];
  if(!data.measures||!data.measures.length)data.measures=[nM()];
  if(!Array.isArray(data.spans))data.spans=[];
  data.measures.forEach(m=>{
    if(!m.id)m.id=uid("m");
    if(!m.events)m.events=[];
    if(!m.attrs){m.attrs=nMeasureAttrs()}else{const def=nMeasureAttrs();for(const k in def){if(!(k in m.attrs))m.attrs[k]=def[k]}}
    if(!m.tickAttrs||typeof m.tickAttrs!=="object")m.tickAttrs={};
    m.events.forEach(e=>{
      if(!e.id)e.id=uid("e");
      migrateEvent(e);/* 旧technique→attrs/links変換+technique削除 */
    });
    srt(m);
  });
  if(!data.schemaVersion)data.schemaVersion=CURRENT_SCHEMA_VERSION;
  return data;
}

/* --- Validate & Cleanup --- */
function validateSong(s){
  const issues=[];
  /* Pass 1: 全eventIDを収集 */
  const allIds=new Set();
  s.measures.forEach((m,mi)=>{m.events.forEach(e=>{
    if(allIds.has(e.id))issues.push("重複ID: "+e.id+" (小節"+(mi+1)+")");
    allIds.add(e.id);
  })});
  /* Pass 2: link整合チェック */
  s.measures.forEach((m,mi)=>{m.events.forEach(e=>{
    if(!e.links)return;
    const typeSeen=new Set();
    e.links.forEach(l=>{
      /* 同type重複 */
      if(typeSeen.has(l.type))issues.push("重複link type: "+l.type+" on "+e.id+" (小節"+(mi+1)+")");
      typeSeen.add(l.type);
      /* 自己参照 */
      if(l.toEventId&&l.toEventId===e.id)issues.push("自己参照link: "+l.type+" on "+e.id);
      /* dangling toEventId */
      if(l.toEventId&&!allIds.has(l.toEventId))issues.push("dangling link: "+l.type+" on "+e.id+" → "+l.toEventId);
    });
  })});
  /* spans */
  if(s.spans){s.spans.forEach((sp,i)=>{
    if(!sp.start||!sp.end)issues.push("不正span #"+i);
    else if(sp.start.measureIdx<0||sp.start.measureIdx>=s.measures.length)issues.push("span開始範囲外 #"+i);
    else if(sp.end.measureIdx<0||sp.end.measureIdx>=s.measures.length)issues.push("span終了範囲外 #"+i);
  })}
  return issues;
}

function cleanupSongForSave(s){
  cleanupDanglingLinks();
  cleanupInvalidSpans();
  /* 空tickAttrsエントリ除去 */
  s.measures.forEach(m=>{
    if(m.tickAttrs){Object.keys(m.tickAttrs).forEach(k=>{
      const ta=m.tickAttrs[k];if(!ta||(!ta.strum&&!ta.rest))delete m.tickAttrs[k];
    })}
  });
}

/* ================================================================
   Phase 11: 交換モデル (Exchange Model)
   ================================================================
   3層の責務分離:
   1. 内部編集モデル — editor用。song.measures[].events[], attrs, links, spans 等
   2. 保存モデル — schemaVersion付きJSON。serializeSong/deserializeSong で変換
   3. 交換モデル — 外部出力・共有・変換用の中間表現。toExchangeModel で生成
   
   交換モデルは events/links をフラット化し、tickAttrs を配列化。
   内部UI都合（selection, clipboard, pending等）を含まない。
*/

function toExchangeModel(s){
  cleanupSongForSave(s);
  const model={version:1,meta:dc(s.meta),measures:[],events:[],links:[],spans:[],warnings:[]};
  const eventIds=new Set();

  s.measures.forEach((m,mi)=>{
    /* measures: 小節単位情報のみ（eventsはフラット化） */
    const taArr=[];
    if(m.tickAttrs){Object.keys(m.tickAttrs).forEach(k=>{
      const ta=m.tickAttrs[k];if(ta&&(ta.strum||ta.rest)){taArr.push({tick:Number(k),strum:ta.strum||null,rest:!!ta.rest})}
    })}
    model.measures.push({index:mi,attrs:dc(m.attrs||nMeasureAttrs()),tickAttrs:taArr});

    /* events: フラット一覧、measureIdx付き */
    (m.events||[]).forEach(e=>{
      if(eventIds.has(e.id)){model.warnings.push("重複ID: "+e.id+" (小節"+(mi+1)+")");return}
      eventIds.add(e.id);
      model.events.push({
        id:e.id,measureIdx:mi,tick:e.startTick,stringIndex:e.stringIndex,
        fret:e.fret,durationTick:e.durationTick,attrs:dc(e.attrs||nAttrs())
      });
      /* links: フラット一覧、fromEventId付き */
      (e.links||[]).forEach(lk=>{
        model.links.push({
          type:lk.type,fromEventId:e.id,toEventId:lk.toEventId||null,
          value:lk.value!=null?lk.value:null,meta:dc(lk.meta||{})
        });
        if(lk.toEventId&&!eventIds.has(lk.toEventId)){
          /* toEventIdがまだ出現していない — 後方参照の可能性もあるのでwarning保留 */
        }
      });
    });
  });

  /* spans: そのまま整形 */
  model.spans=(s.spans||[]).map(sp=>({
    id:sp.id,type:sp.type,
    start:{measureIdx:sp.start.measureIdx,tick:sp.start.tick},
    end:{measureIdx:sp.end.measureIdx,tick:sp.end.tick},
    meta:dc(sp.meta||{})
  }));

  /* 後方参照linkのwarningチェック */
  model.links.forEach(lk=>{
    if(lk.toEventId&&!eventIds.has(lk.toEventId)){
      model.warnings.push("dangling link: "+lk.type+" from "+lk.fromEventId+" → "+lk.toEventId);
    }
  });

  return model;
}

function validateExchangeModel(model){
  const issues=[];
  if(!model||typeof model!=="object")return["モデルがnullまたは不正"];
  if(!model.version)issues.push("versionなし");
  /* event ID重複 */
  const ids=new Set();
  (model.events||[]).forEach(e=>{
    if(ids.has(e.id))issues.push("重複event ID: "+e.id);ids.add(e.id);
    if(e.measureIdx<0||e.measureIdx>=(model.measures||[]).length)issues.push("event measureIdx範囲外: "+e.id);
    if(typeof e.tick!=="number"||e.tick<0)issues.push("event tick不正: "+e.id);
  });
  /* link整合 */
  (model.links||[]).forEach(lk=>{
    if(!ids.has(lk.fromEventId))issues.push("link fromEventId不在: "+lk.fromEventId);
    if(lk.toEventId&&!ids.has(lk.toEventId))issues.push("link toEventId不在: "+lk.toEventId);
  });
  /* span整合 */
  const ml=(model.measures||[]).length;
  (model.spans||[]).forEach((sp,i)=>{
    if(!sp.start||!sp.end)issues.push("span #"+i+" start/endなし");
    else{
      if(sp.start.measureIdx<0||sp.start.measureIdx>=ml)issues.push("span #"+i+" start範囲外");
      if(sp.end.measureIdx<0||sp.end.measureIdx>=ml)issues.push("span #"+i+" end範囲外");
    }
  });
  /* tickAttrs */
  (model.measures||[]).forEach((m,i)=>{
    (m.tickAttrs||[]).forEach(ta=>{
      if(typeof ta.tick!=="number"||ta.tick<0)issues.push("tickAttrs不正 measure "+i);
    });
  });
  return issues;
}

/* デバッグ用: 交換モデルをJSON出力 */
function showExchangeModelDebug(){
  const model=toExchangeModel(song);
  const issues=validateExchangeModel(model);
  if(issues.length){console.warn("Exchange Model issues:",issues);model.warnings.push(...issues)}
  console.log("Exchange Model:",model);
  const b=new Blob([JSON.stringify(model,null,2)],{type:"application/json"});
  const a=document.createElement("a");a.href=URL.createObjectURL(b);a.download=sfn()+".exchange.json";a.click();URL.revokeObjectURL(a.href);
  toast("交換モデル出力"+(issues.length?" (警告"+issues.length+"件)":""));
}

/* 後方互換: toPortableSong */
function toPortableSong(s){return toExchangeModel(s)}

/* ================================================================
   Phase 12: 共有モデル (Shared Model)
   ================================================================
   4層の責務:
   1. 内部編集モデル — editor内部で使用
   2. 保存モデル — schemaVersion付きJSON。復元のための完全保存
   3. 交換モデル — 外部変換用の中間表現（warnings/meta等含む）
   4. 共有モデル — 軽量な閲覧・共有向け表現。このJSONだけでTABビューアが組める
*/

function toSharedModel(s){
  const ex=toExchangeModel(s);
  return toSharedModelFromExchange(ex);
}

function toSharedModelFromExchange(ex){
  return{
    version:1,
    meta:{
      title:ex.meta&&ex.meta.title||"",
      tempo:ex.meta&&ex.meta.tempo||120,
      timeSignature:ex.meta&&ex.meta.timeSignature||{beats:4,beatUnit:4},
      tuning:ex.meta&&ex.meta.tuning||[]
    },
    summary:{
      measureCount:(ex.measures||[]).length,
      eventCount:(ex.events||[]).length,
      linkCount:(ex.links||[]).length,
      spanCount:(ex.spans||[]).length,
      hasLinks:(ex.links||[]).length>0,
      hasSpans:(ex.spans||[]).length>0,
      hasRepeat:(ex.measures||[]).some(m=>m.attrs&&(m.attrs.repeatStart||m.attrs.repeatEnd)),
      maxFret:Math.max(0,...(ex.events||[]).map(e=>e.fret||0))
    },
    measures:(ex.measures||[]).map(m=>({
      index:m.index,
      attrs:{repeatStart:!!(m.attrs&&m.attrs.repeatStart),repeatEnd:!!(m.attrs&&m.attrs.repeatEnd),ending:(m.attrs&&m.attrs.ending)||null},
      tickAttrs:(m.tickAttrs||[]).map(t=>({tick:t.tick,strum:t.strum||null,rest:!!t.rest}))
    })),
    events:(ex.events||[]).map(e=>({
      id:e.id,measureIdx:e.measureIdx,tick:e.tick,stringIndex:e.stringIndex,
      fret:e.fret,durationTick:e.durationTick,
      attrs:dc(e.attrs||{})
    })),
    links:(ex.links||[]).map(l=>({
      type:l.type,fromEventId:l.fromEventId,toEventId:l.toEventId||null,
      value:l.value!=null?l.value:null
    })),
    spans:(ex.spans||[]).map(sp=>({
      type:sp.type,
      start:{measureIdx:sp.start.measureIdx,tick:sp.start.tick},
      end:{measureIdx:sp.end.measureIdx,tick:sp.end.tick}
    }))
  };
}

function validateSharedModel(model){
  const issues=[];
  if(!model||typeof model!=="object")return["モデルがnull"];
  if(!model.version)issues.push("versionなし");
  if(!model.meta)issues.push("metaなし");
  if(!Array.isArray(model.measures))issues.push("measuresなし");
  if(!Array.isArray(model.events))issues.push("eventsなし");
  const ids=new Set();const ml=(model.measures||[]).length;
  (model.events||[]).forEach(e=>{
    if(ids.has(e.id))issues.push("重複ID: "+e.id);ids.add(e.id);
    if(e.measureIdx<0||e.measureIdx>=ml)issues.push("measureIdx範囲外: "+e.id);
    if(typeof e.tick!=="number"||e.tick<0)issues.push("tick不正: "+e.id);
  });
  (model.links||[]).forEach(l=>{
    if(!ids.has(l.fromEventId))issues.push("link from不在: "+l.fromEventId);
    if(l.toEventId&&!ids.has(l.toEventId))issues.push("link to不在: "+l.toEventId);
  });
  (model.spans||[]).forEach((sp,i)=>{
    if(!sp.start||!sp.end)issues.push("span #"+i+" 不正");
    else if(sp.start.measureIdx<0||sp.start.measureIdx>=ml||sp.end.measureIdx<0||sp.end.measureIdx>=ml)issues.push("span #"+i+" 範囲外");
  });
  (model.measures||[]).forEach((m,i)=>{
    (m.tickAttrs||[]).forEach(ta=>{if(typeof ta.tick!=="number")issues.push("tickAttr不正 m"+i)});
  });
  return issues;
}

function exportSharedJson(){
  const model=toSharedModel(song);
  const issues=validateSharedModel(model);
  if(issues.length)console.warn("Shared Model issues:",issues);
  const b=new Blob([JSON.stringify(model,null,2)],{type:"application/json"});
  const a=document.createElement("a");a.href=URL.createObjectURL(b);a.download=sfn()+".shared.json";a.click();URL.revokeObjectURL(a.href);
  toast("共有JSON出力"+(issues.length?" (警告"+issues.length+"件)":""));
}

/* --- localStorage: 作業中下書き --- */
function saveToLocalDraft(){try{localStorage.setItem(SK,JSON.stringify(serializeSong(song)));editorMeta.isDirty=false}catch(e){}}
function loadFromLocalDraft(){try{const d=localStorage.getItem(SK);return d?JSON.parse(d):null}catch(e){return null}}
/* 後方互換 */
function save(){saveToLocalDraft();scheduleAutoBackup()}
function loadLS(){return loadFromLocalDraft()}

/* ================================================================
   Phase 24: 保存スロット / 自動バックアップ / 復元導線
   ================================================================
   - スロット: 意図的に残す案（ユーザー明示操作）
   - autobackup: 事故対策（debounce自動保存、常に最新）
   - dirty: 未保存状態の追跡
   - 保存フォーマット: serializeSong() 統一（schemaVersion付き）
*/

const SLOT_COUNT=5;
const SLOT_PREFIX="tabEditor.slot.";
const AB_KEY="tabEditor.autobackup";

function makeStoredSnapshot(s){
  const data=serializeSong(s);
  return{savedAt:Date.now(),title:s.meta.title||"",measureCount:s.measures.length,
    eventCount:s.measures.reduce((n,m)=>n+(m.events?m.events.length:0),0),
    schemaVersion:data.schemaVersion,data};
}

/* --- スロット操作 --- */
function saveToSlot(n){
  try{localStorage.setItem(SLOT_PREFIX+n,JSON.stringify(makeStoredSnapshot(song)));editorMeta.isDirty=false;
    pushActionLog("Save slot "+n);toast("スロット"+n+"に保存")}catch(e){toast("保存失敗")}
}
function loadFromSlot(n){
  try{const raw=localStorage.getItem(SLOT_PREFIX+n);if(!raw){toast("スロット"+n+"は空");return}
    if(editorMeta.isDirty&&!confirm("未保存の変更があります。読み込みますか？"))return;
    const snap=JSON.parse(raw);applySong(snap.data);pushActionLog("Load slot "+n);toast("スロット"+n+"から読込")}catch(e){toast("読込失敗")}
}
function deleteSlot(n){
  if(!confirm("スロット"+n+"を削除しますか？"))return;
  localStorage.removeItem(SLOT_PREFIX+n);pushActionLog("Delete slot "+n);toast("スロット"+n+"を削除");renderSlotPanel();
}
function getSlotInfo(n){
  try{const raw=localStorage.getItem(SLOT_PREFIX+n);if(!raw)return null;
    const snap=JSON.parse(raw);return{title:snap.title||"",savedAt:snap.savedAt,measureCount:snap.measureCount,eventCount:snap.eventCount}}catch(e){return null}
}

/* --- 自動バックアップ --- */
function scheduleAutoBackup(){
  editorMeta.isDirty=true;
  if(_autoBackupTimer)clearTimeout(_autoBackupTimer);
  _autoBackupTimer=setTimeout(()=>{
    try{localStorage.setItem(AB_KEY,JSON.stringify(makeStoredSnapshot(song)))}catch(e){}
  },8000);/* 8秒無操作で自動保存 */
}
function loadAutoBackup(){
  try{const raw=localStorage.getItem(AB_KEY);if(!raw)return null;return JSON.parse(raw)}catch(e){return null}
}
function restoreAutoBackup(){
  const snap=loadAutoBackup();if(!snap||!snap.data){toast("自動バックアップなし");return}
  if(editorMeta.isDirty&&!confirm("未保存の変更があります。復元しますか？"))return;
  applySong(snap.data);pushActionLog("Restore autobackup");toast("自動バックアップから復元");
}
function clearAutoBackup(){localStorage.removeItem(AB_KEY)}

/* --- スロット一覧パネル --- */
function renderSlotPanel(){
  const el=document.getElementById("slot-panel-body");if(!el)return;
  let h="";
  for(let i=1;i<=SLOT_COUNT;i++){
    const info=getSlotInfo(i);
    if(info){
      const d=new Date(info.savedAt);const ts=d.toLocaleDateString()+" "+d.toLocaleTimeString().slice(0,5);
      h+='<div style="display:flex;align-items:center;gap:4px;margin:3px 0;font:11px var(--fu)">';
      h+='<span style="color:var(--ink2);min-width:16px">'+i+'</span>';
      h+='<span style="flex:1;color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="'+info.title+'">'+(info.title||"無題")+'</span>';
      h+='<span style="color:var(--ink4);font-size:9px">'+ts+'</span>';
      h+='<button class="ep-btn sm" style="font-size:9px;padding:1px 4px" data-slot-action="load" data-slot="'+i+'">読込</button>';
      h+='<button class="ep-btn sm" style="font-size:9px;padding:1px 4px" data-slot-action="save" data-slot="'+i+'">上書</button>';
      h+='<button class="ep-btn sm" style="font-size:9px;padding:1px 4px;color:#c44" data-slot-action="delete" data-slot="'+i+'">✕</button>';
      h+='</div>';
    }else{
      h+='<div style="display:flex;align-items:center;gap:4px;margin:3px 0;font:11px var(--fu)">';
      h+='<span style="color:var(--ink3);min-width:16px">'+i+'</span><span style="color:var(--ink4);flex:1">（空）</span>';
      h+='<button class="ep-btn sm" style="font-size:9px;padding:1px 4px" data-slot-action="save" data-slot="'+i+'">保存</button>';
      h+='</div>';
    }
  }
  const ab=loadAutoBackup();
  if(ab){
    const d=new Date(ab.savedAt);const ts=d.toLocaleDateString()+" "+d.toLocaleTimeString().slice(0,5);
    h+='<div style="border-top:1px solid var(--ui-bdr);margin-top:4px;padding-top:4px;font:10px var(--fu);color:var(--ink3)">';
    h+='自動BK: '+(ab.title||"無題")+' ('+ts+') ';
    h+='<button class="ep-btn sm" style="font-size:9px;padding:1px 4px" data-slot-action="restore-ab">復元</button>';
    h+='</div>';
  }
  el.innerHTML=h;
}

/* --- JSON ファイル書き出し / 読込 --- */
function exportSongJson(){
  song.measures.forEach(m=>srt(m));
  const data=serializeSong(song);
  const b=new Blob([JSON.stringify(data,null,2)],{type:"application/json"});
  const a=document.createElement("a");a.href=URL.createObjectURL(b);a.download=sfn()+".tab.json";a.click();URL.revokeObjectURL(a.href);
  toast("JSON書き出し完了");
}
/* Phase 24: 読込前の安全確認 */
function safeImportSongJson(){
  if(editorMeta.isDirty){
    if(!confirm("未保存の変更があります。\n読み込む前にスロット保存しますか？\n\n「OK」→スロット1に保存してから読込\n「キャンセル」→そのまま読込")){
      /* そのまま読込 */
    }else{
      saveToSlot(1);
    }
  }
  document.getElementById("jsonFileIn").click();
}

function importSongJson(file){
  const r=new FileReader();
  r.onload=function(ev){
    try{
      const raw=JSON.parse(ev.target.result);
      if(!raw||typeof raw!=="object"){toast("無効なファイル形式");return}
      if(!raw.meta&&!raw.measures){toast("TABデータではありません");return}
      pH();
      const data=deserializeSong(raw);
      const issues=validateSong(data);
      if(issues.length)console.warn("TAB import issues:",issues);
      applySong(data);
      toast("JSON読込完了"+(issues.length?" (警告"+issues.length+"件)":""));
    }catch(err){
      console.error("Import error:",err);
      toast("読込失敗: "+err.message);
    }
  };
  r.readAsText(file);
}
/* 後方互換 */
function exportJSON(){exportSongJson()}
function importJSON(f){importSongJson(f)}

function applySong(data){song=normalizeSong(data);state.song=song;syncUI();cur.dur=cur.dur;cur.dotted=cur.dotted;cur.inputMode=cur.inputMode;cur.inputString=0;sel.type="tick";sel.measureIdx=0;sel.tick=0;sel.eventId=null;sel.rangeStart=null;sel.rangeEnd=null;reconcileSelection();render();renderFB();save()}
function exportPNG(){if(!song.measures.length||song.measures.every(m=>!m.events.length)){toast("ノートなし");return}const ts=song.meta.timeSignature,total=mTk(ts),bt=ts.beatUnit===8?TPB/2:TPB;const staffH=NSTR*SH,canvasH=SP+staffH+16;const MPR=Math.min(4,song.measures.length),measW=220,clefW=28,padX=24,padY=20,titleH=40,metaH=24,rowGap=24,rowH=canvasH+rowGap;const rows=Math.ceil(song.measures.length/MPR);const totalW=padX*2+clefW+measW*MPR,totalH=padY+titleH+metaH+rows*rowH+padY;const cvs=document.createElement("canvas");const dpr=2;cvs.width=totalW*dpr;cvs.height=totalH*dpr;const ctx=cvs.getContext("2d");ctx.scale(dpr,dpr);ctx.fillStyle="#fff";ctx.fillRect(0,0,totalW,totalH);const ff=getComputedStyle(document.body).fontFamily;ctx.fillStyle="#111";ctx.font="bold 18px "+ff;ctx.textAlign="center";ctx.textBaseline="top";ctx.fillText(song.meta.title||"Untitled",totalW/2,padY);ctx.font="600 13px "+ff;ctx.fillStyle="#444";ctx.fillText("♩= "+song.meta.tempo+"   "+ts.beats+"/"+ts.beatUnit,totalW/2,padY+titleH-2);const startY=padY+titleH+metaH;for(let r=0;r<rows;r++){const oy=startY+r*rowH;ctx.fillStyle="#444";ctx.font="bold 10px Consolas, monospace";ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText("T",padX+clefW/2,oy+SP+staffH*0.25);ctx.fillText("A",padX+clefW/2,oy+SP+staffH*0.5);ctx.fillText("B",padX+clefW/2,oy+SP+staffH*0.75);for(let c=0;c<MPR;c++){const mi=r*MPR+c;if(mi>=song.measures.length)break;const meas=song.measures[mi];const o={ox:padX+clefW+c*measW,oy,measW,total,bt,staffH,mi,noteFont:"800 14px Consolas, Courier New, monospace"};const tg={};meas.events.forEach(e=>{if(!tg[e.startTick])tg[e.startTick]=[];tg[e.startTick].push(e)});const tl=Object.keys(tg).map(Number).sort((a,b)=>a-b);drawStaff(ctx,o);drawMeasureAttrs(ctx,o,meas);drawNotes(ctx,o,tg,tl);drawRhythm(ctx,o,tg,tl);drawLinks(ctx,o,meas);drawSpans(ctx,o,mi);drawTickAttrs(ctx,o,meas);drawRests(ctx,o,meas);ctx.fillStyle="#c04030";ctx.font="bold 10px "+ff;ctx.textAlign="left";ctx.textBaseline="bottom";ctx.fillText(""+(mi+1),o.ox+2,o.oy+SP-2)}}cvs.toBlob(function(bl){const u=URL.createObjectURL(bl);const a=document.createElement("a");a.href=u;a.download=sfn()+".png";a.click();URL.revokeObjectURL(u);toast("PNG保存")},"image/png")}
