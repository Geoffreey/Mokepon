const { Pool } = require("pg")
const fs = require("fs")
const path = require("path")

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: Number(process.env.DB_POOL_MAX || 10),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== "false" } : undefined
})

const mapAccount = (row) => row && ({
  id:row.id, usuario:row.username, nombre:row.display_name, correo:row.email,
  passwordSalt:row.password_salt, passwordHash:row.password_hash, activa:row.active,
  rol:row.role,
  puntos:row.points, batallas:row.battles_count, victorias:row.wins_count,
  derrotas:row.losses_count, empates:row.draws_count,
  activacion:row.code_hash ? { codigoHash:row.code_hash, reenvioHash:row.resend_hash, expira:new Date(row.activation_expires_at).getTime(), intentos:row.activation_attempts } : null
})

async function initialize() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL es obligatorio.")
  const client=await pool.connect()
  try {
    await client.query("SELECT pg_advisory_lock(hashtext('mokepon_schema_migrations'))")
    await client.query("CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())")
    const directory=path.join(__dirname,"migrations"),files=fs.readdirSync(directory).filter((name)=>name.endsWith(".sql")).sort()
    for(const file of files){
      const applied=await client.query("SELECT 1 FROM schema_migrations WHERE version=$1",[file])
      if(applied.rowCount)continue
      await client.query(fs.readFileSync(path.join(directory,file),"utf8"))
      await client.query("INSERT INTO schema_migrations (version) VALUES ($1)",[file])
    }
    await client.query("DELETE FROM account_sessions WHERE expires_at <= now()")
    const admins=String(process.env.ADMIN_USERNAMES||"").split(",").map((value)=>value.trim().toLowerCase()).filter(Boolean)
    if(admins.length)await client.query("UPDATE accounts SET role='admin',updated_at=now() WHERE username=ANY($1::text[])",[admins])
  } finally { await client.query("SELECT pg_advisory_unlock(hashtext('mokepon_schema_migrations'))").catch(()=>{});client.release() }
}

const accountSelect = `SELECT a.*, x.code_hash, x.resend_hash, x.expires_at activation_expires_at,
  x.attempts activation_attempts FROM accounts a LEFT JOIN account_activations x ON x.account_id=a.id`

async function findAccountByUsername(username) {
  return mapAccount((await pool.query(`${accountSelect} WHERE a.username=$1`, [username])).rows[0])
}
async function findAccountByEmail(email) {
  return mapAccount((await pool.query(`${accountSelect} WHERE a.email=$1`, [email])).rows[0])
}
async function findAccountById(id) {
  return mapAccount((await pool.query(`${accountSelect} WHERE a.id=$1`, [id])).rows[0])
}
async function findAccountBySession(tokenHash) {
  const result = await pool.query(`${accountSelect} JOIN account_sessions s ON s.account_id=a.id WHERE s.token_hash=$1 AND s.expires_at>now()`, [tokenHash])
  return mapAccount(result.rows[0])
}

async function createPendingAccount(account, activation) {
  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    await client.query(`INSERT INTO accounts (id,username,display_name,email,password_salt,password_hash)
      VALUES ($1,$2,$3,$4,$5,$6)`, [account.id,account.usuario,account.nombre,account.correo,account.passwordSalt,account.passwordHash])
    await client.query(`INSERT INTO account_activations (account_id,code_hash,resend_hash,expires_at)
      VALUES ($1,$2,$3,$4)`, [account.id,activation.codigoHash,activation.reenvioHash,new Date(activation.expira)])
    await client.query("COMMIT")
  } catch (error) { await client.query("ROLLBACK"); throw error } finally { client.release() }
}
const deleteAccount = (id) => pool.query("DELETE FROM accounts WHERE id=$1", [id])

