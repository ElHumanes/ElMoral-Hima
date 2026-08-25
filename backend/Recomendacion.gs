/**
 * Motor de recomendación de parejas y alineaciones. Analiza, para cada
 * posible pareja entre los 10 seleccionados: compatibilidad de posiciones,
 * puntuación combinada, % de victorias jugando juntos, experiencia (partidos
 * juntos), forma reciente individual, y diferencia de sets/juegos cuando han
 * jugado juntos. Los pesos de cada factor están en CONFIG (Fase 0).
 *
 * Genera las 3 mejores alineaciones completas (de entre todas las formas
 * posibles de repartir 10 jugadores en 5 parejas) según el ÍNDICE_ALINEACION,
 * que además valora el equilibrio entre los 5 partidos.
 */

function leerConfigCompleta() {
  var config = leerFilas('CONFIG');
  var valor = {};
  config.forEach(function (c) { valor[c.clave] = Number(c.valor); });
  return valor;
}

function pesosDesdeConfig(valor) {
  return {
    compatibilidad: valor['PESO_COMPATIBILIDAD'] || 25,
    puntuacion: valor['PESO_PUNTUACION'] || 15,
    victorias: valor['PESO_VICTORIAS'] || 20,
    partidosJuntos: valor['PESO_PARTIDOS_JUNTOS'] || 10,
    formaReciente: valor['PESO_FORMA_RECIENTE'] || 15,
    difSets: valor['PESO_DIF_SETS'] || 5,
    difJuegos: valor['PESO_DIF_JUEGOS'] || 5,
    equilibrio: valor['PESO_EQUILIBRIO'] || 5
  };
}

function umbralesDesdeConfig(valor) {
  return {
    baja: valor['UMBRAL_BAJA'] || 3,
    media: valor['UMBRAL_MEDIA'] || 6,
    alta: valor['UMBRAL_ALTA'] || 11,
    muyAlta: valor['UMBRAL_MUY_ALTA'] || 21
  };
}

/** Igual que nivelConfianza() de Estadisticas.gs, pero sin volver a leer CONFIG (los umbrales ya vienen calculados). */
function nivelConfianzaConUmbrales(numeroPartidos, umbrales) {
  if (numeroPartidos >= umbrales.muyAlta) return 'MUY ALTA';
  if (numeroPartidos >= umbrales.alta) return 'ALTA';
  if (numeroPartidos >= umbrales.media) return 'MEDIA';
  if (numeroPartidos >= umbrales.baja) return 'BAJA';
  return 'MUY BAJA';
}

/** Genera todas las formas posibles de repartir una lista de ids en parejas (para 10 ids da 945 combinaciones). */
function generarTodasLasAlineaciones(ids) {
  if (ids.length === 0) return [[]];
  var primero = ids[0];
  var resto = ids.slice(1);
  var resultados = [];
  for (var i = 0; i < resto.length; i++) {
    var companero = resto[i];
    var restantes = resto.slice(0, i).concat(resto.slice(i + 1));
    var subAlineaciones = generarTodasLasAlineaciones(restantes);
    subAlineaciones.forEach(function (sub) {
      resultados.push([[primero, companero]].concat(sub));
    });
  }
  return resultados;
}

function normalizar(valor, min, max) {
  if (max <= min) return 50;
  return ((valor - min) / (max - min)) * 100;
}

function confianzaANumero(nivel) {
  return { 'MUY BAJA': 10, 'BAJA': 35, 'MEDIA': 60, 'ALTA': 85, 'MUY ALTA': 100 }[nivel] || 10;
}

function claveParJugadores(idA, idB) {
  return [idA, idB].sort().join('|');
}

/**
 * Recopila todo lo necesario para puntuar parejas: datos de los 10 jugadores,
 * su historial en pareja y su forma reciente. Lee cada hoja UNA sola vez (en
 * vez de reutilizar obtenerEstadisticasJugador por jugador, que releía
 * JORNADAS/PAREJAS/PARTIDOS/RESULTADOS/CONVOCATORIAS por cada uno de los 10 —
 * más de 70 lecturas de hoja redundantes que hacían el motor muy lento).
 */
