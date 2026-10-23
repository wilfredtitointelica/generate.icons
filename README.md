# generate-fonts

Generador de fuentes de iconos a partir de SVG exportados de Figma. La carpeta es autocontenida
(su propio `package.json`, dependencias, scripts y configuración): se puede copiar a otro repositorio
tal cual. Admite varias fuentes (`incontrol-icons`, `incontrol-system`, …), cada una en `fonts/<fuente>/`.

**`generate-fonts/` solo genera.** Ningún proyecto la referencia: la fuente generada se **exporta**
(copia) a una carpeta del proyecto, y el proyecto usa esa copia (ver
[Exportar a un proyecto](#exportar-a-un-proyecto)).

Herramienta: [fantasticon](https://github.com/tancredi/fantasticon) 4.1.0, con un parche en
`patches/` (ver [Parche de fantasticon](#parche-de-fantasticon)).

## Comandos

Desde `generate-fonts/` (requiere Node ≥ 22):

| Comando | Qué hace |
|---|---|
| `npm ci` | Instala las dependencias fijadas y aplica el parche (`postinstall`). Solo la primera vez o tras actualizar dependencias. |
| `npm run new -- <fuente> --figma "<url>" [--prefix <prefijo>] [--filter <texto>]` | Crea `fonts/<fuente>/` con su `icons.config.mjs` y la URL de Figma registrada (ver [Nueva fuente](#nueva-fuente)). |
| `npm run sync -- <fuente> <manifiesto.json> [--dry-run]` | Reemplaza `fonts/<fuente>/source/` con los iconos extraídos de Figma (lo usa el skill `/generar-fuente`). |
| `npm run build` | Genera **todas** las fuentes de `fonts/` (cada carpeta con `icons.config.mjs`). |
| `npm run build -- <fuente> [<fuente>…]` | Genera solo esas fuentes, por ejemplo `npm run build -- incontrol-icons`. |
| `npm run export -- <fuente> <ruta> [--folder <carpeta>] [--force]` | Copia una fuente generada a `<ruta>/<carpeta>/` (ver [Exportar a un proyecto](#exportar-a-un-proyecto)). |

## Estructura

```
generate-fonts/
├── package.json · package-lock.json
├── patches/fantasticon+4.1.0.patch
├── scripts/
│   ├── new-font.mjs               # crea una fuente con su URL de Figma
│   ├── sync-figma.mjs             # escribe source/ con los iconos extraídos de Figma
│   ├── build-icons.mjs            # generador (todas las fuentes o las indicadas)
│   ├── export-icons.mjs           # copia una fuente generada a un proyecto
│   └── lib/fonts.mjs              # lectura y validación de icons.config.mjs (común)
├── templates/                     # plantillas compartidas por todas las fuentes
│   ├── css.hbs                    # @font-face + .<prefijo>-nombre::before
│   └── html.hbs                   # vista previa agrupada por categoría
├── .claude/skills/
│   ├── generar-fuente/            # skill: Figma → source/ → dist/
│   └── exportar-iconos/           # skill: dist/ → proyecto
├── exportar-iconos.html           # guía de la exportación
└── fonts/
    ├── incontrol-icons/
    │   ├── icons.config.mjs       # nombre, prefijo, URL de Figma, primer código y nombres de categoría
    │   ├── source/                # SVG en carpetas de categoría, directos, o ambos
    │   │   └── categories.json    # (de sync) carpeta → nombre de la categoría en Figma
    │   ├── templates/             # (opcional) sustituye css.hbs o html.hbs solo para esta fuente
    │   ├── dist/                  # GENERADO
    │   └── icons.json             # GENERADO
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

## Origen en Figma

Cada fuente registra **de dónde salen sus iconos** en el campo `figma` de su `icons.config.mjs`: la
URL de la página, sección o frame de Figma que los contiene, con `node-id`
(`https://www.figma.com/design/<file>/<nombre>?node-id=12-34`). Es **obligatorio**: el build falla
mientras esté vacío. Para obtenerla, en Figma selecciona el frame de iconos y usa *Copy link to
selection*.

El campo `figmaFilter` indica **qué capas de ese nodo son iconos a generar**: solo las que su nombre
empieza por ese texto, sin distinguir mayúsculas (`'icon-'` → `icon-search` sí, `logo` o `label` no).
Vacío = todos los iconos del nodo. Lo pregunta y guarda `/generar-fuente`.

En Figma, cada icono en un frame cuadrado (24×24) y con los trazos convertidos a relleno:
*Outline stroke* y luego *Flatten*. Una fuente solo dibuja rellenos; el build avisa si un SVG todavía
tiene `stroke` (en la vista previa saldría vacío).

## Generar desde Figma (recomendado)

Con Claude Code: **`/generar-fuente`**. Pregunta si es una fuente existente (cuál) o nueva (pide la URL
de Figma, el nombre y el prefijo), y el filtro de nombre de los iconos (p. ej. `icon-`). Luego:

1. Lee el nodo de Figma con el MCP de Figma: solo las capas que pasan el filtro son iconos; los grupos
   hijos del nodo son **categorías** y los iconos sueltos quedan **sin categoría**. Te muestra el
   resumen (incluido lo que el filtro dejó fuera) antes de descargar.
2. Descarga cada icono como SVG y escribe un manifiesto con nombre, categoría y URL de cada uno.
3. `npm run sync -- <fuente> <manifiesto> --dry-run` para ver añadidos, movidos y eliminados, y luego sin
   `--dry-run`: reemplaza `source/` (Figma manda: lo que ya no está en Figma se borra). Los nombres se
   normalizan (`Arrow Left` → `icon-arrow-left`) y los nombres de categoría de Figma se guardan en
   `source/categories.json`.
4. `npm run build -- <fuente>`.

Formato del manifiesto (`name` y `category` tal cual en Figma; `url` o el SVG en `svg`):

```json
{ "icons": [
  { "name": "Arrow Left", "category": "Navigation", "url": "https://…" },
  { "name": "Logo", "category": null, "svg": "<svg …>…</svg>" }
] }
```

## Agregar o cambiar iconos a mano

Sin Claude, también puedes poner los SVG a mano (el `figma` sigue siendo obligatorio):

1. Exporta cada icono como SVG desde Figma.
2. Guárdalo en `fonts/<fuente>/source/`, de una de estas formas (o mezcladas):
   - **Por categoría**, si en Figma están agrupados: `source/<categoria>/<prefijo>-<nombre>.svg`.
   - **Directo**, si en Figma no tienen categoría: `source/<prefijo>-<nombre>.svg`.

   En `incontrol-icons` el prefijo es `icon` (`icon-search.svg`). Reglas:
   - Categorías y nombres en kebab-case; los nombres empiezan por el `prefix` de la fuente.
   - Un nombre no se puede repetir, aunque esté en otra categoría o directo en `source/`.
   - Sin subcarpetas dentro de una categoría (un solo nivel).
   - Mover un icono entre categorías, o de directo a una categoría, conserva su código.
3. `npm run build -- <fuente>` y versiona juntos `source/`, `dist/` e `icons.json`.

Nombre visible de cada categoría, por prioridad: `categories` de `icons.config.mjs`
(`'business-and-finance': 'Business & finance'`), el de Figma guardado en `source/categories.json`, o
el nombre de la carpeta con mayúscula inicial.

## Nueva fuente

Con `/generar-fuente` (opción *nueva*), o a mano:

1. Créala con su URL de Figma:
   ```bash
   npm run new -- incontrol-system --figma "https://www.figma.com/design/<file>/<nombre>?node-id=12-34" --prefix sys --filter sys-
   ```
   Crea `fonts/incontrol-system/` con `icons.config.mjs` (`name`, `prefix`, `figma`, `figmaFilter` y los opcionales
   `startCodepoint` = `0xf101`, `fontHeight` = 1000, `normalize` = true y `categories`), `source/` y
   `dist/`. El prefijo por defecto es `icon`.
2. Llena `source/` (con `/generar-fuente` o a mano) y `npm run build -- incontrol-system`. A partir de
   ahí, `npm run build` ya la incluye.

No hace falta tocar `package.json` ni los scripts. Si una fuente necesita otro CSS o vista previa,
pon su propio `fonts/<fuente>/templates/css.hbs` o `html.hbs` (copia el compartido como base).

## Exportar a un proyecto

Guía completa: [exportar-iconos.html](exportar-iconos.html) (ábrela en el navegador).

Copia los 8 archivos de `dist/` y `icons.json` a `<ruta>/<carpeta>/`. Por defecto, `<carpeta>` es el
nombre de la fuente; los archivos conservan siempre su nombre (`incontrol-icons.*`):

```bash
npm run export -- incontrol-icons "C:/projects/mi-app/src/assets/fonts"
# -> C:/projects/mi-app/src/assets/fonts/incontrol-icons/{incontrol-icons.css, ..., icons.json}

npm run export -- incontrol-icons "C:/projects/mi-app/src/assets/fonts" --folder icons --force
```

- Si la carpeta ya tiene una copia, no escribe nada salvo que pases `--force`. Los demás archivos de
  esa carpeta nunca se tocan.
- Falla si la fuente aún no está generada o si el destino está dentro de `generate-fonts/`.
- Una ruta relativa se resuelve desde la carpeta donde ejecutas npm.

Con Claude Code: **`/exportar-iconos`** (skill en `.claude/skills/exportar-iconos/`) te pregunta la
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

`patches/fantasticon+4.1.0.patch` corrige dos fallos de fantasticon 4.1.0. `patch-package` lo aplica
solo al hacer `npm ci` / `npm install`:

1. **Windows**: fantasticon busca los SVG con `glob` usando una ruta con `\`, que glob interpreta como
   escape y no encuentra nada. El parche añade `windowsPathsNoEscape: true`.
2. **EOT no reproducible**: el `.eot` se copiaba con todo el buffer interno de Node (8 KB con restos de
   memoria). El parche copia solo los bytes de la fuente.

Al actualizar fantasticon: cambia la versión en `package.json`, `npm install`. Si `patch-package`
avisa que el parche no aplica, comprueba si la versión nueva ya corrige esos fallos y borra el parche;
si no, recréalo con `npx patch-package fantasticon`. Después, `npm run build` y revisa el diff de `dist/`.