async function replaceActivation(accountId, activation) {
  await pool.query(`INSERT INTO account_activations (account_id,code_hash,resend_hash,expires_at,attempts,updated_at)
    VALUES ($1,$2,$3,$4,0,now()) ON CONFLICT (account_id) DO UPDATE SET code_hash=EXCLUDED.code_hash,
    resend_hash=EXCLUDED.resend_hash,expires_at=EXCLUDED.expires_at,attempts=0,updated_at=now()`,
  [accountId,activation.codigoHash,activation.reenvioHash,new Date(activation.expira)])
}
const updateResendHash = (accountId, resendHash) => pool.query("UPDATE account_activations SET resend_hash=$2,updated_at=now() WHERE account_id=$1", [accountId,resendHash])
const incrementActivationAttempts = (accountId) => pool.query("UPDATE account_activations SET attempts=attempts+1,updated_at=now() WHERE account_id=$1 AND attempts<5", [accountId])

async function activateAccount(accountId) {
  const client=await pool.connect()
  try { await client.query("BEGIN"); await client.query("UPDATE accounts SET active=true,updated_at=now() WHERE id=$1",[accountId]); await client.query("DELETE FROM account_activations WHERE account_id=$1",[accountId]); await client.query("COMMIT") }
  catch(error){await client.query("ROLLBACK");throw error}finally{client.release()}
}

async function createSession(accountId, tokenHash, expiresAt) {
  const client=await pool.connect()
  try {
    await client.query("BEGIN")
    await client.query("DELETE FROM account_sessions WHERE account_id=$1 AND expires_at<=now()",[accountId])
    await client.query(`DELETE FROM account_sessions WHERE id IN (SELECT id FROM account_sessions WHERE account_id=$1 ORDER BY created_at DESC OFFSET 4)`,[accountId])
    await client.query("INSERT INTO account_sessions (account_id,token_hash,expires_at) VALUES ($1,$2,$3)",[accountId,tokenHash,new Date(expiresAt)])
    await client.query("COMMIT")
  } catch(error){await client.query("ROLLBACK");throw error}finally{client.release()}
}
const deleteSession = (tokenHash) => pool.query("DELETE FROM account_sessions WHERE token_hash=$1",[tokenHash])

async function getStatistics(accountId) {
  const account=(await pool.query("SELECT points,battles_count,wins_count,losses_count,draws_count FROM accounts WHERE id=$1",[accountId])).rows[0]
  if(!account)return null
  const history=(await pool.query(`SELECT br.battle_id id,(extract(epoch FROM b.played_at)*1000)::bigint fecha,
    opponent.display_name oponente,CASE WHEN b.player_one_id=br.account_id THEN b.player_one_guardian ELSE b.player_two_guardian END guardian,
    br.result resultado,br.rounds_for "rondasAFavor",br.rounds_against "rondasEnContra"
    FROM battle_results br JOIN battles b ON b.id=br.battle_id JOIN accounts opponent ON opponent.id=br.opponent_id
    WHERE br.account_id=$1 ORDER BY b.played_at DESC LIMIT 10`,[accountId])).rows
  return {puntos:account.points,nivel:Math.floor(account.battles_count/5)+1,batallas:account.battles_count,victorias:account.wins_count,derrotas:account.losses_count,empates:account.draws_count,historial:history.map((h)=>({...h,fecha:Number(h.fecha)}))}
}

