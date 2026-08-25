/**
 * Estadísticas: individuales (ampliadas), de parejas, y panel general para
 * el capitán. Todo se calcula al vuelo a partir de PAREJAS + PARTIDOS +
 * RESULTADOS + CONVOCATORIAS + SELECCIONADOS + JORNADAS — nada se guarda
 * en ninguna hoja aparte, para que nunca pueda desincronizarse.
 */

/** Historial de partidos jugados por un jugador, con el contexto de cada uno (local/visitante, nº de partido, fecha). */
function calcularHistorialJugador(idJugador) {
  var parejas = leerFilas('PAREJAS').filter(function (p) {
    return p.id_jugador_a === idJugador || p.id_jugador_b === idJugador;
  });
  var idsPareja = {};
  parejas.forEach(function (p) { idsPareja[p.id_pareja] = true; });

  var partidos = leerFilas('PARTIDOS').filter(function (p) { return idsPareja[p.id_pareja]; });
  var partidoPorId = {};
  partidos.forEach(function (p) { partidoPorId[p.id_partido] = p; });

  var jornadas = leerFilas('JORNADAS');
  var jornadaPorId = {};
  jornadas.forEach(function (j) { jornadaPorId[j.id_jornada] = j; });

  var resultados = leerFilas('RESULTADOS').filter(function (r) { return partidoPorId[r.id_partido]; });

  return resultados.map(function (r) {
    var partido = partidoPorId[r.id_partido];
    var jornada = jornadaPorId[partido.id_jornada] || {};
    return {
      resultado: r.resultado,
      sets_favor: Number(r.sets_favor) || 0,
      sets_contra: Number(r.sets_contra) || 0,
      juegos_favor: Number(r.juegos_favor) || 0,
      juegos_contra: Number(r.juegos_contra) || 0,
      local_visitante: jornada.local_visitante || '',
      numero_partido: Number(partido.numero_partido),
      fecha: jornada.fecha || '',
      fecha_registro: r.fecha_registro || ''
    };
  }).sort(function (a, b) { return String(a.fecha_registro).localeCompare(String(b.fecha_registro)); });
}

/** Asistencia: cuántas convocatorias respondió, a cuántas dijo que sí, y cuántas veces fue seleccionado. */
function calcularAsistenciaJugador(idJugador) {
  var jornadasConConvocatoria = leerFilas('JORNADAS').filter(function (j) { return j.estado !== 'PENDIENTE'; });
  var respuestas = leerFilas('CONVOCATORIAS').filter(function (c) { return c.id_jugador === idJugador; });
  var meApunto = respuestas.filter(function (c) { return c.disponibilidad === 'ME_APUNTO'; }).length;
  var seleccionado = leerFilas('SELECCIONADOS').filter(function (s) { return s.id_jugador === idJugador; }).length;
  var total = jornadasConConvocatoria.length;

  return {
    convocatorias_totales: total,
    veces_apuntado: meApunto,
    porcentaje_asistencia: total > 0 ? Math.round((meApunto / total) * 1000) / 10 : 0,
    veces_seleccionado: seleccionado,
    porcentaje_seleccion: meApunto > 0 ? Math.round((seleccionado / meApunto) * 1000) / 10 : 0
  };
}

