/**
 * Convocatorias: cada jugador activo responde ME_APUNTO o NO_PUEDO a una
 * jornada. Mientras no responda, aparece como PENDIENTE (no se guarda fila
 * hasta que responde, así un jugador nuevo siempre aparece pendiente sin
 * necesidad de rellenar nada por adelantado).
 */

var DISPONIBILIDAD_VALIDA = ['ME_APUNTO', 'NO_PUEDO'];

/**
 * Devuelve, para una jornada, el estado de convocatoria de cada jugador
 * activo: ME_APUNTO, NO_PUEDO o PENDIENTE si todavía no ha respondido.
 */
function listarConvocatoria(idJornada) {
  if (!idJornada) throw new Error('Falta el identificador de la jornada.');

  var jugadores = leerFilas('JUGADORES').filter(function (j) { return j.estado === 'ACTIVO'; });
  var respuestas = leerFilas('CONVOCATORIAS').filter(function (c) { return c.id_jornada === idJornada; });

  var respuestaPorJugador = {};
  respuestas.forEach(function (r) { respuestaPorJugador[r.id_jugador] = r; });

  return jugadores.map(function (j) {
    var respuesta = respuestaPorJugador[j.id_jugador];
    return {
      id_jugador: j.id_jugador,
      nombre_completo: j.nombre_completo,
      apodo: j.apodo,
      foto_url: j.foto_url || '',
      disponibilidad: respuesta ? respuesta.disponibilidad : 'PENDIENTE',
      fecha_respuesta: respuesta ? respuesta.fecha_respuesta : '',
      observaciones: respuesta ? respuesta.observaciones : ''
    };
  }).sort(function (a, b) {
    return (a.apodo || a.nombre_completo).localeCompare(b.apodo || b.nombre_completo, 'es');
  });
}

/**
 * El propio jugador (identificado por su sesión) responde a la convocatoria
 * de una jornada. Solo se puede responder mientras esté CONVOCATORIA_ABIERTA.
 */
function responderConvocatoria(sesion, idJornada, disponibilidad, observaciones) {
  if (!sesion.id_jugador) {
    throw new Error('Tu usuario no tiene una ficha de jugador asociada. Habla con el capitán.');
  }
  if (!idJornada) throw new Error('Falta el identificador de la jornada.');
  if (DISPONIBILIDAD_VALIDA.indexOf(disponibilidad) === -1) {
    throw new Error('Respuesta no válida.');
  }

  var jornada = leerFilas('JORNADAS').filter(function (j) { return j.id_jornada === idJornada; })[0];
  if (!jornada) throw new Error('No se ha encontrado esa jornada.');
  if (jornada.estado !== 'CONVOCATORIA_ABIERTA') {
    throw new Error('La convocatoria de esta jornada no está abierta.');
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var existente = leerFilas('CONVOCATORIAS').filter(function (c) {
      return c.id_jornada === idJornada && c.id_jugador === sesion.id_jugador;
    })[0];

    var cambios = {
      disponibilidad: disponibilidad,
      fecha_respuesta: ahoraIso(),
      observaciones: (observaciones || '').trim()
    };

    if (existente) {
      actualizarFila('CONVOCATORIAS', 'id_convocatoria', existente.id_convocatoria, cambios);
    } else {
      agregarFila('CONVOCATORIAS', Object.assign({
        id_convocatoria: generarId(),
        id_jornada: idJornada,
        id_jugador: sesion.id_jugador
      }, cambios));
    }

    registrarLog(sesion.id_usuario, 'RESPONDER_CONVOCATORIA', idJornada + ' -> ' + disponibilidad);
  } finally {
    lock.releaseLock();
  }

  return { ok: true };
}

/**
 * Historial de convocatorias del propio jugador: para cada jornada cuya
 * convocatoria ya está cerrada o en un estado posterior, su respuesta
 * (ME_APUNTO / NO_PUEDO / NO_RESPONDIO si no llegó a contestar). No incluye
 * jornadas sin convocatoria todavía ni con la convocatoria abierta (esa se
 * responde desde la pantalla de inicio, no tiene sentido en un historial).
 */
function listarHistorialConvocatoriasJugador(sesion) {
  if (!sesion.id_jugador) {
    throw new Error('Tu usuario no tiene una ficha de jugador asociada. Habla con el capitán.');
  }

  var jornadas = leerFilas('JORNADAS').filter(function (j) {
    return j.estado !== 'PENDIENTE' && j.estado !== 'CONVOCATORIA_ABIERTA';
  });

  var respuestaPorJornada = {};
  leerFilas('CONVOCATORIAS')
    .filter(function (c) { return c.id_jugador === sesion.id_jugador; })
    .forEach(function (r) { respuestaPorJornada[r.id_jornada] = r; });

  return jornadas.map(function (j) {
    var respuesta = respuestaPorJornada[j.id_jornada];
    return {
      id_jornada: j.id_jornada,
      rival: j.rival,
      fecha: j.fecha,
      lugar: j.lugar,
      local_visitante: j.local_visitante,
      estado_jornada: j.estado,
      disponibilidad: respuesta ? respuesta.disponibilidad : 'NO_RESPONDIO'
    };
  }).sort(function (a, b) { return String(b.fecha).localeCompare(String(a.fecha)); });
}

/* ========================================================================
 * FUNCIÓN DE PRUEBA — se ejecuta a mano UNA VEZ desde el editor de Apps
 * Script para poder probar cómo responde un jugador a una convocatoria.
 * Crea un usuario de tipo JUGADOR vinculado a "Mari" (María López Ruiz),
 * solo si todavía no existe ningún usuario para ese jugador.
 * ==================================================================== */
function crearUsuarioJugadorPrueba() {
  var jugadores = leerFilas('JUGADORES');
  var mari = jugadores.filter(function (j) { return j.apodo === 'Mari'; })[0];
  if (!mari) {
    Logger.log('No se ha encontrado a "Mari" en JUGADORES. Créala primero desde la app.');
    return;
  }

  var usuarios = leerFilas('USUARIOS');
  var yaExiste = usuarios.filter(function (u) { return u.id_jugador === mari.id_jugador; })[0];
  if (yaExiste) {
    Logger.log('Ya existe un usuario para ese jugador: "' + yaExiste.nombre_usuario + '"');
    return;
  }

  var nombreUsuario = 'mari';
  var codigoAcceso = '1111';

  agregarFila('USUARIOS', {
    id_usuario: generarId(),
    id_jugador: mari.id_jugador,
    nombre_usuario: nombreUsuario,
    rol: 'JUGADOR',
    codigo_acceso_hash: hashTexto(codigoAcceso),
    estado: 'ACTIVO',
    fecha_creacion: ahoraIso(),
    ultimo_acceso: ''
  });

  Logger.log('Usuario jugador creado. Usuario: "' + nombreUsuario + '"  Código: "' + codigoAcceso + '"');
}
