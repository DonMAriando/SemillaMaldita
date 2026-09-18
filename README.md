# Semilla Maldita

Roguelike de un solo archivo: bajás, elegís reliquias, morís y compartís la semilla. La misma semilla genera la misma mazmorra para todo el mundo.

## Jugar

- **GitHub Pages:** https://donmariando.github.io/SemillaMaldita/
- **Cloudflare Pages:** https://semilla-maldita.pages.dev

Las dos sirven el mismo juego. En local: abrí `SemillaMaldita.html` (doble clic o cualquier servidor estático). No hace falta instalar nada.

## Qué hay

- Diario, maldición semanal y duelos por enlace
- Árbol de esencia permanente; al completarlo se abre la **Raíz Profunda**
- Combate en 8 direcciones
- Un HTML para mandar por WhatsApp o jugar sin internet

El prototipo ASCII original quedó en `Semilla Maldita.html`. El juego real es `src/` → `SemillaMaldita.html`.

## Compilar

Hace falta [Node.js](https://nodejs.org/).

```bash
node build.mjs
```

Eso arma `SemillaMaldita.html` (v3.1). Para recompilar al guardar:

```bash
node build.mjs --watch
```

## Publicar

Con Wrangler ya autenticado:

```bash
npx wrangler pages deploy . --project-name semilla-maldita
```

Para no subir el código fuente, desplegá solo el HTML (como `index.html` y `SemillaMaldita.html`) a un directorio y pasale esa carpeta a `wrangler pages deploy`.
