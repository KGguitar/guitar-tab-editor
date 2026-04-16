/* ================================================================
   render.js — Canvas描画・パネル表示更新・指板描画
   ================================================================
   責務: stateを読んでDOM/Canvasに反映する表示専用層。
         songを書き換えない。selectionを変更しない。
   依存: グローバル変数 song, sel, cur, playback, state, appMode,
         TPB, GS, NSTR, SH, SP, LANE, TUN, TLB, DOTS, DDOTS, DUR_OPTS,
         TECH_MAP, FRETS, MEASURES_PER_ROW,
         mTk, dc, FF, isNoteSelected, isTickSelected, isRangeSelected,
         isMeasureSelected, isChordMode, getSelectedEvent, getCurrentMeasure,
         getEventsAtTick, hasEventsAtTick, hasMultipleEventsAtTick,
         getSpansInMeasure, hasLinkType, getLinkByType, getEventLinks,
         getTickAttrs, hasCopied, selLabel, sfn,
         toast, pushActionLog, save, focus
   
   このファイルは model.js, selection-edit.js の後に読み込む。
*/

const MEASURES_PER_ROW=2;
/* Phase 29修正: 切り出し漏れ関数を復元 */
function getBestTickFromPointer(px,meas,measW,total){const snap=getTapSnapStep();const rawTick=(px/measW)*total;const evtTicks=[...new Set(meas.events.map(e=>e.startTick))];if(evtTicks.length){let closest=evtTicks[0];evtTicks.forEach(t=>{if(Math.abs(t-rawTick)<Math.abs(closest-rawTick))closest=t});const colW=measW/Math.floor(total/snap);const evtPx=(closest/total)*measW;if(Math.abs(evtPx-px)<Math.min(20,colW*0.45))return Math.max(0,Math.min(closest,total-snap))}return Math.max(0,Math.min(Math.round(rawTick/snap)*snap,total-snap))}
function tickXCenter(tick,o){return o.ox+(tick/o.total)*o.measW+(GS/o.total)*o.measW/2}

/* 旧drawMeasureBase/drawMeasureNotes — Phase 6で drawStaff/drawNotes/drawRhythm/drawLinks等に分離済み */


