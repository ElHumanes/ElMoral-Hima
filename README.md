# Padel App — Club de Pádel El Moral

Aplicación web para gestionar el equipo de pádel del **Club de Pádel El Moral**
(Sanlúcar de Barrameda), que compite en la **Series Nacionales de Pádel (SNP)**.

Gestiona jugadores, jornadas, convocatorias, selección de los 10, parejas y
resultados — con **coste 0 €**, sin ningún servicio de pago.

## Arquitectura (coste 0 €)

```
USUARIO → GITHUB PAGES → HTML/CSS/JS → GOOGLE APPS SCRIPT → GOOGLE SHEETS
```

- **Frontend**: HTML + CSS + JavaScript puro, sin frameworks. PWA instalable.
- **Backend**: Google Apps Script (Web App).
- **Base de datos**: Google Sheets.
- **Hosting**: GitHub Pages.

Todos los detalles de arquitectura, modelo de datos y decisiones de diseño están
en [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md). Los identificadores, URLs y
usuarios de prueba están en [docs/CONFIGURACION.md](docs/CONFIGURACION.md).

## Estructura del proyecto

```
/padel-app
  index.html          → lo que publica GitHub Pages (todo en la raíz)
  styles.css
  app.js
  manifest.json
  service-worker.js
  /assets              → logos e iconos
  /backend             → código a pegar en Google Apps Script (no se "sirve",
                          va aparte al editor de Apps Script; solo vive aquí
                          como copia de referencia)
    Code.gs             → punto de entrada del Web App (router)
    Utils.gs            → helpers de acceso a la hoja de cálculo
    Auth.gs             → login, sesiones, usuario de prueba
    Jugadores.gs
    Jornadas.gs
    Convocatorias.gs
    Seleccion.gs
    Parejas.gs
    Resultados.gs
    Estadisticas.gs
    Usuarios.gs
    Recomendacion.gs
    Fotos.gs
  /docs
    ARQUITECTURA.md
    CONFIGURACION.md
    PRUEBAS.md
```

## Estado del proyecto por fases

| Fase | Contenido | Estado |
|---|---|---|
| 0 | Arquitectura | ✅ Hecho |
| 1 | Google Sheets | ✅ Hecho |
| 2 | Backend base (login, sesiones) | ✅ Hecho y publicado |
| 3 | Frontend base + identidad visual | ✅ Hecho y publicado |
| 4 | Gestión de jugadores | ✅ Hecho y publicado |
| 5 | Jornadas y convocatorias | ✅ Hecho y publicado |
| 6 | Panel de jugadores (perfil, calendario) | ✅ Hecho y publicado |
| 7 | Selección de los 10 | ✅ Hecho, publicado y verificado de extremo a extremo |
| 8 | Generador de parejas | ✅ Hecho, publicado y verificado de extremo a extremo |
| 9 | Motor de recomendación | ✅ Hecho, publicado y verificado con datos reales |
| 10 | Partidos y resultados | ✅ Hecho, publicado y verificado de extremo a extremo |
| 11 | Estadísticas (ampliadas: forma reciente, local/visitante, asistencia, ranking de jugadores y de parejas) | ✅ Hecho, publicado y verificado de extremo a extremo |
| 12 | Dashboard (resumen del equipo, mejor jugador, mejor pareja, próxima jornada) | ✅ Hecho, publicado y verificado de extremo a extremo |
| — | Gestión de usuarios / segundo capitán | ✅ Hecho, publicado y verificado de extremo a extremo |
| — | Jugadores pueden ver los resultados de todos los partidos (no solo los suyos) desde el Calendario | ✅ Hecho, publicado y verificado |
| 13 | PWA | ✅ Hecho y verificado |
| 14 | Seguridad | ✅ Revisión hecha (ver nota XSS en CONFIGURACION.md) |
| 15 | Pruebas completas | ✅ Hecho — ciclo de vida completo de una jornada real (convocatoria → selección → recomendación → parejas → resultados), validaciones y permisos verificados de extremo a extremo (ver docs/PRUEBAS.md) |
| 16 | Publicación en GitHub Pages | ✅ Hecho |

**"Código listo, pendiente de publicar"** significa que el archivo `.gs` ya está
escrito y lo he probado todo lo que se puede probar sin backend real (la parte
visual, con datos simulados), pero falta pegarlo en el editor de Apps Script y
crear una nueva versión — eso solo lo puedes hacer tú, desde el navegador.

## Cómo continuar

1. Abre el editor de Apps Script (Extensiones → Apps Script desde la hoja de cálculo).
2. Pega los archivos pendientes: `Seleccion.gs`, `Parejas.gs`, `Resultados.gs`,
   `Estadisticas.gs` (nuevos) y reemplaza `Código.gs` (todos con el contenido de
   `/backend` en este repositorio).
3. Implementar → Gestionar implementaciones → lápiz → Nueva versión → Implementar.
4. Probar cada fase por separado, en este orden: selección de los 10 → parejas →
   resultados → estadísticas — así, si algo falla, se sabe exactamente en qué
   pieza está el problema.

## Coste

**0 € al mes, 0 € al año, sin tarjeta, sin ningún servicio de pago.** Detalle
completo de cada servicio usado en [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md#12-comprobación-de-coste-0).
