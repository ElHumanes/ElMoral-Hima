/**
 * Utilidades comunes: acceso a la hoja de cálculo, lectura/escritura genérica,
 * generación de IDs y respuestas JSON.
 */

var PROP_SPREADSHEET_ID = 'SPREADSHEET_ID';

/**
 * Devuelve el Spreadsheet configurado en las Propiedades del proyecto.
 * El ID nunca se escribe en el código fuente (que se sube a GitHub más adelante
 * solo como referencia, nunca este proyecto de Apps Script en sí).
 */
function getSpreadsheet() {
  var id = PropertiesService.getScriptProperties().getProperty(PROP_SPREADSHEET_ID);
  if (!id) {
    throw new Error('Falta configurar la propiedad SPREADSHEET_ID en Configuración > Propiedades del proyecto.');
  }
  return SpreadsheetApp.openById(id);
}

/**
 * Devuelve la hoja (pestaña) con ese nombre exacto, o lanza un error claro si no existe.
 */
function getSheet(nombreHoja) {
  var hoja = getSpreadsheet().getSheetByName(nombreHoja);
  if (!hoja) {
    throw new Error('No existe la pestaña "' + nombreHoja + '" en la hoja de cálculo.');
  }
  return hoja;
}

/**
 * Lee todas las filas de una pestaña y las devuelve como un array de objetos,
 * usando la fila 1 (cabeceras) como claves. Ignora filas completamente vacías.
 */
function leerFilas(nombreHoja) {
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
  var hoja = getSheet(nombreHoja);
  var cabeceras = hoja.getRange(1, 1, 1, hoja.getLastColumn()).getValues()[0];
  var fila = cabeceras.map(function (clave) {
    return objeto.hasOwnProperty(clave) ? objeto[clave] : '';
  });
  hoja.appendRow(fila);
}

/**
 * Busca la primera fila donde la columna "columnaId" vale "valorId" y actualiza
 * los campos indicados en "cambios". Devuelve true si encontró y actualizó algo.
 */
function actualizarFila(nombreHoja, columnaId, valorId, cambios) {
  var hoja = getSheet(nombreHoja);
  var datos = hoja.getDataRange().getValues();
  var cabeceras = datos[0];
  var colIndice = cabeceras.indexOf(columnaId);
  if (colIndice === -1) {
    throw new Error('La pestaña "' + nombreHoja + '" no tiene columna "' + columnaId + '".');
  }

  for (var i = 1; i < datos.length; i++) {
    if (datos[i][colIndice] === valorId) {
      for (var clave in cambios) {
        var colCambio = cabeceras.indexOf(clave);
        if (colCambio !== -1) {
          hoja.getRange(i + 1, colCambio + 1).setValue(cambios[clave]);
        }
      }
      return true;
    }
  }
  return false;
}

/**
 * Elimina todas las filas donde la columna "columnaId" vale "valorId".
 * Recorre de abajo hacia arriba para que borrar una fila no desordene los
 * índices de las siguientes.
 */
function eliminarFilas(nombreHoja, columnaId, valorId) {
  var hoja = getSheet(nombreHoja);
  var datos = hoja.getDataRange().getValues();
  var cabeceras = datos[0];
  var colIndice = cabeceras.indexOf(columnaId);
  if (colIndice === -1) {
    throw new Error('La pestaña "' + nombreHoja + '" no tiene columna "' + columnaId + '".');
  }

  for (var i = datos.length - 1; i >= 1; i--) {
    if (datos[i][colIndice] === valorId) {
      hoja.deleteRow(i + 1);
    }
  }
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
}

/** Genera un identificador único (UUID). Gratuito, nativo de Apps Script. */
function generarId() {
  return Utilities.getUuid();
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
