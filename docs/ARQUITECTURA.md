# ARQUITECTURA — App de Gestión de Equipo de Pádel

**Estado:** FASE 0 — Documento de planificación. No contiene código todavía.
**Principio rector:** Coste 0 € en todo momento. Sin tarjeta bancaria. Sin facturación en Google Cloud.

---

## 1. Arquitectura general

```
JUGADOR / CAPITÁN (móvil, tablet, ordenador)
        │
        ▼
GITHUB PAGES  (hosting estático gratuito)
   index.html + styles.css + app.js  (PWA instalable)
        │  fetch() con token de sesión
        ▼
GOOGLE APPS SCRIPT  (Web App: doGet / doPost)
   Code.gs → valida sesión, valida rol, ejecuta lógica, calcula índices
        │  SpreadsheetApp
        ▼
GOOGLE SHEETS  (base de datos)
   CONFIG · JUGADORES · USUARIOS · SESIONES · TEMPORADAS · JORNADAS ·
   CONVOCATORIAS · SELECCIONADOS · PAREJAS · PARTIDOS · RESULTADOS ·
   HISTORICO_PAREJAS · HISTORICO_PUNTUACIONES · LOG
```

Todo el peso de negocio (cálculos, seguridad, validaciones) vive en Apps Script. El frontend es "tonto": solo pide datos y los pinta. Google Sheets nunca se expone directamente a internet; solo se accede a través del Web App de Apps Script.

**Por qué esta arquitectura cumple coste 0 €:**
- GitHub Pages: gratis para repositorios públicos (y también para privados en el plan Free, con la web publicada en una URL pública tipo `usuario.github.io/padel-app`).
- Google Apps Script: gratis con cualquier cuenta de Google normal. Tiene cuotas diarias generosas (ver apartado 13) que no se van a alcanzar con un equipo de pádel.
- Google Sheets: gratis, incluido en cualquier cuenta de Google (15 GB compartidos con Gmail/Drive, muy por encima de lo que ocupará este proyecto).
- No hay dominio de pago: se usa la URL gratuita `github.io`.
- No hay ningún servicio de terceros, API de pago, ni sistema de autenticación externo.

---

## 2. Estructura de carpetas del proyecto

```
/padel-app
  /frontend
    index.html
    styles.css
    app.js
    manifest.json          (Fase 13)
    service-worker.js      (Fase 13)
    /icons                 (iconos PWA, SVG propios)
  /backend
    Code.gs                (punto de entrada Web App: doGet/doPost)
    Auth.gs                (login, sesiones, permisos)
    Jugadores.gs
    Jornadas.gs
    Convocatorias.gs
    Parejas.gs
    Recomendacion.gs       (motor de recomendación)
    Resultados.gs
    Estadisticas.gs
    Utils.gs                (helpers: IDs, respuestas JSON, validaciones)
  /docs
    ARQUITECTURA.md   ← este documento
    INSTALACION.md    (Fase 16)
    CONFIGURACION.md  (Fase 16)
    PRUEBAS.md        (Fase 15)
    README.md
```

Esta carpeta `padel-app` se crea como proyecto independiente dentro de tu repositorio actual, sin tocar `hima`, `clicksat`, `geofichaje` ni el resto de proyectos que ya tienes. No comparte configuración con ellos (no usa pnpm/turbo), porque no lo necesita: es HTML/CSS/JS puro + Apps Script.

---

## 3. Modelo de datos (entidades y relaciones)

```
TEMPORADA 1───N JORNADA 1───N CONVOCATORIA N───1 JUGADOR
                    │
                    1───N SELECCIONADOS N───1 JUGADOR
                    │
                    1───N PAREJA (jugador_a, jugador_b → JUGADOR)
                    │        │
                    │        1───1 PARTIDO
                    │             │
                    │             1───1 RESULTADO

JUGADOR 1───1 USUARIO (opcional: el capitán también puede no tener ficha de jugador)
USUARIO 1───N SESIONES

HISTORICO_PAREJAS y HISTORICO_PUNTUACIONES son tablas derivadas/caché,
recalculadas a partir de PARTIDOS + RESULTADOS + JUGADORES.
No se piden a mano: las genera Apps Script.
```

Todos los identificadores son **IDs únicos generados con `Utilities.getUuid()`** (función gratuita nativa de Apps Script). Nunca se usa el número de fila como identificador, para que reordenar o filtrar la hoja no rompa nada.

---

## 4. Estructura de Google Sheets

Un único archivo de Google Sheets con estas hojas:

