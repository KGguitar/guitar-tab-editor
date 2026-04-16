/* ================================================================
   model.js — データ構造・正規化・整合チェック・低レベル更新
   ================================================================
   責務: songデータの形・整合・migrate。UI非依存。DOMを触らない。
   依存: なし（最下層）。将来 state.js のみに依存する形へ。
   
   グローバル変数 song, state を参照する関数あり（cleanupDanglingLinks等）。
   将来の純関数化で引数渡しに移行予定。
   
   このファイルは <script src="model.js"> で読み込む。
*/

/* ================================================================ CONFIG ================================================================ */
const TPB=96,GS=24,SK="tabEditorV6",FRETS=24,NSTR=6,SH=20,SP=44;
/* Phase 6: 描画レーン設計 — SP=44に拡張し上部に記号レーンを確保
   Y=0〜13:  measure.attrs (ending, repeat)
   Y=13〜25: spans (P.M., let ring)
   Y=25〜38: tickAttrs (strum) + rhythm (stem/beam/flag)
   Y=38〜44: 余白
   Y=44〜:   TAB弦線 + ノート数字 (6弦 × 20px = 120px)
   弦下方:   接続系記号 (弧線)
*/
const LANE={mAttr:2,span:14,rhythm:26,staff:SP};
const TUN={standard:["E4","B3","G3","D3","A2","E2"]};
const TLB={standard:["e","B","G","D","A","E"]};
const DOTS=[3,5,7,9,12,15,17,19,21,24],DDOTS=[12,24];
const DUR_OPTS=[{label:"♩ 4分",value:96},{label:"♪ 8分",value:48},{label:"♬ 16分",value:24}];
/* Phase 3: TECH_MAP — 新記号モデル一本化。fieldは廃止。 */
const TECH_MAP=[
  {id:"tie",label:"Tie",kind:"link",linkType:"tie"},
  {id:"hammer",label:"H",kind:"link",linkType:"hammer"},
  {id:"pull",label:"P",kind:"link",linkType:"pull"},
  {id:"slide",label:"S",kind:"link",linkType:"slide"},
];

/* ================================================================ UTIL ================================================================ */
let _i=0;
function uid(p){return p+"_"+(++_i)}function pTS(s){const p=s.split("/");return{beats:+p[0],beatUnit:+p[1]}}
function mTk(ts){return ts.beatUnit===4?ts.beats*TPB:ts.beatUnit===8?ts.beats*(TPB/2):ts.beats*TPB}
function dc(o){return JSON.parse(JSON.stringify(o))}

/* ===== 新記号モデル — デフォルト生成関数 ===== */

/* A. 単一ノート属性 */
function nAttrs(){return{vibrato:false,accent:false,staccato:false,ghost:false,dead:false,harmonic:false,tap:false,mute:false}}

/* B. ノート間接続 */
function nLink(type,extra){return{type:type,toEventId:null,value:null,meta:{},...(extra||{})}}
function nLinks(){return[]}

/* D. 小節属性 */
function nMeasureAttrs(){return{repeatStart:false,repeatEnd:false,repeatCount:2,ending:null,sectionLabel:null,barlineEnd:"single"}}

/* 小節生成 */
function nM(){return{id:uid("m"),events:[],attrs:nMeasureAttrs(),tickAttrs:{}/* tick番号文字列キー → {strum,rest,fermata等} */}}

/* ===== Link操作ヘルパー ===== */
function addLink(e,type,extra){if(!Array.isArray(e.links))e.links=[];if(e.links.some(l=>l.type===type))return;e.links.push(nLink(type,extra))}
function removeLinkByType(e,type){if(!Array.isArray(e.links))return;e.links=e.links.filter(l=>l.type!==type)}
function toggleLink(e,type,extra){if(!Array.isArray(e.links))e.links=[];if(e.links.some(l=>l.type===type)){removeLinkByType(e,type)}else{addLink(e,type,extra)}}
function setLinkTarget(e,type,targetId){const lk=getLinkByType(e,type);if(lk)lk.toEventId=targetId}
function clearLinkTarget(e,type){const lk=getLinkByType(e,type);if(lk)lk.toEventId=null}

/* ===== Phase 4: 接続先検索・候補ヘルパー ===== */

/* songから eventId で検索 → {measureIdx, event} or null */
function findEventById(eventId){
  for(let mi=0;mi<song.measures.length;mi++){
    const ev=song.measures[mi].events.find(e=>e.id===eventId);
    if(ev)return{measureIdx:mi,event:ev};
  }
  return null;
}

