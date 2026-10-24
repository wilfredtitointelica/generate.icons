---
name: exportar-fuente
description: Copia una fuente de iconos generada en generate.icons/fonts/<fuente>/ (incontrol-icons, incontrol-system, …) a una carpeta de un proyecto, para que el proyecto use esa copia y nunca referencie generate.icons/. Copia los 8 archivos de dist/ (css, eot, html, json, svg, ttf, woff, woff2) y el icons.json (iconos por categoría y/o sin categoría). Pregunta la fuente (si hay varias) y exporta a sus destinos registrados (fonts/<fuente>/export.local.json) o pide el nombre de la carpeta y la ruta, y ofrece registrarla. Úsalo cuando el usuario diga "exporta la fuente", "exporta los iconos", "copia incontrol-icons a <ruta>", "lleva la fuente de iconos al proyecto X", "actualiza los iconos en <proyecto>" o /exportar-fuente.
argument-hint: "[fuente] [ruta] [nombre-carpeta]"
---

# Exportar una fuente de iconos

`generate.icons/` solo **genera** fuentes; ningún proyecto la referencia. Cada fuente vive en
`generate.icons/fonts/<fuente>/`. Para usarla, se copia su salida a una carpeta del proyecto, y ese
proyecto referencia la copia (por ejemplo, el CSS en `styles` de `angular.json`).

Resultado en `<ruta>/<carpeta>/` (ejemplo con `incontrol-icons`):

```
<carpeta>/
├── incontrol-icons.css      # @font-face + una clase por icono (.icon-search)
├── incontrol-icons.eot · .svg · .ttf · .woff · .woff2
├── incontrol-icons.html     # vista previa de todos los iconos
├── incontrol-icons.json     # nombre → código Unicode ("icon-search": 61698)
└── icons.json               # iconos por categoría y/o sin categoría
```

Los archivos se llaman siempre como la fuente (`<fuente>.*`); solo la carpeta cambia de nombre.

## 1. Datos

Lo que venga en los argumentos o en el mensaje no se vuelve a preguntar; lo que falte se pregunta en el
chat, **todo en un solo mensaje**.

**Fuente**: una carpeta de `generate.icons/fonts/` que tenga `icons.config.mjs`. Si solo hay una, se usa
sin preguntar; si hay varias, lístalas y pregunta cuál.

### Destinos registrados

Cada fuente puede tener sus destinos guardados en `fonts/<fuente>/export.local.json` (ignorado por git):
`{ "targets": [{ "name", "path", "folder"? }] }`. Míralos con `npm run export -- <fuente> --list`.

- **Si hay registrados** y el usuario no dio otra ruta: muéstralos (nombre → `<path>/<folder>`, marcando
  los que no existen en disco) y pregunta en un solo mensaje si exporta a **todos**, a **algunos**
  (`--only`) o a **otra ruta**. No preguntes carpeta ni sobrescritura: los registrados ya la tienen y se
  sobrescriben sin `--force` (solo los 9 archivos). Pasa al paso [3](#3-copiar).
- **Si no hay**, o el usuario da una ruta nueva: pide los datos de abajo y pregunta si la **guarda** como
  destino registrado (recomendado si va a repetirse); con un sí se añade `--save`.

### Ruta nueva

1. **Nombre de la carpeta** a crear o actualizar. Por defecto, el de la fuente (`incontrol-icons`).
   Solo letras, números, `.`, `_` y `-`.
2. **Ruta** donde se crea la carpeta, por ejemplo `C:/projects/mi-app/src/assets/fonts`. Puede ser
   cualquier carpeta o repositorio, y **varias a la vez** (una por proyecto): se exportan todas con un
   solo comando y la misma carpeta. Si el usuario quiere otro nombre de carpeta en alguna, esa va en un
   comando aparte. Si es relativa, se
   resuelve desde la raíz de `generate.icons/` y se le muestra al usuario la ruta absoluta resultante. Debe estar **fuera** de `generate.icons/`.

## 2. Validar antes de copiar

- **La fuente está generada**: existen `fonts/<fuente>/dist/<fuente>.{css,eot,html,json,svg,ttf,woff,woff2}`
  y `fonts/<fuente>/icons.json`. Si falta alguno:
  > La fuente **<fuente>** aún no está generada. ¿La genero ahora con `npm run build -- <fuente>`?

  Si acepta, ejecútalo desde `generate.icons/`. Si el build falla (por ejemplo, `source/` sin SVG),
  muestra el error y no continúes.
- **La ruta destino existe** (la carpeta padre), en cada ruta. Si no existe, pregunta si se crea; el
  script la crea con la copia.
- **Copia anterior** (solo rutas nuevas): si `<ruta>/<carpeta>/` ya tiene alguno de esos 9 archivos, muestra cuáles (por
  ruta) y pregunta **una sola vez** si se sobrescriben. Solo con un sí se pasa `--force`. Los demás
  archivos de esa carpeta no se tocan nunca.

## 3. Copiar

Desde `generate.icons/` (si no hay `node_modules`, antes `npm ci`):

```bash
# destinos registrados (todos, o solo los indicados)
npm run export -- <fuente> [--only <nombre>,<nombre>]

# rutas nuevas (con --save quedan registradas; --name solo con una ruta)
npm run export -- <fuente> "<ruta-absoluta>" ["<otra-ruta-absoluta>" …] --folder <carpeta> [--force] [--save [--name <nombre>]]
```

Pasa siempre las rutas **absolutas** y entre comillas. El script vuelve a validar lo anterior en todas
las rutas y, si alguna falla, no escribe en ninguna. Con `--save`, el nombre registrado es el del
repositorio git de la ruta; para cambiar o quitar un destino, se edita `export.local.json`.

## 4. Responder

En pocas líneas:

- Ruta absoluta de cada carpeta creada o actualizada y los 9 archivos copiados.
- Si se sobrescribió una copia anterior, decirlo.
- Si se registraron destinos (`--save`), con qué nombre, y que la próxima vez basta con
  `npm run release -- <fuente>` (genera y exporta a todos).
- Recordar que el proyecto debe referenciar **la copia**, nunca `generate.icons/`. No modifiques
  `angular.json` ni otros archivos del proyecto destino salvo que el usuario lo pida y diga la ruta.
- Si después cambian los SVG: `npm run release -- <fuente>` en `generate.icons/` (destinos
  registrados), o `npm run build -- <fuente>` y volver a exportar (con sobrescritura).
