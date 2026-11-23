const {randomUUID}=require('node:crypto')
const Engine=require('../public/js/duel-engine')
class CombatService {
  constructor({persist,now=Date.now,maxMatches=200}){this.matches=new Map();this.active=new Map();this.persist=persist;this.now=now;this.maxMatches=maxMatches;this.lastTime=now();this.accumulator=0}
  create({id=randomUUID(),mode,participants,arena='cueva',mission=null}){
    if([...this.matches.values()].filter(m=>m.finishedAt===null).length>=this.maxMatches)throw Object.assign(new Error('Hay muchos combates activos. Intenta en un momento.'),{status:503})
    for(const p of participants)if(p.accountId&&this.active.has(p.accountId))throw Object.assign(new Error('Termina o abandona tu combate activo antes de iniciar otro.'),{status:409})
    const now=this.now(),m={id,mode,participants,arena,mission,createdAt:now,phase:'waiting',countdown:180,state:Engine.create(participants.map(p=>p.guardian)),inputs:[0,0],seq:[-1,-1],ready:participants.map(p=>!p.accountId),seen:[now,now],paused:false,finishedAt:null,result:null,saving:null,retryAt:0}
    this.matches.set(id,m);for(const p of participants)if(p.accountId)this.active.set(p.accountId,id)
    return m
  }
  get(id,accountId){const m=this.matches.get(id);if(!m)return null;const side=m.participants.findIndex(p=>p.accountId===accountId);return side<0?null:{match:m,side}}
  receive(id,accountId,{input,seq,ready=false,pause=false}){
    const found=this.get(id,accountId);if(!found)return null
    const {match:m,side}=found
    m.seen[side]=this.now()
    if(seq>m.seq[side]){m.seq[side]=seq;m.inputs[side]=input;if(ready)m.ready[side]=true;if(m.mode!=='pvp')m.paused=pause}
    if(m.phase==='waiting'&&m.ready.every(Boolean))m.phase='countdown'
    this.save(m);return this.snapshot(m,side)
  }
  snapshot(m,side){return {id:m.id,mode:m.mode,side,arena:m.arena,mission:m.mission?{id:m.mission.id,name:m.mission.name}:null,phase:m.phase,paused:m.paused,countdown:m.countdown,ack:m.seq[side],serverTime:this.now(),state:m.state,inputs:m.inputs,names:m.participants.map(p=>p.name),skins:m.participants.map(p=>p.skin||'clasico'),result:m.result?.[side]||null}}
  advance(){
    const now=this.now();this.accumulator+=Math.min(Math.max(now-this.lastTime,0),200);this.lastTime=now
    while(this.accumulator>=1000/60){this.accumulator-=1000/60;this.tick()}
    for(const m of this.matches.values()){
      if(m.phase==='waiting'&&now-m.createdAt>60000)this.end(m,null,'not-ready',true)
      if(['countdown','playing'].includes(m.phase)){
        const missing=m.participants.map((p,i)=>p.accountId&&now-m.seen[i]>15000)
        if(m.mode==='pvp'&&missing.some(Boolean))this.end(m,missing.every(Boolean)?null:missing[0]?1:0,'disconnected')
        else if(m.mode!=='pvp'&&now-m.seen[0]>120000)this.end(m,1,'disconnected')
      }
      this.save(m)
      if(m.finishedAt!==null&&m.result&&now-m.finishedAt>5*60000)this.matches.delete(m.id)
    }
  }
  tick(){
    const now=this.now()
    for(const m of this.matches.values()){
      if(m.phase==='countdown'&&!m.paused){if(--m.countdown<=0)m.phase='playing'}
      else if(m.phase==='playing'&&!m.paused){
        const inputs=m.inputs.map((v,i)=>now-m.seen[i]>400?0:v)
        if(m.mode!=='pvp')inputs[1]=Engine.botInput(m.state)
        Engine.step(m.state,inputs)
        if(m.state.status==='finished')this.end(m,m.state.winner,m.state.reason)
      }
    }
  }
  end(m,winner,reason,cancelled=false){
    if(m.finishedAt!==null)return
    m.phase=cancelled?'cancelled':'finished';m.finishedAt=this.now();m.inputs=[0,0];Engine.finish(m.state,winner,reason)
    for(const p of m.participants)if(p.accountId&&this.active.get(p.accountId)===m.id)this.active.delete(p.accountId)
    if(cancelled)m.result=m.participants.map(()=>({outcome:'cancelled',reason}))
    this.save(m)
  }
  abandon(id,accountId){const found=this.get(id,accountId);if(!found)return null;this.end(found.match,1-found.side,'abandoned',found.match.phase==='waiting');return this.snapshot(found.match,found.side)}
  save(m){
    if(m.phase!=='finished'||m.result||m.saving||this.now()<m.retryAt)return
    m.saving=Promise.resolve().then(()=>this.persist(m)).then(result=>{m.result=result}).catch(error=>{m.retryAt=this.now()+2000;console.error('No se pudo guardar el combate:',error.message)}).finally(()=>{m.saving=null})
  }
}
module.exports=CombatService
