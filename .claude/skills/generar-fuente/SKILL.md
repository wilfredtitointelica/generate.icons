---
name: generar-fuente
description: Genera (o regenera) una fuente de iconos en generate.icons/fonts/<fuente>/, desde su Figma o desde SVG copiados a mano en su carpeta source/. Pregunta si es una fuente existente (cuál) o nueva, y en ese caso su origen - Figma (pide la URL, el nombre, el prefijo y el filtro de capas, p. ej. icon-) o local (nombre y prefijo; los SVG se copian en source/, en carpetas de categoría o sueltos). Origen Figma - extrae con la API REST (npm run pull, con FIGMA_TOKEN; el MCP de Figma como alternativa sin token). Origen local - valida source/ y genera directo. En ambos, duplicados paran la generación, los iconos eliminados van a trash/ con su código reservado, y genera dist/ e icons.json (npm run build). Úsalo cuando el usuario diga "genera la fuente", "regenera <fuente>", "actualiza los iconos desde Figma", "ya copié los svg en source", "genera la fuente desde la carpeta", "crea una fuente nueva de iconos" o /generar-fuente.
argument-hint: "[fuente | url-figma]"
---

# Generar una fuente de iconos

Cada fuente vive en `generate.icons/fonts/<fuente>/` y **registra de dónde salen sus iconos** en su
`icons.config.mjs`, campo `origin`:

| `origin` | De dónde salen los SVG | Cómo se llena `source/` | Generar |
|---|---|---|---|
| `'figma'` (por defecto) | Un nodo de Figma: `figma` (URL con `node-id`, obligatoria) y `figmaFilter` | `npm run pull -- <fuente>` (API REST, con token) | `npm run build -- <fuente>` |
| `'local'` | SVG que alguien comparte | Se **copian a mano** en `source/` (carpetas = categorías, o sueltos) | `npm run build -- <fuente>` |

Todos los comandos se ejecutan desde `generate.icons/` (si no hay `node_modules`, antes `npm ci`).

## 1. ¿Fuente existente o nueva?

Lo que venga en los argumentos o en el mensaje no se vuelve a preguntar (una URL de Figma implica
fuente de Figma; "ya copié los SVG", "desde la carpeta", implica local). Lo que falte se pregunta **en un
solo mensaje**.

Lista las fuentes: carpetas de `generate.icons/fonts/` con `icons.config.mjs`, cada una con su
`origin` y, si es de Figma, su URL y su filtro. Si no hay ninguna, ve directo a **Nueva**.

### Existente

