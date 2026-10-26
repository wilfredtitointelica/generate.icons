---
name: actualizar-rutas
description: Lista en una tabla los destinos de exportación registrados de cada fuente de iconos de generate.icons/fonts/<fuente>/ (incontrol-icons, incontrol-system, …), con su origen (Figma o local), nombre, ruta y carpeta, y pregunta qué actualizar - cambiar la ruta, la carpeta o el nombre de un destino, quitarlo o añadir uno nuevo. Edita fonts/<fuente>/export.local.json; no exporta ni copia archivos. Úsalo cuando el usuario diga "actualiza las rutas", "cambia la ruta de exportación", "qué destinos tengo registrados", "lista las rutas de las fuentes", "quita un destino" o /actualizar-rutas.
argument-hint: "[fuente]"
---

# Actualizar las rutas de exportación

Cada fuente de `generate.icons/fonts/<fuente>/` guarda sus destinos de exportación en
`fonts/<fuente>/export.local.json` (ignorado por git), que usan `npm run export` y `npm run release`:

```json
{ "targets": [{ "name": "mi-app", "path": "C:/projects/mi-app/src/assets/fonts", "folder": "icons" }] }
```

`folder` es opcional: si falta, la carpeta se llama como la fuente. La copia queda en `<path>/<folder>/`.
Esta skill solo **edita ese registro**; para copiar los archivos está la skill `exportar-fuente`.

## 1. Listar

Fuentes: las carpetas de `fonts/` que tengan `icons.config.mjs` (si se pasó una en los argumentos, solo
esa). De cada una lee `origin` en `icons.config.mjs` (`figma` o `local`) y su `export.local.json` (si no
existe, no tiene destinos). Muestra **una sola tabla**:

| Fuente | Origen | Destino | Ruta (`path`) | Carpeta | En disco |
|---|---|---|---|---|---|
| incontrol-icons | Figma | mi-app | `C:/projects/mi-app/src/assets/fonts` | incontrol-icons | ✅ |
| incontrol-system | local | — | sin destinos registrados | — | — |

- **Carpeta**: `folder`, o el nombre de la fuente si no lo tiene.
- **En disco**: ✅ si existe `<path>/<folder>/`; 📁 si existe `path` pero aún no la carpeta (nunca se
  exportó ahí); ❌ si no existe `path`.

## 2. Preguntar

En **un solo mensaje**, debajo de la tabla, pregunta qué quiere actualizar:

- **Cambiar la ruta** (`path`), **la carpeta** (`folder`) o **el nombre** (`name`) de un destino.
- **Quitar** un destino.
- **Añadir** un destino nuevo (fuente, ruta y, si no es la de la fuente, la carpeta).

Lo que ya venga en el mensaje no se vuelve a preguntar. Si no quiere cambiar nada, termina ahí.

## 3. Validar y editar

Antes de escribir, comprueba (como `scripts/export-icons.mjs`):

- **Ruta** absoluta y **fuera** de `generate.icons/`. Si es relativa, resuélvela desde la raíz de
  `generate.icons/` y muéstrale la absoluta. Guárdala con `/` (`C:/projects/...`). Si no existe en disco,
  avísalo, pero se puede registrar igual (el export la crea).
- **Carpeta**: solo letras, números, `.`, `_` y `-`. Si es igual al nombre de la fuente, omite `folder`.
- **Nombre** único dentro de la fuente. Para uno nuevo, por defecto el del repositorio git de la ruta
  (la carpeta que tiene `.git`).
- Sin dos destinos de la misma fuente con la misma ruta.

Edita `fonts/<fuente>/export.local.json` conservando el formato (2 espacios, `name` primero). Si al
quitar no queda ninguno, deja `{ "targets": [] }`. Si la fuente no tenía el archivo, créalo.

Cambiar la ruta o la carpeta **no mueve ni borra** la copia anterior: queda donde estaba.

## 4. Responder

- Vuelve a mostrar la tabla de la fuente modificada (puedes contrastarla con
  `npm run export -- <fuente> --list`).
- Si cambió una ruta o carpeta, recuerda que la copia antigua sigue en la ruta anterior (bórrala a mano
  si ya no sirve) y que la nueva aún está vacía: ofrece exportar ahora con
  `npm run export -- <fuente> --only <nombre>` (o `npm run release -- <fuente>` para generar y exportar
  a todos). No exportes sin un sí.
- No modifiques archivos de los proyectos destino.
