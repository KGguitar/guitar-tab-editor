/* ================================================================
   storage-slots.js — localStorage 保存スロット / autobackup / draft 運用
   ================================================================
   責務: ブラウザ内保存（localStorage）のデータ運用のみ。
         - 下書き(draft): 常時書き込む作業中データ（key: SK）
         - スロット(slot): ユーザー明示の名前付き保存枠（1..SLOT_COUNT）
         - 自動バックアップ(autobackup): debounceで書かれる最新スナップ
         - 起動時 restore 候補判定

   ここは純粋ではないが、以下は絶対に持ち込まない:
         dialog/confirm、toast、ボタン操作、パネル描画、DOM構築。
         それらは呼び出し側(io.js/ui-app.js)の責務。

   依存: グローバル関数 serializeSong (io.js), グローバル変数 song (state.js),
         SK (model.js), _autoBackupTimer (state.js)

   このファイルは model.js / state.js の後、io.js より前（または後）に
   読み込む。関数は全て runtime 解決なので順序は緩い。
*/

/* --- 定数: localStorage key ---
   DRAFT_KEY は model.js の SK と同一（歴史的経緯）。 */
const SLOT_COUNT=5;
const SLOT_PREFIX="tabEditor.slot.";
const AB_KEY="tabEditor.autobackup";

/* --- 保存スナップショット生成 --- */
function makeStoredSnapshot(s){
  const data=serializeSong(s);
  return{
    savedAt:Date.now(),
    title:s.meta.title||"",
    measureCount:s.measures.length,
    eventCount:s.measures.reduce((n,m)=>n+(m.events?m.events.length:0),0),
    schemaVersion:data.schemaVersion,
    data
  };
}

/* ================================================================
   Draft (作業中下書き) — SK key
   ================================================================ */
function draftWrite(s){
  try{localStorage.setItem(SK,JSON.stringify(serializeSong(s)));return true}
  catch(e){return false}
}
function draftRead(){
  try{const d=localStorage.getItem(SK);return d?JSON.parse(d):null}
  catch(e){return null}
}
function draftClear(){try{localStorage.removeItem(SK)}catch(e){}}

/* ================================================================
   Slot (名前付き保存枠) — SLOT_PREFIX + n
   ================================================================ */
function slotStorageWrite(n,s){
  try{localStorage.setItem(SLOT_PREFIX+n,JSON.stringify(makeStoredSnapshot(s)));return true}
  catch(e){return false}
}
function slotStorageRead(n){
  try{const raw=localStorage.getItem(SLOT_PREFIX+n);return raw?JSON.parse(raw):null}
  catch(e){return null}
}
function slotStorageDelete(n){try{localStorage.removeItem(SLOT_PREFIX+n)}catch(e){}}
function slotStorageInfo(n){
  const snap=slotStorageRead(n);if(!snap)return null;
  return{
    title:snap.title||"",
    savedAt:snap.savedAt,
    measureCount:snap.measureCount,
    eventCount:snap.eventCount
  };
}
function slotStorageListInfos(){
  const out=[];
  for(let i=1;i<=SLOT_COUNT;i++){out.push({index:i,info:slotStorageInfo(i)})}
  return out;
}

/* ================================================================
   AutoBackup — AB_KEY
   ================================================================ */
function autoBackupWriteNow(s){
  try{localStorage.setItem(AB_KEY,JSON.stringify(makeStoredSnapshot(s)));return true}
  catch(e){return false}
}
function autoBackupRead(){
  try{const raw=localStorage.getItem(AB_KEY);return raw?JSON.parse(raw):null}
  catch(e){return null}
}
function autoBackupClear(){try{localStorage.removeItem(AB_KEY)}catch(e){}}
/* debounce書き込み。_autoBackupTimer は state.js の global を共有。 */
function autoBackupSchedule(s,delayMs){
  if(_autoBackupTimer)clearTimeout(_autoBackupTimer);
  _autoBackupTimer=setTimeout(()=>{autoBackupWriteNow(s)},delayMs||8000);
}

/* ================================================================
   起動時 restore 候補判定
   ================================================================ */
function getRestoreCandidates(){
  const draft=draftRead();
  const ab=autoBackupRead();
  return{
    draft:draft,
    autobackup:ab,
    hasDraft:!!draft,
    hasAutobackup:!!ab
  };
}
