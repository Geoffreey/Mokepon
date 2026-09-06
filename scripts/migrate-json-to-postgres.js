const fs = require("fs")
const path = require("path")
const { Pool } = require("pg")
const database = require("../db")

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL es obligatorio.")
const source = process.env.DATA_FILE || path.join(__dirname,"..","data","accounts.json")
const accounts = JSON.parse(fs.readFileSync(source,"utf8")).cuentas || []
const pool = new Pool({connectionString:process.env.DATABASE_URL})

async function migrate() {
  await database.initialize()
  const client=await pool.connect()
  try {
    await client.query("BEGIN")
    for(const account of accounts){
      const history=account.historial||[],battles=account.batallas??history.length,wins=account.victorias??history.filter((b)=>b.resultado==="victoria").length,losses=account.derrotas??history.filter((b)=>b.resultado==="derrota").length,draws=account.empates??history.filter((b)=>b.resultado==="empate").length
      await client.query(`INSERT INTO accounts (id,username,display_name,email,password_salt,password_hash,active,points,battles_count,wins_count,losses_count,draws_count)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT (id) DO NOTHING`,[account.id,account.usuario,account.nombre,account.correo,account.passwordSalt,account.passwordHash,account.activa!==false,account.puntos||0,battles,wins,losses,draws])
      for(const session of account.sesiones||[])if(session.expira>Date.now())await client.query("INSERT INTO account_sessions (account_id,token_hash,expires_at) VALUES ($1,$2,$3) ON CONFLICT (token_hash) DO NOTHING",[account.id,session.tokenHash,new Date(session.expira)])
      if(account.activacion)await client.query(`INSERT INTO account_activations (account_id,code_hash,resend_hash,expires_at,attempts) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (account_id) DO NOTHING`,[account.id,account.activacion.codigoHash,account.activacion.reenvioHash,new Date(account.activacion.expira),account.activacion.intentos||0])
    }
    const duels=new Map()
    for(const account of accounts)for(const item of account.historial||[]){if(!duels.has(item.id))duels.set(item.id,[]);duels.get(item.id).push({account,item})}
    for(const [id,entries] of duels){
      if(entries.length!==2||entries[0].account.id===entries[1].account.id)continue
      const [one,two]=entries
      await client.query(`INSERT INTO battles (id,player_one_id,player_two_id,player_one_guardian,player_two_guardian,player_one_rounds,player_two_rounds,played_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (id) DO NOTHING`,[id,one.account.id,two.account.id,one.item.guardian,two.item.guardian,one.item.rondasAFavor,two.item.rondasAFavor,new Date(one.item.fecha)])
      for(const [side,opponent] of [[one,two],[two,one]])await client.query(`INSERT INTO battle_results (battle_id,account_id,opponent_id,result,points_awarded,rounds_for,rounds_against)
        VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (battle_id,account_id) DO NOTHING`,[id,side.account.id,opponent.account.id,side.item.resultado,side.item.resultado==="victoria"?30:side.item.resultado==="empate"?10:5,side.item.rondasAFavor,side.item.rondasEnContra])
    }
    await client.query("COMMIT")
    console.log(`${accounts.length} cuentas migradas desde ${source}. El archivo original no fue modificado.`)
  } catch(error){await client.query("ROLLBACK");throw error}finally{client.release();await pool.end();await database.close()}
}
migrate().catch((error)=>{console.error(error);process.exitCode=1})
