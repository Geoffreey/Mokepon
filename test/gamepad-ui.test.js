const test=require('node:test'),assert=require('node:assert/strict')
const {nextIndex}=require('../public/js/gamepad-ui')
const rect=(x,y,width=80,height=45)=>({x,y,width,height})
test('navegación espacial sigue filas y columnas de menús y teclado',()=>{
  const grid=[rect(0,0),rect(90,0),rect(180,0),rect(0,55),rect(90,55),rect(180,55)]
  assert.equal(nextIndex(grid,0,'right'),1)
  assert.equal(nextIndex(grid,1,'right'),2)
  assert.equal(nextIndex(grid,2,'down'),5)
  assert.equal(nextIndex(grid,5,'left'),4)
  assert.equal(nextIndex(grid,4,'up'),1)
  assert.equal(nextIndex(grid,0,'left'),0)
  assert.equal(nextIndex(grid,-1,'down'),0)
  assert.equal(nextIndex([],0,'right'),-1)
})
test('prioriza una opción alineada, sin saltar a botones laterales',()=>{
  const list=[rect(10,10,200,100),rect(230,10,200,100),rect(10,130,200,100),rect(600,110,50,40)]
  assert.equal(nextIndex(list,0,'down'),2)
  assert.equal(nextIndex(list,0,'right'),1)
  assert.equal(nextIndex(list,2,'up'),0)
})
