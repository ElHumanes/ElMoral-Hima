/**
 * Copia de seguridad diaria de la hoja de cálculo (nuestra base de datos)
 * en una carpeta aparte de Google Drive, por si algún día se borra o se
 * estropea algo por error. Usa DriveApp (gratis, dentro de la cuota normal
 * de una cuenta de Google), así que la primera vez que se use pedirá
 * autorización — ver autorizarYCrearDisparadorCopiaSeguridad() más abajo.
 */

var BACKUP_NOMBRE_CARPETA = 'Copias de seguridad - Padel App';
var BACKUP_DIAS_A_CONSERVAR = 30;

function obtenerOCrearCarpetaBackup() {
  var carpetas = DriveApp.getFoldersByName(BACKUP_NOMBRE_CARPETA);
  if (carpetas.hasNext()) return carpetas.next();
  return DriveApp.createFolder(BACKUP_NOMBRE_CARPETA);
}

/**
 * Pensada para ejecutarse sola cada día (ver
 * autorizarYCrearDisparadorCopiaSeguridad): hace una copia completa de la
 * hoja de cálculo con la fecha en el nombre, y borra las copias de hace más
 * de BACKUP_DIAS_A_CONSERVAR días para no acumular copias sin límite.
 */
function crearCopiaSeguridad() {
  var ss = getSpreadsheet();
  var carpeta = obtenerOCrearCarpetaBackup();
  var fecha = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd_HH-mm');
  var nombreCopia = 'Copia ' + fecha + ' - ' + ss.getName();

  DriveApp.getFileById(ss.getId()).makeCopy(nombreCopia, carpeta);
  borrarCopiasAntiguas(carpeta);

  Logger.log('Copia de seguridad creada: ' + nombreCopia);
}

function borrarCopiasAntiguas(carpeta) {
  var limite = new Date();
  limite.setDate(limite.getDate() - BACKUP_DIAS_A_CONSERVAR);

  var archivos = carpeta.getFiles();
  while (archivos.hasNext()) {
    var archivo = archivos.next();
    if (archivo.getDateCreated() < limite) {
      archivo.setTrashed(true);
    }
  }
}

/**
 * PASO ÚNICO A MANO: ejecutar esta función una vez desde el editor de Apps
 * Script. Hace una primera copia de seguridad de prueba sin atrapar ningún
 * error a propósito, para que si falta autorización para usar Google Drive,
 * Apps Script muestre aquí la pantalla para concederla. Después crea el
 * disparador diario que hace la copia sola (todos los días sobre las 4:00,
 * de madrugada para no interferir con el uso normal de la app).
 */
function autorizarYCrearDisparadorCopiaSeguridad() {
  crearCopiaSeguridad();

  var yaExiste = ScriptApp.getProjectTriggers().some(function (t) {
    return t.getHandlerFunction() === 'crearCopiaSeguridad';
  });
  if (!yaExiste) {
    ScriptApp.newTrigger('crearCopiaSeguridad')
      .timeBased()
      .everyDays(1)
      .atHour(4)
      .create();
  }

  Logger.log('Autorización concedida. Copia de seguridad de prueba creada y disparador diario configurado (todos los días sobre las 4:00).');
}