function construirContextoRecomendacion(idsSeleccionados) {
  var jugadores = leerFilas('JUGADORES');
  var jugadorPorId = {};
  jugadores.forEach(function (j) { jugadorPorId[j.id_jugador] = j; });

  var parejas = leerFilas('PAREJAS');
  var partidos = leerFilas('PARTIDOS');
  var partidoPorPareja = {};
  partidos.forEach(function (p) { partidoPorPareja[p.id_pareja] = p; });
  var resultados = leerFilas('RESULTADOS');
  var resultadoPorPartido = {};
  resultados.forEach(function (r) { resultadoPorPartido[r.id_partido] = r; });

  var historialParejas = {};
  var historialPorJugador = {};
  idsSeleccionados.forEach(function (id) { historialPorJugador[id] = []; });

  parejas.forEach(function (p) {
    var partido = partidoPorPareja[p.id_pareja];
    var resultado = partido ? resultadoPorPartido[partido.id_partido] : null;
    if (!resultado) return;

    var clave = claveParJugadores(p.id_jugador_a, p.id_jugador_b);
    if (!historialParejas[clave]) {
      historialParejas[clave] = { jugados: 0, victorias: 0, setsFavor: 0, setsContra: 0, juegosFavor: 0, juegosContra: 0 };
    }
    var h = historialParejas[clave];
    h.jugados += 1;
    if (resultado.resultado === 'GANADO') h.victorias += 1;
    h.setsFavor += Number(resultado.sets_favor) || 0;
    h.setsContra += Number(resultado.sets_contra) || 0;
    h.juegosFavor += Number(resultado.juegos_favor) || 0;
    h.juegosContra += Number(resultado.juegos_contra) || 0;

    [p.id_jugador_a, p.id_jugador_b].forEach(function (idJugador) {
      if (!historialPorJugador[idJugador]) historialPorJugador[idJugador] = [];
      historialPorJugador[idJugador].push({ resultado: resultado.resultado, fecha_registro: resultado.fecha_registro || '' });
    });
  });

  var formaPorJugador = {};
  idsSeleccionados.forEach(function (id) {
    var historial = historialPorJugador[id].slice().sort(function (a, b) {
      return String(a.fecha_registro).localeCompare(String(b.fecha_registro));
    });
    var recientes = historial.slice(-5);
    var victoriasForma = recientes.filter(function (h) { return h.resultado === 'GANADO'; }).length;
    formaPorJugador[id] = recientes.length > 0 ? (victoriasForma / recientes.length) * 100 : 50;
  });

  // Rango de puntuaciones combinadas posibles entre los 10, para normalizar.
  var puntuaciones = idsSeleccionados.map(function (id) { return Number(jugadorPorId[id].puntuacion); });
  var combinadas = [];
  for (var i = 0; i < idsSeleccionados.length; i++) {
    for (var j = i + 1; j < idsSeleccionados.length; j++) {
      combinadas.push(puntuaciones[i] + puntuaciones[j]);
    }
  }
  var rangoPuntuacion = { min: Math.min.apply(null, combinadas), max: Math.max.apply(null, combinadas) };

  // Rango de diferencias de sets/juegos históricas entre los 10 (para normalizar; si no hay historial, no afecta).
  var difsSets = [0], difsJuegos = [0];
  Object.keys(historialParejas).forEach(function (clave) {
    var h = historialParejas[clave];
    difsSets.push(h.setsFavor - h.setsContra);
    difsJuegos.push(h.juegosFavor - h.juegosContra);
  });

  var configCompleta = leerConfigCompleta();

  return {
    jugadorPorId: jugadorPorId,
    formaPorJugador: formaPorJugador,
    historialParejas: historialParejas,
    rangoPuntuacion: rangoPuntuacion,
    rangoDifSets: { min: Math.min.apply(null, difsSets), max: Math.max.apply(null, difsSets) },
    rangoDifJuegos: { min: Math.min.apply(null, difsJuegos), max: Math.max.apply(null, difsJuegos) },
    pesos: pesosDesdeConfig(configCompleta),
    umbrales: umbralesDesdeConfig(configCompleta)
  };
}

