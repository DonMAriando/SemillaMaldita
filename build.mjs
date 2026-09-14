/* ════════════════════════════════════════════════════════════════════
   build.mjs — compila src/ en UN solo archivo HTML.

   El archivo único no es una limitación técnica, es el producto: se
   manda por WhatsApp, se abre con doble clic, funciona sin internet y
   no pide instalar nada. Esa es su ventaja frente a cualquier juego de
   tienda de aplicaciones, así que el build la protege.

   Uso:  node build.mjs            -> SemillaMaldita.html
         node build.mjs --watch    -> recompila al guardar
   ════════════════════════════════════════════════════════════════════ */

import { readFileSync, writeFileSync, readdirSync, watch, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const SRC = join(ROOT, 'src');
const OUT = join(ROOT, 'SemillaMaldita.html');

const VERSION = '3.1.0';

function jsFiles(){
  return readdirSync(SRC)
    .filter(f => f.endsWith('.js'))
    .sort();                      // los prefijos numéricos definen el orden
}

function build(){
  const css = readFileSync(join(SRC, 'style.css'), 'utf8');
  const shell = readFileSync(join(SRC, 'shell.html'), 'utf8');
  const files = jsFiles();

  const missing = ['00-util.js','01-i18n.js','05-config.js','10-audio.js','15-meta.js',
                   '20-relics.js','22-identity.js','30-dungeon.js','35-fx.js','40-engine.js','45-ai.js',
                   '70-sprites.js','75-render.js','80-ui.js','90-game.js','99-boot.js']
                  .filter(f => !files.includes(f));
  if (missing.length){
    console.error('✗ Faltan módulos:', missing.join(', '));
    process.exitCode = 1;
    return;
  }

  const js = files.map(f => {
    const body = readFileSync(join(SRC, f), 'utf8');
    return `/* ══════════ ${f} ══════════ */\n${body}`;
  }).join('\n\n');

  /* Cerrar el </script> dentro de una cadena rompería el HTML. */
  const safeJs = js.replace(/<\/script>/gi, '<\\/script>');

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover">
<meta name="theme-color" content="#06060b">
<meta name="color-scheme" content="dark">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="description" content="Semilla Maldita — baja, elige reliquias, muere, comparte. La misma semilla genera la misma mazmorra para todo el mundo. Diario, maldición semanal, duelos. Un solo archivo, sin instalar nada.">
<meta property="og:title" content="Semilla Maldita">
<meta property="og:description" content="Baja. Elige. Muere. Comparte. Una mazmorra, la misma para todo el mundo.">
<meta property="og:type" content="website">
<meta name="apple-mobile-web-app-title" content="Semilla Maldita">
<link rel="manifest" href="data:application/manifest+json,${encodeURIComponent(JSON.stringify({
  name:'Semilla Maldita', short_name:'Semilla', start_url:'.', display:'standalone',
  background_color:'#06060b', theme_color:'#06060b',
  icons:[{ src:"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ctext y='.9em' font-size='90'%3E%F0%9F%8C%B1%3C/text%3E%3C/svg%3E", sizes:'any', type:'image/svg+xml' }]
}))}">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ctext y='.9em' font-size='90'%3E%F0%9F%8C%B1%3C/text%3E%3C/svg%3E">
<title>Semilla Maldita</title>
<style>
${css}
</style>
</head>
<body>
${shell}
<script>
/* Semilla Maldita v${VERSION} — compilado ${new Date().toISOString().slice(0,10)}
   Fuente modular en src/, compilado con build.mjs */
window.DEBUG = /[?&]debug=1/.test(location.search);
${safeJs}
</script>
</body>
</html>
`;

  writeFileSync(OUT, html, 'utf8');
  const kb = (Buffer.byteLength(html, 'utf8') / 1024).toFixed(0);
  console.log(`✓ SemillaMaldita.html — ${kb} KB · ${files.length} módulos`);
}

build();

if (process.argv.includes('--watch')){
  console.log('… vigilando src/');
  let t = null;
  watch(SRC, () => {
    clearTimeout(t);
    t = setTimeout(() => { try { build(); } catch(e){ console.error(e.message); } }, 120);
  });
}
