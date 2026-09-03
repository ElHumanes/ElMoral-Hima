/**
 * Selección de los 10 jugadores de una jornada, a partir de los que
 * respondieron ME_APUNTO en la convocatoria.
 */

function listarSeleccionados(idJornada) {
  if (!idJornada) throw new Error('Falta el identificador de la jornada.');

  var seleccionados = leerFilas('SELECCIONADOS').filter(function (s) { return s.id_jornada === idJornada; });
  var jugadores = leerFilas('JUGADORES');
  var jugadorPorId = {};
  jugadores.forEach(function (j) { jugadorPorId[j.id_jugador] = j; });

  return seleccionados.map(function (s) {
    var j = jugadorPorId[s.id_jugador] || {};
    return {
      id_jugador: s.id_jugador,
      nombre_completo: j.nombre_completo || '',
      apodo: j.apodo || '',
      foto_url: j.foto_url || '',
      posicion_principal: j.posicion_principal || '',
      posicion_secundaria: j.posicion_secundaria || '',
      puntuacion: j.puntuacion || 0
    };
  }).sort(function (a, b) {
    return (a.apodo || a.nombre_completo).localeCompare(b.apodo || b.nombre_completo, 'es');
  });
}

/**
 * Guarda la selección de exactamente 10 jugadores para una jornada. Solo se
 * puede seleccionar entre quienes respondieron ME_APUNTO a la convocatoria.
 * Al guardar, la jornada pasa a estado CONFIRMADA.
 */
function guardarSeleccion(sesion, idJornada, idsJugadores) {
  requerirCapitan(sesion);

  if (!idJornada) throw new Error('Falta el identificador de la jornada.');
  if (!Array.isArray(idsJugadores)) throw new Error('La selección debe ser una lista de jugadores.');

  var unicos = idsJugadores.filter(function (id, i) { return idsJugadores.indexOf(id) === i; });
  if (unicos.length !== idsJugadores.length) {
    throw new Error('Hay jugadores repetidos en la selección.');
  }
  if (idsJugadores.length !== 10) {
    throw new Error('Debes seleccionar exactamente 10 jugadores (has seleccionado ' + idsJugadores.length + ').');
  }

  var jornada = leerFilas('JORNADAS').filter(function (j) { return j.id_jornada === idJornada; })[0];
  if (!jornada) throw new Error('No se ha encontrado esa jornada.');

  var apuntados = listarConvocatoria(idJornada).filter(function (c) { return c.disponibilidad === 'ME_APUNTO'; });
  var idsApuntados = apuntados.map(function (c) { return c.id_jugador; });
  var noApuntado = idsJugadores.filter(function (id) { return idsApuntados.indexOf(id) === -1; });
  if (noApuntado.length > 0) {
    throw new Error('Solo puedes seleccionar jugadores que hayan respondido "Me apunto" a la convocatoria.');
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    eliminarFilas('SELECCIONADOS', 'id_jornada', idJornada);

    var filasSeleccionados = idsJugadores.map(function (idJugador) {
      return {
        id_seleccion: generarId(),
        id_jornada: idJornada,
        id_jugador: idJugador,
        fecha_seleccion: ahoraIso()
      };
    });
    agregarFilas('SELECCIONADOS', filasSeleccionados);

    actualizarFila('JORNADAS', 'id_jornada', idJornada, { estado: 'CONFIRMADA' });
    registrarLog(sesion.id_usuario, 'SELECCIONAR_JUGADORES', idJornada + ' -> 10 jugadores');
  } finally {
    lock.releaseLock();
  }

  return { ok: true };
}