function obtenerEstadisticasJugador(idJugador) {
  if (!idJugador) throw new Error('Falta el identificador del jugador.');

  var historial = calcularHistorialJugador(idJugador);
  var partidosJugados = historial.length;
  var victorias = historial.filter(function (h) { return h.resultado === 'GANADO'; }).length;
  var derrotas = partidosJugados - victorias;

  var setsFavor = 0, setsContra = 0, juegosFavor = 0, juegosContra = 0;
  historial.forEach(function (h) {
    setsFavor += h.sets_favor; setsContra += h.sets_contra;
    juegosFavor += h.juegos_favor; juegosContra += h.juegos_contra;
  });

  var local = historial.filter(function (h) { return h.local_visitante === 'LOCAL'; });
  var visitante = historial.filter(function (h) { return h.local_visitante === 'VISITANTE'; });

  var rendimientoPorPartido = {};
  for (var n = 1; n <= 5; n++) {
    var deEsePuesto = historial.filter(function (h) { return h.numero_partido === n; });
    rendimientoPorPartido[n] = {
      jugados: deEsePuesto.length,
      victorias: deEsePuesto.filter(function (h) { return h.resultado === 'GANADO'; }).length
    };
  }

  return {
    id_jugador: idJugador,
    partidos_jugados: partidosJugados,
    victorias: victorias,
    derrotas: derrotas,
    porcentaje_victorias: partidosJugados > 0 ? Math.round((victorias / partidosJugados) * 1000) / 10 : 0,
    sets_favor: setsFavor,
    sets_contra: setsContra,
    diferencia_sets: setsFavor - setsContra,
    juegos_favor: juegosFavor,
    juegos_contra: juegosContra,
    diferencia_juegos: juegosFavor - juegosContra,
    confianza: nivelConfianza(partidosJugados),
    forma_reciente: historial.slice(-5).map(function (h) { return h.resultado === 'GANADO' ? 'G' : 'P'; }),
    local: { jugados: local.length, victorias: local.filter(function (h) { return h.resultado === 'GANADO'; }).length },
    visitante: { jugados: visitante.length, victorias: visitante.filter(function (h) { return h.resultado === 'GANADO'; }).length },
    rendimiento_por_partido: rendimientoPorPartido,
    asistencia: calcularAsistenciaJugador(idJugador)
  };
}

function nivelConfianza(numeroPartidos) {
  var config = leerFilas('CONFIG');
  var valorConfig = {};
  config.forEach(function (c) { valorConfig[c.clave] = Number(c.valor); });

  var umbralBaja = valorConfig['UMBRAL_BAJA'] || 3;
  var umbralMedia = valorConfig['UMBRAL_MEDIA'] || 6;
  var umbralAlta = valorConfig['UMBRAL_ALTA'] || 11;
  var umbralMuyAlta = valorConfig['UMBRAL_MUY_ALTA'] || 21;

  if (numeroPartidos >= umbralMuyAlta) return 'MUY ALTA';
  if (numeroPartidos >= umbralAlta) return 'ALTA';
  if (numeroPartidos >= umbralMedia) return 'MEDIA';
  if (numeroPartidos >= umbralBaja) return 'BAJA';
  return 'MUY BAJA';
}

/**
 * Calcula partidos jugados/ganados, % de victorias, confianza y asistencia
 * para VARIOS jugadores a la vez, leyendo cada hoja una sola vez — en vez de
 * llamar a obtenerEstadisticasJugador() en un bucle, que releía por
 * completo JORNADAS/PAREJAS/PARTIDOS/RESULTADOS/CONVOCATORIAS/SELECCIONADOS
 * y CONFIG por cada jugador (con muchos jugadores, esto era lentísimo: el
 * mismo fallo que ya se corrigió en el motor de recomendación).
 */
