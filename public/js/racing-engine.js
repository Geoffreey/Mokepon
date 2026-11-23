/* Deterministic kart simulation shared by browser prediction and server. */
;(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.MayabRacing=factory()})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict'
const TRACKS=[{id:'selva',name:'Ceiba Esmeralda',region:'Selva del Petén',color:'#a7de69',ground:'#286c36',road:'#79745a',sky:'#80d4d7',bend:.85},{id:'lago',name:'Espejo de Atitlán',region:'Lago sagrado',color:'#c1ebed',ground:'#2d8b85',road:'#9b9383',sky:'#99dbed',bend:1.1},{id:'volcan',name:'Corona de Fuego',region:'Tierras volcánicas',color:'#ffb161',ground:'#593d43',road:'#756268',sky:'#e5a18d',bend:1.3}]
const GUARDIANS=["B'alam","Iq'",'Kabrak','Cadejo',"Tz'ikin",'Sipak',"B'atz",'Tacuatzin'],LENGTH=60000,MAX_SPEED=.00060,LIMIT=60*300
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n)),mod=n=>(n%1+1)%1
function track(id){return TRACKS.find(t=>t.id===id)||TRACKS[0]}
function road(id,p){const t=track(id),a=mod(p)*Math.PI*2;return {curve:(Math.sin(a*3)+Math.sin(a*7+.6)*.55)*t.bend,height:Math.sin(a*2)*260+Math.sin(a*5)*90}}
function point(id,p,lateral=0){const a=mod(p)*Math.PI*2-Math.PI/2,r=1+.12*Math.sin(a*3)*track(id).bend;return {x:480+Math.cos(a)*(310*r-lateral*48),y:300+Math.sin(a)*(205*r-lateral*48)}}
const HAZARD_ZONES=[[.26,.31],[.58,.63],[.82,.87]],objectsCache=new Map()
function hazardZone(p){return HAZARD_ZONES.some(([a,b])=>mod(p)>=a&&mod(p)<=b)}
function objects(id){if(!objectsCache.has(id)){const list=[]
 const crates=[.10,.23,.39,.66,.91];crates.forEach((p,i)=>list.push({id:(i+1)*7,p,lane:[0,-.6,.6][i%3],type:'crate'}))
 ;[.05,.17,.34,.49,.72,.95].forEach((p,i)=>{for(let j=0;j<4;j++)list.push({id:100+i*4+j,p:p+j*.0016,lane:[-.55,0,.55][i%3],type:'jade'})})
 ;[.20,.52,.88].forEach((p,i)=>list.push({id:150+i,p,lane:0,type:'pad'}))
 ;[.275,.295,.595,.615,.835,.855].forEach((p,i)=>list.push({id:200+i,p,lane:i%2?.55:-.55,type:['rock','oil',id==='volcan'?'fire':'log'][i%3]}))
 objectsCache.set(id,list.sort((a,b)=>a.p-b.p))}return objectsCache.get(id)}