function drawCursor(ctx,o,meas){
  const total=o.total,measW=o.measW,staffH=o.staffH;
  const canvasH=SP+staffH;const chord=isChordMode();

  /* Range選択帯: この小節に含まれる範囲を描画 */
  if(isRangeSelected()){
    const rs=sel.rangeStart,re=sel.rangeEnd;
    let rx1=null,rx2=null;
    if(rs.measureIdx<=o.mi&&re.measureIdx>=o.mi){
      rx1=(rs.measureIdx===o.mi)?(rs.tick/total)*measW:0;
      rx2=(re.measureIdx===o.mi)?(re.tick/total)*measW+(cur.dur/total)*measW:measW;
      ctx.fillStyle="rgba(80,180,80,.1)";ctx.fillRect(rx1,0,rx2-rx1,canvasH);
      ctx.strokeStyle="rgba(80,180,80,.4)";ctx.lineWidth=1;
      ctx.strokeRect(rx1+0.5,0.5,rx2-rx1-1,canvasH-1);
    }
  }

  /* Measure選択枠 */
  if(isMeasureSelected()&&o.mi===sel.measureIdx){
    ctx.strokeStyle="rgba(180,80,180,.4)";ctx.lineWidth=2;
    ctx.strokeRect(1,1,measW-2,canvasH-2);
  }

  /* Tick/Note選択 */
  if(o.mi!==sel.measureIdx||(sel.type!=="tick"&&sel.type!=="note"))return;
  const cx=(sel.tick/total)*measW;const cw2=(cur.dur/total)*measW;
  const multi=hasMultipleEventsAtTick(meas,sel.tick);
  const alpha=chord?"rgba(224,112,32,":"rgba(50,130,240,";
  const alphaStrong=chord?"rgba(224,112,32,":"rgba(42,122,245,";

  /* Tick帯 */
  ctx.fillStyle=multi?alphaStrong+".18)":alpha+".13)";ctx.fillRect(cx,0,cw2,canvasH);
  ctx.fillStyle=multi?alphaStrong+".62)":alphaStrong+".4)";
  ctx.fillRect(cx,SP-1.5,cw2,2);ctx.fillRect(cx,SP+staffH-0.5,cw2,2);
  ctx.strokeStyle=multi?alphaStrong+".75)":alphaStrong+".45)";ctx.lineWidth=1;
  ctx.beginPath();ctx.moveTo(cx+0.5,0);ctx.lineTo(cx+0.5,canvasH);ctx.stroke();
  ctx.beginPath();ctx.moveTo(cx+cw2-0.5,0);ctx.lineTo(cx+cw2-0.5,canvasH);ctx.stroke();
  const mx2=cx+cw2/2;ctx.fillStyle=multi?alphaStrong+".9)":alphaStrong+".75)";
  ctx.beginPath();ctx.moveTo(mx2-5,0);ctx.lineTo(mx2+5,0);ctx.lineTo(mx2,6);ctx.closePath();ctx.fill();

  /* Input string indicator */
  const sy=SP+cur.inputString*SH;
  ctx.fillStyle=chord?"rgba(224,112,32,.15)":"rgba(42,122,245,.12)";
  ctx.fillRect(cx+1,sy,cw2-2,SH);
  ctx.strokeStyle=chord?"rgba(224,112,32,.7)":"rgba(42,122,245,.6)";
  ctx.lineWidth=1.5;ctx.strokeRect(cx+1,sy+0.5,cw2-2,SH-1);

  /* Note選択: 特定ノートにglow強調 */
  if(isNoteSelected()){
    const ne=meas.events.find(e=>e.id===sel.eventId);
    if(ne){
      const xC=tickXCenter(ne.startTick,o);
      const ny=o.oy+SP+ne.stringIndex*SH+SH/2;
      ctx.strokeStyle="rgba(220,80,40,.8)";ctx.lineWidth=2.5;
      ctx.beginPath();ctx.arc(xC,ny,12,0,Math.PI*2);ctx.stroke();
      ctx.fillStyle="rgba(220,80,40,.12)";
      ctx.beginPath();ctx.arc(xC,ny,12,0,Math.PI*2);ctx.fill();
    }
  }

  /* Phase 22: 再生範囲ハイライト（薄い青帯 + 開始/終了マーカー） */
  const pr=playback.playRange;
  if(pr.enabled&&pr.start&&pr.end){
    if(pr.start.measureIdx<=o.mi&&pr.end.measureIdx>=o.mi){
      let rx1=(pr.start.measureIdx===o.mi)?(pr.start.tick/total)*measW:0;
      let rx2=(pr.end.measureIdx===o.mi)?(pr.end.tick/total)*measW+(cur.dur/total)*measW:measW;
      ctx.fillStyle="rgba(100,140,220,.06)";ctx.fillRect(rx1,0,rx2-rx1,canvasH);
      /* 開始マーカー */
      if(pr.start.measureIdx===o.mi){
        ctx.strokeStyle="rgba(60,100,200,.5)";ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(rx1+1,0);ctx.lineTo(rx1+1,canvasH);ctx.stroke();
        ctx.fillStyle="rgba(60,100,200,.7)";ctx.beginPath();ctx.moveTo(rx1,0);ctx.lineTo(rx1+8,0);ctx.lineTo(rx1,8);ctx.closePath();ctx.fill();
      }
      /* 終了マーカー */
      if(pr.end.measureIdx===o.mi){
        ctx.strokeStyle="rgba(60,100,200,.5)";ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(rx2-1,0);ctx.lineTo(rx2-1,canvasH);ctx.stroke();
        ctx.fillStyle="rgba(60,100,200,.7)";ctx.beginPath();ctx.moveTo(rx2,0);ctx.lineTo(rx2-8,0);ctx.lineTo(rx2,8);ctx.closePath();ctx.fill();
      }
    }
  }

  /* Phase 22: 再生中の拍位置強調（現在再生小節の1拍目と現拍を軽くハイライト） */
  if(playback.isPlaying&&playback.currentMeasureIdx===o.mi){
    const beatTick=o.bt;
    const curBeat=Math.floor(playback.currentTick/beatTick);
    for(let b=0;b<Math.ceil(total/beatTick);b++){
      const bx=(b*beatTick/total)*measW;
      if(b===curBeat){
        ctx.fillStyle="rgba(40,180,80,.06)";ctx.fillRect(bx,SP,beatTick/total*measW,staffH);
      }
      if(b===0){
        ctx.strokeStyle="rgba(40,180,80,.2)";ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(bx+0.5,SP);ctx.lineTo(bx+0.5,SP+staffH);ctx.stroke();
      }
    }
  }

  /* Phase 22: 再生位置ハイライト（緑ヘッド — 太縦線 + 三角マーカー） */
  if(playback.isPlaying&&playback.currentMeasureIdx===o.mi){
    const px=(playback.currentTick/total)*measW;const pw=(cur.dur/total)*measW;
    ctx.fillStyle="rgba(40,180,80,.18)";ctx.fillRect(px,0,pw,canvasH);
    ctx.strokeStyle="rgba(30,160,60,.75)";ctx.lineWidth=2.5;
    ctx.beginPath();ctx.moveTo(px+1,0);ctx.lineTo(px+1,canvasH);ctx.stroke();
    /* 上部三角マーカー */
    ctx.fillStyle="rgba(30,160,60,.85)";ctx.beginPath();ctx.moveTo(px-4,0);ctx.lineTo(px+6,0);ctx.lineTo(px+1,7);ctx.closePath();ctx.fill();
  }
}

/* ===== Phase 6: 描画レーン対応 — 責務分離 ===== */
const FF=()=>getComputedStyle(document.body).fontFamily;

/* 1. drawStaff: TAB弦線・小節線・拍グリッド */
function drawStaff(ctx,o){
  ctx.strokeStyle="#aaa";ctx.lineWidth=0.8;
  for(let s=0;s<NSTR;s++){const y=o.oy+SP+s*SH+SH/2;ctx.beginPath();ctx.moveTo(o.ox,y);ctx.lineTo(o.ox+o.measW,y);ctx.stroke()}
  /* bar lines */
  ctx.strokeStyle="#666";ctx.lineWidth=0.8;
  [o.ox+0.75,o.ox+o.measW-0.75].forEach(x=>{ctx.beginPath();ctx.moveTo(x,o.oy+SP);ctx.lineTo(x,o.oy+SP+o.staffH);ctx.stroke()});
  /* beat grid */
  ctx.strokeStyle="#ddd";ctx.lineWidth=0.5;
  for(let t=o.bt;t<o.total;t+=o.bt){const x=o.ox+(t/o.total)*o.measW;ctx.beginPath();ctx.moveTo(x,o.oy+SP);ctx.lineTo(x,o.oy+SP+o.staffH);ctx.stroke()}
}