function calcularEstadisticasBatch(idsJugadores) {
  var idsSet = {};
  idsJugadores.forEach(function (id) { idsSet[id] = true; });

  var jornadasConConvocatoria = leerFilas('JORNADAS').filter(function (j) { return j.estado !== 'PENDIENTE'; }).length;

  var parejas = leerFilas('PAREJAS');
  var parejaPorId = {};
  parejas.forEach(function (p) { parejaPorId[p.id_pareja] = p; });

  var partidos = leerFilas('PARTIDOS');
  var partidoPorId = {};
  partidos.forEach(function (p) { partidoPorId[p.id_partido] = p; });

  var resultadoPorJugador = {};
  idsJugadores.forEach(function (id) { resultadoPorJugador[id] = []; });

  leerFilas('RESULTADOS').forEach(function (r) {
    var partido = partidoPorId[r.id_partido];
    var pareja = partido ? parejaPorId[partido.id_pareja] : null;
    if (!pareja) return;
    [pareja.id_jugador_a, pareja.id_jugador_b].forEach(function (idJugador) {
      if (idsSet[idJugador]) resultadoPorJugador[idJugador].push(r.resultado);
    });
  });

  var meApuntoPorJugador = {};
  leerFilas('CONVOCATORIAS').forEach(function (c) {
    if (idsSet[c.id_jugador] && c.disponibilidad === 'ME_APUNTO') {
      meApuntoPorJugador[c.id_jugador] = (meApuntoPorJugador[c.id_jugador] || 0) + 1;
    }
  });

  var vecesSeleccionadoPorJugador = {};
  leerFilas('SELECCIONADOS').forEach(function (s) {
    if (idsSet[s.id_jugador]) {
      vecesSeleccionadoPorJugador[s.id_jugador] = (vecesSeleccionadoPorJugador[s.id_jugador] || 0) + 1;
    }
  });

  var valorConfig = {};
  leerFilas('CONFIG').forEach(function (c) { valorConfig[c.clave] = Number(c.valor); });
  var umbralBaja = valorConfig['UMBRAL_BAJA'] || 3;
  var umbralMedia = valorConfig['UMBRAL_MEDIA'] || 6;
  var umbralAlta = valorConfig['UMBRAL_ALTA'] || 11;
  var umbralMuyAlta = valorConfig['UMBRAL_MUY_ALTA'] || 21;
  function confianzaDesdeNumero(n) {
    if (n >= umbralMuyAlta) return 'MUY ALTA';
    if (n >= umbralAlta) return 'ALTA';
    if (n >= umbralMedia) return 'MEDIA';
    if (n >= umbralBaja) return 'BAJA';
    return 'MUY BAJA';
  }

  var resultado = {};
  idsJugadores.forEach(function (id) {
    var resultados = resultadoPorJugador[id] || [];
    var jugados = resultados.length;
    var victorias = resultados.filter(function (r) { return r === 'GANADO'; }).length;
    var meApunto = meApuntoPorJugador[id] || 0;
    var vecesSel = vecesSeleccionadoPorJugador[id] || 0;

    resultado[id] = {
      partidos_jugados: jugados,
      victorias: victorias,
      derrotas: jugados - victorias,
      porcentaje_victorias: jugados > 0 ? Math.round((victorias / jugados) * 1000) / 10 : 0,
      confianza: confianzaDesdeNumero(jugados),
      asistencia: {
        convocatorias_totales: jornadasConConvocatoria,
        veces_apuntado: meApunto,
        porcentaje_asistencia: jornadasConConvocatoria > 0 ? Math.round((meApunto / jornadasConConvocatoria) * 1000) / 10 : 0,
        veces_seleccionado: vecesSel,
        porcentaje_seleccion: meApunto > 0 ? Math.round((vecesSel / meApunto) * 1000) / 10 : 0
      }
    };
  });

  return resultado;
}

/**
 * Ranking de todos los jugadores activos, de mayor a menor % de victorias.
 * Cualquier persona con sesión válida puede verlo (jugador o capitán) — es
 * la clasificación del equipo, no un dato de gestión.
 */
function listarRankingJugadores(sesion) {
  return calcularRankingJugadores();
}

/**
 * La posición del propio jugador en el ranking del equipo, sin exponer los
 * datos del resto (el ranking completo es solo del capitán). Para que
 * cualquier jugador pueda ver "en qué puesto estoy" desde su perfil.
 */