### CONFIG
| clave | valor | descripcion |
|---|---|---|
Pares clave-valor. Contendrá, entre otros: `TEMPORADA_ACTUAL`, `NOMBRE_EQUIPO`, pesos del motor de recomendación (`PESO_COMPATIBILIDAD`, `PESO_PUNTUACION`, `PESO_VICTORIAS`, `PESO_PARTIDOS_JUNTOS`, `PESO_FORMA_RECIENTE`, `PESO_DIF_SETS`, `PESO_DIF_JUEGOS`, `PESO_EQUILIBRIO`) y umbrales de confianza estadística (`UMBRAL_BAJA`, `UMBRAL_MEDIA`, `UMBRAL_ALTA`, `UMBRAL_MUY_ALTA`, en número de partidos).

### JUGADORES
`id_jugador, nombre, apellidos, nombre_completo, posicion_principal, posicion_secundaria, puntuacion, estado, id_temporada, fecha_alta, apodo`

*(columna `apodo` añadida en la Fase 4: muchos jugadores son más conocidos por su apodo que por su nombre real, así que se muestra en su lugar cuando existe)*

### USUARIOS
`id_usuario, id_jugador, nombre_usuario, rol, codigo_acceso_hash, estado, fecha_creacion, ultimo_acceso`

### SESIONES *(hoja añadida, necesaria para el login — ver apartado 6)*
`token, id_usuario, fecha_creacion, fecha_expiracion`

### TEMPORADAS
`id_temporada, nombre, fecha_inicio, fecha_fin, estado`

### JORNADAS
`id_jornada, id_temporada, fecha, rival, local_visitante, lugar, estado, observaciones`

### CONVOCATORIAS
`id_convocatoria, id_jornada, id_jugador, disponibilidad, fecha_respuesta, observaciones`

### SELECCIONADOS
`id_seleccion, id_jornada, id_jugador, fecha_seleccion`

### PAREJAS
`id_pareja, id_jornada, id_jugador_a, id_jugador_b, numero_partido, puntuacion_total, compatibilidad, indice_pareja`

### PARTIDOS
`id_partido, id_jornada, id_pareja, numero_partido`

### RESULTADOS
`id_resultado, id_partido, sets_favor, sets_contra, juegos_favor, juegos_contra, resultado, fecha_registro`

### HISTORICO_PAREJAS *(caché recalculada)*
`id, id_jugador_a, id_jugador_b, id_temporada, partidos_juntos, victorias, derrotas, ultima_actualizacion`

### HISTORICO_PUNTUACIONES
`id, id_jugador, puntuacion, fecha, motivo`

### LOG
`id_log, fecha, id_usuario, accion, detalle`

**Nota sobre redundancia:** las estadísticas individuales (partidos, % victoria, sets, forma reciente, etc.) **no se guardan como hoja fija**: se calculan al vuelo en Apps Script a partir de JUGADORES + PARTIDOS + RESULTADOS + CONVOCATORIAS, y se devuelven ya calculadas al frontend. Esto evita datos duplicados que se puedan desincronizar.

---

## 5. API de Google Apps Script

Un único Web App (`Code.gs`) con dos funciones de entrada, `doGet(e)` y `doPost(e)`, que enrutan según un parámetro `action`. Todas las respuestas son JSON.

**Autenticación:** `login`, `logout`, `validarSesion`
**Jugadores:** `listarJugadores`, `crearJugador`, `editarJugador`, `desactivarJugador`
**Temporadas:** `listarTemporadas`, `crearTemporada`
**Jornadas:** `listarJornadas`, `crearJornada`, `cambiarEstadoJornada`
**Convocatorias:** `abrirConvocatoria`, `responderConvocatoria`, `listarConvocatoria`
**Selección:** `seleccionarJugadores`, `listarSeleccionados`
**Parejas:** `crearPareja`, `editarPareja`, `listarParejas`, `calcularCompatibilidad`
**Recomendación:** `generarRecomendaciones`, `compararAlineaciones`
**Resultados:** `registrarResultado`, `listarResultados`
**Estadísticas:** `estadisticasJugador`, `estadisticasPareja`, `dashboard`, `asistencia`
**Config:** `obtenerConfigPublica`, `actualizarConfig` (solo capitán)

Toda acción que no sea `login` exige un `token` de sesión válido. Las acciones de gestión (crear jornada, seleccionar jugadores, crear parejas, registrar resultados, editar config) además exigen `rol = CAPITAN`.