/* 2. drawNotes: フレット数字 */
function drawNotes(ctx,o,tg,tl){
  const isCur=o.mi===sel.measureIdx;
  const ff=FF();
  tl.forEach(tick=>{
    const evts=tg[tick];const xC=tickXCenter(tick,o);const isCurT=isCur&&tick===sel.tick;
    if(evts.length>=2){ctx.fillStyle="rgba(180,140,60,.03)";ctx.fillRect(xC-8,o.oy+SP,16,o.staffH)}
    evts.forEach(e=>{
      const ny=o.oy+SP+e.stringIndex*SH+SH/2;
      const a=e.attrs||{};
      const isDead=!!a.dead;const isGhost=!!a.ghost;const isHarm=!!a.harmonic;const isAccent=!!a.accent;

      /* テキスト決定 */
      let txt=isDead?"x":""+e.fret;
      if(isGhost)txt="("+e.fret+")";
      if(isHarm)txt="<"+e.fret+">";
      ctx.font=isGhost?"600 13px "+ff.split(",")[0]+",monospace":o.noteFont;
      const tw=ctx.measureText(txt).width;

      if(isCurT){const r=Math.max(tw/2+5,10);ctx.fillStyle=evts.length>1?"rgba(42,122,245,.18)":"rgba(42,122,245,.10)";ctx.beginPath();ctx.arc(xC,ny,r,0,Math.PI*2);ctx.fill()}
      ctx.fillStyle="#fff";ctx.fillRect(xC-tw/2-3,ny-8,tw+6,16);
      if(isCurT){const r2=Math.max(tw/2+4,9);ctx.strokeStyle=evts.length>1?"rgba(42,122,245,.75)":"rgba(42,122,245,.45)";ctx.lineWidth=1.2;ctx.beginPath();ctx.arc(xC,ny,r2,0,Math.PI*2);ctx.stroke()}

      /* 色: ghost=薄い、harmonic=青緑、dead=赤みグレー */
      ctx.fillStyle=isGhost?"#999":isHarm?"#1a7a6a":isDead?"#a04040":"#111";
      ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText(txt,xC,ny);
      ctx.font=o.noteFont;/* リセット */

      /* accent: ノート直上に > マーク */
      if(isAccent){
        ctx.fillStyle="#c04030";ctx.font="700 10px "+ff;ctx.textAlign="center";ctx.textBaseline="bottom";
        ctx.fillText(">",xC,ny-9);ctx.font=o.noteFont;
      }
    });
  });
}

/* 3. drawRhythm: ステム・ビーム・フラグ（レーン上部 LANE.rhythm） */
function drawRhythm(ctx,o,tg,tl){
  const bt=o.bt;const bg=[];let cg=[];
  tl.forEach(t=>{const bs=Math.floor(t/bt)*bt;if(!cg.length){cg.push(t)}else{if(Math.floor(cg[0]/bt)*bt===bs){cg.push(t)}else{bg.push(cg);cg=[t]}}});
  if(cg.length)bg.push(cg);

  const stemTop=o.oy+LANE.rhythm;
  const stemLen=SP-LANE.rhythm-2;

  bg.forEach(group=>{
    const notes=group.map(tick=>{
      const evts=tg[tick];const dur=evts[0].durationTick;const xC=tickXCenter(tick,o);
      return{tick,dur,xCenter:xC,stemBottom:stemTop+stemLen};
    });

    if(group.length>1&&notes.every(n=>n.dur<=48)){
      /* Beamed group */
      ctx.strokeStyle="#444";ctx.lineWidth=1.2;
      notes.forEach(n=>{ctx.beginPath();ctx.moveTo(n.xCenter,stemTop+2);ctx.lineTo(n.xCenter,n.stemBottom);ctx.stroke()});
      /* Primary beam (8th) */
      ctx.lineWidth=2.2;ctx.beginPath();ctx.moveTo(notes[0].xCenter,stemTop+2);ctx.lineTo(notes[notes.length-1].xCenter,stemTop+2);ctx.stroke();
      /* 16th sub-beams */
      ctx.lineWidth=2.2;
      for(let i=0;i<notes.length;i++){
        if(notes[i].dur<=24){
          let j=i;while(j<notes.length-1&&notes[j+1].dur<=24)j++;
          if(j>i){ctx.beginPath();ctx.moveTo(notes[i].xCenter,stemTop+6);ctx.lineTo(notes[j].xCenter,stemTop+6);ctx.stroke()}
          else{const nb=i>0?notes[i-1]:notes[Math.min(i+1,notes.length-1)];const dir=nb.xCenter>notes[i].xCenter?1:-1;const len=Math.min(8,Math.abs(nb.xCenter-notes[i].xCenter)*0.4);ctx.beginPath();ctx.moveTo(notes[i].xCenter,stemTop+6);ctx.lineTo(notes[i].xCenter+dir*len,stemTop+6);ctx.stroke()}
          i=j;
        }
      }
    }else{
      /* Individual notes with flags */
      notes.forEach(n=>{
        ctx.strokeStyle="#444";
        if(n.dur>=TPB*4){/* whole: no stem, open ellipse */
          ctx.lineWidth=1.3;ctx.beginPath();ctx.ellipse(n.xCenter,stemTop+6,5,3.5,0,0,Math.PI*2);ctx.stroke();
        }else if(n.dur>=TPB*2){/* half: stem + open head */
          ctx.lineWidth=1.2;ctx.beginPath();ctx.moveTo(n.xCenter,stemTop+2);ctx.lineTo(n.xCenter,n.stemBottom);ctx.stroke();
          ctx.beginPath();ctx.ellipse(n.xCenter,stemTop+5,4,3,0,0,Math.PI*2);ctx.stroke();
        }else{/* quarter/8th/16th: stem + flags */
          ctx.lineWidth=1.2;ctx.beginPath();ctx.moveTo(n.xCenter,stemTop+2);ctx.lineTo(n.xCenter,n.stemBottom);ctx.stroke();
          if(n.dur<=48){ctx.lineWidth=1.3;ctx.beginPath();ctx.moveTo(n.xCenter,stemTop+2);ctx.quadraticCurveTo(n.xCenter+8,stemTop+8,n.xCenter+5,stemTop+13);ctx.stroke()}
          if(n.dur<=24){ctx.beginPath();ctx.moveTo(n.xCenter,stemTop+7);ctx.quadraticCurveTo(n.xCenter+8,stemTop+13,n.xCenter+5,stemTop+18);ctx.stroke()}
        }
      });
    }
  });

  /* Dotted markers */
  [TPB*6,TPB*3,TPB*1.5,TPB*0.75,TPB*0.375].forEach(dd=>{
    tl.forEach(tick=>{if(tg[tick]&&tg[tick][0].durationTick===Math.floor(dd)){
      const xC=tickXCenter(tick,o);ctx.fillStyle="#444";ctx.beginPath();ctx.arc(xC+7,stemTop+10,1.5,0,Math.PI*2);ctx.fill();
    }});
  });
}

