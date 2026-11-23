const test=require('node:test'),assert=require('node:assert/strict'),Engine=require('../public/js/racing-engine'),Sync=require('../public/js/racing-sync')
test('las respuestas no reinician posición ni velocidad y convergen suavemente a la autoridad',()=>{
 const local=Engine.create(['Cadejo']),server=Engine.create(['Cadejo']);for(let i=0;i<100;i++)Engine.step(local,[4]);Object.assign(server,structuredClone(local));server.racers[0].progress-=.0007;server.racers[0].lane+=.1
 const snap={state:server,side:0,mode:'maquina',phase:'playing'},predicted=Sync.reconcile(local,snap,4,0)
 assert.equal(predicted.racers[0].progress,local.racers[0].progress);assert.equal(predicted.racers[0].lane,local.racers[0].lane);assert.equal(predicted.racers[0].speed,local.racers[0].speed)
 const error=Math.abs(predicted.racers[0].correction.progress);for(let i=0;i<20;i++){const previous=predicted.racers[0].progress;Sync.step(predicted,[4]);assert(predicted.racers[0].progress>previous)}assert(Math.abs(predicted.racers[0].correction.progress)<error*.04)
 assert.deepEqual(snap.state,server)
})
test('nuevas vueltas, pausa, finales y saltos grandes respetan el servidor',()=>{
 const local=Engine.create(['Cadejo']),server=structuredClone(local);server.racers[0].progress=1
 for(const phase of ['playing','finished','countdown']){const reconciled=Sync.reconcile(local,{state:server,phase,side:0,mode:'maquina'},4);assert.equal(reconciled.racers[0].progress,1)}
 assert.equal(Sync.reconcile(local,{state:null},0),null)
})
test('latencia variable mantiene el avance local continuo entre respuestas',()=>{
 let predicted=Engine.create(['Cadejo']);const server=Engine.create(['Cadejo'])
 for(let packet=0;packet<80;packet++){for(let step=0;step<3;step++){Sync.step(predicted,[4]);Engine.step(server,[4])}const previous=predicted.racers[0].progress;predicted=Sync.reconcile(predicted,{state:server,phase:'playing',side:0,mode:'maquina'},4,[15,65,40,100][packet%4]);assert.equal(predicted.racers[0].progress,previous)}
})