Para evitar que dos escrituras simultáneas corrompan una hoja (por ejemplo, dos jugadores respondiendo a la convocatoria a la vez), cada operación de escritura usa `LockService` (gratuito, incluido en Apps Script).

**Limitación real que debes conocer:** los Web Apps de Apps Script tienen un comportamiento particular con CORS en peticiones `POST` con JSON — no admiten cabeceras personalizadas ni `Content-Type: application/json` igual que un servidor normal. La solución estándar (gratuita) es enviar el cuerpo como `text/plain` con el JSON como texto, que Apps Script interpreta igualmente. Lo dejo anotado aquí para no encontrarnos con una sorpresa en la Fase 3.

---

## 6. Sistema de usuarios y autenticación (100% gratuito)

No se usa Google Sign-In ni ningún proveedor externo, para no depender de configurar un proyecto de Google Cloud con pantalla de consentimiento (innecesario y más complejo para ti). En su lugar:

1. El capitán da de alta a cada jugador en `USUARIOS` con un **nombre de usuario** y un **código de acceso** (tipo PIN de 4-6 dígitos, o una palabra sencilla).
2. Apps Script nunca guarda el código en texto plano: lo guarda **hasheado** con `Utilities.computeDigest` (función nativa gratuita).
3. Al iniciar sesión, el frontend envía usuario + código → Apps Script valida el hash → si es correcto, genera un **token aleatorio**, lo guarda en `SESIONES` con fecha de caducidad (ej. 30 días), y lo devuelve al frontend.
4. El frontend guarda el token en `localStorage` del navegador y lo manda en cada petición.
5. Apps Script comprueba el token y su caducidad en cada acción protegida.

Esto es sencillo de explicar a los jugadores ("tu usuario es tu nombre, tu código te lo doy yo") y no exige que nadie tenga cuenta de Google.

---

## 7. Seguridad

- El frontend (GitHub Pages) es público por naturaleza — cualquiera puede ver el HTML/CSS/JS. Por eso **ningún dato sensible ni contraseña vive en el frontend**: solo la URL pública del Web App de Apps Script (que ya de por sí no expone datos sin token válido).
- Google Sheets nunca se comparte como "cualquiera con el enlace puede editar". Solo el propio Apps Script (ejecutándose como tu cuenta) tiene acceso de escritura.
- Toda entrada del usuario se valida en el backend (Apps Script), nunca solo en el frontend, porque el frontend se puede manipular.
- Distinción CONFIG pública/privada: `obtenerConfigPublica` solo devuelve valores no sensibles (pesos del motor, nombre del equipo); nunca credenciales.
- El fichero `Code.gs` no contiene ninguna clave secreta hardcodeada: el propio ID de la hoja de cálculo se guarda en `PropertiesService` (almacén de propiedades del script, no visible desde fuera), no en el código fuente que subiremos a GitHub.
- `LOG` registra acciones sensibles (login, cambios de resultados, cambios de config) con usuario y fecha, para poder auditar qué pasó.

---

## 8. Flujo del capitán

```
Login → Dashboard
  → Gestionar jugadores (alta/baja/edición)
  → Crear jornada (temporada, fecha, rival, local/visitante)
  → Abrir convocatoria → jugadores responden
  → Ver convocatoria (apuntados/no disponibles/pendientes)
  → Seleccionar 10 de los apuntados
  → Generar parejas (manual o con motor de recomendación)
  → Ver compatibilidad, índices, comparar hasta 3 alineaciones
  → Confirmar alineación → jornada pasa a CONFIRMADA
  → Jugar → registrar resultados por partido
  → Consultar estadísticas y dashboard actualizados
```

## 9. Flujo del jugador

```
Login → Mi perfil (mis estadísticas, mi puntuación, mi forma reciente)
  → Ver convocatoria abierta → responder ME APUNTO / NO PUEDO
  → Ver si he sido seleccionado
  → Ver alineación confirmada de la jornada
  → Ver calendario de jornadas
  → Ver resultados pasados
  → Ver mis estadísticas históricas
```

El jugador nunca ve pantallas de gestión (crear jornada, seleccionar, registrar resultados): esas rutas quedan bloqueadas en frontend *y* rechazadas en backend si `rol ≠ CAPITAN`.

---

## 10. Motor de recomendación de parejas

Para cada posible pareja de los 10 seleccionados se calcula un **INDICE_PAREJA (0-100)**, combinando (pesos configurables en `CONFIG`):

- Compatibilidad de posiciones (✓ / ⚠ / ❌)
- Puntuación combinada
- % de victorias juntos
- Nº de partidos juntos (peso también de la **confianza estadística** de esa muestra)
- Diferencia de sets y de juegos
- Forma reciente de cada jugador
- Rendimiento individual por posición