/* 4. drawRests: 休符描画（tickAttrs.restがあるtick、リズムレーンに配置） */
function drawRests(ctx,o,meas){
  if(!meas.tickAttrs)return;
  Object.keys(meas.tickAttrs).forEach(key=>{
    const tick=+key;const ta=meas.tickAttrs[key];if(!ta||!ta.rest)return;
    const xC=tickXCenter(tick,o);
    const y=o.oy+LANE.rhythm+4;
    ctx.fillStyle="#666";
    /* 簡易休符記号: 4分=■的、8分=7的、16分=7+点 */
    const d=cur.dur;
    ctx.font="700 11px "+FF();ctx.textAlign="center";ctx.textBaseline="top";
    if(d>=TPB){/* 4分休符風 */
      ctx.fillRect(xC-3,y,6,4);ctx.fillRect(xC-1,y+4,4,3);ctx.fillRect(xC-3,y+7,6,4);
    }else if(d>=TPB/2){/* 8分休符風 */
      ctx.fillText("𝄾",xC,y);
    }else{/* 16分休符風 */
      ctx.fillText("𝄿",xC,y);
    }
  });
}

/* 5. drawLinks: 接続系記号 — ノート下方に弧線配置 */
function drawLinks(ctx,o,meas){
  const ff=FF();
  meas.events.forEach(e=>{
    const hasTie=hasLinkType(e,"tie"),hasH=hasLinkType(e,"hammer"),hasP=hasLinkType(e,"pull"),hasS=hasLinkType(e,"slide");
    if(!hasTie&&!hasH&&!hasP&&!hasS)return;
    const x1=tickXCenter(e.startTick,o);
    const ny=o.oy+SP+e.stringIndex*SH+SH/2;

    const resolveTarget=(linkType)=>{
      const lk=getLinkByType(e,linkType);
      if(lk&&lk.toEventId){const target=meas.events.find(ev=>ev.id===lk.toEventId);if(target)return target}
      return meas.events.find(n=>n.stringIndex===e.stringIndex&&n.startTick>e.startTick)||null;
    };

    /* Tie/H/P: 弧線をノート下方に描画 */
    const arcTypes=[];
    if(hasTie)arcTypes.push("tie");if(hasH)arcTypes.push("hammer");if(hasP)arcTypes.push("pull");

    arcTypes.forEach(lt=>{
      const ne=resolveTarget(lt);
      let x2=ne?tickXCenter(ne.startTick,o):x1+30;
      if(x2>o.ox+o.measW-4)x2=o.ox+o.measW-4;
      const ay=ny+10;const mx=(x1+x2)/2;const bu=7;
      ctx.strokeStyle=ne?"#444":"#bbb";ctx.lineWidth=1.2;
      ctx.beginPath();ctx.moveTo(x1+3,ay);ctx.quadraticCurveTo(mx,ay+bu,x2-3,ay);ctx.stroke();
      if(lt==="hammer"){ctx.fillStyle="#555";ctx.font="600 8px "+ff;ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText("H",mx,ay+bu)}
      if(lt==="pull"){ctx.fillStyle="#555";ctx.font="600 8px "+ff;ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText("P",mx,ay+bu)}
    });

    /* Slide: 斜め線 */
    if(hasS){
      const ne=resolveTarget("slide");
      let x2=ne?tickXCenter(ne.startTick,o):x1+30;
      if(x2>o.ox+o.measW-4)x2=o.ox+o.measW-4;
      ctx.strokeStyle=ne?"#444":"#bbb";ctx.lineWidth=1.2;
      if(ne&&ne.fret>e.fret){ctx.beginPath();ctx.moveTo(x1+5,ny+5);ctx.lineTo(x2-5,ny-5);ctx.stroke()}
      else{ctx.beginPath();ctx.moveTo(x1+5,ny-5);ctx.lineTo(x2-5,ny+5);ctx.stroke()}
      const mx=(x1+x2)/2;
      ctx.fillStyle="#555";ctx.font="600 8px "+ff;ctx.textAlign="center";ctx.textBaseline="bottom";
      ctx.fillText("S",mx,ny-6);
    }
  });
}

/* 6. drawTickAttrs: strum矢印（リズムレーン付近） */
function drawTickAttrs(ctx,o,meas){
  if(!meas.tickAttrs)return;
  Object.keys(meas.tickAttrs).forEach(key=>{
    const tick=+key;const ta=meas.tickAttrs[key];if(!ta)return;
    const xC=tickXCenter(tick,o);
    if(ta.strum==="down"||ta.strum==="up"){
      ctx.fillStyle="#555";ctx.font="600 11px "+FF();ctx.textAlign="center";ctx.textBaseline="bottom";
      ctx.fillText(ta.strum==="down"?"↓":"↑",xC,o.oy+LANE.rhythm);
    }
  });
}

