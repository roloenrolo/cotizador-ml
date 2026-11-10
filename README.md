# Cotizador de construcción

Sitio estático para preparar presupuestos en CLP: capítulos y partidas, materiales, mano de obra, versiones, respaldos JSON y PDF A4. Sin build, npm ni CDN. Las bibliotecas de PDF están incluidas en `docs/vendor/`.

## Ejecutar localmente

```sh
python3 -m http.server 8080 -d docs
```

Abre `http://localhost:8080`. Usa un servidor HTTP; abrir `index.html` como archivo no permite cargar los módulos y el ejemplo. En escritorio, Tab recorre los controles y Enter avanza entre celdas (Shift+Enter permite saltos de línea en la designación).

## Tests (Node 24)

```sh
node --test tests/*.test.mjs
for archivo in docs/js/*.js; do node --check "$archivo"; done
```

El fixture anonimizado se copia sin cambios a `docs/ejemplo.json`. Los tests del Worker usan HTML sintético y no hacen consultas reales.

## GitHub Pages y buscador

En GitHub Pages selecciona **Deploy from a branch**, rama **main**, carpeta **/docs**. Los recursos usan rutas relativas para funcionar bajo `/cotizador-ml/` sin build ni workflow adicional.

Completa `WORKER_URL` en `docs/js/config.js` con la URL base del Worker ya desplegado y configura el origen del sitio en los orígenes permitidos del Worker. Sin esa URL, sin respuesta o sin conexión al Worker, la cotización funciona con precios manuales y Mis materiales.

## Datos y respaldos

Ingresa la empresa en Configuración; no agregues datos reales a los archivos del repositorio público. Todo se guarda en localStorage bajo `cotizadorml:`. Si no está disponible, se trabaja en memoria con un aviso: exporta antes de cerrar. Cambiar navegador, origen o borrar sus datos no conserva cotizaciones; usa los respaldos JSON para trasladarlas.

Guardar versión conserva una copia independiente y solicita automáticamente un respaldo completo, salvo que desactives esa opción. Revisa las descargas del navegador. Fusionar conserva empresa/configuración locales omite cotizaciones idénticas y copia las distintas con ID repetido (con sufijo «(importada)»); reemplazar sustituye todo con confirmación. Una cotización duplicada comienza sin versiones. La designación sirve de nombre para recordar materiales manuales.

Los precios editables se ingresan como números en CLP; totales y PDF usan formato `$1.234.567`. La mano de obra nunca se multiplica por cantidad. El cambio de IVA solo convierte precios Sodimac sin ajuste manual y avisa cuántos deja sin tocar. Reutilizar un material Sodimac o editar su rendimiento vuelve a aplicar el precio sugerido con el IVA actual. El PDF con cambios sin versionar se descarga como `Presupuesto-{numero}-borrador.pdf`.

Los datos ilegibles se preservan y bloquean el guardado hasta confirmar «Empezar de cero». Descarga el original desde el aviso persistente. Si otra pestaña cambia los datos, recarga antes de continuar. Los números aceptan coma o punto decimal; un campo vacío vale cero y los inválidos bloquean la versión y el PDF. La numeración conserva el máximo utilizado aunque elimines cotizaciones.
