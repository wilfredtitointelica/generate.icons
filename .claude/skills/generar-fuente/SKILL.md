---
name: generar-fuente
description: Genera (o regenera) una fuente de iconos en generate-fonts/fonts/<fuente>/ a partir de su Figma. Pregunta si es una fuente existente (cuál) o una nueva (pide la URL de Figma, el nombre y el prefijo y la registra en icons.config.mjs), y qué capas son iconos según el inicio de su nombre (p. ej. icon-, guardado en figmaFilter). Lee el nodo de Figma con el MCP de Figma, mapea grupos → categorías e iconos sueltos → sin categoría, descarga cada icono como SVG, reemplaza source/ (npm run sync) y genera dist/ e icons.json (npm run build). Úsalo cuando el usuario diga "genera la fuente", "actualiza los iconos desde Figma", "crea una fuente nueva de iconos", "sincroniza incontrol-icons con Figma" o /generar-fuente.
argument-hint: "[fuente | url-figma]"
---

# Generar una fuente de iconos desde Figma

Cada fuente vive en `generate-fonts/fonts/<fuente>/` y **registra de dónde salen sus iconos**: el
campo `figma` de su `icons.config.mjs` (URL de un nodo de Figma con `node-id`). Es obligatorio: el build
falla si falta.

Flujo: **Figma** → (MCP de Figma) → manifiesto → `npm run sync` → `source/` → `npm run build` →
`dist/` + `icons.json`. Todos los comandos se ejecutan desde `generate-fonts/` (si no hay
`node_modules`, antes `npm ci`).

## 1. ¿Fuente existente o nueva?

Lo que venga en los argumentos o en el mensaje no se vuelve a preguntar (una URL de Figma implica
fuente nueva, salvo que coincida con el `figma` de una existente). Lo que falte se pregunta **en un solo
mensaje**.

Lista las fuentes: carpetas de `generate-fonts/fonts/` con `icons.config.mjs`, cada una con su URL de
`figma` (o "sin URL"). Si no hay ninguna, ve directo a **Nueva**.

### Existente

1. Pregunta **qué fuente** (si solo hay una, confírmala sin preguntar).
2. Si su `figma` está vacío, pide la URL y regístrala editando `figma: '<url>'` en su
   `icons.config.mjs` (valida el formato como en *Nueva*).
