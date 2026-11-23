/* Perspective road renderer. No per-frame network or DOM work. */
;(function(root){
'use strict'
const mod=n=>(n%1+1)%1,lerp=(a,b,t)=>a+(b-a)*t
const VEHICLES={
 "B'alam":{body:'#272d38',trim:'#d59b46',jade:'#58c9a4',form:'jaguar',head:[.68,.15,.24,.55]},
 "Iq'":{body:'#247f85',trim:'#e9d28b',jade:'#85eee0',form:'plume',head:[.12,.03,.35,.32]},
 Kabrak:{body:'#797763',trim:'#dbb663',jade:'#84b875',form:'stone',head:[.57,.31,.36,.40]},
 Cadejo:{body:'#3b3034',trim:'#e98445',jade:'#f5bd76',form:'hound',head:[.65,.01,.32,.38]},
 "Tz'ikin":{body:'#365b76',trim:'#b6dca3',jade:'#a6e7f1',form:'wing',head:[.50,.20,.27,.28]},
 Sipak:{body:'#425f4f',trim:'#bfa774',jade:'#92d3b2',form:'scales',head:[.65,.18,.35,.56]},
 "B'atz":{body:'#734f32',trim:'#d7b675',jade:'#73b98b',form:'wood',head:[.52,.16,.27,.28]},
 Tacuatzin:{body:'#586579',trim:'#d6ba91',jade:'#a4d7ea',form:'moon',head:[.18,.14,.39,.37]}
}
const LANDMARKS=Array.from({length:48},(_,i)=>({p:i/48,lane:(i%2?1:-1)*(1.65+(i%3)*.15),kind:i%8===0?'temple':i%4===1?'stela':i%4===2?'stonehead':'tree',id:i}))
function create(canvas,imageFor){
 const c=canvas.getContext('2d');let view=null,last=0,rivals=[],measureAt=0,measureFrames=0,measureDraw=0
 function polygon(points,color){c.fillStyle=color;c.beginPath();points.forEach((p,i)=>i?c.lineTo(p[0],p[1]):c.moveTo(p[0],p[1]));c.closePath();c.fill()}
 function kart(x,y,size,guardian,image,steer=0,boost=false,shield=false,spin=0,time=0){
  const profile=VEHICLES[guardian]||VEHICLES["B'alam"],color=image?.src?.includes('nocturno')?'#423557':profile.body,trim=profile.trim
  c.save();c.translate(x,y);c.rotate(spin?Math.sin(time/65)*.35:steer*.07);c.scale(size,size)
  c.fillStyle='#001c2444';c.beginPath();c.ellipse(0,8,65,19,0,0,7);c.fill()
  if(boost){for(const side of [-1,1]){c.fillStyle='#fff4b4';polygon([[side*28-9,5],[side*28,40+Math.sin(time/40)*12],[side*28+9,5]],'#ffe18b');polygon([[side*28-6,4],[side*28,24],[side*28+6,4]],'#7affdc')}}
  for(const side of [-1,1]){c.fillStyle='#142933';c.beginPath();c.roundRect(side*48-13,-25,26,43,8);c.fill();c.fillStyle='#45535a';c.fillRect(side*48-11,-21,5,30)}
  polygon([[-48,-33],[-32,-57],[32,-57],[48,-33],[54,8],[-54,8]],color)
  polygon([[-48,-33],[-26,-45],[26,-45],[48,-33],[44,-8],[-44,-8]],'#134b48')
  c.fillStyle=trim;c.fillRect(-50,-37,100,9);c.fillStyle='#12242c';c.fillRect(-39,-9,78,20);c.fillStyle=color;c.fillRect(-36,-7,72,12)
  c.fillStyle='#ff664f';c.fillRect(-42,-6,13,7);c.fillRect(29,-6,13,7);c.fillStyle='#fff2a4';c.fillRect(-15,-4,30,7)
  // Only the face enters the cockpit. The source crop excludes torso, limbs and tail.
  if(image?.complete&&image.naturalWidth){const [sx,sy,sw,sh]=profile.head;c.save();c.beginPath();c.ellipse(0,-69,29,31,0,0,Math.PI*2);c.clip();c.drawImage(image,sx*image.naturalWidth,sy*image.naturalHeight,sw*image.naturalWidth,sh*image.naturalHeight,-28,-99,56,61);c.restore()}
  else{c.fillStyle=trim;c.beginPath();c.arc(0,-68,21,0,7);c.fill()}
  // Raised jade cockpit rim hides the neck and seats the pilot inside the kart.
  polygon([[-34,-48],[-25,-40],[25,-40],[34,-48],[31,-31],[-31,-31]],profile.jade)
  c.strokeStyle=trim;c.lineWidth=3;c.strokeRect(-39,-7,78,17)
  // Stepped glyph on the rear panel, shared by the Mayab vehicle family.
  c.strokeStyle=profile.jade;c.lineWidth=3;c.beginPath();c.moveTo(-14,6);c.lineTo(-14,-5);c.lineTo(0,-5);c.lineTo(0,4);c.lineTo(12,4);c.lineTo(12,-5);c.stroke()
  const form=profile.form
  if(form==='plume'||form==='wing')for(const side of [-1,1]){polygon([[side*42,-37],[side*79,-58],[side*68,-21],[side*45,-12]],trim);polygon([[side*45,-33],[side*69,-48],[side*61,-24]],profile.jade)}
  if(form==='jaguar'||form==='hound'){for(const side of [-1,1]){polygon([[side*39,-44],[side*54,-67],[side*59,-34]],trim);for(let j=0;j<3;j++){c.fillStyle=form==='jaguar'?'#10171e':profile.jade;c.beginPath();c.ellipse(side*(34+j*6),-23+j*6,4,3,0,0,7);c.fill()}}}
  if(form==='stone'){for(const side of [-1,1])for(let j=0;j<3;j++){c.fillStyle=j%2?trim:'#98917b';c.fillRect(side*46-10,-40+j*13,20,10)}c.fillStyle=profile.jade;c.fillRect(-18,-24,36,9)}
  if(form==='scales'){for(let j=0;j<5;j++)polygon([[-41+j*18,-38],[-34+j*18,-57],[-27+j*18,-38]],trim);c.strokeStyle=profile.jade;c.lineWidth=4;for(const side of [-1,1]){c.beginPath();c.moveTo(side*53,-30);c.lineTo(side*62,-10);c.lineTo(side*52,9);c.stroke()}}
  if(form==='wood'){c.strokeStyle=trim;c.lineWidth=6;for(const side of [-1,1]){c.beginPath();c.moveTo(side*46,5);c.lineTo(side*68,-14);c.lineTo(side*58,-42);c.lineTo(side*43,-50);c.stroke()}c.strokeStyle='#382e23';c.lineWidth=2;for(let j=0;j<3;j++){c.beginPath();c.moveTo(-34,-28+j*5);c.lineTo(34,-23+j*5);c.stroke()}}
  if(form==='moon'){c.fillStyle=profile.jade;c.beginPath();c.arc(0,-20,10,0,Math.PI*2);c.fill();c.fillStyle=color;c.beginPath();c.arc(5,-23,9,0,Math.PI*2);c.fill();for(const side of [-1,1]){c.fillStyle=trim;c.beginPath();c.ellipse(side*48,-35,10,17,side*.3,0,7);c.fill()}}
  if(shield){c.strokeStyle='#95ffe7';c.lineWidth=3;c.shadowColor='#75ffda';c.shadowBlur=12;c.beginPath();c.ellipse(0,-36,76,83,0,0,7);c.stroke()}
  if(steer&&boost===false){c.fillStyle='#ffdb6e';for(let i=0;i<4;i++)c.fillRect((i%2?1:-1)*54,-i*5+15,4,9)}
  c.restore()
 }
 function draw(snapshot,prediction,time,input=0){
  const drawStarted=root.performance?.now?.()||0
  const E=root.MayabRacing,state=prediction||snapshot.state,t=E.track(snapshot.track),side=snapshot.side
  const racer=state?.racers[side]||{progress:0,lane:-.48,speed:0,energy:100},dt=Math.min(.05,(time-(last||time))/1000);last=time
  if(canvas.clientWidth<1||canvas.clientHeight<1)return
  const w=canvas.clientWidth<550?640:1100,h=Math.max(1,Math.round(w*canvas.clientHeight/canvas.clientWidth));if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h}
  if(!view||view.track!==t.id||Math.abs(view.progress-racer.progress)>.12)view={track:t.id,progress:racer.progress,lane:racer.lane,speed:racer.speed,depth:.88}
  const blend=1-Math.exp(-dt*18);view.progress=racer.progress;view.lane=lerp(view.lane,racer.lane,blend);view.speed=lerp(view.speed,racer.speed,blend)
  const horizon=h*.35,fast=racer.boost||racer.boostTicks>0,roadWidth=1850,camY=1000,depth=view.depth=lerp(view.depth,fast?.78:.88,1-Math.exp(-dt*6)),position=view.progress*E.LENGTH-1300,baseHeight=E.road(t.id,view.progress).height
  const sky=c.createLinearGradient(0,0,0,horizon*1.3);sky.addColorStop(0,t.sky);sky.addColorStop(1,t.id==='volcan'?'#ffdab0':'#e7f0b7');c.fillStyle=sky;c.fillRect(0,0,w,h)
  c.fillStyle='#ffe9a1';c.beginPath();c.arc(w*.78,h*.12,h*.065,0,7);c.fill()
  for(let layer=0;layer<3;layer++){const shift=Math.sin(view.progress*12)*w*.09*(layer+1);c.beginPath();c.moveTo(0,horizon+35);for(let x=-80;x<=w+100;x+=35){const y=horizon-35-layer*14-Math.abs(Math.sin((x+shift)/w*7+layer*2))*h*(.07+layer*.025);c.lineTo(x,y)}c.lineTo(w,horizon+80);c.closePath();c.fillStyle=t.id==='volcan'?['#b57b82','#956379','#714e69'][layer]:['#7fbbab','#56968e','#38787a'][layer];c.fill()}
  c.fillStyle=t.ground;c.fillRect(0,horizon+10,w,h)
  const segments=[],curveNow=E.road(t.id,view.progress).curve,baseSegment=Math.floor(position/200),fraction=position/200-baseSegment
  let x=-view.lane*roadWidth*.72,dx=-curveNow*(35+fraction*3.6)
  // World-anchored segments move continuously under the camera, including road markings.
  for(let i=1;i<=97;i++){const world=(baseSegment+i)*200,z=world-position,progress=world/E.LENGTH,road=E.road(t.id,progress);dx+=road.curve*3.6;x+=dx;const scale=depth/z;segments.push({x:w/2+scale*x*w*.5,y:horizon+scale*(camY+baseHeight-road.height)*h*.65,half:scale*roadWidth*w*.5,z,progress,scale})}
  function project(progress,lane=0){let z=progress*E.LENGTH-position;if(z<150||z>19000)return null;const index=Math.max(0,Math.min(segments.length-2,Math.floor((z-segments[0].z)/200))),a=segments[index],b=segments[index+1],f=Math.max(0,Math.min(1,(z-a.z)/200));return {x:lerp(a.x,b.x,f)+lane*lerp(a.half,b.half,f),y:lerp(a.y,b.y,f),size:depth/z*w*.5,z}}
  for(let i=segments.length-1;i>0;i--){const far=segments[i],near=segments[i-1];if(near.y<=far.y||far.y>h)continue;const stripe=Math.floor(mod(near.progress)*E.LENGTH/600)%2
   polygon([[0,far.y],[w,far.y],[w,near.y],[0,near.y]],stripe?t.ground:t.id==='volcan'?'#67474a':t.id==='lago'?'#348f94':'#318348')
   polygon([[far.x-far.half*1.13,far.y],[far.x+far.half*1.13,far.y],[near.x+near.half*1.13,near.y],[near.x-near.half*1.13,near.y]],stripe?'#f5e4bd':t.color)
   polygon([[far.x-far.half,far.y],[far.x+far.half,far.y],[near.x+near.half,near.y],[near.x-near.half,near.y]],stripe?t.road:t.id==='volcan'?'#7c6d71':t.id==='lago'?'#a29a85':'#827b62')
   if(stripe)for(const lane of [-.34,.34])polygon([[far.x+far.half*(lane-.009),far.y],[far.x+far.half*(lane+.009),far.y],[near.x+near.half*(lane+.009),near.y],[near.x+near.half*(lane-.009),near.y]],'#eee3bd88')
   if(Math.floor(mod(near.progress)*E.LENGTH/200)<2){for(let j=0;j<12;j++)polygon([[far.x+far.half*(-1+j/6),far.y],[far.x+far.half*(-1+(j+1)/6),far.y],[near.x+near.half*(-1+(j+1)/6),near.y],[near.x+near.half*(-1+j/6),near.y]],(j+stripe)%2?'#f8f5d3':'#253335')}
  }
  const sprites=[]
  for(const landmark of LANDMARKS){let p=Math.floor(view.progress)+landmark.p;if(p<view.progress-.018)p++;sprites.push({...landmark,p})}
  const lap=Math.max(0,Math.floor(view.progress))
  for(const o of E.objects(t.id)){let p=lap+o.p;if(p<view.progress-.02)p++;if(!racer.picked?.[Math.floor(p)+'_'+o.id+'_'+o.type])sprites.push({...o,p,kind:o.type})}
  for(const trap of state?.traps||[])sprites.push({...trap,kind:'oil'})
  if(state)for(let i=0;i<state.racers.length;i++){const r=state.racers[i];if(i!==side&&!r.dnf&&r.finish===null){let v=rivals[i];if(!v||Math.abs(v.progress-r.progress)>.1)v=rivals[i]={progress:r.progress,lane:r.lane};v.progress=lerp(v.progress,r.progress,blend);v.lane=lerp(v.lane,r.lane,blend);sprites.push({p:v.progress,lane:v.lane,kind:'kart',index:i,racer:r})}}
  const projected=sprites.map(o=>({...o,screen:project(o.p,o.lane)})).filter(o=>o.screen&&o.screen.y>horizon-80&&o.screen.y<h+150).sort((a,b)=>b.screen.z-a.screen.z)
  for(const o of projected){const {x,y,size}=o.screen;if(o.kind==='kart'){const p=snapshot.players[o.index];kart(x,y,size*1.6,p.guardian,imageFor(p.guardian,p.skin),0,o.racer.boost||o.racer.boostTicks>0,o.racer.shield,o.racer.spin,time);continue}
   c.save();c.translate(x,y);c.scale(size,size)
   if(o.kind==='tree'){c.fillStyle='#725b36';polygon([[-18,0],[-10,-265],[15,-265],[23,0]],'#725b36');for(let j=0;j<5;j++){c.fillStyle=['#164d3e','#206b47','#39924f'][j%3];c.beginPath();c.ellipse((j-2)*47,-275-Math.sin(j)*42,92,52,j*.3,0,7);c.fill()}polygon([[-45,0],[-12,-70],[20,-70],[55,0]],'#685436')}
   else if(o.kind==='temple'){for(let j=0;j<7;j++){c.fillStyle=j%2?'#aaa483':'#c9c395';c.fillRect(-210+j*24,-j*48-48,420-j*48,48);c.fillStyle='#657d68';c.fillRect(-210+j*24,-j*48-48,420-j*48,5)}polygon([[-37,0],[-17,-295],[17,-295],[37,0]],'#ece0b1');c.fillStyle='#344e48';c.fillRect(-23,-340,46,55);c.fillStyle='#d3c495';c.fillRect(-49,-354,98,14);for(const side of [-1,1]){c.fillStyle='#8f9977';c.fillRect(side*238-18,-115,36,115)}}
   else if(o.kind==='stela'){c.fillStyle='#7e8a79';c.beginPath();c.roundRect(-56,-300,112,300,25);c.fill();c.fillStyle='#afb39a';c.beginPath();c.roundRect(-48,-292,86,282,19);c.fill();c.strokeStyle='#4b685c';c.lineWidth=6;c.strokeRect(-34,-270,62,245);for(let row=0;row<6;row++){const y=-247+row*36;c.strokeStyle=row%2?'#546b5b':'#d2c99a';c.lineWidth=5;c.beginPath();c.moveTo(-21,y);c.lineTo(10,y);c.lineTo(10,y+12);c.lineTo(-9,y+12);c.lineTo(-9,y+22);c.lineTo(22,y+22);c.stroke()}c.fillStyle='#596e58';c.fillRect(-70,-15,140,24)}
   else if(o.kind==='stonehead'){c.fillStyle='#6f7d74';c.beginPath();c.roundRect(-97,-195,194,195,53);c.fill();c.fillStyle='#a1a892';c.beginPath();c.roundRect(-85,-185,160,173,45);c.fill();c.fillStyle='#707e70';c.fillRect(-93,-162,181,21);c.fillStyle='#b8b493';c.fillRect(-83,-182,162,14);c.fillStyle='#425d54';c.fillRect(-61,-118,42,12);c.fillRect(19,-118,42,12);polygon([[-13,-121],[-20,-67],[19,-67],[12,-121]],'#7d8977');c.fillStyle='#40594d';c.fillRect(-40,-44,80,11);c.fillStyle='#c0bea3';c.fillRect(-35,-31,70,7);for(const side of [-1,1]){c.strokeStyle='#6a7c69';c.lineWidth=10;c.beginPath();c.ellipse(side*87,-85,14,30,0,0,7);c.stroke()}c.fillStyle='#566f58';c.fillRect(-110,-5,220,20)}
   else if(o.kind==='crystal'){polygon([[-55,0],[-80,-70],[0,-210],[65,-60],[50,0]],'#c48dad');polygon([[0,-210],[65,-60],[50,0],[0,-30]],'#eea5a3')}
   else if(o.kind==='jade'){c.translate(0,-70-Math.sin(time/160+o.id)*14);c.rotate(time/700);polygon([[0,-38],[25,0],[0,38],[-25,0]],'#9dffe1');polygon([[0,-38],[25,0],[0,8]],'#efffc1')}
   else if(o.kind==='crate'){c.translate(0,-80);c.rotate(Math.sin(time/350+o.id)*.12);c.fillStyle='#eeb84e';c.fillRect(-48,-90,96,96);c.strokeStyle='#fff5bf';c.lineWidth=7;c.strokeRect(-48,-90,96,96);c.fillStyle='#fff8cb';c.font='bold 70px Georgia';c.textAlign='center';c.fillText('?',0,-18)}
   else if(o.kind==='pad'){polygon([[-460,0],[-350,-60],[350,-60],[460,0]],'#56f3c3');for(let j=0;j<3;j++)polygon([[-100,-j*18],[0,-28-j*18],[100,-j*18],[0,-12-j*18]],'#f5ffba')}
   else if(o.kind==='oil'){c.fillStyle='#281e4c';c.beginPath();c.ellipse(0,-5,115,24,0,0,7);c.fill();c.strokeStyle='#a36de1';c.lineWidth=6;c.stroke()}
   else if(o.kind==='fire'){for(let j=0;j<3;j++)polygon([[-70+j*45,0],[-30+j*30,-100-Math.sin(time/80+j)*35],[40+j*25,0]],j%2?'#ffec7b':'#ff784b')}
   else if(o.kind==='log'){c.fillStyle='#6b4528';c.beginPath();c.roundRect(-110,-58,220,55,20);c.fill();c.fillStyle='#d6b478';c.beginPath();c.ellipse(-90,-30,22,28,0,0,7);c.fill()}
   else polygon([[-70,0],[-90,-35],[-30,-90],[40,-80],[75,-25],[60,0]],'#545d65')
   c.restore()
  }
  const steer=Number(Boolean(input&2))-Number(Boolean(input&1)),kartX=w/2+view.lane*w*.12,kartY=h*.87,bounce=Math.sin(time/55)*Math.min(3,view.speed/E.MAX_SPEED*2)
  kart(kartX,kartY+bounce,Math.min(w/430,h/300),snapshot.players[side].guardian,imageFor(snapshot.players[side].guardian,snapshot.players[side].skin),racer.drifting?steer:steer*.3,fast,racer.shield,racer.spin,time)
  if(view.speed>E.MAX_SPEED*.6){c.save();c.strokeStyle=fast?'#e9fff5aa':'#ffffff35';c.lineWidth=fast?3:1;for(let i=0;i<(fast?18:8);i++){const angle=i*.93+time/2200,r=w*(.3+((time/500+i*.13)%1)*.5),x=w/2+Math.cos(angle)*r,y=h*.48+Math.sin(angle)*r;c.beginPath();c.moveTo(x,y);c.lineTo(x+Math.cos(angle)*(fast?75:25),y+Math.sin(angle)*(fast?65:20));c.stroke()}c.restore()}
  // Compact map remains secondary to the chase camera.
  const mapW=Math.min(120,w*.16),mapH=mapW*.7,mapX=w-mapW-18,mapY=22;c.fillStyle='#082c30bb';c.beginPath();c.roundRect(mapX-8,mapY-8,mapW+16,mapH+16,14);c.fill();c.lineWidth=3;c.strokeStyle='#e8efd799';c.beginPath();for(let i=0;i<=100;i++){const p=E.point(t.id,i/100),x=mapX+(p.x-100)/760*mapW,y=mapY+(p.y-50)/500*mapH;i?c.lineTo(x,y):c.moveTo(x,y)}c.stroke();if(state)state.racers.forEach((r,i)=>{const p=E.point(t.id,r.progress);c.fillStyle=i===side?'#fff8ad':'#9ce9d1';c.beginPath();c.arc(mapX+(p.x-100)/760*mapW,mapY+(p.y-50)/500*mapH,i===side?5:3,0,7);c.fill()})
  if(racer.eventUntil>state?.tick&&racer.event){c.font='bold '+Math.max(15,w*.022)+'px system-ui';c.textAlign='center';c.fillStyle='#092b37cc';c.fillRect(w*.12,h*.2,w*.76,40);c.fillStyle='#ffedaa';c.fillText(racer.event,w/2,h*.2+27)}
  if(canvas.dataset&&drawStarted){measureFrames++;measureDraw+=(root.performance.now()-drawStarted);if(!measureAt)measureAt=time;if(time-measureAt>=1500){canvas.dataset.renderFps=String(Math.round(measureFrames*1000/(time-measureAt)));canvas.dataset.renderMs=(measureDraw/measureFrames).toFixed(2);measureAt=time;measureFrames=0;measureDraw=0}}
  if(snapshot.phase==='countdown'){c.fillStyle='#09292d44';c.fillRect(0,0,w,h);c.textAlign='center';c.font='bold '+Math.min(130,h*.28)+'px Georgia';c.strokeStyle='#29443b';c.lineWidth=8;c.strokeText(Math.ceil(snapshot.countdown/60),w/2,h*.53);c.fillStyle='#fff1ac';c.fillText(Math.ceil(snapshot.countdown/60),w/2,h*.53)}
 }
 return {draw,reset(){view=null;last=0;rivals=[]}}
}
root.MayabRacingRenderer={create,VEHICLES,LANDMARKS}
})(typeof globalThis!=='undefined'?globalThis:this)