/* 同弦・同measure・startTick>fromTickの次ノートを配列で返す（tick昇順） */
function findNextOnSameString(mIdx,fromEvent){
  if(mIdx<0||mIdx>=song.measures.length)return[];
  return song.measures[mIdx].events
    .filter(e=>e.stringIndex===fromEvent.stringIndex&&e.startTick>fromEvent.startTick&&e.id!==fromEvent.id)
    .sort((a,b)=>a.startTick-b.startTick);
}

/* linkTypeに応じた候補一覧（同弦・同measure・後方ノート） */
function findLinkCandidates(mIdx,fromEvent,linkType){
  return findNextOnSameString(mIdx,fromEvent);
}

/* 自動候補: 最も近い同弦次ノートのIDを返す（無ければnull） */
function resolveAutoLinkTarget(mIdx,fromEvent,linkType){
  const cands=findLinkCandidates(mIdx,fromEvent,linkType);
  return cands.length?cands[0].id:null;
}

/* 人間可読な event 参照文字列 */
function getReadableEventRef(eventId){
  const r=findEventById(eventId);
  if(!r)return"(不明)";
  const e=r.event;
  return TLB.standard[e.stringIndex]+"弦 "+e.fret+"F @tick"+e.startTick;
}

/* 孤立リンクのクリーンアップ: 存在しないtoEventIdや自己参照を除去 */
function cleanupDanglingLinks(){
  const allIds=new Set();
  song.measures.forEach(m=>m.events.forEach(e=>allIds.add(e.id)));
  song.measures.forEach(m=>m.events.forEach(e=>{
    if(!Array.isArray(e.links))return;
    e.links.forEach(lk=>{
      if(lk.toEventId&&(!allIds.has(lk.toEventId)||lk.toEventId===e.id)){
        lk.toEventId=null;
      }
    });
  }));
}

/* ===== Attr操作ヘルパー ===== */
function toggleAttr(e,attrName){if(!e.attrs)e.attrs=nAttrs();e.attrs[attrName]=!e.attrs[attrName]}

/* ===== Phase 5: Span操作ヘルパー ===== */
function nSpan(type,start,end,meta){
  return{id:uid("span"),type:type,
    start:{measureIdx:start.measureIdx,tick:start.tick},
    end:{measureIdx:end.measureIdx,tick:end.tick},
    meta:{...(meta||{})}};
}
function addSpan(type,start,end,meta){
  if(!Array.isArray(song.spans))song.spans=[];
  /* start > end なら入替 */
  if(start.measureIdx>end.measureIdx||(start.measureIdx===end.measureIdx&&start.tick>end.tick)){
    const tmp=start;start=end;end=tmp;
  }
  song.spans.push(nSpan(type,start,end,meta));
}
function removeSpan(spanId){
  if(!Array.isArray(song.spans))return;
  song.spans=song.spans.filter(s=>s.id!==spanId);
}
function getSpansInMeasure(mi){
  if(!Array.isArray(song.spans))return[];
  return song.spans.filter(s=>s.start.measureIdx<=mi&&s.end.measureIdx>=mi);
}
function getSpansAtPosition(mi,tick){
  return getSpansInMeasure(mi).filter(s=>{
    const afterStart=mi>s.start.measureIdx||(mi===s.start.measureIdx&&tick>=s.start.tick);
    const beforeEnd=mi<s.end.measureIdx||(mi===s.end.measureIdx&&tick<=s.end.tick);
    return afterStart&&beforeEnd;
  });
}
function cleanupInvalidSpans(){
  if(!Array.isArray(song.spans))return;
  const ml=song.measures.length;
  song.spans=song.spans.filter(s=>{
    if(!s.start||!s.end)return false;
    if(s.start.measureIdx<0||s.start.measureIdx>=ml)return false;
    if(s.end.measureIdx<0||s.end.measureIdx>=ml)return false;
    if(s.start.measureIdx>s.end.measureIdx)return false;
    if(s.start.measureIdx===s.end.measureIdx&&s.start.tick>s.end.tick)return false;
    return true;
  });
}
function adjustSpanIndicesAfterInsert(atIdx){
  if(!Array.isArray(song.spans))return;
  song.spans.forEach(s=>{
    if(s.start.measureIdx>=atIdx)s.start.measureIdx++;
    if(s.end.measureIdx>=atIdx)s.end.measureIdx++;
  });
}
function adjustSpanIndicesAfterRemove(atIdx){
  if(!Array.isArray(song.spans))return;
  song.spans.forEach(s=>{
    if(s.start.measureIdx>atIdx)s.start.measureIdx--;
    if(s.end.measureIdx>atIdx)s.end.measureIdx--;
  });
  cleanupInvalidSpans();
}

