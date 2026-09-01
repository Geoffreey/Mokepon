const test = require("node:test")
const assert = require("node:assert/strict")
const { spawn } = require("node:child_process")
const { mkdtemp, readFile } = require("node:fs/promises")
const { tmpdir } = require("node:os")
const path = require("node:path")

test("registra, activa e inicia sesión y genera auditoría", async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), "mokepon-auth-"))
  const port = 18080 + Math.floor(Math.random() * 1000)
  const server = spawn(process.execPath, [path.join(__dirname, "..", "index.js")], {
    env:{ ...process.env, PORT:String(port), NODE_ENV:"development", DATA_FILE:path.join(dir,"accounts.json"), AUDIT_FILE:path.join(dir,"audit.jsonl"), RECAPTCHA_SITE_KEY:"", RECAPTCHA_SECRET_KEY:"", SMTP_HOST:"", SMTP_USER:"", SMTP_PASSWORD:"", EMAIL_FROM:"" },
    stdio:["ignore","pipe","pipe"]
  })
  t.after(() => server.kill("SIGTERM"))
  let output=""
  server.stdout.on("data",(chunk)=>{output+=chunk})
  server.stderr.on("data",(chunk)=>{output+=chunk})
  await new Promise((resolve,reject)=>{const limite=setTimeout(()=>reject(new Error(output||"El servidor no inició")),5000);server.stdout.on("data",()=>{if(output.includes("Servidor funcionando")){clearTimeout(limite);resolve()}})})
  const request = (ruta,body) => fetch(`http://127.0.0.1:${port}${ruta}`,{method:"POST",headers:{"Content-Type":"application/json","User-Agent":"Mokepon-Test"},body:JSON.stringify(body)})
  const registro=await request("/auth/registro",{usuario:"prueba_segura",nombre:"Prueba",correo:"prueba@example.com",clave:"clave-segura-123",captchaToken:"desarrollo-local"})
  assert.equal(registro.status,201)
  const datosRegistro=await registro.json()
  await new Promise((resolve)=>setTimeout(resolve,50))
  const codigo=output.match(/Código de activación para prueba_segura: (\d{6})/)?.[1]
  assert.match(codigo,/^\d{6}$/)
  const activacion=await request("/auth/activar",{usuario:"prueba_segura",codigo})
  assert.equal(activacion.status,200)
  assert.ok((await activacion.json()).token)
  const login=await request("/auth/login",{usuario:"prueba_segura",clave:"clave-segura-123",captchaToken:"desarrollo-local"})
  assert.equal(login.status,200)
  const auditoria=await readFile(path.join(dir,"audit.jsonl"),"utf8")
  assert.match(auditoria,/"evento":"registro_pendiente"/)
  assert.match(auditoria,/"evento":"cuenta_activada"/)
  assert.match(auditoria,/"evento":"login_exitoso"/)
  assert.doesNotMatch(auditoria,/clave-segura-123|"codigo"|"token"/)
  assert.ok(datosRegistro.reenvioToken)
})