async function recordBattle(battle) {
  const client=await pool.connect()
  try {
    await client.query("BEGIN")
    const inserted=await client.query(`INSERT INTO battles (id,player_one_id,player_two_id,player_one_guardian,player_two_guardian,player_one_rounds,player_two_rounds)
      VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING RETURNING id`,[battle.id,battle.one.accountId,battle.two.accountId,battle.one.guardian,battle.two.guardian,battle.one.rounds,battle.two.rounds])
    if(!inserted.rowCount){await client.query("ROLLBACK");return {recorded:false,economy:null}}
    for(const [side,opponent] of [[battle.one,battle.two],[battle.two,battle.one]]){
      const points=side.result==="victoria"?30:side.result==="empate"?10:5
      await client.query(`INSERT INTO battle_results (battle_id,account_id,opponent_id,result,points_awarded,rounds_for,rounds_against) VALUES ($1,$2,$3,$4,$5,$6,$7)`,[battle.id,side.accountId,opponent.accountId,side.result,points,side.rounds,opponent.rounds])
      await client.query(`UPDATE accounts SET points=points+$2,battles_count=battles_count+1,
        wins_count=wins_count+($3='victoria')::int,losses_count=losses_count+($3='derrota')::int,
        draws_count=draws_count+($3='empate')::int,updated_at=now() WHERE id=$1`,[side.accountId,points,side.result])
    }
    let economy={type:"pvp",winnerId:null,loserId:null,transfer:{jade:0,obsidian:0,gold:0}}
    const winner=battle.one.result==="victoria"?battle.one:battle.two.result==="victoria"?battle.two:null,loser=winner?(winner===battle.one?battle.two:battle.one):null
    await client.query("INSERT INTO player_wallets (account_id) VALUES ($1),($2) ON CONFLICT DO NOTHING",[battle.one.accountId,battle.two.accountId])
    const wallets=(await client.query("SELECT account_id,jade,obsidian,gold FROM player_wallets WHERE account_id=ANY($1::uuid[]) ORDER BY account_id FOR UPDATE",[[battle.one.accountId,battle.two.accountId]])).rows
    if(winner&&loser){
      const loserWallet=wallets.find((wallet)=>wallet.account_id===loser.accountId),transfer={jade:Math.min(Number(loserWallet?.jade||0),3),obsidian:Math.min(Number(loserWallet?.obsidian||0),1),gold:Math.min(Number(loserWallet?.gold||0),20)}
      await client.query("UPDATE player_wallets SET jade=jade+$2,obsidian=obsidian+$3,gold=gold+$4,updated_at=now() WHERE account_id=$1",[winner.accountId,transfer.jade,transfer.obsidian,transfer.gold])
      await client.query("UPDATE player_wallets SET jade=jade-$2,obsidian=obsidian-$3,gold=gold-$4,updated_at=now() WHERE account_id=$1",[loser.accountId,transfer.jade,transfer.obsidian,transfer.gold])
      economy={type:"pvp",winnerId:winner.accountId,loserId:loser.accountId,transfer}
    }
    for(const side of [battle.one,battle.two]){
      const won=side.accountId===economy.winnerId,lost=side.accountId===economy.loserId,delta={jade:won?economy.transfer.jade:lost?-economy.transfer.jade:0,obsidian:won?economy.transfer.obsidian:lost?-economy.transfer.obsidian:0,gold:won?economy.transfer.gold:lost?-economy.transfer.gold:0},opponent=side===battle.one?battle.two:battle.one
      await client.query(`INSERT INTO combat_economy_events (id,source_type,source_id,account_id,opponent_id,outcome,jade_delta,obsidian_delta,gold_delta)
        VALUES (gen_random_uuid(),'pvp',$1,$2,$3,$4,$5,$6,$7)`,[battle.id,side.accountId,opponent.accountId,side.result,delta.jade,delta.obsidian,delta.gold])
    }
    await client.query("COMMIT");return {recorded:true,economy}
  } catch(error){await client.query("ROLLBACK");throw error}finally{client.release()}
}

