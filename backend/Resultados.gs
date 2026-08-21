/**
 * Partidos y resultados. Cada partido queda creado automáticamente al
 * guardar las parejas de una jornada (Parejas.gs). Aquí solo se registra
 * el marcador de cada uno.
 *
 * Cuando se registra el primer resultado de una jornada, esta pasa a
 * JUGADA. Cuando los 5 partidos ya tienen resultado, pasa a FINALIZADA.
 */

function listarPartidos(idJornada) {
  if (!idJornada) throw new Error('Falta el identificador de la jornada.');

  var partidos = leerFilas('PARTIDOS').filter(function (p) { return p.id_jornada === idJornada; });
  var parejas = leerFilas('PAREJAS');
  var parejaPorId = {};
  parejas.forEach(function (p) { parejaPorId[p.id_pareja] = p; });

  var jugadores = leerFilas('JUGADORES');
  var jugadorPorId = {};
  jugadores.forEach(function (j) { jugadorPorId[j.id_jugador] = j; });

  var resultados = leerFilas('RESULTADOS');
  var resultadoPorPartido = {};
  resultados.forEach(function (r) { resultadoPorPartido[r.id_partido] = r; });

  return partidos.map(function (partido) {
    var pareja = parejaPorId[partido.id_pareja] || {};
    var a = jugadorPorId[pareja.id_jugador_a] || {};
    var b = jugadorPorId[pareja.id_jugador_b] || {};
    var resultado = resultadoPorPartido[partido.id_partido];

    return {
      id_partido: partido.id_partido,
      numero_partido: Number(partido.numero_partido),
      jugador_a: { id_jugador: pareja.id_jugador_a, nombre_completo: a.nombre_completo || '', apodo: a.apodo || '', foto_url: a.foto_url || '' },
      jugador_b: { id_jugador: pareja.id_jugador_b, nombre_completo: b.nombre_completo || '', apodo: b.apodo || '', foto_url: b.foto_url || '' },
      resultado: resultado ? {
        sets_favor: Number(resultado.sets_favor),
        sets_contra: Number(resultado.sets_contra),
        juegos_favor: Number(resultado.juegos_favor),
        juegos_contra: Number(resultado.juegos_contra),
        resultado: resultado.resultado
      } : null
    };
  }).sort(function (x, y) { return x.numero_partido - y.numero_partido; });
}

function registrarResultado(sesion, datos) {
  requerirCapitan(sesion);

  var idPartido = datos.id_partido;
  var setsFavor = Number(datos.sets_favor);
  var setsContra = Number(datos.sets_contra);
  var juegosFavor = Number(datos.juegos_favor);
  var juegosContra = Number(datos.juegos_contra);

  if (!idPartido) throw new Error('Falta el identificador del partido.');
  [setsFavor, setsContra, juegosFavor, juegosContra].forEach(function (v) {
    if (isNaN(v) || v < 0) throw new Error('Los sets y juegos deben ser números iguales o mayores que 0.');
  });
  if (setsFavor === setsContra) {
    throw new Error('No puede haber empate en sets: alguien tiene que ganar el partido.');
  }

  var partido = leerFilas('PARTIDOS').filter(function (p) { return p.id_partido === idPartido; })[0];
  if (!partido) throw new Error('No se ha encontrado ese partido.');

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var existente = leerFilas('RESULTADOS').filter(function (r) { return r.id_partido === idPartido; })[0];
    var cambios = {
      sets_favor: setsFavor,
      sets_contra: setsContra,
      juegos_favor: juegosFavor,
      juegos_contra: juegosContra,
      resultado: setsFavor > setsContra ? 'GANADO' : 'PERDIDO',
      fecha_registro: ahoraIso()
    };

    if (existente) {
      actualizarFila('RESULTADOS', 'id_resultado', existente.id_resultado, cambios);
    } else {
      agregarFila('RESULTADOS', Object.assign({ id_resultado: generarId(), id_partido: idPartido }, cambios));
    }

    actualizarEstadoJornadaSegunResultados(partido.id_jornada);
    registrarLog(sesion.id_usuario, 'REGISTRAR_RESULTADO', idPartido + ' -> ' + cambios.resultado);
  } finally {
    lock.releaseLock();
  }

  return { ok: true };
}

function actualizarEstadoJornadaSegunResultados(idJornada) {
  var jornada = leerFilas('JORNADAS').filter(function (j) { return j.id_jornada === idJornada; })[0];
  if (!jornada) return;

  var partidos = leerFilas('PARTIDOS').filter(function (p) { return p.id_jornada === idJornada; });
  var resultados = leerFilas('RESULTADOS');
  var idsConResultado = {};
  resultados.forEach(function (r) { idsConResultado[r.id_partido] = true; });

  var partidosConResultado = partidos.filter(function (p) { return idsConResultado[p.id_partido]; }).length;

  if (partidosConResultado === 0) return;

  var nuevoEstado = partidosConResultado >= 5 ? 'FINALIZADA' : 'JUGADA';
  if (jornada.estado !== nuevoEstado) {
    actualizarFila('JORNADAS', 'id_jornada', idJornada, { estado: nuevoEstado });
  }
}
