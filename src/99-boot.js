/* ════════════════════════════════════════════════════════════════════
   99-boot.js — arranque.
   ════════════════════════════════════════════════════════════════════ */
"use strict";

(function(){
  /* Bloqueos de gestos del navegador que arruinan un juego a pantalla
     completa en móvil: zoom por doble toque y pinch. */
  document.addEventListener('gesturestart', function(e){ e.preventDefault(); });
  document.addEventListener('dblclick', function(e){ e.preventDefault(); }, { passive:false });
  document.addEventListener('contextmenu', function(e){
    if (e.target && e.target.id === 'seedInput') return;
    e.preventDefault();
  });

  /* Un error suelto no debe dejar una pantalla negra sin explicación. */
  window.addEventListener('error', function(ev){
    if (window.DEBUG) return;
    try {
      if (UI && UI.toast) UI.toast('⚠ ' + (ev.message || 'error'));
    } catch(e){}
  });

  function go(){
    try {
      Game.boot();
    } catch(e){
      document.body.innerHTML =
        '<div style="padding:24px;font:14px system-ui;color:#ff7a8a">' +
        'No se pudo iniciar el juego.<br><br><code style="color:#8b8ba7">' +
        String(e && e.stack || e) + '</code></div>';
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go);
  else go();
})();