function create(guardians,trackId='selva'){if(guardians.length<1||guardians.length>6)throw new Error('Entre uno y seis corredores');return {track:track(trackId).id,tick:0,status:'playing',laps:3,traps:[],racers:guardians.map((guardian,i)=>({guardian,progress:-Math.floor(i/2)*.002,lane:i%2?.48:-.48,speed:0,energy:100,boost:false,finish:null,dnf:false,coins:0,lastPickup:-1,picked:{},shield:0,boostTicks:0,spin:0,drift:0,drifting:false,event:'',eventUntil:0,previousInput:0}))}}
function ranking(s){return s.racers.map((r,i)=>i).sort((a,b)=>{const x=s.racers[a],y=s.racers[b];return Number(x.dnf)-Number(y.dnf)||(x.finish!==null&&y.finish!==null?x.finish-y.finish:x.finish!==null?-1:y.finish!==null?1:y.progress-x.progress)||a-b})}
function botInput(s,i){const r=s.racers[i],ahead=objects(s.track).find(o=>mod(o.p-mod(r.progress))<.009&&mod(o.p-mod(r.progress))>.0002),danger=ahead&&['rock','oil','log','fire'].includes(ahead.type);let target=danger?(ahead.lane>0?-.5:.5):ahead?ahead.lane:Math.sin(s.tick/200+i)*.4,input=4;if(r.lane<target-.06)input|=2;if(r.lane>target+.06)input|=1;if(s.tick>300&&r.energy>75&&(s.tick+i*71)%900<65&&Math.abs(road(s.track,r.progress).curve)<.65)input|=16;if(Math.abs(road(s.track,r.progress).curve)>.8&&s.tick%200<100)input|=32;return input}
function event(s,r,text){r.event=text;r.eventUntil=s.tick+105}
function hit(s,r){if(r.shield){r.shield=0;event(s,r,'¡Escudo protector!')}else if(!r.spin){r.spin=42;r.speed*=.4;event(s,r,'¡Trampa! Recupera el control')}}
function step(s,inputs){if(s.status!=='playing')return;s.tick++
 s.racers.forEach((r,i)=>{if(r.finish!==null||r.dnf)return;const input=inputs[i]||0,steer=Number(Boolean(input&2))-Number(Boolean(input&1)),drifting=Boolean(input&32)&&r.speed>MAX_SPEED*.4,previous=r.progress
 if(r.drifting&&!drifting&&r.drift>35){r.boostTicks=Math.max(r.boostTicks,Math.min(120,r.drift));event(s,r,'¡Mini turbo de derrape!')}
 r.drift=drifting?Math.min(120,r.drift+Math.abs(steer)*1.2):0;r.drifting=drifting
 r.boost=Boolean(input&16)&&r.energy>1&&Boolean(input&4);r.energy=clamp(r.energy+(r.boost?-.65:.18),0,100)
 const off=Math.abs(r.lane)>1,max=off?.00032:r.boost||r.boostTicks>0?.00084:MAX_SPEED
 if(r.boostTicks>0)r.boostTicks--;if(r.spin>0)r.spin--
 r.speed=clamp(r.speed+(input&4?.000014:-.000004)-(input&8?.000025:0),0,r.spin?MAX_SPEED*.45:max)
 r.lane=clamp(r.lane+steer*(drifting?.023:.017)*(r.speed/MAX_SPEED+.12)*(r.spin?.25:1)-road(s.track,r.progress).curve*r.speed*(drifting?.35:.8),-1.65,1.65)
 r.progress+=r.speed*(1-Math.abs(r.lane)*.018)
 for(let lap=Math.max(0,Math.floor(previous));lap<=Math.floor(r.progress);lap++)for(const o of objects(s.track)){const p=lap+o.p,key=lap+'_'+o.id+'_'+o.type;if(previous<=p&&r.progress>=p&&Math.abs(r.lane-o.lane)<(o.type==='pad'?.85:.25)&&!r.picked[key]){r.picked[key]=true;if(o.type==='jade'){r.coins++;r.energy=clamp(r.energy+7,0,100);event(s,r,'+1 jade · Turbo recargado')}else if(o.type==='pad'){r.boostTicks=100;event(s,r,'¡Plataforma de aceleración!')}else if(o.type==='crate'){const prize=(o.id+lap+i)%3;if(prize===0){r.shield=1;event(s,r,'¡Escudo de jade!')}else if(prize===1){r.boostTicks=150;r.coins+=3;event(s,r,'¡Turbo ancestral! +3 jade')}else{const zone=HAZARD_ZONES.find(([start])=>start>mod(r.progress));s.traps.push({p:Math.floor(r.progress)+(zone?zone[0]:1+HAZARD_ZONES[0][0])+.008,lane:r.lane,owner:i,expires:s.tick+1200});r.coins+=5;event(s,r,'+5 jade · Trampa de obsidiana desplegada')}}else hit(s,r)}}
 for(const trap of s.traps)if(trap.owner!==i&&previous<=trap.p&&r.progress>=trap.p&&Math.abs(r.lane-trap.lane)<.25)hit(s,r)
 if(r.progress>=s.laps){r.progress=s.laps;r.finish=s.tick;r.speed=0}
 r.previousInput=input
 })
 s.traps=s.traps.filter(t=>t.expires>s.tick).slice(-60)
 for(let i=0;i<s.racers.length;i++)for(let j=i+1;j<s.racers.length;j++){const a=s.racers[i],b=s.racers[j];if(a.finish!==null||b.finish!==null||a.dnf||b.dnf)continue;if(Math.abs(a.progress-b.progress)<.00065&&Math.abs(a.lane-b.lane)<.22){const d=a.lane<=b.lane?-1:1;a.lane=clamp(a.lane+d*.014,-1.65,1.65);b.lane=clamp(b.lane-d*.014,-1.65,1.65);a.speed*=.995;b.speed*=.995}}
 const finishes=s.racers.filter(r=>r.finish!==null)
 if(s.racers.every(r=>r.finish!==null||r.dnf)||s.tick>=LIMIT||(finishes.length&&s.tick-Math.min(...finishes.map(r=>r.finish))>=60*40))s.status='finished'
}
return {TRACKS,GUARDIANS,LENGTH,MAX_SPEED,LIMIT,create,step,ranking,botInput,point,track,road,objects,mod,HAZARD_ZONES,hazardZone}
})