/* 7. drawSpans: P.M./let ring — spanレーンに配置 */
function drawSpans(ctx,o,mi){
  const spans=getSpansInMeasure(mi);if(!spans.length)return;
  const total=o.total;
  /* 段分け: palmMuteとletRingを別段に */
  const pmSpans=spans.filter(s=>s.type==="palmMute");
  const lrSpans=spans.filter(s=>s.type==="letRing");

  const drawSpanRow=(spList,label,color,yBase)=>{
    spList.forEach(sp=>{
      let x1,x2;
      if(sp.start.measureIdx===mi){x1=(sp.start.tick/total)*o.measW}else{x1=0}
      if(sp.end.measureIdx===mi){x2=(sp.end.tick/total)*o.measW+GS/total*o.measW}else{x2=o.measW}
      x1=Math.max(x1,2);x2=Math.min(x2,o.measW-2);
      ctx.fillStyle=color;ctx.font="600 8px "+FF();ctx.textAlign="left";ctx.textBaseline="top";
      ctx.fillText(label,o.ox+x1,o.oy+yBase);
      const textW=ctx.measureText(label).width;
      ctx.strokeStyle=color;ctx.lineWidth=0.8;ctx.setLineDash([3,2]);
      ctx.beginPath();ctx.moveTo(o.ox+x1+textW+2,o.oy+yBase+4);ctx.lineTo(o.ox+x2,o.oy+yBase+4);ctx.stroke();
      ctx.setLineDash([]);
    });
  };

  drawSpanRow(pmSpans,"P.M.","#b05818",LANE.span);
  drawSpanRow(lrSpans,"let ring","#1878a0",LANE.span+9);
}

/* 8. drawMeasureAttrs: repeat/ending — 最上段レーンに配置 */
function drawMeasureAttrs(ctx,o,meas){
  const a=meas.attrs;if(!a)return;
  const staffTop=o.oy+SP;const staffBot=o.oy+SP+o.staffH;

  /* Repeat start */
  if(a.repeatStart){
    ctx.fillStyle="#333";ctx.strokeStyle="#333";
    ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(o.ox+2,staffTop);ctx.lineTo(o.ox+2,staffBot);ctx.stroke();
    ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(o.ox+7,staffTop);ctx.lineTo(o.ox+7,staffBot);ctx.stroke();
    const dy1=staffTop+o.staffH*0.35,dy2=staffTop+o.staffH*0.65;
    ctx.beginPath();ctx.arc(o.ox+13,dy1,2.5,0,Math.PI*2);ctx.fill();
    ctx.beginPath();ctx.arc(o.ox+13,dy2,2.5,0,Math.PI*2);ctx.fill();
  }
  /* Repeat end */
  if(a.repeatEnd){
    const rx=o.ox+o.measW;
    ctx.fillStyle="#333";ctx.strokeStyle="#333";
    ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(rx-2,staffTop);ctx.lineTo(rx-2,staffBot);ctx.stroke();
    ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(rx-7,staffTop);ctx.lineTo(rx-7,staffBot);ctx.stroke();
    const dy1=staffTop+o.staffH*0.35,dy2=staffTop+o.staffH*0.65;
    ctx.beginPath();ctx.arc(rx-13,dy1,2.5,0,Math.PI*2);ctx.fill();
    ctx.beginPath();ctx.arc(rx-13,dy2,2.5,0,Math.PI*2);ctx.fill();
  }
  /* Ending bracket */
  if(a.ending){
    const ey=o.oy+LANE.mAttr;
    ctx.fillStyle="#555";ctx.font="600 9px "+FF();ctx.textAlign="left";ctx.textBaseline="top";
    ctx.fillText(a.ending+".",o.ox+6,ey);
    ctx.strokeStyle="#777";ctx.lineWidth=0.8;
    ctx.beginPath();ctx.moveTo(o.ox+1,ey);ctx.lineTo(o.ox+o.measW*0.5,ey);ctx.stroke();
    ctx.beginPath();ctx.moveTo(o.ox+1,ey);ctx.lineTo(o.ox+1,ey+10);ctx.stroke();
  }
}

/* ===== Orchestrator: renderMeasureCanvas ===== */
function renderMeasureCanvas(meas,mi,measW,canvasH,total,bt,staffH){
  const cvs=document.createElement("canvas");const dpr=window.devicePixelRatio||1;
  cvs.width=measW*dpr;cvs.height=canvasH*dpr;cvs.style.width=measW+"px";cvs.style.height=canvasH+"px";
  const ctx=cvs.getContext("2d");ctx.scale(dpr,dpr);
  const o={ox:0,oy:0,measW,total,bt,staffH,mi,noteFont:"800 15px Consolas, Courier New, monospace"};

  /* Build tick groups once, shared across draw functions */
  const tg={};meas.events.forEach(e=>{if(!tg[e.startTick])tg[e.startTick]=[];tg[e.startTick].push(e)});
  const tl=Object.keys(tg).map(Number).sort((a,b)=>a-b);

  /* Draw in layer order (back to front) */
  drawStaff(ctx,o);                     /* 1. 弦線・小節線 */
  drawMeasureAttrs(ctx,o,meas);   /* 2. repeat/ending (最上段) */
  drawSpans(ctx,o,mi);            /* 3. spans (上段) */
  drawCursor(ctx,o,meas);               /* 4. カーソル */
  drawNotes(ctx,o,tg,tl);              /* 5. フレット数字 */
  drawRhythm(ctx,o,tg,tl);             /* 6. ステム・ビーム */
  drawRests(ctx,o,meas);               /* 7. 休符 */
  drawTickAttrs(ctx,o,meas);      /* 8. strum矢印 */
  drawLinks(ctx,o,meas);               /* 9. 接続系 (最前面) */
  return cvs;
}

