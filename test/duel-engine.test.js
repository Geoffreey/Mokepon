const test=require('node:test'),assert=require('node:assert/strict'),E=require('../public/js/duel-engine'),Service=require('../server/combat-service')
test('el mismo movimiento permite correr, saltar y aterrizar sin atravesar plataformas',()=>{
 const s=E.create(['Cadejo','Kabrak']);E.step(s,[E.INPUT.RIGHT|E.INPUT.JUMP,0]);assert.ok(s.fighters[0].x>150);assert.ok(s.fighters[0].vy<0)
 for(let i=0;i<80;i++)E.step(s,[0,0]);assert.equal(s.fighters[0].grounded,true);assert.equal(s.fighters[0].y+s.fighters[0].h,450)
})
test('un proyectil alcanza al rival y el servidor puede decidir un knockout',()=>{
 const s=E.create(['Cadejo','Kabrak']);for(let i=0;i<1500&&s.status==='playing';i++)E.step(s,[E.INPUT.SHOOT,0])
 assert.equal(s.status,'finished');assert.equal(s.winner,0);assert.equal(s.fighters[1].hp,0)
})
test('el escudo bloquea de frente, consume energía y no protege la espalda',()=>{
 const s=E.create(['Cadejo','Kabrak']),p=s.fighters[1];p.blocking=true;p.facing=-1
 assert.equal(E.strike(s,1,10,p.x-20),false);assert.equal(p.hp,100);assert.equal(p.stamina,80)
 p.hurt=0;assert.equal(E.strike(s,1,10,p.x+100),true);assert.equal(p.hp,90)
 p.hurt=0;p.stamina=0;E.strike(s,1,10,p.x-20);assert.equal(p.hp,80)
 for(let i=0;i<100;i++)E.step(s,[0,0]);assert.ok(p.stamina>0)
})
test('no se puede atacar mientras se mantiene el escudo y un golpe no se repite cada frame',()=>{
 const s=E.create(['Cadejo','Kabrak']);s.fighters[1].x=235
 for(let i=0;i<10;i++)E.step(s,[E.INPUT.ATTACK|E.INPUT.SHOOT|E.INPUT.BLOCK,0])
 assert.equal(s.shots.length,0);assert.equal(s.fighters[1].hp,100)
 for(let i=0;i<24;i++)E.step(s,[E.INPUT.ATTACK,0]);assert.equal(s.fighters[1].hp,88)
})
test('el bot persigue, ataca, se defiende y puede saltar',()=>{
 const s=E.create(['Cadejo','Kabrak']);assert.ok(E.botInput(s)&E.INPUT.LEFT)
 s.fighters[0].x=650;assert.ok(E.botInput(s)&E.INPUT.ATTACK)
 s.shots=[{owner:0,x:700,vx:8.5}];assert.ok(E.botInput(s)&E.INPUT.BLOCK)
 s.tick=150;assert.ok(E.botInput(s)&E.INPUT.JUMP)
})
function harness(persist=async()=>[{outcome:'victoria'},{outcome:'derrota'}]){
 let time=1000;const service=new Service({persist,now:()=>time})
 const create=(mode='pvp')=>service.create({mode,participants:[{accountId:'a',guardian:'Cadejo',name:'A'},{accountId:mode==='pvp'?'b':null,guardian:'Kabrak',name:'B'}]})
 return {service,create,advance(ms){time+=ms;service.advance()}}
}
test('espera a ambos participantes, rechaza espectadores y descarta controles viejos',()=>{
 const {service,create}=harness(),m=create()
 assert.equal(service.get(m.id,'intruso'),null)
 service.receive(m.id,'a',{input:2,seq:5,ready:true});assert.equal(m.phase,'waiting')
 service.receive(m.id,'b',{input:1,seq:1,ready:true});assert.equal(m.phase,'countdown')
 service.receive(m.id,'a',{input:16,seq:4,ready:true});assert.equal(m.inputs[0],2);assert.equal(m.seq[0],5)
 assert.throws(()=>create(),/Termina o abandona/)
})
test('el cliente no adelanta el reloj enviando más controles',()=>{
 const {service,create,advance}=harness(),m=create();service.receive(m.id,'a',{input:0,seq:0,ready:true});service.receive(m.id,'b',{input:0,seq:0,ready:true})
 for(let seq=1;seq<100;seq++)service.receive(m.id,'a',{input:16,seq,ready:true})
 assert.equal(m.state.tick,0);assert.equal(m.countdown,180)
 advance(100);assert.ok(m.countdown<180);assert.equal(m.state.tick,0)
})
test('no hay pausa en PvP; PvE sí pausa; un control vencido deja de mover',()=>{
 const {service,create,advance}=harness(),m=create();m.phase='playing'
 service.receive(m.id,'a',{input:2,seq:0,ready:true,pause:true});assert.equal(m.paused,false)
 advance(100);assert.ok(m.state.fighters[0].x>150)
 const x=m.state.fighters[0].x;advance(500);assert.equal(m.state.fighters[0].x,x)
 const solo=harness(),bot=solo.create('maquina');bot.phase='playing';solo.service.receive(bot.id,'a',{input:2,seq:0,ready:true,pause:true});solo.advance(100);assert.equal(bot.state.tick,0)
})
test('desconexión, abandono y cancelación guardan una sola vez el resultado correcto',async()=>{
 let writes=0;const h=harness(async m=>{writes++;return m.participants.map((_,i)=>({outcome:m.state.winner===i?'victoria':'derrota'}))}),m=h.create();m.phase='playing'
 h.advance(14900);h.service.receive(m.id,'a',{input:0,seq:0,ready:true});h.advance(200)
 assert.equal(m.phase,'finished');assert.equal(m.state.winner,0);assert.equal(m.state.reason,'disconnected')
 await m.saving;h.service.abandon(m.id,'a');h.service.save(m);assert.equal(writes,1)
 const waiting=h.create();h.service.abandon(waiting.id,'a');assert.equal(waiting.phase,'cancelled');assert.equal(writes,1)
})
