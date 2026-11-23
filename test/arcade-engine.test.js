const test=require('node:test')
const assert=require('node:assert/strict')
const A=require('../public/js/arcade-engine')

// Uses exactly the same four inputs available to a player, without moving entities directly.
function winningReplay(levelId,guardian='Kabrak',ranged=false){
  const state=A.create(levelId,guardian),inputs=[]
  while(state.status==='playing'&&state.tick<6000){
    const p=state.player,b=state.boss
    let input=ranged?A.INPUT.SHOOT:A.INPUT.ATTACK
    if(!b.active){
      input|=A.INPUT.RIGHT
      const ground=state.platforms.find(q=>q.h>24&&p.x+p.w>q.x&&p.x<q.x+q.w)
      if(p.grounded&&((ground&&p.x>ground.x+ground.w-105)||state.enemies.some(e=>e.hp>0&&e.x>p.x&&e.x-p.x<120)))input|=A.INPUT.JUMP
    }else{
      if(p.x<2730)input|=A.INPUT.RIGHT
      if(p.grounded&&state.projectiles.some(shot=>shot.vx<0&&shot.x>p.x+p.w&&shot.x-p.x<150))input|=A.INPUT.JUMP
    }
    const previous=inputs.at(-1)
    if(previous&&previous[0]===input)previous[1]++;else inputs.push([input,1])
    A.step(state,input)
  }
  return {state,inputs}
}
module.exports={winningReplay}
for(const level of A.LEVELS)test(`se puede completar ${level.id} y reproducir la victoria en servidor`,()=>{
  const {state,inputs}=winningReplay(level.id)
  assert.equal(state.status,'won')
  assert.equal(state.boss.hp,0)
  assert.ok(state.loot.gold>0)
  assert.ok(state.loot.jade>0)
  assert.ok(state.loot.obsidian>0)
  assert.deepEqual(A.replay(level.id,inputs),state)
  const reward=A.reward(state)
  assert.equal(reward.gold,level.reward.gold+state.loot.gold)
})
test('salto aterriza sin atravesar el suelo y requiere soltar el botón',()=>{
  const s=A.create('selva')
  for(let i=0;i<30;i++)A.step(s,0)
  assert.equal(s.player.grounded,true)
  A.step(s,A.INPUT.JUMP)
  assert.ok(s.player.vy<0)
  for(let i=0;i<70;i++)A.step(s,A.INPUT.JUMP)
  assert.equal(s.player.grounded,true)
  assert.equal(s.player.y+s.player.h,450)
})
test('caer consume vidas, conserva tesoros y termina al agotar tres',()=>{
  const s=A.create('selva');s.loot.gold=3
  for(let i=0;i<3;i++){s.player.y=600;A.step(s,0)}
  assert.equal(s.status,'lost');assert.equal(s.player.lives,0);assert.equal(s.loot.gold,3)
})
test('repeticiones inválidas, excesivas o posteriores al final se rechazan',()=>{
  for(const inputs of [null,[],[[32,1]],[[1,-1]],[[1,1.5]],[[0,A.MAX_TICKS+1]],Array(12001).fill([0,1])])assert.throws(()=>A.replay('selva',inputs))
  const {inputs}=winningReplay('selva');assert.throws(()=>A.replay('selva',[...inputs,[0,1]]))
  assert.notEqual(A.replay('selva',[[0,100]]).status,'won')
})

test('poder a distancia: dirección, recarga, impacto único y bloqueo por plataformas',()=>{
  const s=A.create('selva',"B'alam")
  for(let i=0;i<30;i++)A.step(s,0)
  A.step(s,A.INPUT.SHOOT)
  assert.equal(s.playerShots.length,1);assert.equal(s.playerShots[0].element,'fire');assert.ok(s.playerShots[0].vx>0)
  for(let i=0;i<12;i++)A.step(s,A.INPUT.SHOOT)
  assert.equal(s.playerShots.length,1)
  const left=A.create('selva',"Iq'");A.step(left,A.INPUT.LEFT|A.INPUT.SHOOT)
  assert.ok(left.playerShots[0].vx<0);assert.equal(left.playerShots[0].element,'water')
  const hit=A.create('selva');hit.enemies=[{...hit.enemies[0],x:210,min:210,max:210}]
  for(let i=0;i<30;i++)A.step(hit,0)
  A.step(hit,A.INPUT.SHOOT)
  for(let i=0;i<25;i++)A.step(hit,0)
  assert.equal(hit.enemies[0].hp,1);assert.equal(hit.playerShots.length,0)
  const wall=A.create('selva');wall.platforms.push({x:150,y:340,w:20,h:110})
  for(let i=0;i<30;i++)A.step(wall,0)
  A.step(wall,A.INPUT.SHOOT);for(let i=0;i<15;i++)A.step(wall,0)
  assert.equal(wall.playerShots.length,0)
})
test('cada guardián puede vencer con proyectiles y reproducir su poder',()=>{
  for(const guardian of Object.keys(A.POWERS)){
    const {state,inputs}=winningReplay('selva',guardian,true)
    assert.equal(state.status,'won',guardian)
    assert.deepEqual(A.replay('selva',inputs,guardian),state)
  }
})
test('chichicaste permanece fijo, no se aplasta y puede despejarse con proyectiles',()=>{
  const s=A.create('selva'),plant=s.enemies.find(e=>e.type==='chichicaste'),start=plant.x
  s.player.x=plant.x;s.player.y=plant.y-s.player.h-1;s.player.vy=3
  A.step(s,0);assert.equal(plant.hp,2);assert.equal(s.player.hp,4)
  assert.equal(plant.x,start)
  s.player.x=plant.x-170;s.player.y=388;s.player.vy=0;s.player.grounded=true;s.player.facing=1
  for(let i=0;i<80;i++)A.step(s,A.INPUT.SHOOT)
  assert.equal(plant.hp,0);assert.equal(plant.x,start)
})