function render(){
  const scrollState=document.getElementById("score-area").scrollTop;const root=document.getElementById("systems");root.innerHTML="";const ts=song.meta.timeSignature;const total=mTk(ts);const bt=ts.beatUnit===8?TPB/2:TPB;const MPR=MEASURES_PER_ROW;const shW=document.getElementById("score-inner").clientWidth;const clefW=18;const measW=Math.floor((shW-20-clefW)/MPR);const staffH=NSTR*SH;const canvasH=SP+staffH+16;/* +16 for link arcs below staff */const rows=Math.ceil(song.measures.length/MPR);const chord=isChordMode();
  for(let r=0;r<rows;r++){const sDiv=document.createElement("div");sDiv.className="sys";const sRow=document.createElement("div");sRow.className="sys-row";sRow.setAttribute("data-system-row",r);const clef=document.createElement("div");clef.className="tab-c";clef.style.height=canvasH+"px";clef.innerHTML='<span>T<br>A<br>B</span>';sRow.appendChild(clef);
    for(let c=0;c<MPR;c++){const mi=r*MPR+c;if(mi>=song.measures.length)break;const meas=song.measures[mi];const mb=document.createElement("div");mb.className="ms"+(mi===sel.measureIdx&&(sel.type==="tick"||sel.type==="note")?" ms-cur":"")+(mi===sel.measureIdx&&chord?" chord-mode":"")+(sel.type==="measure"&&mi===sel.measureIdx?" ms-measure-sel":"");mb.style.width=measW+"px";mb.setAttribute("data-mi",mi);const num=document.createElement("div");num.className="ms-n";num.textContent=mi+1;mb.appendChild(num);const cvs=renderMeasureCanvas(meas,mi,measW,canvasH,total,bt,staffH);
      cvs.addEventListener("click",function(e){
        const rect=cvs.getBoundingClientRect();
        const px=e.clientX-rect.left;
        const py=e.clientY-rect.top;
        const tick=getBestTickFromPointer(px,meas,measW,total);
        closeContextMenu();
        if(e.shiftKey){sel.measureIdx=mi;sel.tick=tick;setRangeEnd();document.getElementById("score-area").focus();return}
        const clickedString=Math.floor((py-SP)/SH);
        let clickedEvent=null;
        if(clickedString>=0&&clickedString<NSTR){
          clickedEvent=meas.events.find(ev=>ev.startTick===tick&&ev.stringIndex===clickedString);
        }
        if(clickedEvent){selectNote(mi,tick,clickedEvent.id);cur.inputString=clickedEvent.stringIndex}
        else{selectTick(mi,tick)}
        document.getElementById("score-area").focus();
      });
      cvs.addEventListener("contextmenu",function(e){
        e.preventDefault();if(appMode!=="editor")return;
        const rect=cvs.getBoundingClientRect();
        const px=e.clientX-rect.left;const py=e.clientY-rect.top;
        const tick=getBestTickFromPointer(px,meas,measW,total);
        /* 右クリック対象で selection を同期 */
        const clickedString=Math.floor((py-SP)/SH);
        let clickedEvent=null;
        if(clickedString>=0&&clickedString<NSTR){clickedEvent=meas.events.find(ev=>ev.startTick===tick&&ev.stringIndex===clickedString)}
        if(sel.type==="range"&&isRangeSelected()){/* range中はrangeのまま */}
        else if(clickedEvent){selectNote(mi,tick,clickedEvent.id);cur.inputString=clickedEvent.stringIndex}
        else{selectTick(mi,tick)}
        const items=buildContextMenuItems();openContextMenu(e.clientX,e.clientY,items);
      });
      mb.appendChild(cvs);sRow.appendChild(mb)}
    sDiv.appendChild(sRow);root.appendChild(sDiv)}
  document.getElementById("score-area").scrollTop=scrollState;updateEditPanel();updateStatus();if(debugUI.isOpen)renderDebugPanel();
}

