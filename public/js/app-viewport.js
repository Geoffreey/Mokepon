/* Use the actual iPhone visual viewport, including standalone mode and rotation. */
;(function(){
  const root=document.documentElement
  let frame=0
  function update(){
    frame=0
    const view=window.visualViewport
    // Pinch zoom remains available; it must not resize the game underneath the gesture.
    if(view&&Math.abs(view.scale-1)>.05)return
    const height=Math.round(view?.height||window.innerHeight),width=Math.round(view?.width||window.innerWidth)
    if(!height||!width)return
    root.style.setProperty('--app-height',`${height}px`)
    root.style.setProperty('--app-width',`${width}px`)
    document.body.classList.toggle('app-landscape',window.matchMedia('(orientation: landscape)').matches&&height<=620)
    document.body.classList.toggle('app-standalone',Boolean(window.navigator.standalone||window.matchMedia('(display-mode: standalone)').matches))
  }
  function schedule(){if(!frame)frame=requestAnimationFrame(update)}
  window.addEventListener('resize',schedule)
  window.addEventListener('orientationchange',schedule)
  window.addEventListener('pageshow',schedule)
  window.visualViewport?.addEventListener('resize',schedule)
  update()
})()
