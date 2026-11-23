/* Reconcile authority without restarting the local movement clock. */
;(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./racing-engine'));else root.MayabRacingSync=factory(root.MayabRacing)})(typeof globalThis!=='undefined'?globalThis:this,function(Engine){
'use strict'
function reconcile(previous,snapshot,input,rtt=0,previousPhase='playing'){
 if(!snapshot.state)return null
 const next=structuredClone(snapshot.state)
 if(snapshot.phase!=='playing'||snapshot.paused)return next
 const ahead=Math.min(12,Math.max(0,Math.round(rtt/2/(1000/60))))
 for(let n=0;n<ahead;n++)Engine.step(next,next.racers.map((_,i)=>i===snapshot.side?input:snapshot.mode==='online'?(snapshot.inputs?.[i]||0):Engine.botInput(next,i)))
 if(previous&&previousPhase==='playing'&&previous.track===next.track){
  next.racers.forEach((r,i)=>{const old=previous.racers[i];if(!old||r.finish!==null||r.dnf||old.finish!==null||Math.abs(r.progress-old.progress)>.025)return
   // Keep the current visual position and converge over simulation steps.
   r.correction={progress:r.progress-old.progress,lane:r.lane-old.lane,speed:r.speed-old.speed}
   r.progress=old.progress;r.lane=old.lane;r.speed=old.speed
  })
 }
 return next
}
function step(state,inputs){
 Engine.step(state,inputs)
 for(const r of state.racers){if(!r.correction||r.finish!==null||r.dnf)continue;const correction=r.correction
  for(const key of ['progress','lane','speed']){const amount=correction[key]*.16;r[key]+=amount;correction[key]-=amount}
  r.speed=Math.max(0,r.speed);r.lane=Math.max(-1.65,Math.min(1.65,r.lane))
 }
}
return {reconcile,step}
})