/* ================================================================ EDIT PANEL ================================================================ */
function updateEditPanel(){
  const m=getCurrentMeasure();const ev=m?getEventsAtTick(m,sel.tick):[];const has=ev.length>0;const total=mTk(song.meta.timeSignature);const step=getManualMoveStep();const chord=isChordMode();
  document.getElementById("mode-single").className="mode-btn"+(isSingleMode()?" act-single":"");document.getElementById("mode-chord").className="mode-btn"+(chord?" act-chord":"");
  const stBar=document.getElementById("ep-status-bar");stBar.className="ep-status"+(chord?" chord-mode":"");
  /* 選択タイプ表示 */
  const stEl=document.getElementById("ep-sel-type");stEl.textContent=selLabel();
  stEl.className="st-val "+(isNoteSelected()?"":"single-color");
  if(isNoteSelected())stEl.style.color="#dc5028";else stEl.style.color="";
  document.getElementById("ep-m").textContent=(sel.measureIdx+1)+"/"+song.measures.length;document.getElementById("ep-m").className="st-val "+(chord?"chord-color":"single-color");
  document.getElementById("ep-t").textContent=sel.tick;document.getElementById("ep-t").className="st-val "+(chord?"chord-color":"single-color");
  const ncEl=document.getElementById("ep-nc");ncEl.textContent=ev.length+"音";ncEl.className="st-note-count "+(has?(chord?"has-notes chord-mode":"has-notes"):"empty");
  document.querySelectorAll("#ep-strings .ep-btn").forEach((b,i)=>{const note=m?findNoteAt(m,sel.tick,i):null;const isAct=i===cur.inputString;b.className="ep-btn string-btn"+(isAct?" act":"")+(isAct&&chord?" chord-mode":"")+(note&&!isAct?" has-note":"")+(note&&!isAct&&chord?" chord-mode":"");b.textContent=note?TLB.standard[i]+":"+note.fret:TLB.standard[i]});

  /* Phase 7: 選択単位別セクション表示切替 */
  const show=(id,v)=>{const el=document.getElementById(id);if(el)el.style.display=v?"":"none"};
  const nt=isNoteSelected(),tk=isTickSelected(),rng=isRangeSelected(),ms=isMeasureSelected();
  show("sec-tech",nt||tk);           /* 奏法: note/tick */
  show("sec-note-attrs",nt);          /* 単音属性: note選択時のみ */
  show("sec-tick-attrs",tk||nt);     /* tick属性: tick/note */
  show("sec-range",true);            /* 範囲: 常時表示 */
  show("sec-edit",tk||nt);           /* 編集: tick/note */
  show("sec-measure",true);          /* 小節: 常時表示 */

  /* 奏法ボタン状態 */
  if(isNoteSelected()){
    const ne=getSelectedEvent();
    TECH_MAP.forEach(t=>{const btn=document.getElementById("ep-"+t.id);if(!btn)return;btn.classList.toggle("act",ne?hasLinkType(ne,t.linkType):false);btn.disabled=!ne});
    /* 単音属性ボタン状態 */
    ["accent","ghost","dead","harmonic"].forEach(a=>{
      const btn=document.getElementById("ep-"+a);if(!btn)return;
      btn.classList.toggle("act",ne?!!(ne.attrs&&ne.attrs[a]):false);btn.disabled=!ne;
    });
  }else{
    TECH_MAP.forEach(t=>{const btn=document.getElementById("ep-"+t.id);if(!btn)return;btn.classList.toggle("act",ev.some(e=>hasLinkType(e,t.linkType)));btn.disabled=!has});
  }

  const d=(id,ok)=>{const b=document.getElementById(id);if(b)b.disabled=!ok};
  d("ep-copy",has);d("ep-paste",!has&&hasCopied());d("ep-overwrite",hasCopied());d("ep-dup",has&&sel.tick+step<total&&!(m&&hasEventsAtTick(m,sel.tick+step)));
  d("ep-tr-down",has);d("ep-tr-up",has);d("ep-mv-l",has&&sel.tick-step>=0);d("ep-mv-r",has&&sel.tick+step<total);d("pad-del",has||isNoteSelected());
  /* 接続先UI */
  if(isNoteSelected()){
    const ne=getSelectedEvent();
    updateLinksPanel(m,ne?[ne]:[]);
  }else{
    updateLinksPanel(m,ev);
  }
  /* tick属性 */
  const ta=m?getTickAttrs(m,sel.tick):null;
  document.getElementById("ep-strum-dn").classList.toggle("act",!!(ta&&ta.strum==="down"));
  document.getElementById("ep-strum-up").classList.toggle("act",!!(ta&&ta.strum==="up"));
  document.getElementById("ep-rest").classList.toggle("act",!!(ta&&ta.rest));
  /* 小節属性 */
  const ma=m?m.attrs:null;
  document.getElementById("ep-rpt-start").classList.toggle("act",!!(ma&&ma.repeatStart));
  document.getElementById("ep-rpt-end").classList.toggle("act",!!(ma&&ma.repeatEnd));
  document.getElementById("ep-ending").classList.toggle("act",!!(ma&&ma.ending));
  /* span状態 */
  const ss=document.getElementById("ep-span-status");const parts=[];
  if(spanPending.palmMute)parts.push("PM開始: M"+(spanPending.palmMute.measureIdx+1)+"t"+spanPending.palmMute.tick);
  if(spanPending.letRing)parts.push("LR開始: M"+(spanPending.letRing.measureIdx+1)+"t"+spanPending.letRing.tick);
  if(isRangeSelected())parts.push("範囲: M"+(sel.rangeStart.measureIdx+1)+"t"+sel.rangeStart.tick+"→M"+(sel.rangeEnd.measureIdx+1)+"t"+sel.rangeEnd.tick);
  const activeSpans=getSpansAtPosition(sel.measureIdx,sel.tick);
  activeSpans.forEach(sp=>{parts.push((sp.type==="palmMute"?"PM":"LR")+"範囲内")});
  ss.textContent=parts.join(" | ");
  /* Phase 20: 再生セクション情報 */
  const pi=document.getElementById("ep-play-info");
  if(pi){
    const pr=playback.playRange;let pt="";
    if(playback.isPlaying)pt+="▶ 再生中 ";
    if(playback.loopEnabled)pt+="🔁 ";
    if(pr.enabled&&pr.start&&pr.end)pt+="PR: M"+(pr.start.measureIdx+1)+"T"+pr.start.tick+"→M"+(pr.end.measureIdx+1)+"T"+pr.end.tick;
    else pt+="PR: なし";
    pi.textContent=pt;
  }
  const lb2=document.getElementById("ep-loop2");if(lb2)lb2.classList.toggle("act",playback.loopEnabled);
}
/* Phase 4: 接続先UIパネル更新 */
function updateLinksPanel(m,ev){
  const sec=document.getElementById("ep-links-section");
  const list=document.getElementById("ep-links-list");
  list.innerHTML="";
  /* 全eventのlinksからlink系を収集 */
  const linkItems=[];
  if(m&&ev.length){
    ev.forEach(e=>{
      getEventLinks(e).forEach(lk=>{
        if(["tie","hammer","pull","slide"].includes(lk.type)){
          linkItems.push({event:e,link:lk});
        }
      });
    });
  }
  if(!linkItems.length){sec.style.display="none";return}
  sec.style.display="";
  const LABELS={tie:"Tie",hammer:"H.on",pull:"P.off",slide:"Slide"};
  linkItems.forEach(({event:ev,link:lk})=>{
    const item=document.createElement("div");item.className="link-item";
    /* header: type + remove */
    const hd=document.createElement("div");hd.className="link-item-hd";
    const typeL=document.createElement("span");typeL.className="link-type-label";
    typeL.textContent=(LABELS[lk.type]||lk.type)+" ("+TLB.standard[ev.stringIndex]+ev.fret+"F)";
    const rmBtn=document.createElement("span");rmBtn.className="link-remove";rmBtn.textContent="✕ 解除";
    rmBtn.addEventListener("click",()=>{pH();removeLinkByType(ev,lk.type);render();save();toast(LABELS[lk.type]+" 解除");document.getElementById("score-area").focus()});
    hd.appendChild(typeL);hd.appendChild(rmBtn);item.appendChild(hd);
    /* target display */
    const tgt=document.createElement("div");
    tgt.className="link-target"+(lk.toEventId?"":"  unlinked");
    tgt.textContent="→ "+(lk.toEventId?getReadableEventRef(lk.toEventId):"未接続");
    item.appendChild(tgt);
    /* candidate select */
    const cands=findLinkCandidates(sel.measureIdx,ev,lk.type);
    if(cands.length){
      const sel=document.createElement("select");sel.className="link-select";
      const optNone=document.createElement("option");optNone.value="";optNone.textContent="-- 接続先を選択 --";sel.appendChild(optNone);
      cands.forEach(c=>{
        const opt=document.createElement("option");opt.value=c.id;
        opt.textContent=TLB.standard[c.stringIndex]+"弦 "+c.fret+"F @tick"+c.startTick;
        if(c.id===lk.toEventId)opt.selected=true;
        sel.appendChild(opt);
      });
      sel.addEventListener("change",function(){
        pH();setLinkTarget(ev,lk.type,this.value||null);render();save();document.getElementById("score-area").focus();
      });
      item.appendChild(sel);
    }
    list.appendChild(item);
  });
}

