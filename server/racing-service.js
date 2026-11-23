const {randomUUID}=require('node:crypto')
const Engine=require('../public/js/racing-engine')
const fail=(message,status=409)=>{throw Object.assign(new Error(message),{status})}
class RacingService{
 constructor({now=Date.now,maxRooms=100}={}){this.now=now;this.maxRooms=maxRooms;this.rooms=new Map();this.active=new Map();this.last=now();this.accumulator=0}
 member(id,accountId){const room=this.rooms.get(id),side=room?.players.findIndex(p=>p.accountId===accountId);if(!room||side<0||room.players[side].left)fail('No tienes acceso a esta carrera.',404);return {room,side}}
 available(accountId){if(this.active.has(accountId))fail('Sal de tu carrera actual antes de entrar a otra.')}
 create(player,{mode='maquina',count=6,track='selva'}={}){
  this.available(player.accountId);if(this.rooms.size>=this.maxRooms)fail('Hay muchas carreras. Intenta en un momento.',503)
  if(!['online','maquina','arcade'].includes(mode)||!Number.isInteger(count)||count<2||count>6||!Engine.TRACKS.some(t=>t.id===track))fail('Configuración de carrera inválida.',400)
  const room={id:randomUUID(),mode,track:mode==='arcade'?'selva':track,players:[],phase:'waiting',created:this.now(),updated:this.now(),countdown:180,paused:false,state:null,cupRound:0,cupPoints:[],finishedAt:null}
  this.rooms.set(room.id,room);this.add(room,player)
  if(mode!=='online'){for(let i=1;i<count;i++)room.players.push({accountId:null,name:`Máquina ${i}`,guardian:Engine.GUARDIANS[i%8],skin:'clasico',ready:true,input:0,seq:-1,seen:this.now()});room.cupPoints=room.players.map(()=>0)}
  return this.snapshot(room,0)
 }
 add(room,player){room.players.push({...player,ready:false,input:0,seq:-1,seen:this.now()});this.active.set(player.accountId,room.id)}
 join(id,player){this.available(player.accountId);const room=this.rooms.get(id);if(!room||room.mode!=='online'||room.phase!=='waiting')fail('La sala ya no está disponible.',404);if(room.players.length>=6)fail('Esta sala está llena.');this.add(room,player);return this.snapshot(room,room.players.length-1)}
 list(){return [...this.rooms.values()].filter(r=>r.mode==='online'&&r.phase==='waiting').map(r=>({id:r.id,host:r.players[0].name,count:r.players.length,track:r.track}))}
 start(room){room.phase='countdown';room.state=Engine.create(room.players.map(p=>p.guardian),room.track);room.countdown=180;room.paused=false}
 receive(id,accountId,body){const {room:r,side}=this.member(id,accountId),p=r.players[side];p.seen=this.now();r.updated=p.seen
  if(body.seq>p.seq){p.seq=body.seq;p.input=body.input;if(body.ready)p.ready=true;if(r.mode!=='online')r.paused=Boolean(body.pause)
   if(body.start&&r.phase==='waiting'&&side===0){if(r.players.length<2||!r.players.every(p=>p.ready))fail('Se necesitan al menos dos corredores y todos deben estar listos.');this.start(r)}
   if(r.mode!=='online'&&r.phase==='waiting'&&p.ready){this.start(r);r.paused=Boolean(body.pause)}
  }return this.snapshot(r,side)
 }
 next(id,accountId){const {room:r}=this.member(id,accountId);if(r.mode!=='arcade'||r.phase!=='finished'||r.cupRound>=2)fail('No hay otro circuito disponible.');r.cupRound++;r.track=Engine.TRACKS[r.cupRound].id;r.finishedAt=null;for(const p of r.players){p.input=0;p.seen=this.now()}this.start(r);return this.snapshot(r,0)}
 snapshot(r,side){return {id:r.id,mode:r.mode,track:r.track,phase:r.phase,side,ack:r.players[side].seq,countdown:r.countdown,paused:r.paused,inputs:r.players.map(p=>p.input),state:r.state,players:r.players.map(p=>({name:p.name,guardian:p.guardian,skin:p.skin,ready:p.ready})),cupRound:r.cupRound,cupPoints:r.cupPoints}}
 finish(r){if(r.phase==='finished')return;r.phase='finished';r.finishedAt=this.now();r.paused=false;if(r.mode==='arcade')Engine.ranking(r.state).forEach((side,place)=>{if(!r.state.racers[side].dnf)r.cupPoints[side]+=[10,7,5,3,2,1][place]})}
 leave(id,accountId){const {room:r,side}=this.member(id,accountId);this.active.delete(accountId)
  if(r.phase==='waiting'){r.players.splice(side,1);if(!r.players.length)this.rooms.delete(id)}else{r.players[side].input=0;r.players[side].left=true;if(r.state&&r.phase!=='finished'&&r.state.racers[side].finish===null)r.state.racers[side].dnf=true;if(r.mode!=='online'||r.players.every(p=>p.left||!p.accountId)){this.rooms.delete(id);for(const p of r.players)if(this.active.get(p.accountId)===id)this.active.delete(p.accountId)}}
 }
 advance(){const now=this.now();this.accumulator+=Math.min(200,Math.max(0,now-this.last));this.last=now
  for(const r of this.rooms.values()){
   if(r.phase==='waiting'){for(const p of [...r.players])if(p.accountId&&now-p.seen>60000)this.leave(r.id,p.accountId)}
   else if(r.phase!=='finished'){for(const p of r.players)if(p.accountId&&!p.left&&now-p.seen>(r.mode==='online'?15000:120000))this.leave(r.id,p.accountId)}
   if((r.phase==='finished'&&now-r.finishedAt>300000)||now-r.created>1800000){this.rooms.delete(r.id);for(const p of r.players)if(this.active.get(p.accountId)===r.id)this.active.delete(p.accountId)}
  }
  while(this.accumulator>=1000/60){this.accumulator-=1000/60;for(const r of this.rooms.values()){
   if(r.paused)continue
   if(r.phase==='countdown'){if(--r.countdown<=0)r.phase='playing'}else if(r.phase==='playing'){Engine.step(r.state,r.players.map((p,i)=>p.accountId?(now-p.seen>400?0:p.input):Engine.botInput(r.state,i)));if(r.state.status==='finished')this.finish(r)}
  }}
 }
}
module.exports=RacingService
