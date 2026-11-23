const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path')
const root=path.join(__dirname,'..','public')
function pngSize(file){const b=fs.readFileSync(file);assert.equal(b.subarray(1,4).toString(),'PNG');return [b.readUInt32BE(16),b.readUInt32BE(20)]}
test('portada e iconos PWA tienen los tamaños anunciados y usan modo standalone',()=>{
 const manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.webmanifest'),'utf8'))
 assert.equal(manifest.display,'standalone');assert.equal(manifest.start_url,'/');assert.equal(manifest.scope,'/')
 for(const icon of manifest.icons){assert.deepEqual(pngSize(path.join(root,icon.src)),icon.sizes.split('x').map(Number))}
 assert.deepEqual(pngSize(path.join(root,'icons/apple-touch-icon-v1.png')),[180,180])
 for(const entry of ['index.html','restablecer/index.html']){
  const html=fs.readFileSync(path.join(root,entry),'utf8')
  assert.ok(html.includes('apple-touch-icon'));assert.ok(html.includes('apple-mobile-web-app-capable'));assert.ok(html.includes('manifest.webmanifest'));assert.ok(html.includes('mobile.css'))
 }
})
