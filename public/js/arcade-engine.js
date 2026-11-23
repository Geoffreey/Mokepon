/* Fixed 60 Hz simulation shared by the browser and server replay verifier. */
;(function(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory()
  else root.MayabArcade = factory()
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict'
  const LEVELS = [
    {id:'selva',name:'El sendero de la ceiba',region:'01 · Selva del Mayab',boss:'Kabrak',theme:'selva',reward:{gold:80,jade:12,obsidian:3}},
    {id:'ruinas',name:'Las escalinatas del tiempo',region:'02 · Ruinas sagradas',boss:'Sipak',theme:'ruinas',reward:{gold:100,jade:18,obsidian:5}},
    {id:'volcan',name:'El corazón de obsidiana',region:'03 · Volcán ancestral',boss:"B'alam",theme:'volcan',reward:{gold:140,jade:24,obsidian:8}}
  ]
  const INPUT = {LEFT:1,RIGHT:2,JUMP:4,ATTACK:8,SHOOT:16}
  const POWERS = {
    "B'alam":{name:'Brasa de obsidiana',element:'fire',color:'#ffad60'},
    "Iq'":{name:'Gota de tormenta',element:'water',color:'#8be2ff'},
    Kabrak:{name:'Semilla de jade',element:'earth',color:'#b5ed87'},
    Cadejo:{name:'Llama del camino',element:'fire',color:'#ffa685'},
    "Tz'ikin":{name:'Pluma de lluvia',element:'water',color:'#98e8ef'},
    Sipak:{name:'Fragmento ancestral',element:'earth',color:'#b8d78c'},
    "B'atz":{name:'Semilla del dosel',element:'earth',color:'#d6ed86'},
    Tacuatzin:{name:'Ascua nocturna',element:'fire',color:'#ffc483'}
  }
  const MAX_TICKS = 36000
  const overlap = (a,b) => a.x < b.x+b.w && a.x+a.w > b.x && a.y < b.y+b.h && a.y+a.h > b.y
  const clamp = (v,a,b) => Math.max(a,Math.min(b,v))
  function create(levelId,guardian='Kabrak') {
    const level = LEVELS.find(l=>l.id===levelId)
    if (!POWERS[guardian]) throw new Error('Guardián inválido')
    if (!level) throw new Error('Nivel inválido')
    const difficulty = LEVELS.indexOf(level)
    const platforms = [
      {x:0,y:450,w:610,h:110},{x:735,y:450,w:650,h:110},
      {x:1510,y:450,w:650,h:110},{x:2285,y:450,w:1015,h:110},
      {x:245,y:350,w:150,h:24},{x:495,y:290,w:145,h:24},
      {x:860,y:345,w:165,h:24},{x:1130,y:265,w:150,h:24},
      {x:1580,y:350,w:170,h:24},{x:1880,y:280,w:170,h:24},
      {x:2130,y:345,w:185,h:24},{x:2420,y:345,w:150,h:24}
    ]
    const coins = []
    platforms.forEach((p,i)=>{
      const count = p.h>24 ? 4 : 3
      for(let j=0;j<count;j++)coins.push({x:p.x+35+j*(p.w-70)/count,y:p.y-42,w:22,h:22,type:p.h>24?'gold':i%3===0?'obsidian':'jade',taken:false})
    })
    return {levelId,guardian,difficulty,tick:0,status:'playing',width:3300,height:540,platforms,coins,
      player:{x:65,y:370,w:46,h:62,vx:0,vy:0,grounded:false,facing:1,hp:5,lives:3,invincible:0,cooldown:0,attack:0,shootCooldown:0},
      enemies:[{x:850,type:'tarantula'},{x:1260,type:'chichicaste'},{x:1660,type:'serpent'},{x:2070,type:'chichicaste'},{x:2400,type:'scorpion'}].map((enemy,i)=>({...enemy,y:408,w:42,h:42,min:enemy.x-100,max:enemy.x+150,dir:i%2?-1:1,hp:2,cooldown:0})),
      boss:{x:3020,y:358,w:92,h:92,hp:10+difficulty*2,maxHp:10+difficulty*2,active:false,phase:0,cooldown:90,hurt:0,facing:-1},
      projectiles:[],playerShots:[],loot:{gold:0,jade:0,obsidian:0},previousInput:0,checkpoint:65,event:''}
  }
  function damage(s, amount=1) {
    const p=s.player
    if(p.invincible||s.status!=='playing')return
    p.hp-=amount;p.invincible=75;p.vy=-6;s.event='hurt'
    if(p.hp<=0)respawn(s)
  }
  function respawn(s) {
    const p=s.player
    p.lives--;s.event='respawn'
    if(p.lives<=0){p.hp=0;s.status='lost';return}
    Object.assign(p,{x:s.checkpoint,y:340,vx:0,vy:0,hp:5,invincible:120,attack:0,shootCooldown:0})
    s.projectiles=[];s.playerShots=[]
    if(s.boss.active){s.boss.hp=s.boss.maxHp;s.boss.x=3020;s.boss.cooldown=100}
  }
  function step(s,input) {
    if(s.status!=='playing')return s
    s.tick++;s.event=''
    if(s.tick>=MAX_TICKS){s.status='lost';s.event='timeout';return s}
    const p=s.player,b=s.boss
    p.shootCooldown=Math.max(0,p.shootCooldown-1)
    p.invincible=Math.max(0,p.invincible-1);p.cooldown=Math.max(0,p.cooldown-1);p.attack=Math.max(0,p.attack-1)
    p.vx=((input&INPUT.RIGHT?1:0)-(input&INPUT.LEFT?1:0))*4.2
    if(p.vx)p.facing=Math.sign(p.vx)
    if((input&INPUT.JUMP)&&!(s.previousInput&INPUT.JUMP)&&p.grounded){p.vy=-12.8;p.grounded=false;s.event='jump'}
    if((input&INPUT.ATTACK)&&p.cooldown===0){p.attack=12;p.cooldown=25;s.event='attack'}
    if((input&INPUT.SHOOT)&&p.shootCooldown===0){
      s.playerShots.push({x:p.facing>0?p.x+p.w:p.x-22,y:p.y+p.h*.56,w:22,h:18,vx:p.facing*8.5,ttl:65,element:POWERS[s.guardian].element})
      p.shootCooldown=36;s.event='shoot'
    }
    const previousBottom=p.y+p.h
    p.vy=Math.min(p.vy+0.58,14);p.x=clamp(p.x+p.vx,b.active?2700:0,s.width-p.w);p.y+=p.vy;p.grounded=false
    for(const platform of s.platforms){
      if(p.vy>=0&&previousBottom<=platform.y+1&&p.y+p.h>=platform.y&&p.x+p.w>platform.x&&p.x<platform.x+platform.w){p.y=platform.y-p.h;p.vy=0;p.grounded=true}
    }
    if(p.y>580){respawn(s);s.previousInput=input;return s}
    for(const coin of s.coins)if(!coin.taken&&overlap(p,coin)){coin.taken=true;s.loot[coin.type]++;s.event='collect'}
    // One damaging frame per strike, so holding attack cannot hit every tick.
    const hit=p.attack===10?{x:p.facing>0?p.x+p.w-6:p.x-76,y:p.y-8,w:82,h:p.h+16}:null
    for(const enemy of s.enemies){
      if(enemy.hp<=0)continue
      if(enemy.type!=='chichicaste')enemy.x+=enemy.dir*(1.15+s.difficulty*.3)
      if(enemy.x<enemy.min||enemy.x>enemy.max)enemy.dir*=-1
      enemy.cooldown=Math.max(0,enemy.cooldown-1)
      if(hit&&overlap(hit,enemy)){enemy.hp--;enemy.cooldown=12;s.event='hit'}
      if(enemy.hp>0&&overlap(p,enemy)){
        if(enemy.type!=='chichicaste'&&p.vy>0&&previousBottom<enemy.y+15){enemy.hp=0;p.vy=-9;s.event='hit'}else damage(s)
      }
    }
    if(p.x>2700&&!b.active){b.active=true;s.checkpoint=2730;p.hp=5;p.invincible=90;s.event='boss'}
    if(b.active&&b.hp>0){
      b.hurt=Math.max(0,b.hurt-1);b.facing=p.x<b.x?-1:1;b.cooldown--
      // Amber wind-up for 35 ticks; jump over the low stone wave.
      if(b.cooldown>35)b.x=clamp(b.x+b.facing*(.65+s.difficulty*.12),2790,3170)
      if(b.cooldown<=0){s.projectiles.push({x:b.x+b.w/2,y:416,w:32,h:30,vx:b.facing*(4.4+s.difficulty*.6)});b.cooldown=125-s.difficulty*12;s.event='wave'}
      if(hit&&overlap(hit,b)){b.hp--;b.hurt=12;s.event='hit';if(b.hp<=0){s.status='won';s.event='won'}}
      if(b.hp>0&&overlap(p,b))damage(s)
    }
    if(s.status==='lost'){s.previousInput=input;return s}
    for(const shot of s.playerShots){
      shot.x+=shot.vx;shot.ttl--
      if(s.platforms.some(platform=>overlap(shot,platform))){shot.dead=true;continue}
      const enemy=s.enemies.find(enemy=>enemy.hp>0&&overlap(shot,enemy))
      if(enemy){enemy.hp--;enemy.cooldown=12;shot.dead=true;s.event='hit'}
      else if(b.active&&b.hp>0&&overlap(shot,b)){
        b.hp--;b.hurt=12;shot.dead=true;s.event='hit'
        if(b.hp<=0){s.status='won';s.event='won'}
      }
    }
    s.playerShots=s.playerShots.filter(shot=>!shot.dead&&shot.ttl>0&&shot.x>0&&shot.x<s.width)
    for(const shot of s.projectiles){shot.x+=shot.vx;if(overlap(p,shot)){damage(s);shot.dead=true}}
    s.projectiles=s.projectiles.filter(shot=>!shot.dead&&shot.x>2600&&shot.x<3350)
    s.previousInput=input
    return s
  }
  function replay(levelId,inputs,guardian='Kabrak') {
    if(!Array.isArray(inputs)||!inputs.length||inputs.length>12000)throw new Error('Repetición inválida')
    const s=create(levelId,guardian)
    for(const entry of inputs){
      if(!Array.isArray(entry)||entry.length!==2||!Number.isInteger(entry[0])||entry[0]<0||entry[0]>31||!Number.isInteger(entry[1])||entry[1]<1||entry[1]>MAX_TICKS||s.tick+entry[1]>MAX_TICKS)throw new Error('Controles inválidos')
      for(let i=0;i<entry[1];i++){if(s.status!=='playing')throw new Error('Partida ya terminada');step(s,entry[0])}
    }
    return s
  }
  function reward(s) {
    const base=LEVELS.find(l=>l.id===s.levelId).reward
    return Object.fromEntries(Object.keys(base).map(k=>[k,base[k]+s.loot[k]]))
  }
  return {LEVELS,POWERS,INPUT,MAX_TICKS,create,step,replay,reward,overlap}
})