test('API arcade: desbloqueos, verificación, propiedad y abono único aun con concurrencia',async(t)=>{
  const {Pool}=require('pg'),{spawn}=require('node:child_process'),{randomUUID,scryptSync}=require('node:crypto'),path=require('node:path')
  const pool=new Pool({connectionString:process.env.DATABASE_URL}),id=randomUUID(),otherId=randomUUID(),token=randomUUID(),otherToken=randomUUID(),port=19572
  const db=require('../db');await db.initialize()
  const server=spawn(process.execPath,[path.join(__dirname,'..','index.js')],{env:{...process.env,PORT:String(port),NODE_ENV:'development'},stdio:['ignore','pipe','pipe']})
  t.after(async()=>{server.kill();await pool.query('DELETE FROM accounts WHERE id=ANY($1::uuid[])',[[id,otherId]]);await pool.end();await db.close()})
  let output='';await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(new Error(output)),8000);server.stdout.on('data',data=>{output+=data;if(output.includes('Servidor funcionando')){clearTimeout(timeout);resolve()}});server.stderr.on('data',data=>{output+=data})})
  for(const [account,session] of [[id,token],[otherId,otherToken]]){
    await pool.query("INSERT INTO accounts (id,username,display_name,email,password_salt,password_hash,active) VALUES ($1,$2,'Arcade Test',$3,'test',$4,true)",[account,`arc_${account.slice(0,12)}`,`${account}@example.test`,scryptSync('arcade-test-only','test',64).toString('hex')])
    await db.createSession(account,require('node:crypto').createHash('sha256').update(session).digest('hex'),Date.now()+3600000)
  }
  const request=(route,body,auth=token)=>fetch(`http://127.0.0.1:${port}${route}`,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${auth}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})})
  assert.equal((await request('/arcade/progreso',null,'')).status,401)
  let levels=(await (await request('/arcade/progreso')).json()).levels
  assert.deepEqual(levels.map(l=>l.unlocked),[true,false,false])
  assert.equal((await request('/arcade/iniciar',{levelId:'volcan',guardian:'Kabrak'})).status,403)
  assert.equal((await request('/arcade/iniciar',{levelId:'selva',guardian:"B'atz"})).status,403)
  assert.equal((await request('/arcade/iniciar',{levelId:'selva',guardian:'inventado'})).status,400)
  const run=await (await request('/arcade/iniciar',{levelId:'selva',guardian:'Cadejo'})).json()
  assert.equal((await request('/arcade/finalizar',{id:run.id,inputs:[[0,1]]})).status,400)
  const {state,inputs}=winningReplay('selva','Cadejo',true)
  assert.equal((await request('/arcade/finalizar',{id:run.id,inputs},otherToken)).status,404)
  // A valid replay cannot be submitted faster than its actual game duration.
  assert.equal((await request('/arcade/finalizar',{id:run.id,inputs})).status,400)
  await pool.query("UPDATE arcade_runs SET created_at=now()-interval '2 minutes' WHERE id=$1",[run.id])
  const responses=await Promise.all([request('/arcade/finalizar',{id:run.id,inputs}),request('/arcade/finalizar',{id:run.id,inputs})])
  assert.deepEqual(responses.map(r=>r.status),[200,200])
  const results=await Promise.all(responses.map(r=>r.json()));assert.deepEqual(results[0],results[1]);assert.equal(results[0].firstCompletion,true)
  const wallet=(await pool.query('SELECT gold,jade,obsidian FROM player_wallets WHERE account_id=$1',[id])).rows[0]
  assert.deepEqual(wallet,A.reward(state))
  levels=(await (await request('/arcade/progreso')).json()).levels;assert.deepEqual(levels.map(l=>l.unlocked),[true,true,false])
  const repeat=await (await request('/arcade/iniciar',{levelId:'selva',guardian:'Cadejo'})).json()
  await pool.query("UPDATE arcade_runs SET created_at=now()-interval '2 minutes' WHERE id=$1",[repeat.id])
  const result=await (await request('/arcade/finalizar',{id:repeat.id,inputs})).json()
  assert.equal(result.firstCompletion,false);assert.deepEqual(result.reward,{gold:0,jade:0,obsidian:0})
  assert.deepEqual((await pool.query('SELECT gold,jade,obsidian FROM player_wallets WHERE account_id=$1',[id])).rows[0],wallet)
  const abandoned=await (await request('/arcade/iniciar',{levelId:'ruinas',guardian:'Kabrak'})).json()
  await request('/arcade/iniciar',{levelId:'ruinas',guardian:'Kabrak'})
  assert.equal((await request('/arcade/finalizar',{id:abandoned.id,inputs})).status,404)
})
