---
name: exportar-iconos
description: Copia una fuente de iconos generada en generate-fonts/fonts/<fuente>/ (incontrol-icons, incontrol-system, …) a una carpeta de un proyecto, para que el proyecto use esa copia y nunca referencie generate-fonts/. Copia los 8 archivos de dist/ (css, eot, html, json, svg, ttf, woff, woff2) y el icons.json (iconos por categoría y/o sin categoría). Pregunta la fuente (si hay varias), el nombre de la carpeta a crear y la ruta donde crearla. Úsalo cuando el usuario diga "exporta los iconos", "copia incontrol-icons a <ruta>", "lleva la fuente de iconos al proyecto X", "actualiza los iconos en <proyecto>" o /exportar-iconos.
argument-hint: "[fuente] [ruta] [nombre-carpeta]"
---

# Exportar una fuente de iconos

`generate-fonts/` solo **genera** fuentes; ningún proyecto la referencia. Cada fuente vive en
`generate-fonts/fonts/<fuente>/`. Para usarla, se copia su salida a una carpeta del proyecto, y ese
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
chat, **todo en un solo mensaje**:

1. **Fuente**: una carpeta de `generate-fonts/fonts/` que tenga `icons.config.mjs`. Si solo hay una,
   se usa sin preguntar; si hay varias, lístalas y pregunta cuál.
2. **Nombre de la carpeta** a crear o actualizar. Por defecto, el de la fuente (`incontrol-icons`).
   Solo letras, números, `.`, `_` y `-`.
3. **Ruta** donde se crea la carpeta, por ejemplo `C:/projects/mi-app/src/assets/fonts`. Si es
   relativa, se resuelve desde la raíz del repositorio que contiene `generate-fonts/` y se le muestra al
   usuario la ruta absoluta resultante. Debe estar **fuera** de `generate-fonts/`.

## 2. Validar antes de copiar

- **La fuente está generada**: existen `fonts/<fuente>/dist/<fuente>.{css,eot,html,json,svg,ttf,woff,woff2}`
  y `fonts/<fuente>/icons.json`. Si falta alguno:
  > La fuente **<fuente>** aún no está generada. ¿La genero ahora con `npm run build -- <fuente>`?

  Si acepta, ejecútalo desde `generate-fonts/`. Si el build falla (por ejemplo, `source/` sin SVG),
  muestra el error y no continúes.
- **La ruta destino existe** (la carpeta padre). Si no existe, pregunta si se crea; el script la crea
  con la copia.
- **Copia anterior**: si `<ruta>/<carpeta>/` ya tiene alguno de esos 9 archivos, muestra cuáles y
  pregunta si se sobrescriben. Solo con un sí se pasa `--force`. Los demás archivos de esa carpeta no
  se tocan nunca.

## 3. Copiar

Desde `generate-fonts/` (si no hay `node_modules`, antes `npm ci`):

```bash
npm run export -- <fuente> "<ruta-absoluta>" --folder <carpeta> [--force]
```

Pasa siempre la ruta **absoluta** y entre comillas. El script vuelve a validar lo anterior y no escribe
nada si algo falla.

## 4. Responder

En pocas líneas:

- Ruta absoluta de la carpeta creada o actualizada y los 9 archivos copiados.
- Si se sobrescribió una copia anterior, decirlo.
- Recordar que el proyecto debe referenciar **la copia**, nunca `generate-fonts/`. No modifiques
  `angular.json` ni otros archivos del proyecto destino salvo que el usuario lo pida y diga la ruta.
- Si después cambian los SVG: `npm run build -- <fuente>` en `generate-fonts/` y volver a exportar
  (con sobrescritura).
