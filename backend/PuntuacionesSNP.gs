/**
 * Actualización automática de la puntuación de cada jugador desde el
 * ranking oficial de la SNP (seriesnacionalesdepadel.com/ranking/), que es
 * público y no requiere sesión. Se busca a cada jugador por su primer
 * apellido en el Grupo 500 (Masculino) y se identifica su fila exacta
 * comprobando que juega en "CLUB DE PADEL EL MORAL" (por si hay varias
 * personas con el mismo apellido en el ranking).
 */

var SNP_RANKING_URL = 'https://seriesnacionalesdepadel.snpgalaxy.com/ranking/ajaxGetRankingNacional';
var SNP_ID_CATEGORIA = '15';   // Masculino
var SNP_ID_GRUPO = '19';       // Grupo 500
var SNP_ID_TEMPORADA = '3';
var SNP_NOMBRE_CLUB = 'CLUB DE PADEL EL MORAL';

/**
 * PASO ÚNICO A MANO (usar esta si crearDisparadorSemanalPuntuacionesSNP o
 * actualizarPuntuacionesSNP se ejecutan sin pedir permiso, y luego fallan):
 * esta función no atrapa ningún error, así que si falta autorización para
 * conectar a internet, Apps Script SÍ mostrará aquí la pantalla para
 * concederla antes de dejarla fallar. Ejecutar una vez y aceptar el permiso.
 */
function autorizarConexionExterna() {
  var respuesta = UrlFetchApp.fetch('https://www.google.com');
  Logger.log('Conexión externa autorizada correctamente. Código de respuesta: ' + respuesta.getResponseCode());
}

/**
 * Busca los puntos de un jugador en el ranking de la SNP a partir de su
 * primer apellido. Devuelve el número de puntos, o null si no se encuentra
 * a nadie de "CLUB DE PADEL EL MORAL" con ese apellido.
 */
function buscarPuntosSNP(apellidos) {
  var primerApellido = (apellidos || '').trim().split(/\s+/)[0];
  if (!primerApellido) return null;

  var respuesta = UrlFetchApp.fetch(SNP_RANKING_URL, {
    method: 'post',
    payload: {
      idcategoria: SNP_ID_CATEGORIA,
      idgrupo: SNP_ID_GRUPO,
      filtro: primerApellido,
      num_pagina: '1',
      limite_pagina: '50',
      update: '1',
      idtemporadaG: SNP_ID_TEMPORADA
    },
    muteHttpExceptions: true
  });

  if (respuesta.getResponseCode() !== 200) return null;

  var datos = JSON.parse(respuesta.getContentText());
  if (!datos.entities || datos.entities.length === 0) return null;

  var coincidencia = datos.entities.filter(function (e) {
    var equipos = (e.Jugador && e.Jugador.EquipoJugador) || [];
    return equipos.some(function (eq) {
      return eq.Equipo && eq.Equipo.Club && eq.Equipo.Club.nombre === SNP_NOMBRE_CLUB;
    });
  })[0];

  if (!coincidencia) return null;
  return Number(coincidencia.puntos) || 0;
}

/**
 * Recorre todos los jugadores activos, busca su puntuación real en la SNP
 * y actualiza la hoja JUGADORES cuando cambia. Pensada para ejecutarse sola
 * cada semana (ver crearDisparadorSemanalPuntuacionesSNP), pero también se
 * puede lanzar a mano desde el editor o desde la propia app.
 */
function actualizarPuntuacionesSNP() {
  var jugadores = leerFilas('JUGADORES').filter(function (j) { return j.estado === 'ACTIVO'; });
  var actualizados = [];
  var sinEncontrar = [];
  var cambiosPorJugador = {};

  jugadores.forEach(function (j) {
    try {
      var puntos = buscarPuntosSNP(j.apellidos);
      if (puntos === null) {
        sinEncontrar.push(j.nombre_completo);
      } else if (Number(j.puntuacion) !== puntos) {
        cambiosPorJugador[j.id_jugador] = { puntuacion: puntos };
        actualizados.push(j.nombre_completo + ': ' + j.puntuacion + ' -> ' + puntos);
      }
    } catch (err) {
      sinEncontrar.push(j.nombre_completo + ' (error: ' + err.message + ')');
    }
    Utilities.sleep(300); // no saturar la web de la SNP con peticiones seguidas
  });

  // Se escriben todas las puntuaciones cambiadas de una sola vez al final,
  // en vez de una escritura suelta por jugador dentro del bucle de arriba.
  actualizarFilasEnLote('JUGADORES', 'id_jugador', cambiosPorJugador);

  var resumen = actualizados.length + ' actualizados, ' + sinEncontrar.length + ' sin encontrar en el ranking.';
  Logger.log('Actualizados: ' + (actualizados.join(' | ') || 'ninguno'));
  Logger.log('Sin encontrar: ' + (sinEncontrar.join(', ') || 'ninguno'));
  registrarLog('', 'ACTUALIZAR_PUNTUACIONES_SNP', resumen);

  return { ok: true, actualizados: actualizados, sin_encontrar: sinEncontrar };
}

/**
 * PASO ÚNICO A MANO: ejecutar esta función UNA VEZ desde el editor de Apps
 * Script (seleccionarla arriba y pulsar "Ejecutar"). La primera vez pedirá
 * autorización para conectar a internet (UrlFetchApp) y crear disparadores
 * (ScriptApp) — hay que aceptarla, es necesaria para que esto funcione. A
 * partir de ahí, la actualización de puntuaciones se ejecuta sola todos los
 * lunes a las 8:00, sin que nadie tenga que hacer nada.
 */
function crearDisparadorSemanalPuntuacionesSNP() {
  var yaExiste = ScriptApp.getProjectTriggers().some(function (t) {
    return t.getHandlerFunction() === 'actualizarPuntuacionesSNP';
  });
  if (yaExiste) {
    Logger.log('Ya existe un disparador para actualizarPuntuacionesSNP. No se crea otro.');
    return;
  }

  ScriptApp.newTrigger('actualizarPuntuacionesSNP')
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.MONDAY)
    .atHour(8)
    .create();

  Logger.log('Disparador semanal creado: todos los lunes a las 8:00 se actualizarán las puntuaciones.');
}
