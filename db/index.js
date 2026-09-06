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
    if(!inserted.rowCount){await client.query("ROLLBACK");return false}
    for(const [side,opponent] of [[battle.one,battle.two],[battle.two,battle.one]]){
      const points=side.result==="victoria"?30:side.result==="empate"?10:5
      await client.query(`INSERT INTO battle_results (battle_id,account_id,opponent_id,result,points_awarded,rounds_for,rounds_against) VALUES ($1,$2,$3,$4,$5,$6,$7)`,[battle.id,side.accountId,opponent.accountId,side.result,points,side.rounds,opponent.rounds])
      await client.query(`UPDATE accounts SET points=points+$2,battles_count=battles_count+1,
        wins_count=wins_count+($3='victoria')::int,losses_count=losses_count+($3='derrota')::int,
        draws_count=draws_count+($3='empate')::int,updated_at=now() WHERE id=$1`,[side.accountId,points,side.result])
    }
    await client.query("COMMIT");return true
  } catch(error){await client.query("ROLLBACK");throw error}finally{client.release()}
}

const insertAudit = (entry) => pool.query(`INSERT INTO audit_events (occurred_at,event,account_id,actor_id,username,ip,location,user_agent,success)
  VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,[entry.fecha,entry.evento,entry.cuentaId,entry.actorId,entry.usuario,entry.ip,entry.ubicacion,entry.agente,entry.exito])

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
  createSession,deleteSession,getStatistics,recordBattle,insertAudit,getAdminSummary,listAdminUsers,
  getAdminUser,listAuditEvents,setAccountActive,revokeAccountSessions,addSupportNote}
module.exports.createPasswordReset=createPasswordReset
module.exports.findPasswordReset=findPasswordReset
module.exports.consumePasswordReset=consumePasswordReset
module.exports.invalidatePasswordReset=invalidatePasswordReset