function updateStatus(){
  const chord=isChordMode();const m=getCurrentMeasure();const ev=m?getEventsAtTick(m,sel.tick):[];
  let info="["+selLabel()+"] "+(chord?"♫ 和音":"♪ 単音")+" | 小節"+(sel.measureIdx+1)+" | Tick "+sel.tick+" | "+TLB.standard[cur.inputString]+"弦";
  if(ev.length)info+=" | "+ev.length+"音";
  if(isNoteSelected()){const ne=getSelectedEvent();if(ne)info+=" | "+TLB.standard[ne.stringIndex]+ne.fret+"F"}
  if(isRangeSelected())info+=" | 範囲:M"+(sel.rangeStart.measureIdx+1)+"t"+sel.rangeStart.tick+"→M"+(sel.rangeEnd.measureIdx+1)+"t"+sel.rangeEnd.tick;
  if(clipboard.type)info+=" | CB:"+clipboard.type;
  document.getElementById("st-left").textContent=info;
}

/* ================================================================ FRETBOARD ================================================================ */
function renderFB(){const g=document.getElementById("fb-g");g.innerHTML="";const tl=TLB.standard;const cw=36;const fnr=document.createElement("div");fnr.className="fb-fn-row";for(let f=0;f<=FRETS;f++){const fn=document.createElement("div");fn.className="fb-fn";fn.style.width=cw+"px";fn.textContent=f;fnr.appendChild(fn);if(f===0){const sp=document.createElement("div");sp.style.width="5px";sp.style.flexShrink="0";fnr.appendChild(sp)}}g.appendChild(fnr);const wireH=[1,1,1.5,2,2.5,3];for(let s=0;s<NSTR;s++){const row=document.createElement("div");row.className="fb-r";const sl=document.createElement("div");sl.className="fb-sl";sl.textContent=tl[s];row.appendChild(sl);for(let f=0;f<=FRETS;f++){const c=document.createElement("div");c.className="fb-c";c.style.width=cw+"px";c.dataset.s=s;c.dataset.f=f;c.style.setProperty("--wire-h",wireH[s]+"px");if(s===2&&DOTS.includes(f)&&!DDOTS.includes(f)){const d=document.createElement("div");d.className="fb-dot";d.style.bottom="2px";c.appendChild(d)}if(DDOTS.includes(f)&&(s===1||s===3)){const d=document.createElement("div");d.className="fb-dot";d.style.bottom="2px";c.appendChild(d)}row.appendChild(c);if(f===0){const nut=document.createElement("div");nut.className="fb-nut-bar";row.appendChild(nut)}}g.appendChild(row)}}
function handleFBInput(e){const c=e.target.closest(".fb-c");if(!c)return;e.preventDefault();const s=+c.dataset.s,f=+c.dataset.f;cur.inputString=s;const r=putNote(s,f);if(r.changed){if(isSingleMode()&&r.shouldAdvance){const total=mTk(song.meta.timeSignature);const step=getAutoAdvanceStep();const nt=sel.tick+step;if(nt>=total){if(sel.measureIdx<song.measures.length-1){sel.measureIdx++;sel.tick=0}}else{sel.tick=nt}}else if(isChordMode()&&(r.action==="add"||r.action==="update")){if(cur.inputString<NSTR-1)cur.inputString++}render();save();c.classList.add("flash");setTimeout(()=>c.classList.remove("flash"),300)}}

/* IO系関数は io.js へ分離済み (Phase 27) */

/* 再生系関数は playback.js へ分離済み (Phase 27) */

