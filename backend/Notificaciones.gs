/**
 * Avisos por email a los jugadores: uno en cuanto se abre una convocatoria,
 * y un recordatorio a quien todavía no haya respondido pasados unos días.
 * Usa MailApp (gratis, dentro de la cuota diaria normal de una cuenta de
 * Google), así que la primera vez que se use pedirá autorización para
 * enviar correos — ver autorizarYCrearDisparadorRecordatorios() más abajo.
 */

/**
 * Mantenimiento: añade a la hoja de cálculo las columnas nuevas que
 * necesita este sistema de avisos (email del jugador, y cuándo se abrió
 * cada convocatoria / si ya se mandó su recordatorio). No hace nada si ya
 * existen, así que se puede ejecutar más de una vez sin peligro.
 */
function configurarColumnasNotificaciones() {
  agregarColumnaSiFalta('JUGADORES', 'email');
  agregarColumnaSiFalta('JORNADAS', 'fecha_apertura_convocatoria');
  agregarColumnaSiFalta('JORNADAS', 'recordatorio_enviado');
  Logger.log('Columnas de notificaciones comprobadas/añadidas.');
}

var NOTIF_APP_URL = 'https://elhumanes.github.io/elmoral-hima/';
// URL del despliegue de producción, para los enlaces de "confirmar asistencia
// con un clic" dentro del email (deben apuntar siempre aquí, nunca al @HEAD
// de desarrollo).
var NOTIF_API_URL = 'https://script.google.com/macros/s/AKfycbyNesOIcXqUElt02t1eCSDdTJSJwcQN6Rr_lnUgpz2rjibh1qHHrLRPwQdciWANpXhj/exec';
var NOTIF_DIAS_PARA_RECORDATORIO = 2;
var NOTIF_EMAIL_PRUEBA = 'info@hima.es';

// Los avisos salen desde este alias verificado (Gmail > Configuración >
// Cuentas e importación > Enviar correo como), no desde la cuenta del
// proyecto, para que se vean más "de club" y no de una cuenta personal.
var NOTIF_EMAIL_REMITENTE = 'humanes80@gmail.com';
var NOTIF_NOMBRE_REMITENTE = 'El Moral - Hima';

function jugadoresActivosConEmail() {
  return leerFilas('JUGADORES').filter(function (j) {
    return j.estado === 'ACTIVO' && j.email && String(j.email).indexOf('@') !== -1;
  });
}

function notifTextoJornada(jornada) {
  return (jornada.local_visitante === 'LOCAL' ? 'vs ' : '@ ') + jornada.rival + ' · ' + notifFormatearFecha(jornada.fecha) +
    (jornada.lugar ? ' · ' + jornada.lugar : '');
}

function notifFormatearFecha(fechaIso) {
  if (!fechaIso) return '';
  var soloFecha = String(fechaIso).split('T')[0];
  var partes = soloFecha.split('-');
  if (partes.length !== 3) return fechaIso;
  return partes[2] + '/' + partes[1] + '/' + partes[0];
}

/** Enlaces de "sí voy" / "no puedo" de un clic para incluir en el email de un jugador concreto. */
function notifEnlacesRespuesta(idJugador, idJornada) {
  var token = tokenRespuestaEnlace(idJugador, idJornada);
  var base = NOTIF_API_URL + '?action=confirmarAsistencia' +
    '&jug=' + encodeURIComponent(idJugador) +
    '&jor=' + encodeURIComponent(idJornada) +
    '&tok=' + encodeURIComponent(token) +
    '&resp=';
  return { si: base + 'SI', no: base + 'NO' };
}

/**
 * Avisa a todos los jugadores activos con email de que se ha abierto una
 * convocatoria nueva. La llama automáticamente cambiarEstadoJornada al
 * abrir la convocatoria (Jornadas.gs); un fallo aquí no debe impedir que la
 * convocatoria se abra, por eso ese sitio la protege con try/catch.
 */
function enviarAvisoConvocatoriaAbierta(jornada) {
  var jugadores = jugadoresActivosConEmail();
  if (jugadores.length === 0) return;

  var asunto = '🎾 Nueva convocatoria: ' + notifTextoJornada(jornada);
  jugadores.forEach(function (j) {
    var enlaces = notifEnlacesRespuesta(j.id_jugador, jornada.id_jornada);
    var cuerpo = 'Hola ' + (j.apodo || j.nombre) + ',\n\n' +
      'Se ha abierto una nueva convocatoria:\n' + notifTextoJornada(jornada) + '\n\n' +
      'Responde con un solo clic:\n' +
      '✅ Sí, voy: ' + enlaces.si + '\n' +
      '❌ No puedo: ' + enlaces.no + '\n\n' +
      'O entra en la app:\n' + NOTIF_APP_URL + '\n\n' +
      '— El Moral - Hima';
    try {
      GmailApp.sendEmail(j.email, asunto, cuerpo, { from: NOTIF_EMAIL_REMITENTE, name: NOTIF_NOMBRE_REMITENTE });
    } catch (err) {
      Logger.log('No se ha podido avisar por email a ' + j.nombre_completo + ': ' + err.message);
    }
  });
}

