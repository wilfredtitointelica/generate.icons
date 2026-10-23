# generate.icons

Generador de fuentes de iconos a partir de SVG, extraídos de Figma o copiados a mano. La carpeta es autocontenida
(su propio `package.json`, dependencias, scripts y configuración): se puede copiar a otro repositorio
tal cual. Admite varias fuentes (`incontrol-icons`, `incontrol-system`, …), cada una en `fonts/<fuente>/`.

**`generate.icons/` solo genera.** Ningún proyecto la referencia: la fuente generada se **exporta**
(copia) a una carpeta del proyecto, y el proyecto usa esa copia (ver
[Exportar a un proyecto](#exportar-a-un-proyecto)).

Guías en HTML (ábrelas en el navegador): [reference/index.html](reference/index.html), con
[generar una fuente](reference/generar-fuente.html),
[conectar con Figma (token)](reference/configurar-token.html) y
[exportar fuente](reference/exportar-fuente.html).

Herramienta: [fantasticon](https://github.com/tancredi/fantasticon) 4.1.0, con un parche en
`patches/` (ver [Parche de fantasticon](#parche-de-fantasticon)).

## Comandos

Desde `generate.icons/` (requiere Node ≥ 22):

| Comando | Qué hace |
|---|---|
| `npm ci` | Instala las dependencias fijadas y aplica el parche (`postinstall`). Solo la primera vez o tras actualizar dependencias. |
| `npm run new -- <fuente> --figma "<url>" [--prefix <prefijo>] [--filter <texto>]` | Crea una fuente de Figma: `fonts/<fuente>/` con su `icons.config.mjs` y la URL registrada (ver [Nueva fuente](#nueva-fuente)). |
| `npm run new -- <fuente> --local [--prefix <prefijo>]` | Crea una fuente local: sus SVG se copian a mano en `source/` (ver [Origen local](#origen-local-svg-copiados-a-mano)). |
| `npm run pull -- <fuente> [--dry-run]` | Extrae los iconos del nodo de Figma de la fuente con la API REST (necesita `FIGMA_TOKEN`) y reemplaza `fonts/<fuente>/source/` (ver [Generar desde Figma](#generar-desde-figma-recomendado)). |
| `npm run sync -- <fuente> <manifiesto.json> [--dry-run]` | Igual, a partir de un manifiesto (alternativa sin token, con el MCP de Figma). |
| `npm run build` | Genera **todas** las fuentes de `fonts/` (cada carpeta con `icons.config.mjs`). |
| `npm run build -- <fuente> [<fuente>…]` | Genera solo esas fuentes, por ejemplo `npm run build -- incontrol-icons`. |
| `npm run export -- <fuente> <ruta> [--folder <carpeta>] [--force]` | Copia una fuente generada a `<ruta>/<carpeta>/` (ver [Exportar a un proyecto](#exportar-a-un-proyecto)). |

## Estructura

```
generate.icons/
├── package.json · package-lock.json
├── .env.example                   # copiar a .env con FIGMA_TOKEN (.env no se sube)
├── patches/fantasticon+4.1.0.patch
├── scripts/
│   ├── new-font.mjs               # crea una fuente con su URL de Figma
│   ├── pull-figma.mjs             # Figma (API REST) → source/
│   ├── sync-figma.mjs             # manifiesto (MCP) → source/
│   ├── build-icons.mjs            # generador (todas las fuentes o las indicadas)
│   ├── export-icons.mjs           # copia una fuente generada a un proyecto
│   └── lib/                       # fonts.mjs (config) y sync.mjs (escribir source/), comunes
├── templates/                     # plantillas compartidas por todas las fuentes
│   ├── css.hbs                    # @font-face + .<prefijo>-nombre::before
│   └── html.hbs                   # vista previa agrupada por categoría
├── .claude/skills/
│   ├── generar-fuente/            # skill: Figma → source/ → dist/
│   └── exportar-fuente/           # skill: dist/ → proyecto
├── reference/                     # guías HTML: index, generar-fuente, configurar-token, exportar-fuente
└── fonts/
    ├── incontrol-icons/
    │   ├── icons.config.mjs       # nombre, prefijo, URL de Figma, primer código y nombres de categoría
    │   ├── source/                # SVG en carpetas de categoría, directos, o ambos
    │   │   └── figma.json         # (de sync) nombres de categoría y orden de Figma
    │   ├── templates/             # (opcional) sustituye css.hbs o html.hbs solo para esta fuente
    │   ├── dist/                  # GENERADO
    │   ├── icons.json             # GENERADO
    │   └── trash/                 # iconos eliminados de Figma (SVG + trash.json), fuera de la fuente
    └── incontrol-system/ …        # otra fuente, misma estructura
```

`fonts/<fuente>/dist/` contiene `<fuente>.{css,eot,html,json,svg,ttf,woff,woff2}`:

- **css**: una clase por icono, `<i class="icon-search"></i>`.
- **html**: vista previa de todos los iconos por categoría, con buscador; un clic copia la clase.
- **json**: nombre → código Unicode en decimal (`"icon-search": 61698`).

`fonts/<fuente>/icons.json` lista los iconos con la misma organización que `source/`:

| `source/` tiene | `icons.json` tiene |
|---|---|
| Solo carpetas de categoría | `categories` (categoría → iconos) |
| Solo SVG directos | `icons` (lista plana) |
| Ambos | `categories` y, en `icons`, los SVG directos (sin categoría) |

```json
{
  "name": "incontrol-icons",
  "categories": [
    {
      "category": "Navigation",
      "slug": "navigation",
      "icons": [{ "name": "icon-nav-left", "code": 61697, "unicode": "f101" }]
    }
  ],
  "icons": [{ "name": "icon-logo", "code": 61698, "unicode": "f102" }]
}
```

Cada clave aparece solo si tiene iconos: quien lea el JSON debe tratar `categories` e `icons` como
opcionales. En la vista previa HTML, los iconos sin categoría salen en la sección *Uncategorized* (o
*Icons* si no hay categorías).

**No edites a mano `dist/` ni `icons.json`**: se reescriben en cada build.

## Origen de los iconos

Cada fuente registra **de dónde salen sus iconos** en el campo `origin` de su `icons.config.mjs`.
Guía: [reference/generar-fuente.html](reference/generar-fuente.html).

| `origin` | De dónde salen | Cómo se llena `source/` | Ver |
|---|---|---|---|
| `'figma'` (por defecto) | Un nodo de Figma (`figma` + `figmaFilter`) | `npm run pull -- <fuente>` | [Generar desde Figma](#generar-desde-figma-recomendado) |
| `'local'` | SVG que alguien comparte | Se copian a mano en `source/` | [Origen local](#origen-local-svg-copiados-a-mano) |

En las dos, `npm run build -- <fuente>` genera `dist/` e `icons.json`.

### Origen Figma

El campo `figma` es la URL de la página, sección o frame de Figma que contiene los iconos, con
`node-id` (`https://www.figma.com/design/<file>/<nombre>?node-id=12-34`). Es **obligatorio** en las
fuentes de Figma: el build falla mientras esté vacío. Para obtenerla, en Figma selecciona el frame de
iconos y usa *Copy link to selection*.

El campo `figmaFilter` indica **qué capas de ese nodo son iconos a generar**: solo las que su nombre
empieza por ese texto, sin distinguir mayúsculas (`'icon-'` → `icon-search` sí, `logo` o `label` no).
Vacío = todos los iconos del nodo. Lo pregunta y guarda `/generar-fuente`.

En Figma, cada icono en un frame cuadrado (24×24) y con los trazos convertidos a relleno:
*Outline stroke* y luego *Flatten*. Una fuente solo dibuja rellenos; el build avisa si un SVG todavía
tiene `stroke` (en la vista previa saldría vacío).

## Generar desde Figma (recomendado)

### Token de Figma (una vez)

Guía paso a paso: [reference/configurar-token.html](reference/configurar-token.html).

La extracción usa la **API REST de Figma** con un token personal de solo lectura:

1. En Figma: **Settings → Security → Personal access tokens → Generate new token**, con el scope
   *File content: read-only*.
2. Copia `.env.example` a `.env` (en `generate.icons/`) y pon `FIGMA_TOKEN=<token>`. El `.env` está en
   `.gitignore`: no se sube nunca. También vale la variable de entorno `FIGMA_TOKEN`.

El token es **de tu cuenta, no de un archivo**: uno solo sirve para todas las fuentes, y cada fuente
extrae de su propio Figma (el `figma` de su `icons.config.mjs`). Solo hace falta que tu cuenta pueda
abrir esos archivos: si una fuente da 403/404 y las demás no, pide acceso a su archivo. Cuando el token
caduque (Figma pide fecha de caducidad al crearlo), genera otro y reemplázalo en `.env`.

### Extraer y generar

```bash
npm run pull -- incontrol-icons --dry-run   # resumen, no escribe nada
npm run pull -- incontrol-icons             # reemplaza source/ con lo que hay en Figma
npm run build -- incontrol-icons
```

`npm run pull` lee el nodo de `figma` (1 petición), aplica `figmaFilter`, toma los grupos hijos del nodo
como **categorías** y los iconos sueltos como **sin categoría**, omite capas ocultas e instancias de
componentes ya incluidos, ordena como el lienzo y exporta los SVG en lotes de 100 (1 petición por lote):
unas **3 peticiones** para 187 iconos. Los nombres se normalizan (`Arrow Left` → `icon-arrow-left`), y
los nombres de categoría y el **orden** de Figma se guardan en `source/figma.json`. El `--dry-run`
muestra iconos por categoría, renombrados, filtrados, instancias omitidas y añadidos / movidos /
eliminados.

- **Duplicados**: si dos capas dan el mismo nombre de icono, falla sin escribir nada y las lista: hay
  que renombrar una en Figma.
- **Eliminados** (Figma manda): lo que ya no está en Figma sale de `source/` y no se genera; su SVG se
  mueve a **`fonts/<fuente>/trash/`**, con `trash/trash.json` (nombre, categoría, código Unicode y fecha).
  Ese código queda **reservado** (ningún icono nuevo lo reutiliza) y, si el icono vuelve a Figma con el
  mismo nombre, recupera su código y sale de `trash/`. `trash/` no forma parte de la fuente ni se
  exporta. Para olvidar un icono del todo, borra su SVG y su entrada de `trash.json`.

Con Claude Code, **`/generar-fuente`** hace todo esto: pregunta si es una fuente existente o nueva (URL de
Figma, nombre, prefijo), el filtro de nombre, ejecuta el `--dry-run`, te muestra el resumen, y tras tu
confirmación extrae y genera.

### Alternativa sin token: MCP de Figma

Sin token, `/generar-fuente` puede leer Figma con el MCP de Figma y descargar cada icono (una llamada
por icono: lento, y choca con el límite de llamadas del MCP). Escribe un manifiesto y lo aplica con
`npm run sync -- <fuente> <manifiesto> [--dry-run]`.

**Orden de Figma**: categorías e iconos salen en `icons.json`, el CSS, el JSON y la vista previa HTML
en el mismo orden que en el lienzo de Figma (de arriba abajo y, en cada fila, de izquierda a derecha),
para que el diseñador compare su Figma con lo generado. Sin `figma.json` (SVG puestos a mano), el orden
es alfabético; lo que `figma.json` no liste va al final, en orden alfabético. El orden no afecta a los
códigos Unicode.

Formato del manifiesto de `npm run sync` (`name`, `layer` y `category` tal cual en Figma; `url` o el
SVG en `svg`; en orden de Figma). `layer` deja solo el grupo `<g id="<layer>">` del SVG, porque la
exportación del MCP incluye los fondos de Figma:

```json
{ "icons": [
  { "name": "Arrow Left", "layer": "Arrow Left", "category": "Navigation", "url": "https://…" },
  { "name": "Logo", "layer": "Logo", "category": null, "svg": "<svg …>…</svg>" }
] }
```

## Origen local (SVG copiados a mano)

Para SVG que alguien comparte, sin Figma ni token (`origin: 'local'`; `npm run pull` no aplica):

1. Crea la fuente: `npm run new -- <fuente> --local [--prefix <prefijo>]`.
2. Copia los SVG en `fonts/<fuente>/source/`, en carpetas de categoría, sueltos o mezclados:
   ```
   source/
   ├── Navigation/            # carpeta = categoría (su nombre es el nombre visible)
   │   └── Arrow Left.svg     # cualquier nombre: → icon-arrow-left
   ├── Business & finance/    # → categoría "Business & finance"
   │   └── bank.svg           # → icon-bank
   └── logo.svg               # suelto = sin categoría → icon-logo
   ```
3. `npm run build -- <fuente>` y versiona juntos `source/`, `dist/` e `icons.json`.

Reglas (las mismas que valida el build antes de escribir nada):

- Los nombres de archivo y carpeta se **normalizan** solos, igual que con Figma: kebab-case con el
  prefijo (`Arrow Left.svg` → `icon-arrow-left`). No hace falta renombrar.
- **Duplicados**: dos archivos que dan el mismo nombre (`Add Item.svg` y `add_item.svg`, aunque estén en
  carpetas distintas) o dos carpetas que dan la misma categoría: el build falla y los lista.
- Solo un nivel de carpetas (sin subcarpetas dentro de una categoría).
- Orden alfabético. Mover un icono entre categorías conserva su código.
- **Eliminados**: un SVG que borras de `source/` deja de generarse y su código queda **reservado** en
  `trash/trash.json` (sin archivo); si vuelve con el mismo nombre, recupera su código.

Esto también vale para retocar a mano una fuente de Figma, pero el próximo `npm run pull` reemplaza
`source/` con lo que haya en Figma.

**Nombre visible de cada categoría**: el de Figma (guardado en `source/figma.json`) en fuentes de Figma;
en locales, el nombre de la carpeta tal cual (`Business & finance`), o con mayúscula inicial si ya está
en kebab-case (`navigation` → `Navigation`). Solo si hace falta mostrar otro nombre,
`categories` de `icons.config.mjs` lo reemplaza (`{ 'business-and-finance': 'Business & finance' }`);
normalmente se deja vacío.

## Nueva fuente

Con `/generar-fuente` (opción *nueva*), o a mano:

1. Créala con su origen:
   ```bash
   npm run new -- incontrol-system --figma "https://www.figma.com/design/<file>/<nombre>?node-id=12-34" --prefix sys --filter sys-
   npm run new -- shared-icons --local
   ```
   Crea `fonts/<fuente>/` con `icons.config.mjs` (`name`, `prefix`, `origin`; en Figma también `figma` y
   `figmaFilter`; y los opcionales `startCodepoint` = `0xf101`, `fontHeight` = 1000, `normalize` = true y
   `categories`), `source/` y `dist/`. El prefijo por defecto es `icon`.
2. Llena `source/` (Figma: `npm run pull`; local: copia los SVG) y `npm run build -- <fuente>`. A partir
   de ahí, `npm run build` ya la incluye.

No hace falta tocar `package.json` ni los scripts. Si una fuente necesita otro CSS o vista previa,
pon su propio `fonts/<fuente>/templates/css.hbs` o `html.hbs` (copia el compartido como base).

## Exportar a un proyecto

Guía completa: [reference/exportar-fuente.html](reference/exportar-fuente.html) (ábrela en el navegador).

Copia los 8 archivos de `dist/` y `icons.json` a `<ruta>/<carpeta>/`. Por defecto, `<carpeta>` es el
nombre de la fuente; los archivos conservan siempre su nombre (`incontrol-icons.*`):

```bash
npm run export -- incontrol-icons "C:/projects/mi-app/src/assets/fonts"
# -> C:/projects/mi-app/src/assets/fonts/incontrol-icons/{incontrol-icons.css, ..., icons.json}

npm run export -- incontrol-icons "C:/projects/mi-app/src/assets/fonts" --folder icons --force
```

- Si la carpeta ya tiene una copia, no escribe nada salvo que pases `--force`. Los demás archivos de
  esa carpeta nunca se tocan.
- Falla si la fuente aún no está generada o si el destino está dentro de `generate.icons/`.
- Una ruta relativa se resuelve desde la carpeta donde ejecutas npm.

Con Claude Code: **`/exportar-fuente`** (skill en `.claude/skills/exportar-fuente/`) te pregunta la
fuente, el nombre de la carpeta y la ruta, valida y ejecuta el comando.

Luego el proyecto referencia **la copia**, por ejemplo en `angular.json`:
`"styles": ["src/assets/fonts/incontrol-icons/incontrol-icons.css"]` y `<i class="icon-search"></i>`.
Cuando cambien los SVG: `npm run build -- <fuente>` aquí y vuelve a exportar con `--force`.

## Códigos Unicode estables

Antes de generar, el build lee el `dist/<fuente>.json` anterior:

- Un icono que ya existía conserva su código.
- Un icono nuevo toma el primer código libre desde `startCodepoint` (`0xf101` = 61697).
- Un icono borrado desaparece y su código queda libre para el siguiente icono nuevo.
- **Renombrar un SVG equivale a borrar uno y crear otro**: el icono puede cambiar de código.

Con las mismas entradas, el build produce exactamente los mismos archivos (byte a byte).

## Parche de fantasticon

`patches/fantasticon+4.1.0.patch` corrige tres fallos de fantasticon 4.1.0. `patch-package` lo aplica
solo al hacer `npm ci` / `npm install`:

1. **Windows**: fantasticon busca los SVG con `glob` usando una ruta con `\`, que glob interpreta como
   escape y no encuentra nada. El parche añade `windowsPathsNoEscape: true`.
2. **EOT no reproducible**: el `.eot` se copiaba con todo el buffer interno de Node (8 KB con restos de
   memoria). El parche copia solo los bytes de la fuente.
3. **Orden de los glifos**: el orden en que `glob` devuelve los SVG no está garantizado y define el
   orden de los glifos en la fuente (y por tanto sus bytes). El parche los ordena para que el build sea
   siempre idéntico.

Al actualizar fantasticon: cambia la versión en `package.json`, `npm install`. Si `patch-package`
avisa que el parche no aplica, comprueba si la versión nueva ya corrige esos fallos y borra el parche;
si no, recréalo con `npx patch-package fantasticon`. Después, `npm run build` y revisa el diff de `dist/`.
