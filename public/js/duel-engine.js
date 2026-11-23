/* The server owns this simulation. The browser uses it only for visual prediction. */
;(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory(require('./arcade-engine'))
  else root.MayabDuel=factory(root.MayabArcade)
})(typeof globalThis!=='undefined'?globalThis:this,function(Arcade){
  'use strict'
  const INPUT={LEFT:1,RIGHT:2,JUMP:4,ATTACK:8,SHOOT:16,BLOCK:32},MAX_TICKS=10800
  const overlap=Arcade.overlap,clamp=(v,a,b)=>Math.max(a,Math.min(b,v))
  function create(guardians){
    if(!Array.isArray(guardians)||guardians.length!==2||guardians.some(g=>!Arcade.POWERS[g]))throw new Error('Guardianes inválidos')
    return {tick:0,status:'playing',winner:null,reason:null,width:960,height:540,shots:[],
      platforms:[{x:0,y:450,w:960,h:90},{x:205,y:325,w:140,h:22},{x:615,y:325,w:140,h:22}],
      fighters:guardians.map((guardian,i)=>({guardian,x:i?750:150,y:388,w:46,h:62,vx:0,vy:0,facing:i?-1:1,hp:100,stamina:100,grounded:true,blocking:false,attack:0,cooldown:0,shootCooldown:0,hurt:0,previousInput:0,damage:0,blocks:0}))}
  }
  function strike(s,index,amount,sourceX){
    const target=s.fighters[index]
    if(target.hp<=0||target.hurt>0)return false
    const front=Math.sign(sourceX-(target.x+target.w/2))===target.facing
    if(target.blocking&&front&&target.stamina>=20){target.stamina-=20;target.blocks++;target.hurt=10;return false}
    target.hp=Math.max(0,target.hp-amount);target.hurt=18;target.vy=-3
    s.fighters[1-index].damage+=amount
    return true
  }
  function step(s,inputs){
    if(s.status!=='playing')return s
    s.tick++
    for(let i=0;i<2;i++){
      const p=s.fighters[i],input=inputs[i]&63
      p.hurt=Math.max(0,p.hurt-1);p.attack=Math.max(0,p.attack-1);p.cooldown=Math.max(0,p.cooldown-1);p.shootCooldown=Math.max(0,p.shootCooldown-1)
      p.blocking=Boolean(input&INPUT.BLOCK)&&p.stamina>=1&&p.attack===0
      p.stamina=clamp(p.stamina+(p.blocking?-.24:.45),0,100)
      p.vx=((input&INPUT.RIGHT?1:0)-(input&INPUT.LEFT?1:0))*4.2*(p.blocking?.4:1)
      if(p.vx)p.facing=Math.sign(p.vx)
      if((input&INPUT.JUMP)&&!(p.previousInput&INPUT.JUMP)&&p.grounded){p.vy=-12.8;p.grounded=false}
      if(!p.blocking&&(input&INPUT.ATTACK)&&p.cooldown===0){p.attack=12;p.cooldown=25}
      if(!p.blocking&&(input&INPUT.SHOOT)&&p.shootCooldown===0){s.shots.push({owner:i,x:p.facing>0?p.x+p.w:p.x-22,y:p.y+p.h*.56,w:22,h:18,vx:p.facing*8.5,ttl:90,element:Arcade.POWERS[p.guardian].element});p.shootCooldown=36}
      const bottom=p.y+p.h;p.vy=Math.min(p.vy+.58,14);p.x=clamp(p.x+p.vx,0,s.width-p.w);p.y+=p.vy;p.grounded=false
      for(const platform of s.platforms)if(p.vy>=0&&bottom<=platform.y+1&&p.y+p.h>=platform.y&&p.x+p.w>platform.x&&p.x<platform.x+platform.w){p.y=platform.y-p.h;p.vy=0;p.grounded=true}
      p.previousInput=input
    }
    // Both attacks resolve before the result, so simultaneous knock-outs are draws.
    for(let i=0;i<2;i++){
      const p=s.fighters[i]
      if(p.attack===10){const hit={x:p.facing>0?p.x+p.w-6:p.x-76,y:p.y-8,w:82,h:p.h+16};if(overlap(hit,s.fighters[1-i]))strike(s,1-i,12,p.x+p.w/2)}
    }
    for(const shot of s.shots){
      shot.x+=shot.vx;shot.ttl--
      if(s.platforms.some(p=>overlap(shot,p))){shot.dead=true;continue}
      if(overlap(shot,s.fighters[1-shot.owner])){strike(s,1-shot.owner,10,shot.x+shot.w/2);shot.dead=true}
    }
    s.shots=s.shots.filter(shot=>!shot.dead&&shot.ttl>0&&shot.x>-30&&shot.x<990)
    if(s.fighters.some(p=>p.hp===0))finish(s,s.fighters[0].hp===0&&s.fighters[1].hp===0?null:s.fighters[0].hp===0?1:0,'knockout')
    else if(s.tick>=MAX_TICKS)finish(s,s.fighters[0].hp===s.fighters[1].hp?null:s.fighters[0].hp>s.fighters[1].hp?0:1,'time')
    return s
  }
  function finish(s,winner,reason){if(s.status==='playing'){s.status='finished';s.winner=winner;s.reason=reason}return s}
  function botInput(s,index=1){
    const p=s.fighters[index],r=s.fighters[1-index],distance=(r.x+r.w/2)-(p.x+p.w/2),direction=Math.sign(distance),phase=s.tick%180
    let input=0
    if(Math.abs(distance)>105)input|=direction>0?INPUT.RIGHT:INPUT.LEFT
    else if(Math.sign(distance)!==p.facing)input|=direction>0?INPUT.RIGHT:INPUT.LEFT
    const incoming=s.shots.some(shot=>shot.owner!==index&&Math.abs(shot.x-p.x)<180&&Math.sign(shot.vx)===-direction)
    if(incoming&&phase<105&&p.stamina>25)input|=INPUT.BLOCK
    else {if(Math.abs(distance)<125)input|=INPUT.ATTACK;if(phase<135)input|=INPUT.SHOOT}
    if(p.grounded&&((incoming&&phase>=105)||(Math.abs(distance)<220&&phase===150)))input|=INPUT.JUMP
    return input
  }
  return {INPUT,MAX_TICKS,create,step,strike,finish,botInput}
})