1. Pregunta **qué fuente** (si solo hay una, confírmala sin preguntar).
2. Según su `origin`:
   - **figma**: si `figma` está vacío, pide la URL y regístrala en su `icons.config.mjs`. Muestra el
     `figmaFilter` (o "todos") y pregunta si se mantiene (ver [Filtro de nombre](#filtro-de-nombre)).
     Sigue en [2. Origen Figma](#2-origen-figma-extraer-con-la-api-rest).
   - **local**: sigue en [4. Origen local](#4-origen-local-svg-copiados-en-source).

### Nueva

Pregunta primero el **origen**:

> ¿De dónde salen los iconos? **Figma** (me das la URL del frame de iconos) o **carpeta local** (SVG que
> te compartieron y copias en `source/`).

Luego pide:

1. **Nombre de la fuente** en kebab-case (`incontrol-system`): será la familia y el nombre de los
   archivos (`incontrol-system.css`).
2. **Prefijo** de los iconos y clases CSS (`sys` → `.sys-search`). Por defecto `icon`.
3. Solo **Figma**: **URL** (obligatoria): enlace a la página, sección o frame que contiene los iconos,
   con `node-id`: `https://www.figma.com/design/<file>/<nombre>?node-id=<a>-<b>`. Si no trae `node-id`,
   pide que en Figma seleccionen el frame de iconos y copien el enlace (*Copy link to selection*). Y el
   **filtro de nombre** (ver [Filtro de nombre](#filtro-de-nombre)); sugiere `<prefijo>-` (`icon-`).

Crea la fuente (registra el origen en su `icons.config.mjs`):

```bash
npm run new -- <fuente> --figma "<url>" --prefix <prefijo> --filter "<texto>"   # Figma (sin filtro: omite --filter)
npm run new -- <fuente> --local --prefix <prefijo>                              # local
```

### Filtro de nombre

Solo fuentes de Figma. Pregunta **qué capas de Figma son iconos a generar** según su nombre:

> ¿Qué iconos genero? Por ejemplo, solo las capas cuyo nombre empieza por `icon-` (`icon-search`,
> `icon-arrow-left`). Responde con el texto (`icon-`) o "todos".

- Se guarda en `figmaFilter` de `icons.config.mjs`: la próxima vez se reutiliza y solo se confirma.
- Se compara con el **inicio del nombre** de la capa (último tramo si tiene `/`), sin distinguir
  mayúsculas: con `icon-`, entran `icon-search` e `Icon-Arrow Left`; quedan fuera `logo`,
  `bg-frame`, `label`.
- Vacío = todos los nodos que el mapeo reconozca como icono.

## 2. Origen Figma: extraer con la API REST

`npm run pull` lee el nodo de `figma`, aplica `figmaFilter`, mapea categorías / sin categoría, ordena
como el lienzo y exporta los SVG por lotes: **~3 peticiones** para cientos de iconos, sin el límite de
llamadas del MCP. No hagas el mapeo a mano: el script lo hace (reglas en
[Mapeo Figma → source/](#mapeo-figma--source)).

### Token

Necesita `FIGMA_TOKEN` (variable de entorno o `generate.icons/.env`). Si el script responde
"Missing FIGMA_TOKEN" o 403:

> Para extraer de Figma necesito un token personal de solo lectura. En Figma: **Settings → Security →
> Personal access tokens → Generate new token**, con el scope *File content: read-only*. Cópialo en
> `generate.icons/.env` como `FIGMA_TOKEN=<token>` (hay un `.env.example`). No me lo pegues aquí: el
> `.env` no se sube a git.

El token es **de la cuenta de Figma, no de un archivo**: uno solo sirve para todas las fuentes, cada una
con su propio Figma en `figma` de su `icons.config.mjs`. Si `pull` da 403/404 solo en una fuente, lo
normal es que esa cuenta no tenga acceso a ese archivo (pedir acceso); si da 403 en todas, el token
caducó o es inválido (generar otro y reemplazarlo en `.env`).

Nunca pidas el token en el chat, ni lo escribas tú, ni lo muestres. Si el usuario no puede tener uno, usa
la [alternativa con el MCP](#alternativa-sin-token-mcp-de-figma).

### Simular y confirmar

```bash
npm run pull -- <fuente> --dry-run
```

Muestra, sin exportar nada: total de iconos, iconos por categoría (en orden de Figma), los
**renombrados** al normalizar, los **filtrados** por `figmaFilter` (por si el filtro es demasiado
estricto), las **instancias omitidas** y los **añadidos / movidos / eliminados** frente a `source/`.

- **Duplicados**: si dos capas dan el mismo nombre de icono (aunque estén en categorías distintas, o una
  con espacios y otra con guiones), **falla sin escribir nada** y las lista. No generes: dile al usuario
  qué capas renombrar en Figma y espera a que lo haga.
- **Eliminados**: lo que ya no está en Figma **no se genera** (Figma manda) y no hace falta pedir
  confirmación: su SVG se mueve a `fonts/<fuente>/trash/` (ver [Papelera](#papelera-trash)). Solo
  informa cuáles se eliminan.

Resume eso al usuario y continúa salvo duplicados o nombres raros (erratas, espacios), que conviene
corregir en Figma primero (pregunta si sigue o espera).

### Papelera (trash/)

`fonts/<fuente>/trash/` guarda el SVG de cada icono eliminado de Figma (misma ruta
`<categoria>/<icono>.svg`) y `trash/trash.json` con su nombre, categoría, **código Unicode** y fecha.

- No forma parte de la fuente: ni `dist/`, ni `icons.json`, ni la vista previa lo muestran, y
  `/exportar-fuente` no lo copia.
- Su código queda **reservado**: ningún icono nuevo lo reutiliza.
- Si el icono vuelve a Figma con el mismo nombre, recupera su código y sale de `trash/` solo.
- Para olvidar un icono del todo, borra su SVG y su entrada de `trash.json` (su código quedará libre).

### Extraer

```bash
npm run pull -- <fuente>
```

Exporta y descarga todo y solo reemplaza `source/` (más `source/figma.json`, con nombres de categoría y
orden de Figma) si todo llegó bien. Ante el límite de la API (429) reintenta solo; si Figma pide esperar
mucho, para con un mensaje: espera y repite.

## 3. Origen Figma sin token: MCP de Figma

Solo si no hay token. Es lenta (una llamada por icono) y choca con el límite de llamadas del MCP.
Claude hace el mapeo y la descarga y `npm run sync` escribe `source/` a partir de un manifiesto.

### Leer el nodo de Figma

1. De la URL: `fileKey` (en `/design/<fileKey>/…`; con `/branch/<branchKey>/` usa `branchKey`) y
   `nodeId` (`node-id=12-34` → `12:34`).
2. `create_session` del MCP de Figma con ese `fileKey` y una descripción ("Extraer iconos de
   <fuente>"); usa su `sessionId` en todas las llamadas siguientes.
3. `get_metadata` con `fileKey` y `nodeId`: devuelve el árbol (ids, tipos, nombres, tamaños). Si es muy
   grande, recorre por partes llamando `get_metadata` sobre los hijos.

### Mapeo Figma → source/

Son las reglas que aplica `npm run pull` (sin filtro, `pull` toma solo los `COMPONENT`); con el MCP
las aplicas tú.

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
- **Orden** (el del lienzo, para que el diseñador compare): calcula la posición **absoluta** de cada
  nodo (sumando `x`/`y` de sus ancestros) y ordena en lectura: de arriba abajo y, en una misma fila
  (tops a menos de ~4 px), de izquierda a derecha. Primero las categorías, y dentro de cada una sus
  iconos; los sin categoría van al final. **No** uses el orden de las capas: no coincide con el lienzo.

### Confirmar antes de descargar

Muestra un resumen y espera el sí del usuario:

- Filtro aplicado y cuántos nodos quedaron fuera por él (con unos ejemplos, por si el filtro es
  demasiado estricto).
- Total de iconos, categorías con su número de iconos (nombre en Figma → carpeta) y cuántos quedan sin
  categoría.
- Unos ejemplos de nombres finales y cualquier colisión (dos capas que normalizan al mismo nombre: hay
  que renombrar una en Figma o acordar otro nombre).
- Instancias de un componente que ya se incluye (copias sueltas): se omiten.
- Nodos dudosos que excluiste o incluiste.

### Descargar los SVG

Para **cada icono**, `download_assets` con `fileKey`, el `nodeId` del icono, `defaultFormat: "svg"` y
el `sessionId`; toma la URL de `export`. Lanza 4 llamadas en paralelo por mensaje y descarga sus URLs
con `curl` en el acto a una carpeta temporal (`<id>.svg`): caducan en minutos.

> **Límite de Figma**: el MCP tiene un límite de llamadas por asiento ("You've reached the Figma MCP
> tool call limit…"). Es temporal: si aparece, baja a 1–2 llamadas a la vez y reintenta. Con cientos
> de iconos, no lances varios agentes en paralelo contra el mismo archivo: chocan con el límite.

> La exportación `export` del MCP pinta también lo que hay **detrás** del nodo (fondo de la página,
> del frame, bordes): usada tal cual, cada glifo sería un cuadrado relleno. Por eso cada entrada del
> manifiesto lleva `layer` = el nombre **exacto** de la capa del icono en Figma, y `npm run sync` se
> queda solo con su grupo `<g id="<layer>">`, conservando el marco del icono. No uses `svgAssets`:
> vienen recortados al vector y pierden el marco (un punto se escalaría a toda la altura).
>
> Si la metadata es muy grande para leerla, guárdala y analízala con un script (nodos con su tipo,
> nombre, tamaño y frame hijo directo del nodo raíz = categoría); decodifica `&amp;` en los nombres.

Las URLs son **temporales**: en cuanto las tengas todas, escribe el manifiesto (en el directorio
temporal / scratchpad, nunca dentro del proyecto) y sincroniza enseguida:

```json
{
  "icons": [
    { "name": "icon-arrow-left", "layer": "icon-arrow-left", "category": "Navigation", "url": "https://…" },
    { "name": "icon-logo", "layer": "icon-logo", "category": null, "url": "https://…" }
  ]
}
```

`name`, `layer` y `category` van **tal cual están en Figma** (`layer` siempre el nombre exacto de la
capa; `name` puede cambiarse solo si el usuario acordó otro nombre): el script los normaliza. Las
entradas van **en el orden de Figma** (ver *Mapeo*): el script guarda ese orden y los nombres de
categoría originales en `source/figma.json`, y el build lo respeta en `icons.json`, CSS, JSON y HTML.
En lugar de `url` se puede pasar `svg` con el contenido del SVG.

### Sincronizar source/

1. Simulación (no descarga ni escribe):
   ```bash
   npm run sync -- <fuente> "<manifiesto>" --dry-run
   ```
   Muestra los iconos **añadidos**, **movidos** y **eliminados**. Igual que con `pull`: los duplicados
   paran todo, y lo eliminado de Figma sale de `source/` y va a `trash/` (sin pedir confirmación).
2. Sincronización real (descarga todo y solo reemplaza `source/` si todo llegó bien):
   ```bash
   npm run sync -- <fuente> "<manifiesto>"
   ```
   Si falla por URLs caducadas (HTTP 403), vuelve a pedir `download_assets` de esos iconos y repite.

## 4. Origen local: SVG copiados en source/

Para SVG que alguien comparte (sueltos o ya organizados en carpetas). No hay Figma ni token:
`npm run pull` no aplica (responde que la fuente es local).

### Llenar source/

El usuario copia los SVG en `generate.icons/fonts/<fuente>/source/`:

```
source/
├── Navigation/            # carpeta = categoría (el nombre de la carpeta es el nombre visible)
│   ├── Arrow Left.svg     # cualquier nombre: se normaliza a icon-arrow-left
│   └── icon-nav-up.svg
├── Business & finance/    # → categoría "Business & finance" (carpeta business-and-finance)
│   └── bank.svg           # → icon-bank
└── logo.svg               # suelto = sin categoría → icon-logo
```

- Solo un nivel de carpetas: dentro de una categoría no puede haber subcarpetas.
- Los nombres se normalizan igual que con Figma: kebab-case con el prefijo
  (`Arrow Left.svg` → `icon-arrow-left`, `coins_icon.svg` → `icon-coins-icon`). No hace falta renombrar.
- Orden: alfabético (categorías e iconos). Nombre visible de una categoría: el de su carpeta tal cual
  (`Business & finance`); `categories` de `icons.config.mjs` lo reemplaza si hace falta.
- Si el usuario te da la **ruta de una carpeta** con los SVG, ofrece copiarla tú en `source/`: muestra
  qué hay en `source/` ahora y pregunta si se **añade** o se **reemplaza** el contenido (al reemplazar,
  lo que deje de estar queda como eliminado; ver abajo). Copia solo `.svg` y carpetas de un nivel.
- Recuerda que una fuente solo dibuja rellenos: SVG con trazos (`stroke`) salen vacíos.

### Generar

```bash
npm run build -- <fuente>
```

El build valida antes de escribir nada:

- **Duplicados**: dos archivos que normalizan al mismo nombre (`Add Item.svg` y `add_item.svg`, aunque
  estén en carpetas distintas) o dos carpetas que dan la misma categoría (`Business & finance` y
  `business-and-finance`): falla, lista las rutas y no genera. Pide al usuario que renombre o borre uno.
- **Eliminados**: un SVG que estaba en la generación anterior y ya no está en `source/` no se genera; su
  código queda **reservado** en `trash/trash.json` (sin archivo, porque el SVG lo borró el usuario). Si
  vuelve a aparecer con el mismo nombre, recupera su código.

## 5. Generar

```bash
npm run build -- <fuente>
```

Vale también para el origen local (ver [4](#4-origen-local-svg-copiados-en-source)).

- Si avisa de SVG con `stroke`, lístalos: en Figma hay que aplicar *Outline stroke* + *Flatten* a esos
  iconos y volver a generar (en la fuente saldrían vacíos). En local, pide SVG con los trazos ya
  convertidos a relleno a quien los compartió.
- Los códigos Unicode se conservan por nombre: renombrar una capa en Figma = icono nuevo (el nombre
  anterior va a `trash/` con su código reservado).

## 6. Responder

En pocas líneas: fuente, origen (URL de Figma registrada, o local), total de iconos (por categoría y sin
categoría), nombres que se normalizaron (en local, los archivos renombrados al generar),
añadidos / eliminados respecto a la versión anterior (los eliminados, movidos a `trash/`; los que
volvieron de `trash/`), avisos de `stroke`, y la ruta de la vista previa
`fonts/<fuente>/dist/<fuente>.html`. Ofrece exportarla al proyecto con `/exportar-fuente`.
