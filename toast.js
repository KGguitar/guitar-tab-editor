/* ================================================================
   toast.js — 一時通知表示（トースト）
   ================================================================
   責務: 画面下部 #toast 要素へのメッセージ表示とタイマー管理のみ。
         stateを持たない。編集ロジック・render本体を持たない。
   依存: DOM要素 #toast のみ。

   連続表示時は前タイマーをclearして重ね合わせない。
   呼び出し側は従来通り toast("...") で利用する（互換維持）。
   showToast は toast のエイリアスとして公開。
*/

let _toastT=null;
function toast(msg,ms){
  const el=document.getElementById("toast");if(!el)return;
  el.textContent=msg;el.classList.add("show");
  if(_toastT)clearTimeout(_toastT);
  _toastT=setTimeout(()=>{el.classList.remove("show")},ms||1200);
}
/* 明示呼び出し用の別名 — 既存の toast(...) はそのまま動く */
function showToast(msg,ms){toast(msg,ms)}
