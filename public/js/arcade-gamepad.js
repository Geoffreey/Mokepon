/* Standard Gamepad layout. Bluetooth pairing belongs to the operating system. */
;(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory()
  else root.MayabGamepad=factory()
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict'
  const DEAD_ZONE=.28
  const pressed=(pad,index)=>Boolean(pad.buttons?.[index]?.pressed||pad.buttons?.[index]?.value>.5)
  function decode(pad){
    if(!pad||pad.connected===false||pad.mapping!=='standard')return {input:0,pause:false,confirm:false,menu:0}
    const axis=Number.isFinite(pad.axes?.[0])?pad.axes[0]:0
    const left=pressed(pad,14)||axis < -DEAD_ZONE,right=pressed(pad,15)||axis > DEAD_ZONE
    let input=left===right?0:left?1:2
    if(pressed(pad,0))input|=4 // A / cross: jump
    if(pressed(pad,2))input|=8 // X / square: melee
    if(pressed(pad,1)||pressed(pad,7))input|=16 // B / circle or RT / R2: projectile
    const vertical=Number.isFinite(pad.axes?.[1])?pad.axes[1]:0
    const up=pressed(pad,12)||vertical < -DEAD_ZONE,down=pressed(pad,13)||vertical > DEAD_ZONE
    return {input,pause:pressed(pad,9),confirm:pressed(pad,0),menu:up===down?0:up?-1:1}
  }
  function createReader(){
    let selected=null,previous={pause:false,confirm:false,menu:0},blocked=true
    return {
      block(){blocked=true},
      read(pads){
        const available=Array.from(pads||[]).filter(p=>p&&p.connected!==false)
        const standard=available.filter(p=>p.mapping==='standard')
        const pad=standard.find(p=>`${p.index}:${p.id}`===selected)||standard[0]||available[0]
        const key=pad?`${pad.index}:${pad.id}`:null,changed=key!==selected,disconnected=selected!==null&&changed
        if(changed){selected=key;previous={pause:false,confirm:false,menu:0};blocked=true}
        const value=decode(pad)
        const pausePressed=value.pause&&!previous.pause,confirmPressed=value.confirm&&!previous.confirm,menuPressed=value.menu!==0&&value.menu!==previous.menu?value.menu:0
        if(blocked&&!value.input&&!value.pause&&!value.menu)blocked=false
        const state={connected:Boolean(pad),supported:pad?.mapping==='standard',id:pad?.id||'',index:pad?.index??null,changed,disconnected,
          input:blocked?0:value.input,pausePressed:blocked?false:pausePressed,confirmPressed:blocked?false:confirmPressed,menuPressed:blocked?0:menuPressed}
        previous=value;return state
      }
    }
  }
  return {DEAD_ZONE,decode,createReader}
})