Para cada combinación completa de 5 parejas se calcula un **INDICE_ALINEACION (0-100)**, que añade el equilibrio general entre los 5 partidos (evitar que el partido 5 sea mucho más flojo que el 1, por ejemplo).

**Confianza estadística:** cualquier porcentaje va siempre acompañado del número de partidos que lo sustentan, y se etiqueta MUY BAJA / BAJA / MEDIA / ALTA / MUY ALTA según umbrales configurables (ej. <3, 3-5, 6-10, 11-20, >20 partidos). Un 100% con 1 partido se muestra como "100% · 1 partido · confianza MUY BAJA", nunca como un dato fiable sin más.

El sistema no se limita a probar "la pareja con más % de victorias": genera varias combinaciones válidas de las 5 parejas (respetando que cada jugador aparezca una sola vez) y devuelve las 3 mejores por índice global, cada una con una explicación en lenguaje natural de por qué se recomienda.

---

## 11. Plan de desarrollo por fases

| Fase | Contenido |
|---|---|
| 0 | Arquitectura (este documento) |
| 1 | Configuración de Google Sheets (hojas y cabeceras reales) |
| 2 | Backend Apps Script (Code.gs + módulos) |
| 3 | Frontend base (estructura HTML/CSS/JS + login) |
| 4 | Gestión de jugadores |
| 5 | Jornadas y convocatorias |
| 6 | Panel de jugadores |
| 7 | Selección de los 10 |
| 8 | Generador de parejas |
| 9 | Motor de recomendación |
| 10 | Partidos y resultados |
| 11 | Estadísticas |
| 12 | Dashboard |
| 13 | PWA (manifest + service worker) |
| 14 | Seguridad (revisión y endurecido) |
| 15 | Pruebas completas con datos de prueba |
| 16 | Publicación (GitHub Pages + documentación) |

No se avanza de fase sin comprobar antes que la anterior funciona correctamente.

---

## 12. Comprobación de coste 0 €

| Servicio | Para qué se usa | Precio | ¿Tarjeta? | ¿Puede generar cargos? | ¿Límite gratuito? | ¿Imprescindible? |
|---|---|---|---|---|---|---|
| Cuenta de Google (Gmail normal) | Alojar Sheets y ejecutar Apps Script | 0 € | No | No | 15 GB compartidos (de sobra) | Sí |
| Google Sheets | Base de datos | 0 € | No | No | Dentro de los 15 GB | Sí |
| Google Apps Script | Backend / API | 0 € | No | No | Cuotas diarias generosas: 6 min por ejecución, ~20.000 llamadas URL Fetch/día, 90 min de triggers/día (cuenta gratuita normal) | Sí |
| GitHub (repositorio) | Guardar el código | 0 € | No | No | Repos ilimitados en plan Free | Sí |
| GitHub Pages | Alojar el frontend | 0 € | No | No | 1 GB de sitio, 100 GB de ancho de banda/mes (muy por encima de lo necesario) | Sí |
| Dominio | — | No se usa dominio propio | — | — | — | No (se usa `usuario.github.io`) |
| Cualquier API externa (IA, SMS, email, mapas de pago...) | — | No se usa ninguna | — | — | — | No |

**COSTE MENSUAL: 0 €**
**COSTE ANUAL: 0 €**
**TARJETA NECESARIA: NO**
**SERVICIOS DE PAGO: NINGUNO**

Si en algún momento futuro el equipo creciera muchísimo (varios cientos de jugadores con miles de peticiones diarias) se podría rozar la cuota gratuita de Apps Script; te lo indicaría explícitamente en ese momento, con la alternativa gratuita correspondiente. Con un equipo de pádel normal, no hay ningún riesgo de acercarse a esos límites.

---

## Siguiente paso

Este documento cierra la **FASE 0**. Antes de tocar Google Sheets o escribir una sola línea de `Code.gs`, necesito tu confirmación:

1. ¿Te parece bien la estructura de hojas y el modelo de datos del apartado 3 y 4?
2. ¿Te parece bien el sistema de login por usuario + código de acceso (apartado 6), en vez de exigir cuenta de Google a cada jugador?
3. ¿Confirmas que quieres seguir el plan de fases del apartado 11, avanzando una a una?

Cuando me confirmes, empezamos la **FASE 1: configuración real de Google Sheets**, y te guiaré paso a paso (dónde entrar, qué pulsar, qué copiar) para crear la hoja de cálculo.