function calcularIndicePareja(idA, idB, contexto) {
  var a = contexto.jugadorPorId[idA];
  var b = contexto.jugadorPorId[idB];
  var pesos = contexto.pesos;

  var compat = calcularCompatibilidad(a, b);
  var compatScore = compat === 'BUENA' ? 100 : (compat === 'REGULAR' ? 50 : 0);

  var puntuacionCombinada = Number(a.puntuacion) + Number(b.puntuacion);
  var puntuacionScore = normalizar(puntuacionCombinada, contexto.rangoPuntuacion.min, contexto.rangoPuntuacion.max);

  var clave = claveParJugadores(idA, idB);
  var historial = contexto.historialParejas[clave];
  var jugadosJuntos = historial ? historial.jugados : 0;
  var victoriasScore = historial && historial.jugados > 0 ? (historial.victorias / historial.jugados) * 100 : 50;
  var nivelConf = nivelConfianzaConUmbrales(jugadosJuntos, contexto.umbrales);
  var experienciaScore = confianzaANumero(nivelConf);

  var formaScore = (contexto.formaPorJugador[idA] + contexto.formaPorJugador[idB]) / 2;

  var difSets = historial && historial.jugados > 0 ? (historial.setsFavor - historial.setsContra) : 0;
  var difJuegos = historial && historial.jugados > 0 ? (historial.juegosFavor - historial.juegosContra) : 0;
  var difSetsScore = normalizar(difSets, contexto.rangoDifSets.min, contexto.rangoDifSets.max);
  var difJuegosScore = normalizar(difJuegos, contexto.rangoDifJuegos.min, contexto.rangoDifJuegos.max);

  var sumaPesos = pesos.compatibilidad + pesos.puntuacion + pesos.victorias + pesos.partidosJuntos + pesos.formaReciente + pesos.difSets + pesos.difJuegos;
  var indice = (
    compatScore * pesos.compatibilidad +
    puntuacionScore * pesos.puntuacion +
    victoriasScore * pesos.victorias +
    experienciaScore * pesos.partidosJuntos +
    formaScore * pesos.formaReciente +
    difSetsScore * pesos.difSets +
    difJuegosScore * pesos.difJuegos
  ) / sumaPesos;

  return {
    id_jugador_a: idA,
    id_jugador_b: idB,
    indice_pareja: Math.round(indice * 10) / 10,
    puntuacion_total: Number(a.puntuacion) + Number(b.puntuacion),
    compatibilidad: compat,
    partidos_juntos: jugadosJuntos,
    porcentaje_victorias_juntos: historial && historial.jugados > 0 ? Math.round((historial.victorias / historial.jugados) * 1000) / 10 : null,
    confianza: nivelConf,
    forma_a: Math.round(contexto.formaPorJugador[idA]),
    forma_b: Math.round(contexto.formaPorJugador[idB])
  };
}

function explicarPareja(p, contexto) {
  var a = contexto.jugadorPorId[p.id_jugador_a];
  var b = contexto.jugadorPorId[p.id_jugador_b];
  var motivos = [];

  motivos.push(p.compatibilidad === 'BUENA' ? 'Buena compatibilidad de posiciones' :
    p.compatibilidad === 'REGULAR' ? 'Compatibilidad de posiciones mejorable (ambos del mismo lado)' :
    'Sin combinación ideal de posiciones');

  if (p.partidos_juntos > 0) {
    motivos.push(p.partidos_juntos + ' partido' + (p.partidos_juntos === 1 ? '' : 's') + ' juntos, ' +
      p.porcentaje_victorias_juntos + '% de victorias (confianza ' + p.confianza.toLowerCase() + ')');
  } else {
    motivos.push('Todavía no han jugado juntos');
  }

  motivos.push('Puntuación combinada: ' + p.puntuacion_total);
  motivos.push('Forma reciente: ' + (a.apodo || a.nombre_completo) + ' ' + p.forma_a + '% · ' + (b.apodo || b.nombre_completo) + ' ' + p.forma_b + '%');

  return motivos;
}

/**
 * Genera hasta 3 alineaciones recomendadas (5 parejas cada una) a partir de
 * una lista de exactamente 10 ids de jugadores, ordenadas de mejor a peor
 * ÍNDICE_ALINEACION. Núcleo compartido por generarRecomendaciones (requiere
 * selección ya guardada) y previsualizarAlineaciones (calcula al vuelo,
 * antes de guardar nada, con el pool de candidatos que ve el capitán al
 * abrir la pantalla de parejas).
 */
