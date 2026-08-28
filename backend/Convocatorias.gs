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

  var jugadores = leerFilas('JUGADORES').filter(function (j) { return j.estado === 'ACTIVO' && j.no_convocable !== true; });
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
 * Todo lo necesario para la tarjeta de "convocatoria abierta" de la
 * pantalla de inicio, en una sola llamada. Antes hacían falta 2 peticiones
 * para el jugador (jornadas + su respuesta), y 2+N para el capitán (una
 * por cada convocatoria abierta) — cada petición de más cuesta 2-3 segundos
 * fijos solo por el ida y vuelta a Apps Script, así que juntar todo en una
 * sola llamada es la mejora que más se nota.
 */
function obtenerResumenInicio(sesion) {
  var abiertas = leerFilas('JORNADAS').filter(function (j) { return j.estado === 'CONVOCATORIA_ABIERTA'; });

  if (sesion.rol === 'CAPITAN') {
    if (abiertas.length === 0) return { rol: 'CAPITAN', convocatorias: [] };

    var jugadoresActivos = leerFilas('JUGADORES').filter(function (j) { return j.estado === 'ACTIVO' && j.no_convocable !== true; });
    var todasRespuestas = leerFilas('CONVOCATORIAS');

    var convocatorias = abiertas.map(function (jornada) {
      var respuestaPorJugador = {};
      todasRespuestas
        .filter(function (c) { return c.id_jornada === jornada.id_jornada; })
        .forEach(function (r) { respuestaPorJugador[r.id_jugador] = r.disponibilidad; });

      var apuntados = 0, noDisponibles = 0, pendientes = 0;
      jugadoresActivos.forEach(function (j) {
        var disp = respuestaPorJugador[j.id_jugador] || 'PENDIENTE';
        if (disp === 'ME_APUNTO') apuntados++;
        else if (disp === 'NO_PUEDO') noDisponibles++;
        else pendientes++;
      });

      return {
        id_jornada: jornada.id_jornada,
        rival: jornada.rival,
        fecha: jornada.fecha,
        lugar: jornada.lugar,
        local_visitante: jornada.local_visitante,
        estado: jornada.estado,
        observaciones: jornada.observaciones,
        apuntados: apuntados,
        no_disponibles: noDisponibles,
        pendientes: pendientes
      };
    });

    return { rol: 'CAPITAN', convocatorias: convocatorias };
  }

  // JUGADOR
  if (abiertas.length === 0) return { rol: 'JUGADOR', convocatoria: null };

  if (sesion.id_jugador) {
    var miFicha = leerFilas('JUGADORES').filter(function (j) { return j.id_jugador === sesion.id_jugador; })[0];
    if (miFicha && miFicha.no_convocable === true) return { rol: 'JUGADOR', convocatoria: null };
  }

  var abierta = abiertas[0];
  var miRespuesta = 'PENDIENTE';
  if (sesion.id_jugador) {
    var miFila = leerFilas('CONVOCATORIAS').filter(function (c) {
      return c.id_jornada === abierta.id_jornada && c.id_jugador === sesion.id_jugador;
    })[0];
    if (miFila) miRespuesta = miFila.disponibilidad;
  }

  return {
    rol: 'JUGADOR',
    convocatoria: {
      id_jornada: abierta.id_jornada,
      rival: abierta.rival,
      fecha: abierta.fecha,
      lugar: abierta.lugar,
      local_visitante: abierta.local_visitante,
      mi_respuesta: miRespuesta
    }
  };
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

/**
 * Token que demuestra que un enlace de "confirmar asistencia" es legítimo
 * para ese jugador y esa jornada en concreto (sin él, cualquiera podría
 * responder por otro jugador con solo saber sus identificadores).
 */
function tokenRespuestaEnlace(idJugador, idJornada) {
  return hashTexto(idJugador + '|' + idJornada + '|' + obtenerSecretoEnlaces());
}

/**
 * Responde a una convocatoria desde el enlace de un solo clic del email,
 * sin necesidad de iniciar sesión. Siempre devuelve una página HTML (nunca
 * lanza errores hacia fuera) para que se vea bien al abrirla directamente
 * desde el correo.
 */
function confirmarAsistenciaPorEnlace(params) {
  var idJugador = params.jug;
  var idJornada = params.jor;
  var disponibilidad = params.resp === 'SI' ? 'ME_APUNTO' : (params.resp === 'NO' ? 'NO_PUEDO' : null);
  var token = params.tok;

  if (!idJugador || !idJornada || !disponibilidad || !token) {
    return paginaConfirmacion('Enlace incompleto', 'Este enlace no es válido. Entra en la app para responder.', false);
  }
  if (token !== tokenRespuestaEnlace(idJugador, idJornada)) {
    return paginaConfirmacion('Enlace no válido', 'Este enlace no es válido o ha caducado. Entra en la app para responder.', false);
  }

  var jugador = leerFilas('JUGADORES').filter(function (j) { return j.id_jugador === idJugador; })[0];
  if (!jugador) {
    return paginaConfirmacion('Jugador no encontrado', 'No se ha encontrado tu ficha de jugador. Entra en la app o avisa al capitán.', false);
  }

  var jornada = leerFilas('JORNADAS').filter(function (j) { return j.id_jornada === idJornada; })[0];
  if (!jornada) {
    return paginaConfirmacion('Jornada no encontrada', 'No se ha encontrado esa jornada.', false);
  }
  if (jornada.estado !== 'CONVOCATORIA_ABIERTA') {
    return paginaConfirmacion('Convocatoria cerrada', 'La convocatoria de esta jornada ya no está abierta. Si necesitas cambiar tu respuesta, entra en la app.', false);
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var existente = leerFilas('CONVOCATORIAS').filter(function (c) {
      return c.id_jornada === idJornada && c.id_jugador === idJugador;
    })[0];

    var cambios = {
      disponibilidad: disponibilidad,
      fecha_respuesta: ahoraIso(),
      observaciones: existente ? existente.observaciones : ''
    };

    if (existente) {
      actualizarFila('CONVOCATORIAS', 'id_convocatoria', existente.id_convocatoria, cambios);
    } else {
      agregarFila('CONVOCATORIAS', Object.assign({
        id_convocatoria: generarId(),
        id_jornada: idJornada,
        id_jugador: idJugador
      }, cambios));
    }

    registrarLog('', 'RESPONDER_CONVOCATORIA_ENLACE', idJornada + ' -> ' + disponibilidad + ' (' + jugador.nombre_completo + ')');
  } finally {
    lock.releaseLock();
  }

  var mensaje = disponibilidad === 'ME_APUNTO'
    ? '¡Perfecto, ' + (jugador.apodo || jugador.nombre) + '! Quedas apuntado/a a ' + notifTextoJornada(jornada) + '.'
    : 'Vale, ' + (jugador.apodo || jugador.nombre) + '. Quedas como no disponible para ' + notifTextoJornada(jornada) + '.';

  return paginaConfirmacion('Respuesta registrada', mensaje, true);
}

/** Página sencilla que se ve al hacer clic en el enlace del email, sin salir a la app. */
function paginaConfirmacion(titulo, mensaje, exito) {
  var color = exito ? '#2e7d32' : '#c62828';
  var icono = exito ? '✅' : '⚠️';
  var html = '<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<title>' + titulo + '</title>' +
    '<style>' +
    'body{font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;background:#f4f6f8;margin:0;padding:40px 20px;display:flex;justify-content:center;}' +
    '.tarjeta{background:#fff;border-radius:16px;padding:32px 24px;max-width:420px;width:100%;text-align:center;box-shadow:0 2px 12px rgba(0,0,0,0.08);}' +
    '.icono{font-size:48px;margin-bottom:12px;}' +
    'h1{font-size:20px;color:' + color + ';margin:0 0 12px;}' +
    'p{font-size:16px;color:#333;line-height:1.5;margin:0 0 24px;}' +
    'a.boton{display:inline-block;background:#1b5e20;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;}' +
    '</style></head><body>' +
    '<div class="tarjeta">' +
    '<div class="icono">' + icono + '</div>' +
    '<h1>' + titulo + '</h1>' +
    '<p>' + mensaje + '</p>' +
    '<a class="boton" href="' + NOTIF_APP_URL + '">Abrir la app</a>' +
    '</div></body></html>';
  return respuestaHtml(html);
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