async function recordMachineBattle({id,accountId,outcome,reward,dailyLimit=20}) {
  const client=await pool.connect()
  try{
    await client.query("BEGIN")
    const previous=(await client.query(`SELECT outcome,jade_delta,obsidian_delta,gold_delta,capped FROM combat_economy_events
      WHERE source_type='machine' AND source_id=$1 AND account_id=$2`,[id,accountId])).rows[0]
    if(previous){const wallet=(await client.query("SELECT jade,obsidian,gold FROM player_wallets WHERE account_id=$1",[accountId])).rows[0]||{jade:0,obsidian:0,gold:0};await client.query("COMMIT");return {reward:{jade:previous.jade_delta,obsidian:previous.obsidian_delta,gold:previous.gold_delta},wallet,capped:previous.capped,replayed:true}}
    await client.query("INSERT INTO player_wallets (account_id) VALUES ($1) ON CONFLICT DO NOTHING",[accountId])
    await client.query("SELECT account_id FROM player_wallets WHERE account_id=$1 FOR UPDATE",[accountId])
    const rewardedToday=Number((await client.query(`SELECT count(*)::int count FROM combat_economy_events
      WHERE account_id=$1 AND source_type='machine' AND outcome='victoria' AND (jade_delta>0 OR obsidian_delta>0 OR gold_delta>0) AND created_at>=date_trunc('day',now())`,[accountId])).rows[0].count),capped=outcome==="victoria"&&rewardedToday>=dailyLimit
    const delta=outcome==="victoria"&&!capped?reward:{jade:0,obsidian:0,gold:0}
    await client.query(`INSERT INTO combat_economy_events (id,source_type,source_id,account_id,outcome,jade_delta,obsidian_delta,gold_delta,capped)
      VALUES (gen_random_uuid(),'machine',$1,$2,$3,$4,$5,$6,$7)`,[id,accountId,outcome,delta.jade,delta.obsidian,delta.gold,capped])
    if(delta.jade||delta.obsidian||delta.gold)await client.query("UPDATE player_wallets SET jade=jade+$2,obsidian=obsidian+$3,gold=gold+$4,updated_at=now() WHERE account_id=$1",[accountId,delta.jade,delta.obsidian,delta.gold])
    const wallet=(await client.query("SELECT jade,obsidian,gold FROM player_wallets WHERE account_id=$1",[accountId])).rows[0]
    await client.query("COMMIT");return {reward:delta,wallet,capped,replayed:false}
  }catch(error){await client.query("ROLLBACK");throw error}finally{client.release()}
}

async function getAdventureProgress(accountId) {
  const [wallet,missions,unlocks]=await Promise.all([
    pool.query("SELECT jade,obsidian,gold FROM player_wallets WHERE account_id=$1",[accountId]),
    pool.query("SELECT mission_id FROM mission_progress WHERE account_id=$1 ORDER BY completed_at",[accountId]),
    pool.query("SELECT unlock_type,unlock_id FROM player_unlocks WHERE account_id=$1 ORDER BY unlocked_at",[accountId])
  ])
  return {wallet:wallet.rows[0]||{jade:0,obsidian:0,gold:0},completedMissions:missions.rows.map((row)=>row.mission_id),unlocks:unlocks.rows.map((row)=>({type:row.unlock_type,id:row.unlock_id}))}
}

async function completeMission(accountId,mission) {
  const client=await pool.connect()
  try{
    await client.query("BEGIN")
    const completed=await client.query("INSERT INTO mission_progress (account_id,mission_id) VALUES ($1,$2) ON CONFLICT DO NOTHING RETURNING mission_id",[accountId,mission.id])
    if(!completed.rowCount){await client.query("ROLLBACK");return {firstCompletion:false,progress:await getAdventureProgress(accountId)}}
    await client.query(`INSERT INTO player_wallets (account_id,jade,obsidian,gold) VALUES ($1,$2,$3,$4)
      ON CONFLICT (account_id) DO UPDATE SET jade=player_wallets.jade+EXCLUDED.jade,obsidian=player_wallets.obsidian+EXCLUDED.obsidian,gold=player_wallets.gold+EXCLUDED.gold,updated_at=now()`,[accountId,mission.reward.jade||0,mission.reward.obsidian||0,mission.reward.gold||0])
    if(mission.unlock)await client.query("INSERT INTO player_unlocks (account_id,unlock_type,unlock_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING",[accountId,mission.unlock.type,mission.unlock.id])
    await client.query("COMMIT")
    return {firstCompletion:true,progress:await getAdventureProgress(accountId)}
  }catch(error){await client.query("ROLLBACK");throw error}finally{client.release()}
}

