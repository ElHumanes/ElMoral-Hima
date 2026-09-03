/**
 * Utilidades comunes: acceso a la hoja de cálculo, lectura/escritura genérica,
 * generación de IDs y respuestas JSON.
 */

var PROP_SPREADSHEET_ID = 'SPREADSHEET_ID';

// Caché en memoria del Spreadsheet y sus pestañas, válida solo durante esta
// misma ejecución (cada doGet/doPost es una ejecución nueva, así que no hay
// riesgo de servir datos obsoletos entre peticiones distintas). Sin esta
// caché, cada leerFilas/agregarFila/actualizarFila volvía a abrir la hoja de
// cálculo entera desde cero — con varias llamadas por petición (por ejemplo,
// validar la sesión y luego leer JUGADORES), eso multiplicaba muchísimo el
// tiempo de respuesta.
var _spreadsheetCache = null;
var _sheetCache = {};

// Caché de las FILAS ya leídas de cada pestaña, también solo para esta misma
// ejecución. Sin esto, aunque el Sheet ya estuviera en caché, cada llamada a
// leerFilas('JUGADORES') volvía a pedir todos los datos a Google Sheets — y
// dentro de una sola petición es normal leer la misma pestaña varias veces
// (por ejemplo, validarSesion lee USUARIOS, y la propia acción que se está
// atendiendo puede volver a leer USUARIOS para otra cosa). Se invalida
// automáticamente en cuanto se escribe algo en esa pestaña, para no servir
// datos ya desactualizados dentro de la misma ejecución.
var _filasCache = {};

// Caché COMPARTIDA entre peticiones distintas (CacheService, no memoria del
// proceso): sin esto, cada clic en la app es una ejecución nueva de Apps
// Script que no sabe nada de la anterior, así que SIEMPRE volvía a leer
// SESIONES y USUARIOS enteras solo para validar el token, antes incluso de
// hacer lo que se había pedido. Con esto, si la hoja no ha cambiado en los
// últimos segundos, se sirve desde esta caché en vez de volver a pedirla a
// Sheets. Se invalida (borra) en cuanto se escribe algo en esa pestaña, igual
// que la caché de arriba, así que nunca se sirve más desactualizada de lo que
// tarda la siguiente escritura.
var _CACHE_COMPARTIDA_SEGUNDOS = 60;

function _claveCacheCompartida(nombreHoja) {
  return 'filas_' + nombreHoja;
}

function _leerFilasDeCacheCompartida(nombreHoja) {
  try {
    var texto = CacheService.getScriptCache().get(_claveCacheCompartida(nombreHoja));
    return texto ? JSON.parse(texto) : null;
  } catch (err) {
    return null;
  }
}

function _guardarFilasEnCacheCompartida(nombreHoja, filas) {
  try {
    CacheService.getScriptCache().put(_claveCacheCompartida(nombreHoja), JSON.stringify(filas), _CACHE_COMPARTIDA_SEGUNDOS);
  } catch (err) {
    // Si la pestaña pesa más de lo que admite una clave de CacheService (100 KB),
    // simplemente no se cachea entre peticiones: sigue funcionando igual que
    // antes, solo que sin este segundo nivel de caché para esa pestaña en concreto.
  }
}

function invalidarCacheFilas(nombreHoja) {
  delete _filasCache[nombreHoja];
  try {
    CacheService.getScriptCache().remove(_claveCacheCompartida(nombreHoja));
  } catch (err) {
    // No pasa nada si falla borrar la caché compartida.
  }
}

/**
 * Devuelve el Spreadsheet configurado en las Propiedades del proyecto.
 * El ID nunca se escribe en el código fuente (que se sube a GitHub más adelante
 * solo como referencia, nunca este proyecto de Apps Script en sí).
 */
function getSpreadsheet() {
  if (_spreadsheetCache) return _spreadsheetCache;
  var id = PropertiesService.getScriptProperties().getProperty(PROP_SPREADSHEET_ID);
  if (!id) {
    throw new Error('Falta configurar la propiedad SPREADSHEET_ID en Configuración > Propiedades del proyecto.');
  }
  _spreadsheetCache = SpreadsheetApp.openById(id);
  return _spreadsheetCache;
}