/* ===== Phase 5: TickAttrs操作ヘルパー ===== */
function getTickAttrs(measure,tick){
  const key=String(tick);
  if(!measure.tickAttrs)measure.tickAttrs={};
  return measure.tickAttrs[key]||null;
}
function setTickAttr(measure,tick,patch){
  const key=String(tick);
  if(!measure.tickAttrs)measure.tickAttrs={};
  if(!measure.tickAttrs[key])measure.tickAttrs[key]={strum:null,rest:false};
  Object.assign(measure.tickAttrs[key],patch);
  /* 空なら削除 */
  const a=measure.tickAttrs[key];
  if(!a.strum&&!a.rest)delete measure.tickAttrs[key];
}

/* ===== Phase 5: MeasureAttrs操作ヘルパー ===== */
function toggleMeasureAttr(measure,key){
  if(!measure.attrs)measure.attrs=nMeasureAttrs();
  measure.attrs[key]=!measure.attrs[key];
}
function setMeasureEnding(measure,value){
  if(!measure.attrs)measure.attrs=nMeasureAttrs();
  measure.attrs.ending=value;
}

/* span作成用の一時記憶 — state.uiState に属する */

/* ================================================================
   Phase 26: 共有stateコンテナ
   ================================================================
   全主要stateの単一入口。将来 state.js への切り出し対象。
   既存コードとの互換のため、ショートカット変数（song, cur, sel等）を維持。
   これらは state.xxx への参照であり、state が正規の置き場。
   
   読み取り系: getCurrentMeasure, getSelectedEvent, getTickAttrs, isNoteSelected 等
     → state を読むが変更しない
   更新系: selectTick, setTickAttr, toggleAttr, applySong, undo/redo 等
     → state を変更してから render/save を呼ぶ
   
   基本パターン: action → state更新 → cleanup → render → save/toast/log
*/
/* state定義とショートカット変数は state.js へ移動済み (Phase 31) */

function migrateEvent(e){
  if(!e.attrs)e.attrs=nAttrs();
  else{const def=nAttrs();for(const k in def){if(!(k in e.attrs))e.attrs[k]=def[k]}}
  if(!Array.isArray(e.links))e.links=[];
  const t=e.technique;
  if(t){
    if(t.vibrato)e.attrs.vibrato=true;
    if(t.mute)e.attrs.mute=true;
    const has=(type)=>e.links.some(l=>l.type===type);
    if(t.tieNext&&!has("tie"))e.links.push(nLink("tie"));
    if(t.hammerOnToEventId&&!has("hammer"))e.links.push(nLink("hammer",{toEventId:t.hammerOnToEventId}));
    if(t.pullOffToEventId&&!has("pull"))e.links.push(nLink("pull",{toEventId:t.pullOffToEventId}));
    if(t.slideToEventId&&!has("slide"))e.links.push(nLink("slide",{toEventId:t.slideToEventId}));
    if(t.bend&&!has("bend"))e.links.push(nLink("bend",{value:t.bend}));
    /* Phase 3: 移行完了後に旧構造を削除 */
    delete e.technique;
  }
}

/* ===== 参照ヘルパー — 新構造のみ参照 ===== */
function getEventAttrs(e){return e.attrs||null}
function getEventLinks(e){return Array.isArray(e.links)?e.links:[]}
function hasLinkType(e,type){return getEventLinks(e).some(l=>l.type===type)}
function getLinkByType(e,type){return getEventLinks(e).find(l=>l.type===type)||null}
function eventHasVibrato(e){return!!(e.attrs&&e.attrs.vibrato)}
function eventHasMute(e){return!!(e.attrs&&e.attrs.mute)}
function eventHasTechById(e,techId){
  const t=TECH_MAP.find(x=>x.id===techId);
  return t?hasLinkType(e,t.linkType):false;
}

function srt(m){m.events.sort((a,b)=>a.startTick!==b.startTick?a.startTick-b.startTick:a.stringIndex-b.stringIndex)}
function nSong(){return{meta:{title:"タイトル入力",tempo:120,timeSignature:{beats:4,beatUnit:4},tuningPreset:"standard",tuning:[...TUN.standard],showBpm:true,showTS:true},measures:[nM(),nM(),nM(),nM()],spans:[]}}
function sfn(){const t=(song.meta.title||"").trim();return t.length?t.replace(/[\\/:*?"<>|]/g,"_"):"untitled"}