function obtenerMiPosicionRanking(sesion) {
  if (!sesion.id_jugador) {
    throw new Error('Tu usuario no tiene una ficha de jugador asociada. Habla con el capitán.');
  }

  var ranking = calcularRankingJugadores();
  var miPosicion = null;
  ranking.forEach(function (r, indice) {
    if (r.id_jugador === sesion.id_jugador) miPosicion = { indice: indice, datos: r };
  });

  if (!miPosicion) return null;

  return {
    posicion: miPosicion.indice + 1,
    total_jugadores: ranking.length,
    porcentaje_victorias: miPosicion.datos.porcentaje_victorias,
    partidos_jugados: miPosicion.datos.partidos_jugados
  };
}

function calcularRankingJugadores() {
  var jugadores = leerFilas('JUGADORES').filter(function (j) { return j.estado === 'ACTIVO'; });
  var stats = calcularEstadisticasBatch(jugadores.map(function (j) { return j.id_jugador; }));

  return jugadores.map(function (j) {
    var s = stats[j.id_jugador] || {};
    return {
      id_jugador: j.id_jugador,
      nombre_completo: j.nombre_completo,
      apodo: j.apodo,
      foto_url: j.foto_url || '',
      partidos_jugados: s.partidos_jugados || 0,
      victorias: s.victorias || 0,
      derrotas: s.derrotas || 0,
      porcentaje_victorias: s.porcentaje_victorias || 0,
      confianza: s.confianza || 'MUY BAJA'
    };
  }).sort(function (a, b) {
    if (b.porcentaje_victorias !== a.porcentaje_victorias) return b.porcentaje_victorias - a.porcentaje_victorias;
    return b.partidos_jugados - a.partidos_jugados;
  });
}

/**
 * Estadísticas de cada pareja que se haya formado alguna vez (juntando
 * todas las jornadas). Cualquier persona con sesión válida puede verlo.
 */
function listarEstadisticasParejas(sesion) {
  return calcularEstadisticasParejas();
}

/**
 * Resumen de cada jornada ya jugada: victorias y derrotas del equipo en esa
 * jornada (no partido a partido, eso ya lo da listarResultados). Para la
 * pantalla "Clasificación" del jugador. Cualquier sesión válida puede verlo.
 */
function listarResumenJornadas() {
  var partidoPorId = {};
  leerFilas('PARTIDOS').forEach(function (p) { partidoPorId[p.id_partido] = p; });

  var resultadosPorJornada = {};
  leerFilas('RESULTADOS').forEach(function (r) {
    var partido = partidoPorId[r.id_partido];
    if (!partido) return;
    var idJornada = partido.id_jornada;
    if (!resultadosPorJornada[idJornada]) resultadosPorJornada[idJornada] = { victorias: 0, derrotas: 0 };
    if (r.resultado === 'GANADO') resultadosPorJornada[idJornada].victorias++;
    else resultadosPorJornada[idJornada].derrotas++;
  });

  return leerFilas('JORNADAS')
    .filter(function (j) { return resultadosPorJornada[j.id_jornada]; })
    .map(function (j) {
      var r = resultadosPorJornada[j.id_jornada];
      return {
        id_jornada: j.id_jornada,
        rival: j.rival,
        fecha: j.fecha,
        local_visitante: j.local_visitante,
        estado: j.estado,
        victorias: r.victorias,
        derrotas: r.derrotas,
        partidos_jugados: r.victorias + r.derrotas
      };
    })
    .sort(function (a, b) { return String(b.fecha).localeCompare(String(a.fecha)); });
}

/** Puntos por número de partido según el reglamento oficial de la SNP (12 en juego por enfrentamiento). */
var PUNTOS_POR_PARTIDO_SNP = { 1: 3, 2: 3, 3: 2, 4: 2, 5: 2 };

/**
 * Clasificación del equipo en la liga, según el reglamento de la SNP: cada
 * enfrentamiento reparte 12 puntos entre los 5 partidos (parejas 1 y 2 valen
 * 3 puntos cada una si se ganan, parejas 3/4/5 valen 2 puntos cada una), y
 * se gana el enfrentamiento ganando al menos 3 de los 5 partidos. Solo
 * cuentan los enfrentamientos con los 5 partidos ya resueltos.
 */