/**
 * Devuelve la hoja (pestaña) con ese nombre exacto, o lanza un error claro si no existe.
 */
function getSheet(nombreHoja) {
  if (_sheetCache[nombreHoja]) return _sheetCache[nombreHoja];
  var hoja = getSpreadsheet().getSheetByName(nombreHoja);
  if (!hoja) {
    throw new Error('No existe la pestaña "' + nombreHoja + '" en la hoja de cálculo.');
  }
  _sheetCache[nombreHoja] = hoja;
  return hoja;
}

/**
 * Lee todas las filas de una pestaña y las devuelve como un array de objetos,
 * usando la fila 1 (cabeceras) como claves. Ignora filas completamente vacías.
 */
function leerFilas(nombreHoja) {
  if (_filasCache[nombreHoja]) return _filasCache[nombreHoja].slice();

  var filas = _leerFilasDeCacheCompartida(nombreHoja);
  if (!filas) {
    filas = _leerFilasDesdeHoja(nombreHoja);
    _guardarFilasEnCacheCompartida(nombreHoja, filas);
  }
  _filasCache[nombreHoja] = filas;
  return filas.slice();
}

function _leerFilasDesdeHoja(nombreHoja) {
  var hoja = getSheet(nombreHoja);
  var datos = hoja.getDataRange().getValues();
  if (datos.length < 2) return [];

  var cabeceras = datos[0];
  var filas = [];
  for (var i = 1; i < datos.length; i++) {
    var fila = datos[i];
    var vacia = fila.every(function (v) { return v === '' || v === null; });
    if (vacia) continue;

    var obj = {};
    for (var c = 0; c < cabeceras.length; c++) {
      obj[cabeceras[c]] = normalizarValorCelda(fila[c]);
    }
    obj._fila = i + 1; // número de fila real en la hoja (1-indexado), útil para actualizar
    filas.push(obj);
  }
  return filas;
}

/**
 * Google Sheets convierte automáticamente los textos con pinta de fecha
 * (como "2026-09-06") en un valor de fecha interno. Al leerlo con getValues()
 * vuelve como objeto Date, no como el texto original. Lo devolvemos siempre
 * como texto en formato "yyyy-MM-dd'T'HH:mm:ss", usando la zona horaria del
 * proyecto, para que nunca se desplace de día y el frontend pueda leerlo
 * igual que cualquier otro texto.
 */
function normalizarValorCelda(valor) {
  if (Object.prototype.toString.call(valor) === '[object Date]') {
    return Utilities.formatDate(valor, Session.getScriptTimeZone(), "yyyy-MM-dd'T'HH:mm:ss");
  }
  return valor;
}

/**
 * Añade una fila nueva a una pestaña a partir de un objeto {clave: valor}.
 * Las claves que no coincidan con ninguna cabecera se ignoran.
 * Las cabeceras sin valor en el objeto se dejan en blanco.
 */
function agregarFila(nombreHoja, objeto) {
  agregarFilas(nombreHoja, [objeto]);
}

/**
 * Igual que agregarFila, pero añade varias filas de golpe en una sola
 * escritura a la hoja, en vez de una llamada a Sheets por fila. Se usa
 * siempre que hay que crear varias filas seguidas (por ejemplo, las 10
 * personas seleccionadas para una jornada, o las 5 parejas de un partido),
 * que si no salía notablemente más lento.
 */
function agregarFilas(nombreHoja, objetos) {
  if (!objetos || objetos.length === 0) return;
  var hoja = getSheet(nombreHoja);
  var cabeceras = hoja.getRange(1, 1, 1, hoja.getLastColumn()).getValues()[0];
  var filas = objetos.map(function (objeto) {
    return cabeceras.map(function (clave) {
      return objeto.hasOwnProperty(clave) ? objeto[clave] : '';
    });
  });
  var primeraFilaLibre = hoja.getLastRow() + 1;
  hoja.getRange(primeraFilaLibre, 1, filas.length, cabeceras.length).setValues(filas);
  invalidarCacheFilas(nombreHoja);
}

