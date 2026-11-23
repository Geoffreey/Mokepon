const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),Engine=require('../public/js/racing-engine')
test('la cámara dibuja todos los circuitos y vueltas sin mutar la simulación ni redimensionar cada frame',()=>{
 const source=fs.readFileSync(require.resolve('../public/js/racing-renderer'),'utf8');const sizes=[[1100,480],[355,550],[824,300]]
 for(const track of Engine.TRACKS)for(const [width,height] of sizes){let calls=0,resizes=0,bw=0,bh=0
  const methods=['clip','beginPath','moveTo','lineTo','closePath','fill','stroke','fillRect','strokeRect','arc','ellipse','roundRect','save','restore','translate','rotate','scale','fillText','strokeText','drawImage']
  const ctx={createLinearGradient(){return {addColorStop(){}}}};for(const method of methods)ctx[method]=(...args)=>{calls++;for(const arg of args)if(typeof arg==='number')assert(Number.isFinite(arg),method)}
  const canvas={clientWidth:width,clientHeight:height,getContext:()=>ctx,get width(){return bw},set width(v){bw=v;resizes++},get height(){return bh},set height(v){bh=v;resizes++}}
  const context=vm.createContext({MayabRacing:Engine});vm.runInContext(source,context);const renderer=context.MayabRacingRenderer.create(canvas,()=>({complete:false})),state=Engine.create(['Cadejo','Kabrak'],track.id),snapshot={track:track.id,side:0,players:[{guardian:'Cadejo'},{guardian:'Kabrak'}],state,phase:'playing'}
  for(const progress of [.1,1.3,2.8]){state.racers[0].progress=progress;state.racers[1].progress=progress+.01;const before=JSON.stringify(state);renderer.draw(snapshot,state,1000+progress*100,4);assert.equal(JSON.stringify(state),before)}
  assert(calls>1000);assert.equal(resizes,2)
 }
})

test('ocho karts propios, recortes de cabeza y monumentos fuera de la pista',()=>{
 const context=vm.createContext({MayabRacing:Engine});vm.runInContext(fs.readFileSync(require.resolve('../public/js/racing-renderer'),'utf8'),context)
 const {VEHICLES,LANDMARKS}=context.MayabRacingRenderer
 assert.equal(new Set(Object.values(VEHICLES).map(v=>v.form)).size,8)
 for(const guardian of Engine.GUARDIANS){const crop=VEHICLES[guardian].head;assert.equal(crop.length,4);assert(crop[0]+crop[2]<=1.001);assert(crop[1]+crop[3]<=1.001);assert(crop[2]<.5&&crop[3]<.65)}
 for(const kind of ['stela','stonehead','temple'])assert(LANDMARKS.some(o=>o.kind===kind&&Math.abs(o.lane)>1.5))
})