const insertAudit = (entry) => pool.query(`INSERT INTO audit_events (occurred_at,event,account_id,actor_id,username,ip,location,user_agent,success)
  VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,[entry.fecha,entry.evento,entry.cuentaId,entry.actorId,entry.usuario,entry.ip,entry.ubicacion,entry.agente,entry.exito])

async function playCasinoRound({id,accountId,clientRoundId,game,currency,bet,choice,dieOne=null,dieTwo=null,outcome,payout}) {
  const client=await pool.connect()
  try{
    await client.query("BEGIN")
    const previous=await client.query(`SELECT id,game,currency,bet,choice,die_one "dieOne",die_two "dieTwo",outcome,payout,net,created_at "createdAt" FROM casino_plays WHERE account_id=$1 AND client_round_id=$2`,[accountId,clientRoundId])
    if(previous.rowCount){const wallet=(await client.query("SELECT jade,obsidian,gold FROM player_wallets WHERE account_id=$1",[accountId])).rows[0]||{jade:0,obsidian:0,gold:0};await client.query("COMMIT");return {...previous.rows[0],wallet,replayed:true}}
    await client.query("INSERT INTO player_wallets (account_id) VALUES ($1) ON CONFLICT DO NOTHING",[accountId])
    const wallet=(await client.query("SELECT jade,obsidian,gold FROM player_wallets WHERE account_id=$1 FOR UPDATE",[accountId])).rows[0]
    if(Number(wallet[currency])<bet){await client.query("ROLLBACK");return null}
    const net=payout-bet
    await client.query(`UPDATE player_wallets SET ${currency}=${currency}+$2,updated_at=now() WHERE account_id=$1`,[accountId,net])
    const played=(await client.query(`INSERT INTO casino_plays (id,account_id,client_round_id,game,currency,bet,choice,die_one,die_two,outcome,payout,net) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id,game,currency,bet,choice,die_one "dieOne",die_two "dieTwo",outcome,payout,net,created_at "createdAt"`,[id,accountId,clientRoundId,game,currency,bet,choice,dieOne,dieTwo,outcome,payout,net])).rows[0]
    const updated=(await client.query("SELECT jade,obsidian,gold FROM player_wallets WHERE account_id=$1",[accountId])).rows[0]
    await client.query("COMMIT");return {...played,wallet:updated,replayed:false}
  }catch(error){await client.query("ROLLBACK");throw error}finally{client.release()}
}
const getCasinoHistory = async(accountId) => (await pool.query(`SELECT id,game,currency,bet,choice,die_one "dieOne",die_two "dieTwo",outcome,payout,net,created_at "createdAt" FROM casino_plays WHERE account_id=$1 ORDER BY created_at DESC LIMIT 12`,[accountId])).rows

async function getAdminSummary() {
  const result=await pool.query(`SELECT count(*)::int users,
    count(*) FILTER (WHERE active)::int active_users,
    count(*) FILTER (WHERE created_at>=now()-interval '7 days')::int new_users,
    coalesce(sum(battles_count),0)::int total_player_battles FROM accounts`)
  const events=await pool.query("SELECT count(*)::int count FROM audit_events WHERE occurred_at>=now()-interval '24 hours'")
  return {...result.rows[0],events_24h:events.rows[0].count}
}

async function listAdminUsers({search,page,limit}) {
  const offset=(page-1)*limit,pattern=`%${search}%`
  const result=await pool.query(`SELECT id,username,display_name,email,active,role,points,battles_count,wins_count,losses_count,draws_count,created_at,
    count(*) OVER()::int total FROM accounts WHERE ($1='' OR username ILIKE $2 OR display_name ILIKE $2 OR email ILIKE $2)
    ORDER BY created_at DESC LIMIT $3 OFFSET $4`,[search,pattern,limit,offset])
  return {items:result.rows,total:result.rows[0]?.total||0,page,limit}
}

async function getAdminUser(id) {
  const user=(await pool.query(`SELECT id,username,display_name,email,active,role,points,battles_count,wins_count,losses_count,draws_count,created_at,updated_at,
    (SELECT count(*)::int FROM account_sessions s WHERE s.account_id=a.id AND s.expires_at>now()) active_sessions FROM accounts a WHERE id=$1`,[id])).rows[0]
  if(!user)return null
  const [history,events,notes]=await Promise.all([
    pool.query(`SELECT b.played_at,opponent.display_name opponent,br.result,br.points_awarded,br.rounds_for,br.rounds_against
      FROM battle_results br JOIN battles b ON b.id=br.battle_id JOIN accounts opponent ON opponent.id=br.opponent_id
      WHERE br.account_id=$1 ORDER BY b.played_at DESC LIMIT 20`,[id]),
    pool.query("SELECT occurred_at,event,ip,location,user_agent,success FROM audit_events WHERE account_id=$1 ORDER BY occurred_at DESC LIMIT 30",[id]),
    pool.query(`SELECT n.id,n.note,n.created_at,coalesce(author.display_name,'Administrador eliminado') author
      FROM support_notes n LEFT JOIN accounts author ON author.id=n.author_id WHERE n.account_id=$1 ORDER BY n.created_at DESC LIMIT 30`,[id])
  ])
  return {user,history:history.rows,events:events.rows,notes:notes.rows}
}

async function listAuditEvents({event,search,page,limit}) {
  const offset=(page-1)*limit,pattern=`%${search}%`
  const result=await pool.query(`SELECT id,occurred_at,event,account_id,actor_id,username,ip,location,user_agent,success,count(*) OVER()::int total
    FROM audit_events WHERE ($1='' OR event=$1) AND ($2='' OR coalesce(username,'') ILIKE $3 OR ip ILIKE $3)
    ORDER BY occurred_at DESC LIMIT $4 OFFSET $5`,[event,search,pattern,limit,offset])
  return {items:result.rows,total:result.rows[0]?.total||0,page,limit}
}

async function setAccountActive(id,active) {
  const client=await pool.connect()
  try{await client.query("BEGIN");const result=await client.query("UPDATE accounts SET active=$2,updated_at=now() WHERE id=$1 RETURNING id,username,active",[id,active]);if(!active)await client.query("DELETE FROM account_sessions WHERE account_id=$1",[id]);await client.query("COMMIT");return result}
  catch(error){await client.query("ROLLBACK");throw error}finally{client.release()}
}
const revokeAccountSessions = (id) => pool.query("DELETE FROM account_sessions WHERE account_id=$1",[id])
const addSupportNote = (accountId,authorId,note) => pool.query(`INSERT INTO support_notes (account_id,author_id,note) VALUES ($1,$2,$3) RETURNING id,note,created_at`,[accountId,authorId,note])
const invalidatePasswordReset = (tokenHash) => pool.query("UPDATE password_reset_tokens SET used_at=now() WHERE token_hash=$1 AND used_at IS NULL",[tokenHash])

async function createPasswordReset(accountId,tokenHash,expiresAt,requestedBy) {
  const client=await pool.connect()
  try{await client.query("BEGIN");await client.query("UPDATE password_reset_tokens SET used_at=now() WHERE account_id=$1 AND used_at IS NULL",[accountId]);await client.query("INSERT INTO password_reset_tokens (account_id,token_hash,expires_at,requested_by) VALUES ($1,$2,$3,$4)",[accountId,tokenHash,new Date(expiresAt),requestedBy]);await client.query("COMMIT")}
  catch(error){await client.query("ROLLBACK");throw error}finally{client.release()}
}
async function findPasswordReset(tokenHash) {
  return (await pool.query(`SELECT r.account_id,a.username,a.display_name,a.email FROM password_reset_tokens r JOIN accounts a ON a.id=r.account_id
    WHERE r.token_hash=$1 AND r.used_at IS NULL AND r.expires_at>now()`,[tokenHash])).rows[0]||null
}
async function consumePasswordReset(tokenHash,passwordSalt,passwordHash) {
  const client=await pool.connect()
  try{
    await client.query("BEGIN")
    const reset=await client.query("SELECT account_id FROM password_reset_tokens WHERE token_hash=$1 AND used_at IS NULL AND expires_at>now() FOR UPDATE",[tokenHash])
    if(!reset.rowCount){await client.query("ROLLBACK");return null}
    const accountId=reset.rows[0].account_id
    await client.query("UPDATE accounts SET password_salt=$2,password_hash=$3,updated_at=now() WHERE id=$1",[accountId,passwordSalt,passwordHash])
    await client.query("UPDATE password_reset_tokens SET used_at=now() WHERE account_id=$1 AND used_at IS NULL",[accountId])
    await client.query("DELETE FROM account_sessions WHERE account_id=$1",[accountId])
    await client.query("COMMIT");return accountId
  }catch(error){await client.query("ROLLBACK");throw error}finally{client.release()}
}

module.exports={initialize,close:()=>pool.end(),findAccountByUsername,findAccountByEmail,findAccountById,findAccountBySession,
  createPendingAccount,deleteAccount,replaceActivation,updateResendHash,incrementActivationAttempts,activateAccount,
  createSession,deleteSession,getStatistics,recordBattle,recordMachineBattle,getAdventureProgress,completeMission,insertAudit,getAdminSummary,listAdminUsers,
  getAdminUser,listAuditEvents,setAccountActive,revokeAccountSessions,addSupportNote}
module.exports.createPasswordReset=createPasswordReset
module.exports.findPasswordReset=findPasswordReset
module.exports.consumePasswordReset=consumePasswordReset
module.exports.invalidatePasswordReset=invalidatePasswordReset
module.exports.playCasinoRound=playCasinoRound
module.exports.getCasinoHistory=getCasinoHistory

async function getArcadeProgress(accountId) {
  return (await pool.query('SELECT level_id FROM arcade_progress WHERE account_id=$1 ORDER BY completed_at',[accountId])).rows.map(row=>row.level_id)
}
async function startArcadeRun(id,accountId,levelId,guardian) {
  // Starting a new attempt invalidates abandoned attempts; completed results remain retryable.
  const client=await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query('SELECT id FROM accounts WHERE id=$1 FOR UPDATE',[accountId])
    await client.query('DELETE FROM arcade_runs WHERE account_id=$1 AND finished_at IS NULL',[accountId])
    await client.query('INSERT INTO arcade_runs (id,account_id,level_id,guardian) VALUES ($1,$2,$3,$4)',[id,accountId,levelId,guardian])
    await client.query('COMMIT')
  } catch(error){await client.query('ROLLBACK');throw error}finally{client.release()}
}
async function getArcadeRun(id,accountId) {
  return (await pool.query('SELECT * FROM arcade_runs WHERE id=$1 AND account_id=$2',[id,accountId])).rows[0]
}
async function finishArcadeRun(id,accountId,reward) {
  const client=await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query('SELECT id FROM accounts WHERE id=$1 FOR UPDATE',[accountId])
    const run=(await client.query('SELECT * FROM arcade_runs WHERE id=$1 AND account_id=$2 FOR UPDATE',[id,accountId])).rows[0]
    if(!run){await client.query('ROLLBACK');return null}
    if(run.finished_at){await client.query('COMMIT');return run.reward}
    const first=await client.query('INSERT INTO arcade_progress (account_id,level_id) VALUES ($1,$2) ON CONFLICT DO NOTHING RETURNING level_id',[accountId,run.level_id])
    const result={firstCompletion:first.rowCount===1,reward:first.rowCount?reward:{gold:0,jade:0,obsidian:0}}
    if(first.rowCount)await client.query(`INSERT INTO player_wallets (account_id,gold,jade,obsidian) VALUES ($1,$2,$3,$4)
      ON CONFLICT (account_id) DO UPDATE SET gold=player_wallets.gold+EXCLUDED.gold,jade=player_wallets.jade+EXCLUDED.jade,obsidian=player_wallets.obsidian+EXCLUDED.obsidian,updated_at=now()`,[accountId,reward.gold,reward.jade,reward.obsidian])
    await client.query('UPDATE arcade_runs SET finished_at=now(),reward=$2 WHERE id=$1',[id,JSON.stringify(result)])
    await client.query('COMMIT');return result
  }catch(error){await client.query('ROLLBACK');throw error}finally{client.release()}
}
Object.assign(module.exports,{getArcadeProgress,startArcadeRun,getArcadeRun,finishArcadeRun})

async function getCombatEconomy(sourceId,accountId){
  const row=(await pool.query("SELECT outcome,jade_delta,obsidian_delta,gold_delta FROM combat_economy_events WHERE source_type='pvp' AND source_id=$1 AND account_id=$2",[sourceId,accountId])).rows[0]
  return row?{outcome:row.outcome,delta:{jade:row.jade_delta,obsidian:row.obsidian_delta,gold:row.gold_delta}}:null
}
module.exports.getCombatEconomy=getCombatEconomy
