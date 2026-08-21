/**
 * Fotos de perfil de los jugadores. Se guardan como archivos en una carpeta
 * de Google Drive (gratis, el mismo Drive de la cuenta que ya usa la app) —
 * en la hoja JUGADORES solo se guarda la URL pública de la foto, nunca el
 * archivo en sí, para no llenar las filas de datos pesados.
 */

var NOMBRE_CARPETA_FOTOS = 'Padel App - Fotos de jugadores';
var TIPOS_FOTO_VALIDOS = ['image/jpeg', 'image/png', 'image/webp'];
var TAMANO_MAXIMO_FOTO_BYTES = 2 * 1024 * 1024; // 2 MB — el navegador ya la comprime antes de enviarla

/** Carpeta donde se guardan todas las fotos. La crea la primera vez que hace falta. */
function obtenerCarpetaFotos() {
  var carpetas = DriveApp.getFoldersByName(NOMBRE_CARPETA_FOTOS);
  if (carpetas.hasNext()) return carpetas.next();
  return DriveApp.createFolder(NOMBRE_CARPETA_FOTOS);
}

/** Extrae el ID de archivo de Drive de una URL de foto ya guardada (o null si no lo es). */
function idArchivoDesdeUrlFoto(url) {
  if (!url) return null;
  var match = String(url).match(/[?&]id=([^&]+)/);
  return match ? match[1] : null;
}

/**
 * El propio jugador sube (o cambia) su foto de perfil. Recibe la imagen ya
 * redimensionada y en base64 desde el navegador. Sustituye cualquier foto
 * anterior (la antigua se borra de Drive para no acumular archivos sueltos).
 */
function subirFotoJugador(sesion, fotoBase64, tipoMime) {
  if (!sesion.id_jugador) {
    throw new Error('Tu usuario no tiene una ficha de jugador asociada. Habla con el capitán.');
  }
  if (!fotoBase64) throw new Error('Falta la foto.');
  if (TIPOS_FOTO_VALIDOS.indexOf(tipoMime) === -1) {
    throw new Error('La foto debe ser JPG, PNG o WEBP.');
  }

  var bytes;
  try {
    bytes = Utilities.base64Decode(fotoBase64);
  } catch (err) {
    throw new Error('No se ha podido leer la foto.');
  }
  if (bytes.length > TAMANO_MAXIMO_FOTO_BYTES) {
    throw new Error('La foto es demasiado grande (máximo 2 MB).');
  }

  var jugador = leerFilas('JUGADORES').filter(function (j) { return j.id_jugador === sesion.id_jugador; })[0];
  if (!jugador) throw new Error('No se ha encontrado tu ficha de jugador.');

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  var url;
  try {
    var extension = tipoMime === 'image/png' ? 'png' : (tipoMime === 'image/webp' ? 'webp' : 'jpg');
    var blob = Utilities.newBlob(bytes, tipoMime, 'jugador_' + sesion.id_jugador + '.' + extension);

    var carpeta = obtenerCarpetaFotos();
    var archivo = carpeta.createFile(blob);
    archivo.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    url = 'https://drive.google.com/thumbnail?sz=w300&id=' + archivo.getId();

    var idAnterior = idArchivoDesdeUrlFoto(jugador.foto_url);
    if (idAnterior) {
      try {
        DriveApp.getFileById(idAnterior).setTrashed(true);
      } catch (err) {
        // La foto anterior ya no existe o no se puede borrar: no pasa nada, seguimos.
      }
    }

    actualizarFila('JUGADORES', 'id_jugador', sesion.id_jugador, { foto_url: url });
    registrarLog(sesion.id_usuario, 'SUBIR_FOTO_JUGADOR', sesion.id_jugador);
  } finally {
    lock.releaseLock();
  }

  return { ok: true, foto_url: url };
}