/**
 * Busca la primera fila donde la columna "columnaId" vale "valorId" y actualiza
 * los campos indicados en "cambios". Devuelve true si encontró y actualizó algo.
 */
function actualizarFila(nombreHoja, columnaId, valorId, cambios) {
  var mapaCambios = {};
  mapaCambios[valorId] = cambios;
  return actualizarFilasEnLote(nombreHoja, columnaId, mapaCambios) > 0;
}

/**
 * Igual que actualizarFila, pero aplica los cambios de varias filas a la vez
 * (identificadas por columnaId) en una sola escritura a la hoja, en vez de
 * una llamada a Sheets por fila. Se usa cuando hay que actualizar muchas
 * filas seguidas (por ejemplo, la puntuación de todos los jugadores), que
 * si no salía muy lento por ser tantos viajes de ida y vuelta a Sheets.
 *
 * mapaCambios: { valorId: { campo: valorNuevo, ... }, ... }
 * Devuelve cuántas filas se han actualizado.
 */
function actualizarFilasEnLote(nombreHoja, columnaId, mapaCambios) {
  var ids = Object.keys(mapaCambios);
  if (ids.length === 0) return 0;

  var hoja = getSheet(nombreHoja);
  var datos = hoja.getDataRange().getValues();
  var cabeceras = datos[0];
  var colIndice = cabeceras.indexOf(columnaId);
  if (colIndice === -1) {
    throw new Error('La pestaña "' + nombreHoja + '" no tiene columna "' + columnaId + '".');
  }

  var actualizadas = 0;
  for (var i = 1; i < datos.length; i++) {
    var cambios = mapaCambios[datos[i][colIndice]];
    if (!cambios) continue;
    for (var clave in cambios) {
      var colCambio = cabeceras.indexOf(clave);
      if (colCambio !== -1) datos[i][colCambio] = cambios[clave];
    }
    actualizadas++;
  }

  if (actualizadas > 0) {
    hoja.getRange(1, 1, datos.length, cabeceras.length).setValues(datos);
    invalidarCacheFilas(nombreHoja);
  }
  return actualizadas;
}

/**
 * Elimina todas las filas donde la columna "columnaId" vale "valorId".
 */
function eliminarFilas(nombreHoja, columnaId, valorId) {
  eliminarFilasEnValores(nombreHoja, columnaId, [valorId]);
}

/**
 * Igual que eliminarFilas, pero borra las filas que coincidan con
 * CUALQUIERA de varios valores a la vez (columnaId en valoresId), leyendo la
 * hoja una sola vez en vez de una vez por cada valor. Se usa por ejemplo al
 * rehacer las parejas de una jornada, para borrar de golpe los resultados de
 * varios partidos anteriores.
 *
 * Además, si las filas a borrar están seguidas unas de otras (lo normal
 * cuando se borran de golpe, por ejemplo, las filas que se acaban de crear
 * juntas), se borran en un solo tramo en vez de fila a fila — borrar de
 * Sheets desplaza todas las filas de abajo, así que hacerlo fila a fila sale
 * notablemente más lento cuantas más filas hay que borrar.
 */