/**
 * Pensada para ejecutarse sola cada día (ver
 * autorizarYCrearDisparadorRecordatorios): para cada convocatoria abierta
 * desde hace NOTIF_DIAS_PARA_RECORDATORIO días o más, y que todavía no haya
 * mandado recordatorio, avisa por email solo a quien no haya respondido.
 */
function enviarRecordatoriosConvocatoria() {
  var ahora = new Date();
  var jornadasAbiertas = leerFilas('JORNADAS').filter(function (j) {
    return j.estado === 'CONVOCATORIA_ABIERTA' && j.fecha_apertura_convocatoria && j.recordatorio_enviado !== 'SI';
  });

  jornadasAbiertas.forEach(function (jornada) {
    var apertura = new Date(jornada.fecha_apertura_convocatoria);
    var diasPasados = (ahora.getTime() - apertura.getTime()) / (24 * 60 * 60 * 1000);
    if (diasPasados < NOTIF_DIAS_PARA_RECORDATORIO) return;

    var yaRespondieron = {};
    leerFilas('CONVOCATORIAS')
      .filter(function (c) { return c.id_jornada === jornada.id_jornada; })
      .forEach(function (c) { yaRespondieron[c.id_jugador] = true; });

    var pendientes = jugadoresActivosConEmail().filter(function (j) { return !yaRespondieron[j.id_jugador]; });
    var asunto = '⏰ Recordatorio: responde a la convocatoria de ' + notifTextoJornada(jornada);

    pendientes.forEach(function (j) {
      var enlaces = notifEnlacesRespuesta(j.id_jugador, jornada.id_jornada);
      var cuerpo = 'Hola ' + (j.apodo || j.nombre) + ',\n\n' +
        'Todavía no has respondido a esta convocatoria:\n' + notifTextoJornada(jornada) + '\n\n' +
        'Responde con un solo clic:\n' +
        '✅ Sí, voy: ' + enlaces.si + '\n' +
        '❌ No puedo: ' + enlaces.no + '\n\n' +
        'O entra en la app:\n' + NOTIF_APP_URL + '\n\n' +
        '— El Moral - Hima';
      try {
        GmailApp.sendEmail(j.email, asunto, cuerpo, { from: NOTIF_EMAIL_REMITENTE, name: NOTIF_NOMBRE_REMITENTE });
      } catch (err) {
        Logger.log('No se ha podido enviar recordatorio a ' + j.nombre_completo + ': ' + err.message);
      }
    });

    actualizarFila('JORNADAS', 'id_jornada', jornada.id_jornada, { recordatorio_enviado: 'SI' });
  });
}

/**
 * PASO ÚNICO A MANO: ejecutar esta función una vez desde el editor de Apps
 * Script. Manda un email de prueba sin atrapar ningún error a propósito,
 * para que si falta autorización para enviar correos, Apps Script muestre
 * aquí la pantalla para concederla. Después crea el disparador diario que
 * comprueba y manda los recordatorios (todos los días a las 10:00).
 */
function autorizarYCrearDisparadorRecordatorios() {
  MailApp.sendEmail(
    NOTIF_EMAIL_PRUEBA,
    'Prueba: avisos de convocatoria activados',
    'Este correo confirma que la app ya puede enviar avisos y recordatorios de convocatoria. Todo listo.'
  );

  var yaExiste = ScriptApp.getProjectTriggers().some(function (t) {
    return t.getHandlerFunction() === 'enviarRecordatoriosConvocatoria';
  });
  if (!yaExiste) {
    ScriptApp.newTrigger('enviarRecordatoriosConvocatoria')
      .timeBased()
      .everyDays(1)
      .atHour(10)
      .create();
  }

  Logger.log('Autorización concedida. Disparador diario de recordatorios creado (todos los días a las 10:00).');
}

/**
 * PASO ÚNICO A MANO (solo si ya tenías autorizado MailApp y has cambiado a
 * enviar como humanes80@gmail.com): usar GmailApp con un remitente distinto
 * pide un permiso nuevo, más amplio que el de MailApp. Ejecutar esta función
 * una vez desde el editor; sin try/catch a propósito, para que si falta
 * autorización, Apps Script muestre aquí la pantalla para concederla.
 * Manda un correo de prueba de verdad desde humanes80@gmail.com.
 */
function autorizarEnvioComoHumanes80() {
  GmailApp.sendEmail(
    NOTIF_EMAIL_PRUEBA,
    'Prueba: avisos ahora desde ' + NOTIF_EMAIL_REMITENTE,
    'Este correo confirma que la app ya puede enviar los avisos de convocatoria como "' + NOTIF_NOMBRE_REMITENTE + '" desde ' + NOTIF_EMAIL_REMITENTE + '. Todo listo.',
    { from: NOTIF_EMAIL_REMITENTE, name: NOTIF_NOMBRE_REMITENTE }
  );
  Logger.log('Autorización concedida. Los avisos ya se envían desde ' + NOTIF_EMAIL_REMITENTE + '.');
}
