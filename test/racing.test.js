const test=require('node:test')
const assert=require('node:assert/strict')
const Engine=require('../public/js/racing-engine')
const Service=require('../server/racing-service')
const player=i=>({accountId:`account-${i}`,name:`Piloto ${i}`,guardian:Engine.GUARDIANS[i%8],skin:'clasico'})
function setup(){let now=0;const service=new Service({now:()=>now});return {service,advance(frames){for(let i=0;i<frames;i++){now+=1000/60;service.advance()}},setTime(t){now=t;service.advance()}}}
test('todos los guardianes y circuitos completan tres vueltas con controles reproducibles',()=>{
 for(const track of Engine.TRACKS)for(const guardian of Engine.GUARDIANS){const a=Engine.create([guardian],track.id),b=Engine.create([guardian],track.id)
  for(let i=0;i<10800&&a.status==='playing';i++){const input=Engine.botInput(a,0);Engine.step(a,[input]);Engine.step(b,[input])}
  assert.deepEqual(a,b);assert.equal(a.status,'finished');assert.notEqual(a.racers[0].finish,null);assert.equal(a.racers[0].progress,3)
 }
})
test('sin acelerar no se avanza; turbo consume energía y salir de pista limita velocidad',()=>{
 const a=Engine.create(['Cadejo']);for(let i=0;i<120;i++)Engine.step(a,[0]);assert.equal(a.racers[0].progress,0)
 const b=Engine.create(['Cadejo']);for(let i=0;i<100;i++){Engine.step(a,[4]);Engine.step(b,[20])}assert(b.racers[0].progress>a.racers[0].progress);assert(b.racers[0].energy<a.racers[0].energy)
 a.racers[0].lane=1.6;Engine.step(a,[4]);assert(a.racers[0].speed<=Engine.MAX_SPEED*.6)
})
test('salas: 2–6 jugadores, propiedad, listas, anfitrión y todos listos',()=>{
 const {service:s}=setup(),room=s.create(player(0),{mode:'online'});assert.equal(s.list()[0].count,1)
 assert.throws(()=>s.receive(room.id,'account-0',{seq:0,input:0,start:true,ready:true}),/al menos dos/)
 for(let i=1;i<6;i++)s.join(room.id,player(i))
 assert.throws(()=>s.join(room.id,player(6)),/llena/);assert.throws(()=>s.join(room.id,player(1)),/actual/)
 assert.throws(()=>s.receive(room.id,'intruso',{seq:0,input:4}),/acceso/)
 for(let i=1;i<6;i++)s.receive(room.id,`account-${i}`,{seq:0,input:0,ready:true,start:true})
 assert.equal(s.member(room.id,'account-0').room.phase,'waiting')
 const snapshot=s.receive(room.id,'account-0',{seq:1,input:0,start:true,ready:true,pause:true});assert.equal(snapshot.phase,'countdown');assert.equal(snapshot.paused,false);assert.equal(s.list().length,0)
})
test('máquina usa seis participantes en total y descarta secuencias anteriores',()=>{
 const {service:s,advance}=setup();assert.throws(()=>s.create(player(0),{count:7}),/inválida/)
 const r=s.create(player(0),{count:6});assert.equal(r.players.length,6)
 s.receive(r.id,'account-0',{seq:4,input:4,ready:true});s.receive(r.id,'account-0',{seq:3,input:8});assert.equal(s.member(r.id,'account-0').room.players[0].input,4)
 advance(185);assert.equal(s.member(r.id,'account-0').room.phase,'playing');advance(120);assert(s.member(r.id,'account-0').room.state.racers[1].progress>0)
})
test('pausa local detiene reloj; online ignora pausa; anfitrión se transfiere al salir',()=>{
 const {service:s,advance}=setup();const r=s.create(player(0));s.receive(r.id,'account-0',{seq:0,input:4,ready:true,pause:true});advance(100);assert.equal(s.member(r.id,'account-0').room.countdown,180)
 s.leave(r.id,'account-0');const online=s.create(player(0),{mode:'online'});s.join(online.id,player(1));s.leave(online.id,'account-0');assert.equal(s.member(online.id,'account-1').side,0)
})
test('desconexión y salida no permiten controles ni resultados falsos',()=>{
 const {service:s,setTime}=setup(),r=s.create(player(0),{mode:'online'});s.join(r.id,player(1));s.receive(r.id,'account-0',{seq:0,input:4,ready:true});s.receive(r.id,'account-1',{seq:0,input:4,ready:true});s.receive(r.id,'account-0',{seq:1,input:4,start:true});s.leave(r.id,'account-1');assert.throws(()=>s.receive(r.id,'account-1',{seq:1,input:4}),/acceso/);assert.equal(s.member(r.id,'account-0').room.state.racers[1].dnf,true)
 setTime(16000);assert.equal(s.rooms.size,0);assert.equal(s.active.size,0)
})
test('copa suma puntos una vez y recorre los tres circuitos sin duplicar abonos',()=>{
 const {service:s}=setup(),snapshot=s.create(player(0),{mode:'arcade',count:6});s.receive(snapshot.id,'account-0',{seq:0,input:4,ready:true});const {room:r}=s.member(snapshot.id,'account-0')
 for(let round=0;round<3;round++){r.state.racers.forEach((p,i)=>{p.finish=100+i;p.progress=3});r.state.status='finished';s.finish(r);s.finish(r);assert.equal(r.cupPoints[0],10*(round+1));if(round<2){s.next(r.id,'account-0');assert.equal(r.track,Engine.TRACKS[round+1].id)}}
 assert.throws(()=>s.next(r.id,'account-0'),/otro circuito/);s.leave(r.id,'account-0');assert.equal(s.active.size,0)
})
test('salas vencidas liberan cuentas y memoria',()=>{const {service:s,setTime}=setup();s.create(player(0),{mode:'online'});setTime(61000);assert.equal(s.rooms.size,0);assert.equal(s.active.size,0)})
test('salir tras llegar a la meta conserva el puesto de los demás jugadores',()=>{
 const {service:s}=setup(),r=s.create(player(0),{mode:'online'});s.join(r.id,player(1));s.start(s.rooms.get(r.id));const room=s.rooms.get(r.id);room.state.racers[0].finish=100;room.state.racers[0].progress=3;s.leave(r.id,'account-0');assert.equal(room.state.racers[0].dnf,false);assert.equal(Engine.ranking(room.state)[0],0)
})
test('trampas frenan, escudo protege y recompensas se cobran una vez por vuelta',()=>{
 const objects=Engine.objects('selva'),trap=objects.find(o=>o.type==='rock'),jade=objects.find(o=>o.type==='jade'),crate=objects.find(o=>o.type==='crate'),pad=objects.find(o=>o.type==='pad')
 const cross=(state,o)=>{const r=state.racers[0];r.progress=o.p-.0001;r.lane=o.lane;r.speed=Engine.MAX_SPEED;Engine.step(state,[4]);return r}
 let s=Engine.create(['Cadejo']),r=cross(s,trap);assert(r.spin>0);assert(r.speed<Engine.MAX_SPEED*.6)
 s=Engine.create(['Cadejo']);s.racers[0].shield=1;r=cross(s,trap);assert.equal(r.spin,0);assert.equal(r.shield,0)
 s=Engine.create(['Cadejo']);r=cross(s,jade);assert.equal(r.coins,1);cross(s,jade);assert.equal(r.coins,1)
 s=Engine.create(['Cadejo']);r=cross(s,crate);assert(r.shield||r.boostTicks||s.traps.length)
 s=Engine.create(['Cadejo']);r=cross(s,pad);assert(r.boostTicks>0)
})
test('derrapar y soltar da mini turbo; rectas sin dirección no lo generan',()=>{
 const s=Engine.create(['Cadejo']),r=s.racers[0];r.speed=Engine.MAX_SPEED
 for(let i=0;i<40;i++)Engine.step(s,[4|32|(i%20<10?1:2)])
 Engine.step(s,[4]);assert(r.boostTicks>0);assert.match(r.event,/Mini turbo/)
 const b=Engine.create(['Cadejo']);for(let i=0;i<60;i++)Engine.step(b,[36]);Engine.step(b,[4]);assert.equal(b.racers[0].boostTicks,0)
})
test('el límite de carrera se amplía a cinco minutos para pistas más largas',()=>{const s=Engine.create(['Cadejo']);s.tick=Engine.LIMIT-1;Engine.step(s,[0]);assert.equal(s.status,'finished');assert(Engine.LIMIT>180*60)})
test('cajas conceden los tres poderes; el escudo absorbe una trampa y el botín no se duplica',()=>{
 for(let prize=0;prize<3;prize++){
  const s=Engine.create(['Cadejo']),r=s.racers[0],box=Engine.objects('selva').find(o=>o.type==='crate'&&o.id%3===prize)
  r.progress=box.p-.00001;r.lane=box.lane;r.speed=Engine.MAX_SPEED;Engine.step(s,[4]);const coins=r.coins
  if(prize===0){assert.equal(r.shield,1);const trap=Engine.objects('selva').find(o=>o.type==='rock');r.progress=trap.p-.00001;r.lane=trap.lane;r.speed=Engine.MAX_SPEED;Engine.step(s,[4]);assert.equal(r.shield,0);assert.equal(r.spin,0)}
  if(prize===1){assert(r.boostTicks>0);assert.equal(r.coins,3)}
  if(prize===2){assert.equal(r.coins,5);assert.equal(s.traps.length,1)}
  r.progress=box.p-.00001;r.lane=box.lane;r.speed=Engine.MAX_SPEED;Engine.step(s,[4]);assert.equal(r.coins,coins)
 }
})
test('obstáculos limitados a tres tramos; mayoría de pista libre y bots sin turbo continuo',()=>{
 for(const track of Engine.TRACKS){const hazards=Engine.objects(track.id).filter(o=>['rock','oil','log','fire'].includes(o.type));assert.equal(hazards.length,6);assert(hazards.every(o=>Engine.hazardZone(o.p)));assert(Engine.HAZARD_ZONES.reduce((n,[a,b])=>n+b-a,0)<.2)}
 const state=Engine.create(['Cadejo','Kabrak']);let turbo=0;for(let i=0;i<900;i++){const input=Engine.botInput(state,1);if(input&16)turbo++;if(i<300)assert.equal(input&16,0);Engine.step(state,[4,input])}assert(turbo<90)
})
test('jugador y máquina comparten velocidad punta y aceleración con los mismos controles',()=>{
 const state=Engine.create(['Cadejo','Kabrak']);state.racers.forEach(r=>r.lane=0);for(let i=0;i<45;i++)Engine.step(state,[4,4]);assert.equal(state.racers[0].speed,Engine.MAX_SPEED);assert.equal(state.racers[1].speed,Engine.MAX_SPEED)
})