function obtenerClasificacionEquipo() {
  var jornadaPorId = {};
  leerFilas('JORNADAS').forEach(function (j) { jornadaPorId[j.id_jornada] = j; });

  var partidoPorId = {};
  leerFilas('PARTIDOS').forEach(function (p) { partidoPorId[p.id_partido] = p; });

  var resultadosPorJornada = {};
  leerFilas('RESULTADOS').forEach(function (r) {
    var partido = partidoPorId[r.id_partido];
    if (!partido) return;
    var idJornada = partido.id_jornada;
    if (!resultadosPorJornada[idJornada]) resultadosPorJornada[idJornada] = [];
    resultadosPorJornada[idJornada].push({ numero_partido: Number(partido.numero_partido), resultado: r.resultado });
  });

  var porJornada = [];
  var totalPuntos = 0, totalPuntosPosibles = 0, encuentrosGanados = 0, encuentrosPerdidos = 0, encuentrosJugados = 0;

  Object.keys(resultadosPorJornada).forEach(function (idJornada) {
    var jornada = jornadaPorId[idJornada];
    var partidos = resultadosPorJornada[idJornada];
    if (!jornada || partidos.length < 5) return; // enfrentamiento todavía incompleto, no cuenta aún

    var puntos = 0;
    var partidosGanados = 0;
    partidos.forEach(function (p) {
      if (p.resultado === 'GANADO') {
        puntos += PUNTOS_POR_PARTIDO_SNP[p.numero_partido] || 0;
        partidosGanados += 1;
      }
    });

    var ganado = partidosGanados >= 3;
    totalPuntos += puntos;
    totalPuntosPosibles += 12;
    encuentrosJugados += 1;
    if (ganado) encuentrosGanados += 1; else encuentrosPerdidos += 1;

    porJornada.push({
      id_jornada: idJornada,
      rival: jornada.rival,
      fecha: jornada.fecha,
      local_visitante: jornada.local_visitante,
      partidos_ganados: partidosGanados,
      partidos_perdidos: 5 - partidosGanados,
      puntos: puntos,
      ganado: ganado
    });
  });

  porJornada.sort(function (a, b) { return String(b.fecha).localeCompare(String(a.fecha)); });

  return {
    encuentros_jugados: encuentrosJugados,
    encuentros_ganados: encuentrosGanados,
    encuentros_perdidos: encuentrosPerdidos,
    puntos_totales: totalPuntos,
    puntos_posibles: totalPuntosPosibles,
    por_jornada: porJornada
  };
}

