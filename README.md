# Clin

**PDF Studio**

Un estudio PDF para navegador: organiza documentos sobre un lienzo libre, anota páginas y exporta el resultado. Esta es la edición web de Clin.

**[Descargar Clin para Windows en Gumroad](https://maydei.gumroad.com/l/clin)**

El instalable oficial de Windows se distribuye exclusivamente desde Gumroad. Este repositorio contiene la versión web; no incluye Electron, instaladores ni herramientas para empaquetar la edición de escritorio.

## Funciones

- Importar PDF e imágenes, ordenar, agrupar, duplicar y girar páginas.
- Escribir, dibujar, resaltar y añadir formas sobre páginas o el lienzo.
- Trabajar en canvas, lector o presentación.
- Guardar y abrir proyectos `.clin`, con recuperación local y deshacer/rehacer.
- Exportar PDF, PNG, JPG y ZIP de imágenes.
- Buscar texto y reconocer documentos mediante OCR local en español e inglés.

## Ejecutar en el navegador

Requisitos: Node.js 24 LTS (24.15 o posterior) y npm.

```sh
npm ci
npm run dev
```

Abre http://localhost:3000. La primera compilación prepara los recursos de PDF y OCR desde las dependencias instaladas.

## Producción

```sh
npm ci
npm run build
npm start
```

El proyecto usa Next.js y necesita alojamiento compatible con Node.js. Subir el código a GitHub no publica automáticamente una web, y esta configuración no es una exportación estática para GitHub Pages. Sirve la aplicación en la raíz de un dominio y utiliza HTTPS para las funciones del navegador que lo requieren.

## Privacidad y guardado

Los documentos se procesan en el navegador. La recuperación y los recientes se almacenan en ese navegador y origen; no se sincronizan entre equipos. Guarda archivos `.clin` para conservar copias independientes de los datos del sitio. El navegador necesita descargar inicialmente la aplicación y sus recursos; no se garantiza el funcionamiento sin conexión.

La disponibilidad de guardado directo, pantalla completa y cuentagotas depende del navegador. Cuando no existe guardado directo, Clin descarga el archivo.

## Verificación

```sh
npm test
npm run lint
npm run build
```

## Windows y soporte

La edición de escritorio, su instalación y las asociaciones de archivos corresponden al producto de [Gumroad](https://maydei.gumroad.com/l/clin).

Desarrollado por Maydei. Contacto: support@maydei.es.


## Estado de verificación de esta entrega

- 89 pruebas unitarias pasan (25 archivos).
- Compilación de producción verificada.
- Lint pendiente: 11 errores y 12 advertencias en el código heredado (reglas de hooks de React, refs y alias de `this` en un test). El workflow mantiene esta comprobación activa; no se han desactivado las reglas para ocultarlos.