function generarMejoresAlineaciones(ids) {
  var contexto = construirContextoRecomendacion(ids);
  var pesos = contexto.pesos;
  var todasLasAlineaciones = generarTodasLasAlineaciones(ids);

  var alineacionesPuntuadas = todasLasAlineaciones.map(function (parejasIds) {
    var parejas = parejasIds.map(function (par) { return calcularIndicePareja(par[0], par[1], contexto); });
    var indices = parejas.map(function (p) { return p.indice_pareja; });
    var media = indices.reduce(function (a, v) { return a + v; }, 0) / indices.length;
    var varianza = indices.reduce(function (a, v) { return a + Math.pow(v - media, 2); }, 0) / indices.length;
    var equilibrioScore = Math.max(0, 100 - Math.sqrt(varianza) * 2);

    var pesosPareja = pesos.compatibilidad + pesos.puntuacion + pesos.victorias + pesos.partidosJuntos + pesos.formaReciente + pesos.difSets + pesos.difJuegos;
    var indiceAlineacion = (media * pesosPareja + equilibrioScore * pesos.equilibrio) / (pesosPareja + pesos.equilibrio);

    return { parejas: parejas, indice_alineacion: Math.round(indiceAlineacion * 10) / 10 };
  });

  alineacionesPuntuadas.sort(function (a, b) { return b.indice_alineacion - a.indice_alineacion; });

  return alineacionesPuntuadas.slice(0, 3).map(function (alineacion) {
    // Ordenar las parejas de la alineación de mayor a menor puntuación combinada (partido 1 a 5).
    var parejasOrdenadas = alineacion.parejas.slice().sort(function (a, b) { return b.puntuacion_total - a.puntuacion_total; });
    return {
      indice_alineacion: alineacion.indice_alineacion,
      parejas: parejasOrdenadas.map(function (p, indice) {
        var a = contexto.jugadorPorId[p.id_jugador_a];
        var b = contexto.jugadorPorId[p.id_jugador_b];
        return {
          numero_partido: indice + 1,
          jugador_a: { id_jugador: p.id_jugador_a, nombre_completo: a.nombre_completo, apodo: a.apodo, foto_url: a.foto_url || '' },
          jugador_b: { id_jugador: p.id_jugador_b, nombre_completo: b.nombre_completo, apodo: b.apodo, foto_url: b.foto_url || '' },
          indice_pareja: p.indice_pareja,
          compatibilidad: p.compatibilidad,
          puntuacion_total: p.puntuacion_total,
          explicacion: explicarPareja(p, contexto)
        };
      })
    };
  });
}

/** Igual que antes: recomendaciones para una jornada cuyos 10 seleccionados ya están guardados. */
function generarRecomendaciones(sesion, idJornada) {
  requerirCapitan(sesion);

  var seleccionados = listarSeleccionados(idJornada);
  if (seleccionados.length !== 10) {
    throw new Error('Primero debes seleccionar los 10 jugadores de esta jornada.');
  }
  var ids = seleccionados.map(function (s) { return s.id_jugador; });
  return generarMejoresAlineaciones(ids);
}

/**
 * Recomendación instantánea sin haber guardado nada todavía: recibe
 * directamente los 10 ids del pool que el capitán ve al abrir la pantalla
 * de parejas (apuntados a la convocatoria, o los 10 ya seleccionados si se
 * están rehaciendo), para sugerir la mejor alineación en cuanto entra.
 */
function previsualizarAlineaciones(sesion, idsJugadores) {
  requerirCapitan(sesion);

  if (!Array.isArray(idsJugadores) || idsJugadores.length !== 10) {
    throw new Error('Se necesitan exactamente 10 jugadores para calcular una alineación.');
  }
  var idsUnicos = idsJugadores.filter(function (id, i) { return idsJugadores.indexOf(id) === i; });
  if (idsUnicos.length !== 10) {
    throw new Error('Hay jugadores repetidos en la lista.');
  }

  return generarMejoresAlineaciones(idsJugadores);
}
