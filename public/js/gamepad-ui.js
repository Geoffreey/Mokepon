/* Spatial gamepad navigation for the game UI; no synthetic keyboard shortcuts. */
;(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory()
  else {const api=factory();root.MayabUIController=api.mount(root,root.document,root.MayabGamepad)}
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict'
  function nextIndex(rects,current,direction){
    if(!rects.length)return -1
    if(current<0||!rects[current])return 0
    const a=rects[current],ax=a.x+a.width/2,ay=a.y+a.height/2,vertical=direction==='up'||direction==='down',sign=direction==='up'||direction==='left'?-1:1
    let best=-1,score=Infinity
    rects.forEach((b,i)=>{
      if(i===current)return
      const dx=b.x+b.width/2-ax,dy=b.y+b.height/2-ay,along=(vertical?dy:dx)*sign,cross=Math.abs(vertical?dx:dy)
      if(along<=2)return
      const overlaps=vertical?b.x<a.x+a.width&&b.x+b.width>a.x:b.y<a.y+a.height&&b.y+b.height>a.y
      const rank=along+cross*(overlaps?1:4)+(overlaps?0:150)
      if(rank<score){score=rank;best=i}
    })
    return best<0?current:best
  }
  function mount(win,doc,G){
    const reader=G.createReader();let focused=null,modal=null,returnFocus=null,lastDirection=null,nextRepeat=0,lastRoot=null,frame=0,pendingDialog=null,mapMenu=false,mapDriving=false,lastScrollTime=0
    const hint=doc.createElement('div');hint.id='controller-hint';hint.hidden=true;hint.setAttribute('role','status');doc.body.append(hint)
    const visible=el=>Boolean(el&&!el.disabled&&!el.closest('[hidden],[inert],fieldset:disabled')&&el.getClientRects().length&&win.getComputedStyle(el).visibility!=='hidden')
    const getRoot=()=>modal||Array.from(doc.querySelectorAll('main>section')).find(el=>visible(el))||doc.querySelector('main')||doc.body
    function targets(root){
      const list=[]
      const selector='button,a[href],input:not([type="hidden"]),textarea,select,summary,label[for]'
      const roots=root===modal?[root]:[root,...doc.querySelectorAll('.brand,#room-dock')].filter(Boolean)
      for(let el of roots.flatMap(part=>Array.from(part.querySelectorAll(selector)))){
        if(el.matches('[data-arcade-input],[data-duel-input],.map-controls button'))continue
        if(el.matches('input[type="radio"],input[type="checkbox"]')){
          if(el.disabled)continue
          el=Array.from(doc.querySelectorAll('label[for]')).find(label=>label.htmlFor===el.id)||el
        }else if(el.matches('label[for]')){const control=doc.getElementById(el.htmlFor);if(!control||!['radio','checkbox'].includes(control.type)||control.disabled)continue}
        if(visible(el)&&!list.includes(el))list.push(el)
      }
      return list
    }
    function clear(){doc.querySelectorAll('.controller-focus').forEach(el=>el.classList.remove('controller-focus'));hint.hidden=true}
    function mark(el){
      clear();focused=el
      if(!el)return
      el.classList.add('controller-focus');reveal(el)
      hint.hidden=false;hint.textContent='🎮 Palanca izquierda / cruceta: navegar · ✕ / A: elegir · ○ / B: volver · Palanca derecha: desplazar'
    }
    function canScroll(el,vertical=true){
      const style=win.getComputedStyle(el),overflow=vertical?style.overflowY:style.overflowX
      return /(auto|scroll)/.test(overflow)&&(vertical?el.scrollHeight>el.clientHeight+2:el.scrollWidth>el.clientWidth+2)
    }
    function reveal(el){
      // scrollIntoView also scrolls overflow:hidden ancestors in WebKit, hiding headings.
      for(let parent=el.parentElement;parent&&parent!==doc.body;parent=parent.parentElement){
        const a=el.getBoundingClientRect(),b=parent.getBoundingClientRect()
        const top=canScroll(parent)?a.top<b.top+8?a.top-b.top-8:a.bottom>b.bottom-8?a.bottom-b.bottom+8:0:0
        const left=canScroll(parent,false)?a.left<b.left+8?a.left-b.left-8:a.right>b.right-8?a.right-b.right+8:0:0
        if(top||left)parent.scrollBy({top,left,behavior:'auto'})
      }
    }
    function scrollTarget(root,vertical){
      for(let p=focused?.parentElement;p&&p!==doc.body;p=p.parentElement)if(canScroll(p,vertical))return p
      const choices=[root,...root.querySelectorAll('*')].filter(el=>visible(el)&&canScroll(el,vertical))
      return choices.sort((a,b)=>b.clientHeight*b.clientWidth-a.clientHeight*a.clientWidth)[0]
    }
    function closeModal(value=false){if(!modal)return;modal.remove();modal=null;focused=returnFocus;returnFocus=null;lastRoot=getRoot();reader.blockActions();mark(focused);if(pendingDialog){const resolve=pendingDialog;pendingDialog=null;resolve(value===true)}}
    function dialog(title){
      returnFocus=focused;modal=doc.createElement('section');modal.className='controller-dialog';modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');modal.setAttribute('aria-label',title)
      const heading=doc.createElement('h2');heading.textContent=title;modal.append(heading);doc.body.append(modal);return modal
    }
    function button(parent,label,action){const b=doc.createElement('button');b.type='button';b.textContent=label;b.onclick=action;parent.append(b);return b}
    function changed(field){field.dispatchEvent(new win.Event('input',{bubbles:true}));field.dispatchEvent(new win.Event('change',{bubbles:true}))}
    function edit(field){
      const title=field.labels?.[0]?.textContent?.trim()||field.getAttribute('aria-label')||field.placeholder||'Escribe con el mando'
      const panel=dialog(title),preview=doc.createElement('p');preview.className='controller-preview';preview.setAttribute('aria-live','polite');panel.append(preview)
      const refresh=()=>{preview.textContent=field.type==='password'?'•'.repeat(field.value.length):field.value||'…'};refresh()
      if(field.tagName==='SELECT'){
        for(const option of field.options)if(!option.disabled)button(panel,option.textContent,()=>{field.value=option.value;changed(field);closeModal()})
      }else if(field.type==='number'){
        button(panel,'−',()=>{field.stepDown();changed(field);refresh()});button(panel,'+',()=>{field.stepUp();changed(field);refresh()})
        button(panel,'Listo',closeModal)
      }else{
        let upper=false,symbols=false
        const keys=doc.createElement('div');keys.className='controller-keyboard';panel.append(keys)
        const insert=value=>{const limit=field.maxLength>=0?field.maxLength:1000;field.value=(field.value+value).slice(0,limit);changed(field);refresh()}
        const draw=()=>{
          keys.replaceChildren()
          const letters=symbols?'1234567890@._-+!?#$%&*=/:,;()áéíóúü^~[]{}<>\\|\'"`':upper?'ABCDEFGHIJKLMNÑOPQRSTUVWXYZ':'abcdefghijklmnñopqrstuvwxyz'
          for(const char of letters)button(keys,char,()=>insert(char))
          button(keys,upper?'abc':'ABC',()=>{upper=!upper;draw();mark(keys.querySelector('button'))})
          button(keys,symbols?'Letras':'123 / @',()=>{symbols=!symbols;draw();mark(keys.querySelector('button'))})
          button(keys,'Espacio',()=>insert(' '));button(keys,'Borrar',()=>{field.value=field.value.slice(0,-1);changed(field);refresh()});button(keys,'Listo',closeModal)
        };draw()
      }
      focused=null;mark(targets(panel)[0])
    }
    function activate(el){
      if(!el)return
      if(el.matches('input:not([type="radio"]):not([type="checkbox"]):not([type="submit"]),textarea,select')){edit(el);return}
      el.click()
    }
    function back(root){
      if(modal){closeModal();return}
      const ids=['recompensas-volver','arcade-mapa','volver-modos-guardian','volver-modos-lobby','volver-modos-misiones','volver-modos-casino','arcade-volver','boton-volver-login','boton-abandonar-batalla','arcade-salir','boton-salir-sala','duel-exit']
      const el=ids.map(id=>doc.getElementById(id)).find(el=>el&&(root.contains(el)||el.id==='boton-salir-sala')&&visible(el))
      if(el)el.click()
    }
    function navigate(pad){
      if(doc.hidden||!pad.connected||!pad.supported){clear();lastDirection=null;return}
      const root=getRoot(),list=targets(root)
      if(root!==lastRoot){lastRoot=root;focused=null;lastDirection=null}
      if(!list.includes(focused)){
        const primary=list.find(el=>['arcade-tutorial-play','arcade-continuar','duel-start','duel-resume','duel-return'].includes(el.id))
        mark(primary||list.find(el=>el.matches('input:checked'))||list[0])
      }
      if(pad.backPressed){back(root);reader.blockActions();return}
      const now=win.performance.now(),direction=pad.direction||null
      const move=direction&&(direction!==lastDirection||now>=nextRepeat)
      if(move){
        const next=nextIndex(list.map(el=>el.getBoundingClientRect()),list.indexOf(focused),direction)
        mark(list[next]);nextRepeat=now+(direction!==lastDirection?420:185)
      }
      lastDirection=direction
      const dt=lastScrollTime?Math.min((now-lastScrollTime)/1000,.04):1/60
      lastScrollTime=now
      const sy=pad.scrollY??pad.scroll??0,sx=pad.scrollX||0
      if(sy){const target=scrollTarget(root,true);target?.scrollBy({top:sy*440*dt,behavior:'auto'})}
      if(sx){const target=scrollTarget(root,false);target?.scrollBy({left:sx*440*dt,behavior:'auto'})}
      if(pad.confirmPressed){activate(focused);reader.blockActions()}
    }
    function loop(){
      frame=win.requestAnimationFrame(loop)
      // Arcade samples its own reader once per animation frame and delegates paused menus.
      if(doc.body.classList.contains('arcade-active')){reader.block();return}
      let pads=[];try{pads=win.navigator.getGamepads?.()||[]}catch{}
      const pad=reader.read(pads),map=win.MayabMapController
      if(map?.active()&&!modal&&pad.connected&&pad.supported){
        if(pad.pausePressed){mapMenu=!mapMenu;reader.block();map.stop()}
        if(pad.backPressed&&!mapMenu){mapMenu=true;reader.block();map.stop();return}
        if(!mapMenu){
          if((pad.input&3)||['up','down'].includes(pad.direction)){map.move(pad);mapDriving=true}else if(mapDriving){map.stop();mapDriving=false}
          clear()
          if(pad.connected&&pad.supported){hint.hidden=false;hint.textContent='🎮 Palanca / cruceta: explorar · Start: navegar por los menús'}
          return
        }
      }else{if(mapDriving){map?.stop();mapDriving=false}mapMenu=false}
      navigate(pad)
    }
    win.addEventListener('blur',()=>{reader.block();if(mapDriving){win.MayabMapController?.stop();mapDriving=false}clear()})
    doc.addEventListener('visibilitychange',()=>{reader.block();if(doc.hidden)clear()})
    doc.addEventListener('keydown',event=>{if(event.key==='Escape'&&modal){event.preventDefault();closeModal()}})
    doc.addEventListener('pointerdown',()=>{clear();focused=null},{passive:true})
    loop()
    function message(text,confirm=false){
      if(modal)closeModal()
      const panel=dialog(confirm?'Confirmar acción':'El guardián te avisa'),copy=doc.createElement('p');copy.textContent=text;panel.append(copy)
      return new Promise(resolve=>{pendingDialog=resolve;if(confirm)button(panel,'Cancelar',()=>closeModal(false));button(panel,confirm?'Continuar':'Entendido',()=>closeModal(true));focused=null;mark(targets(panel)[0])})
    }
    return {navigate,clear,targets,activate,closeModal,isDialogOpen:()=>Boolean(modal),notice:text=>message(text),confirm:text=>message(text,true),destroy(){win.cancelAnimationFrame(frame);modal?.remove();clear();hint.remove()}}
  }
  return {nextIndex,mount}
})