3. **Filtro de nombre**: muestra el `figmaFilter` registrado (o "todos" si está vacío) y pregunta si se
   mantiene (ver [Filtro de nombre](#filtro-de-nombre)). Si cambia, edita `figmaFilter: '<texto>'` en
   su `icons.config.mjs`.

### Nueva

Pide:

1. **URL de Figma** (obligatoria): enlace a la página, sección o frame que contiene los iconos, con
   `node-id`: `https://www.figma.com/design/<file>/<nombre>?node-id=<a>-<b>`. Si no trae `node-id`,
   pide que en Figma seleccionen el frame de iconos y copien el enlace (*Copy link to selection*).
2. **Nombre de la fuente** en kebab-case (`incontrol-system`): será la familia y el nombre de los
   archivos (`incontrol-system.css`). Puedes sugerir uno a partir del nombre del nodo en Figma.
3. **Prefijo** de los iconos y clases CSS (`sys` → `.sys-search`). Por defecto `icon`.
4. **Filtro de nombre** (ver [Filtro de nombre](#filtro-de-nombre)). Sugiere `<prefijo>-` (`icon-`).

Crea la fuente (registra la URL y el filtro en su `icons.config.mjs`):

```bash
npm run new -- <fuente> --figma "<url>" --prefix <prefijo> --filter "<texto>"
```

Sin filtro (todos los iconos), omite `--filter`.

### Filtro de nombre

Pregunta **qué capas de Figma son iconos a generar** según su nombre:

> ¿Qué iconos genero? Por ejemplo, solo las capas cuyo nombre empieza por `icon-` (`icon-search`,
> `icon-arrow-left`). Responde con el texto (`icon-`) o "todos".

- Se guarda en `figmaFilter` de `icons.config.mjs`: la próxima vez se reutiliza y solo se confirma.
- Se compara con el **inicio del nombre** de la capa (último tramo si tiene `/`), sin distinguir
  mayúsculas: con `icon-`, entran `icon-search` e `Icon-Arrow Left`; quedan fuera `logo`,
  `bg-frame`, `label`.
- Vacío = todos los nodos que el mapeo reconozca como icono.

## 2. Leer el nodo de Figma

1. De la URL: `fileKey` (en `/design/<fileKey>/…`; con `/branch/<branchKey>/` usa `branchKey`) y
   `nodeId` (`node-id=12-34` → `12:34`).
2. `create_session` del MCP de Figma con ese `fileKey` y una descripción ("Extraer iconos de
   <fuente>"); usa su `sessionId` en todas las llamadas siguientes.
3. `get_metadata` con `fileKey` y `nodeId`: devuelve el árbol (ids, tipos, nombres, tamaños). Si es muy
   grande, recorre por partes llamando `get_metadata` sobre los hijos.

### Mapeo Figma → source/

- **Filtro primero**: si hay `figmaFilter`, solo son iconos los nodos cuyo nombre empieza por él (sin
  distinguir mayúsculas), sean del tipo que sean (`COMPONENT`, `INSTANCE`, `FRAME`, `GROUP`); no se
  baja dentro de un nodo que ya es icono. Los contenedores no se filtran (una categoría
  `Navigation` sigue siendo categoría aunque no empiece por `icon-`).
- **Icono** (sin filtro): cada nodo `COMPONENT`. Si no hay componentes, los nodos pequeños y cuadrados
  (`FRAME`, `INSTANCE` o `GROUP`, p. ej. 16–48 px) que no contienen otros iconos. Ignora textos,
  fondos y etiquetas. Si hay `COMPONENT_SET` (variantes), **pregunta** cómo tratarlas (solo la variante por
  defecto, o una por variante con nombre `<set>-<valor>`).
- **Categoría**: cada contenedor (`SECTION`, `FRAME` o `GROUP` que no es un icono) **hijo directo** del
  nodo de la URL que contiene iconos, a cualquier profundidad. Su nombre en Figma es el nombre de la
  categoría.
- **Sin categoría**: los iconos que son hijos directos del nodo de la URL. Si el nodo no tiene grupos,
  todos los iconos quedan sin categoría (source/ plano).
- **Nombre**: el nombre de la capa del icono; si tiene `/` (`icons/arrow-left`), solo el último tramo.
  El script lo normaliza a `<prefijo>-<kebab-case>` (`Arrow Left` → `icon-arrow-left`).

### Confirmar antes de descargar

Muestra un resumen y espera el sí del usuario:

- Filtro aplicado y cuántos nodos quedaron fuera por él (con unos ejemplos, por si el filtro es
  demasiado estricto).
- Total de iconos, categorías con su número de iconos (nombre en Figma → carpeta) y cuántos quedan sin
  categoría.
- Unos ejemplos de nombres finales y cualquier colisión (dos capas que normalizan al mismo nombre: hay
  que renombrar una en Figma o acordar otro nombre).
- Nodos dudosos que excluiste o incluiste.

## 3. Descargar los SVG

Para **cada icono**, `download_assets` con `fileKey`, el `nodeId` del icono, `defaultFormat: "svg"` y
el `sessionId`; toma la URL de `export`. Lanza varias llamadas en paralelo en cada mensaje.

Las URLs son **temporales**: en cuanto las tengas todas, escribe el manifiesto (en el directorio
temporal / scratchpad, nunca dentro del proyecto) y sincroniza enseguida:

```json
{
  "icons": [
    { "name": "Arrow Left", "category": "Navigation", "url": "https://…" },
    { "name": "Logo", "category": null, "url": "https://…" }
  ]
}
```

`name` y `category` van **tal cual están en Figma**: el script los normaliza y guarda los nombres de
categoría originales en `source/categories.json` para mostrarlos (`Business & finance`). En lugar de
`url` se puede pasar `svg` con el contenido del SVG.

## 4. Sincronizar source/

1. Simulación (no descarga ni escribe):
   ```bash
   npm run sync -- <fuente> "<manifiesto>" --dry-run
   ```
   Muestra los iconos **añadidos**, **movidos** y **eliminados**. Figma manda: lo que ya no está en
   Figma se borra de `source/`. Si hay eliminados, enséñalos y **pide confirmación**.
2. Sincronización real (descarga todo y solo reemplaza `source/` si todo llegó bien):
   ```bash
   npm run sync -- <fuente> "<manifiesto>"
   ```
   Si falla por URLs caducadas (HTTP 403), vuelve a pedir `download_assets` de esos iconos y repite.

## 5. Generar

```bash
npm run build -- <fuente>
```

- Si avisa de SVG con `stroke`, lístalos: en Figma hay que aplicar *Outline stroke* + *Flatten* a esos
  iconos y volver a generar (en la fuente saldrían vacíos).
- Los códigos Unicode se conservan por nombre: renombrar una capa en Figma = icono nuevo.

## 6. Responder

En pocas líneas: fuente, URL de Figma registrada, total de iconos (por categoría y sin categoría),
añadidos / eliminados respecto a la versión anterior, avisos de `stroke`, y la ruta de la vista previa
`fonts/<fuente>/dist/<fuente>.html`. Ofrece exportarla al proyecto con `/exportar-iconos`.