function eliminarFilasEnValores(nombreHoja, columnaId, valoresId) {
  if (!valoresId || valoresId.length === 0) return;
  var conjunto = {};
  valoresId.forEach(function (v) { conjunto[v] = true; });

  var hoja = getSheet(nombreHoja);
  var datos = hoja.getDataRange().getValues();
  var cabeceras = datos[0];
  var colIndice = cabeceras.indexOf(columnaId);
  if (colIndice === -1) {
    throw new Error('La pestaña "' + nombreHoja + '" no tiene columna "' + columnaId + '".');
  }

  // Números de fila reales (1-indexado) a borrar, de menor a mayor.
  var filasABorrar = [];
  for (var i = 1; i < datos.length; i++) {
    if (conjunto[datos[i][colIndice]]) filasABorrar.push(i + 1);
  }
  if (filasABorrar.length === 0) return;

  // Se agrupan en tramos consecutivos (p. ej. [5,6,7,10] -> [5-7], [10]) y se
  // borran de abajo hacia arriba para que borrar un tramo no desordene los
  // números de fila de los tramos que quedan por borrar.
  var tramos = [];
  var inicio = filasABorrar[0];
  var anterior = filasABorrar[0];
  for (var k = 1; k < filasABorrar.length; k++) {
    var fila = filasABorrar[k];
    if (fila === anterior + 1) {
      anterior = fila;
    } else {
      tramos.push([inicio, anterior]);
      inicio = fila;
      anterior = fila;
    }
  }
  tramos.push([inicio, anterior]);

  for (var t = tramos.length - 1; t >= 0; t--) {
    var desde = tramos[t][0];
    var cantidad = tramos[t][1] - tramos[t][0] + 1;
    hoja.deleteRows(desde, cantidad);
  }

  invalidarCacheFilas(nombreHoja);
}

/**
 * Borra todas las filas de datos de una pestaña, dejando solo la fila de
 * cabeceras. Se usa en tareas de mantenimiento (por ejemplo, limpiar datos
 * de prueba antes de pasar a producción), nunca desde la operativa normal.
 */
function vaciarHoja(nombreHoja) {
  var hoja = getSheet(nombreHoja);
  var ultimaFila = hoja.getLastRow();
  if (ultimaFila > 1) {
    hoja.deleteRows(2, ultimaFila - 1);
  }
  invalidarCacheFilas(nombreHoja);
}

/**
 * Añade una columna nueva al final de una pestaña si todavía no existe
 * (comparando por el nombre de la cabecera). No hace nada si ya está.
 */
function agregarColumnaSiFalta(nombreHoja, nombreColumna) {
  var hoja = getSheet(nombreHoja);
  var ultimaColumna = hoja.getLastColumn();
  var cabeceras = ultimaColumna > 0 ? hoja.getRange(1, 1, 1, ultimaColumna).getValues()[0] : [];
  if (cabeceras.indexOf(nombreColumna) !== -1) return;
  hoja.getRange(1, ultimaColumna + 1).setValue(nombreColumna);
  invalidarCacheFilas(nombreHoja);
}

/** Genera un identificador único (UUID). Gratuito, nativo de Apps Script. */
function generarId() {
  return Utilities.getUuid();
}

var PROP_SECRETO_ENLACES = 'SECRETO_ENLACES';

/**
 * Clave secreta usada para firmar los enlaces de un solo clic (confirmar
 * asistencia desde el email sin tener que iniciar sesión). Se genera sola la
 * primera vez que hace falta y se guarda en las Propiedades del proyecto, así
 * que nunca queda escrita en el código ni hay que configurar nada a mano.
 */
function obtenerSecretoEnlaces() {
  var props = PropertiesService.getScriptProperties();
  var secreto = props.getProperty(PROP_SECRETO_ENLACES);
  if (!secreto) {
    secreto = Utilities.getUuid() + Utilities.getUuid();
    props.setProperty(PROP_SECRETO_ENLACES, secreto);
  }
  return secreto;
}

/** Fecha y hora actual en formato ISO 8601, para guardar en las hojas. */
function ahoraIso() {
  return new Date().toISOString();
}

/** Calcula el hash SHA-256 (en hexadecimal) de un texto. Nunca guardamos códigos en plano. */
function hashTexto(texto) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, texto, Utilities.Charset.UTF_8);
  return bytes.map(function (b) {
    var v = (b < 0 ? b + 256 : b).toString(16);
    return v.length === 1 ? '0' + v : v;
  }).join('');
}

/** Construye una respuesta JSON estándar para el Web App. */
function respuestaJson(objeto) {
  return ContentService
    .createTextOutput(JSON.stringify(objeto))
    .setMimeType(ContentService.MimeType.JSON);
}

function respuestaOk(datos) {
  var base = { ok: true };
  for (var k in datos) base[k] = datos[k];
  return respuestaJson(base);
}

function respuestaError(mensaje) {
  return respuestaJson({ ok: false, error: mensaje });
}