function calcularEstadisticasParejas() {
  var parejas = leerFilas('PAREJAS');
  var partidos = leerFilas('PARTIDOS');
  var partidoPorPareja = {};
  partidos.forEach(function (p) { partidoPorPareja[p.id_pareja] = p; });

  var resultados = leerFilas('RESULTADOS');
  var resultadoPorPartido = {};
  resultados.forEach(function (r) { resultadoPorPartido[r.id_partido] = r; });

  var jugadores = leerFilas('JUGADORES');
  var jugadorPorId = {};
  jugadores.forEach(function (j) { jugadorPorId[j.id_jugador] = j; });

  var grupos = {};
  parejas.forEach(function (p) {
    var ids = [p.id_jugador_a, p.id_jugador_b].sort();
    var clave = ids.join('|');
    if (!grupos[clave]) grupos[clave] = { idA: ids[0], idB: ids[1], resultados: [] };

    var partido = partidoPorPareja[p.id_pareja];
    var resultado = partido ? resultadoPorPartido[partido.id_partido] : null;
    if (resultado) grupos[clave].resultados.push(resultado);
  });

  return Object.keys(grupos).map(function (clave) {
    var g = grupos[clave];
    var a = jugadorPorId[g.idA] || {};
    var b = jugadorPorId[g.idB] || {};
    var jugados = g.resultados.length;
    var victorias = g.resultados.filter(function (r) { return r.resultado === 'GANADO'; }).length;
    var setsFavor = 0, setsContra = 0;
    g.resultados.forEach(function (r) {
      setsFavor += Number(r.sets_favor) || 0;
      setsContra += Number(r.sets_contra) || 0;
    });

    return {
      jugador_a: {
        id_jugador: g.idA,
        nombre: a.apodo || a.nombre_completo || '(jugador eliminado)',
        foto_url: a.foto_url || ''
      },
      jugador_b: {
        id_jugador: g.idB,
        nombre: b.apodo || b.nombre_completo || '(jugador eliminado)',
        foto_url: b.foto_url || ''
      },
      partidos_juntos: jugados,
      victorias: victorias,
      derrotas: jugados - victorias,
      porcentaje_victorias: jugados > 0 ? Math.round((victorias / jugados) * 1000) / 10 : 0,
      sets_favor: setsFavor,
      sets_contra: setsContra,
      confianza: nivelConfianza(jugados)
    };
  }).filter(function (x) { return x.partidos_juntos > 0; })
    .sort(function (a, b) {
      if (b.porcentaje_victorias !== a.porcentaje_victorias) return b.porcentaje_victorias - a.porcentaje_victorias;
      return b.partidos_juntos - a.partidos_juntos;
    });
}

/** Panel general del equipo: resumen, mejor jugador, mejor pareja, próxima jornada. Solo capitán. */
function obtenerDashboard(sesion) {
  requerirCapitan(sesion);

  var jornadas = leerFilas('JORNADAS');
  var jornadasJugadas = jornadas.filter(function (j) { return j.estado === 'FINALIZADA' || j.estado === 'JUGADA'; });
  var resultados = leerFilas('RESULTADOS');
  var partidosTotales = resultados.length;
  var victoriasTotales = resultados.filter(function (r) { return r.resultado === 'GANADO'; }).length;

  var estadosPendientes = ['PENDIENTE', 'CONVOCATORIA_ABIERTA', 'CONVOCATORIA_CERRADA', 'SELECCIONANDO', 'CONFIRMADA'];
  var proxima = jornadas
    .filter(function (j) { return estadosPendientes.indexOf(j.estado) !== -1; })
    .sort(function (a, b) { return String(a.fecha).localeCompare(String(b.fecha)); })[0];

  var ranking = calcularRankingJugadores().filter(function (r) { return r.partidos_jugados > 0; });
  var mejorJugador = ranking[0];

  var parejasStats = calcularEstadisticasParejas();
  var mejorPareja = parejasStats[0];

  return {
    jornadas_jugadas: jornadasJugadas.length,
    partidos_totales: partidosTotales,
    victorias_totales: victoriasTotales,
    derrotas_totales: partidosTotales - victoriasTotales,
    porcentaje_victorias_equipo: partidosTotales > 0 ? Math.round((victoriasTotales / partidosTotales) * 1000) / 10 : 0,
    proxima_jornada: proxima ? { rival: proxima.rival, fecha: proxima.fecha, estado: proxima.estado, local_visitante: proxima.local_visitante } : null,
    mejor_jugador: mejorJugador ? {
      nombre: mejorJugador.apodo || mejorJugador.nombre_completo,
      foto_url: mejorJugador.foto_url || '',
      porcentaje: mejorJugador.porcentaje_victorias,
      partidos: mejorJugador.partidos_jugados
    } : null,
    mejor_pareja: mejorPareja ? {
      jugadores: mejorPareja.jugador_a.nombre + ' + ' + mejorPareja.jugador_b.nombre,
      jugador_a: mejorPareja.jugador_a,
      jugador_b: mejorPareja.jugador_b,
      porcentaje: mejorPareja.porcentaje_victorias,
      partidos: mejorPareja.partidos_juntos
    } : null
  };
}
