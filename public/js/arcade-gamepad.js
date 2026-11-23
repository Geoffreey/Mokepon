/* Standard / known DualSense layout. Bluetooth pairing belongs to the OS. */
;(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory()
  else root.MayabGamepad=factory()
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict'
  const DEAD_ZONE=.28, NAV_ZONE=.4, RELEASE_ZONE=.22
  const axis=(pad,index)=>Number.isFinite(pad.axes?.[index])?Math.max(-1,Math.min(1,pad.axes[index])):0
  const pressed=(pad,index)=>Boolean(pad.buttons?.[index]?.pressed||pad.buttons?.[index]?.value>.5)
  function supported(pad){return Boolean(pad&&pad.connected!==false&&(pad.mapping==='standard'||(/dualsense|054c.*0ce6|0ce6.*054c/i.test(pad.id||'')&&pad.buttons?.length>=16&&pad.axes?.length>=4)))}
  function direction(x,y,previous=null){
    // Hysteresis prevents small diagonal wobble from alternating menu rows and columns.
    if(previous){const v=previous==='left'?-x:previous==='right'?x:previous==='up'?-y:y,other=previous==='left'||previous==='right'?Math.abs(y):Math.abs(x);if(v>RELEASE_ZONE&&other<v+.18)return previous}
    if(Math.max(Math.abs(x),Math.abs(y))<NAV_ZONE)return null
    return Math.abs(x)>Math.abs(y)?x<0?'left':'right':y<0?'up':'down'
  }
  function scrollValue(value){return Math.abs(value)<=DEAD_ZONE?0:Math.sign(value)*(Math.abs(value)-DEAD_ZONE)/(1-DEAD_ZONE)}
  function decode(pad,previousDirection=null){
    if(!supported(pad))return {input:0,pause:false,confirm:false,menu:0,direction:null,back:false,scroll:0,scrollX:0,scrollY:0}
    const x=axis(pad,0),y=axis(pad,1),left=pressed(pad,14)||x < -DEAD_ZONE,right=pressed(pad,15)||x > DEAD_ZONE
    const up=pressed(pad,12),down=pressed(pad,13),dleft=pressed(pad,14),dright=pressed(pad,15)
    const dpad=up!==down?(up?'up':'down'):dleft!==dright?(dleft?'left':'right'):null
    const nav=dpad||direction(x,y,previousDirection)
    let input=left===right?0:left?1:2
    if(pressed(pad,0))input|=4
    if(pressed(pad,2))input|=8
    if(pressed(pad,1)||pressed(pad,7))input|=16
    if(pressed(pad,4)||pressed(pad,5))input|=32
    const scrollX=scrollValue(axis(pad,2)),scrollY=scrollValue(axis(pad,3))
    return {input,pause:pressed(pad,9),confirm:pressed(pad,0),back:pressed(pad,1),menu:nav==='up'?-1:nav==='down'?1:0,direction:nav,scroll:Math.sign(scrollY),scrollX,scrollY}
  }
  function createReader(){
    let selected=null,previous={pause:false,confirm:false,menu:0,back:false,direction:null},blocked=true,actionsBlocked=true
    return {
      block(){blocked=true;actionsBlocked=true},
      blockActions(){actionsBlocked=true},
      read(pads){
        const available=Array.from(pads||[]).filter(p=>p&&p.connected!==false),known=available.filter(supported)
        const pad=known.find(p=>`${p.index}:${p.id}`===selected)||known[0]||available[0]
        const key=pad?`${pad.index}:${pad.id}`:null,changed=key!==selected,disconnected=selected!==null&&changed
        if(changed){selected=key;previous={pause:false,confirm:false,menu:0,back:false,direction:null};blocked=true;actionsBlocked=true}
        const value=decode(pad,previous.direction)
        if(blocked&&!(value.input&60)&&!value.pause)blocked=false
        if(actionsBlocked&&!value.confirm&&!value.pause&&!value.back)actionsBlocked=false
        const state={connected:Boolean(pad),supported:supported(pad),id:pad?.id||'',index:pad?.index??null,changed,disconnected,
          input:blocked?value.input&3:value.input,pausePressed:!actionsBlocked&&value.pause&&!previous.pause,confirmPressed:!actionsBlocked&&value.confirm&&!previous.confirm,
          menuPressed:value.menu!==0&&value.menu!==previous.menu?value.menu:0,backPressed:!actionsBlocked&&value.back&&!previous.back,
          direction:value.direction,directionPressed:value.direction!==previous.direction?value.direction:null,scroll:value.scroll,scrollX:value.scrollX,scrollY:value.scrollY}
        previous=value;return state
      }
    }
  }
  return {DEAD_ZONE,decode,createReader,direction,supported}
})
