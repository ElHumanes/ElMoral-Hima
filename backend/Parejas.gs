/**
 * Generador de parejas: a partir de los 10 jugadores seleccionados de una
 * jornada, el capitán forma 5 parejas. Se calcula automáticamente la
 * compatibilidad de posiciones (DERECHA/REVÉS/AMBAS) y se ordenan los
 * partidos del 1 al 5 por puntuación combinada (de mayor a menor).
 */

function listarParejas(idJornada) {
  if (!idJornada) throw new Error('Falta el identificador de la jornada.');

  var parejas = leerFilas('PAREJAS').filter(function (p) { return p.id_jornada === idJornada; });
  var jugadores = leerFilas('JUGADORES');
  var jugadorPorId = {};
  jugadores.forEach(function (j) { jugadorPorId[j.id_jugador] = j; });

  return parejas.map(function (p) {
    var a = jugadorPorId[p.id_jugador_a] || {};
    var b = jugadorPorId[p.id_jugador_b] || {};
    return {
      id_pareja: p.id_pareja,
      numero_partido: Number(p.numero_partido),
      puntuacion_total: Number(p.puntuacion_total),
      compatibilidad: p.compatibilidad,
      jugador_a: { id_jugador: p.id_jugador_a, nombre_completo: a.nombre_completo || '', apodo: a.apodo || '', foto_url: a.foto_url || '' },
      jugador_b: { id_jugador: p.id_jugador_b, nombre_completo: b.nombre_completo || '', apodo: b.apodo || '', foto_url: b.foto_url || '' }
    };
  }).sort(function (x, y) { return x.numero_partido - y.numero_partido; });
}

/**
 * Compara las posiciones de dos jugadores y devuelve BUENA (✓), REGULAR (⚠)
 * o MALA (❌). BUENA = uno puede jugar de derecha y el otro de revés.
 * REGULAR = ambos pueden cubrir alguna posición pero no la combinación ideal.
 */
function calcularCompatibilidad(jugadorA, jugadorB) {
  var posA = posicionesJugables(jugadorA.posicion_principal, jugadorA.posicion_secundaria);
  var posB = posicionesJugables(jugadorB.posicion_principal, jugadorB.posicion_secundaria);

  var hayCombinacionIdeal =
    (posA.indexOf('DERECHA') !== -1 && posB.indexOf('REVÉS') !== -1) ||
    (posA.indexOf('REVÉS') !== -1 && posB.indexOf('DERECHA') !== -1);

  if (hayCombinacionIdeal) return 'BUENA';
  if (posA.length > 0 && posB.length > 0) return 'REGULAR';
  return 'MALA';
}

function posicionesJugables(principal, secundaria) {
  var set = {};
  function agregar(p) {
    if (p === 'AMBAS') { set['DERECHA'] = true; set['REVÉS'] = true; }
    else if (p) { set[p] = true; }
  }
  agregar(principal);
  agregar(secundaria);
  return Object.keys(set);
}

/**
 * Guarda las 5 parejas de una jornada. Recibe un array de 5 objetos
 * {id_jugador_a, id_jugador_b} — el orden de los partidos (1-5) lo decide
 * siempre el propio backend, según la puntuación combinada de cada pareja
 * (de mayor a menor), tal y como pide la Fase 13 del proyecto.
 */
function guardarParejas(sesion, idJornada, parejas) {
  requerirCapitan(sesion);

  if (!idJornada) throw new Error('Falta el identificador de la jornada.');
  if (!Array.isArray(parejas) || parejas.length !== 5) {
    throw new Error('Debes formar exactamente 5 parejas (tienes ' + (parejas ? parejas.length : 0) + ').');
  }

  var seleccionados = listarSeleccionados(idJornada);
  if (seleccionados.length !== 10) {
    throw new Error('Primero debes seleccionar los 10 jugadores de esta jornada.');
  }
  var idsSeleccionados = seleccionados.map(function (s) { return s.id_jugador; });
  var jugadorPorId = {};
  leerFilas('JUGADORES').forEach(function (j) { jugadorPorId[j.id_jugador] = j; });

  var idsUsados = [];
  parejas.forEach(function (p) {
    if (!p.id_jugador_a || !p.id_jugador_b) {
      throw new Error('Cada pareja necesita dos jugadores.');
    }
    if (p.id_jugador_a === p.id_jugador_b) {
      throw new Error('Un jugador no puede formar pareja consigo mismo.');
    }
    idsUsados.push(p.id_jugador_a, p.id_jugador_b);
  });

  var idsUnicos = idsUsados.filter(function (id, i) { return idsUsados.indexOf(id) === i; });
  if (idsUnicos.length !== 10) {
    throw new Error('Hay jugadores repetidos en las parejas, o falta alguno.');
  }
  var fueraDeSeleccion = idsUsados.filter(function (id) { return idsSeleccionados.indexOf(id) === -1; });
  if (fueraDeSeleccion.length > 0) {
    throw new Error('Solo puedes emparejar a jugadores de los 10 seleccionados.');
  }

  var parejasCalculadas = parejas.map(function (p) {
    var a = jugadorPorId[p.id_jugador_a];
    var b = jugadorPorId[p.id_jugador_b];
    return {
      id_jugador_a: p.id_jugador_a,
      id_jugador_b: p.id_jugador_b,
      puntuacion_total: Number(a.puntuacion) + Number(b.puntuacion),
      compatibilidad: calcularCompatibilidad(a, b)
    };
  });

  parejasCalculadas.sort(function (x, y) { return y.puntuacion_total - x.puntuacion_total; });

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    // Al rehacer las parejas de una jornada, se limpian también sus partidos
    // y resultados anteriores, para no dejar datos huérfanos de una versión previa.
    var partidosAnteriores = leerFilas('PARTIDOS').filter(function (p) { return p.id_jornada === idJornada; });
    partidosAnteriores.forEach(function (p) { eliminarFilas('RESULTADOS', 'id_partido', p.id_partido); });
    eliminarFilas('PARTIDOS', 'id_jornada', idJornada);
    eliminarFilas('PAREJAS', 'id_jornada', idJornada);

    parejasCalculadas.forEach(function (p, indice) {
      var idPareja = generarId();
      var numeroPartido = indice + 1;

      agregarFila('PAREJAS', {
        id_pareja: idPareja,
        id_jornada: idJornada,
        id_jugador_a: p.id_jugador_a,
        id_jugador_b: p.id_jugador_b,
        numero_partido: numeroPartido,
        puntuacion_total: p.puntuacion_total,
        compatibilidad: p.compatibilidad,
        indice_pareja: ''
      });

      agregarFila('PARTIDOS', {
        id_partido: generarId(),
        id_jornada: idJornada,
        id_pareja: idPareja,
        numero_partido: numeroPartido
      });
    });

    registrarLog(sesion.id_usuario, 'GUARDAR_PAREJAS', idJornada + ' -> 5 parejas y 5 partidos');
  } finally {
    lock.releaseLock();
  }

  return { ok: true };
}
