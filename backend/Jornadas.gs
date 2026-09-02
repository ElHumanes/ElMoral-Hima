/**
 * Gestión de jornadas: alta y cambio de estado.
 * Solo el capitán puede modificar; cualquier usuario con sesión válida puede listar.
 */

var ESTADOS_JORNADA = [
  'PENDIENTE',
  'CONVOCATORIA_ABIERTA',
  'CONVOCATORIA_CERRADA',
  'SELECCIONANDO',
  'CONFIRMADA',
  'JUGADA',
  'FINALIZADA'
];

var LOCAL_VISITANTE_VALIDOS = ['LOCAL', 'VISITANTE'];

function listarJornadas() {
  var jornadas = leerFilas('JORNADAS').map(function (j) {
    return {
      id_jornada: j.id_jornada,
      id_temporada: j.id_temporada,
      fecha: j.fecha,
      rival: j.rival,
      local_visitante: j.local_visitante,
      lugar: j.lugar,
      estado: j.estado,
      observaciones: j.observaciones
    };
  });

  // Más recientes primero.
  jornadas.sort(function (a, b) {
    return String(b.fecha).localeCompare(String(a.fecha));
  });

  return jornadas;
}

function crearJornada(sesion, datos) {
  requerirCapitan(sesion);

  var fecha = (datos.fecha || '').trim();
  var rival = (datos.rival || '').trim();
  var localVisitante = (datos.local_visitante || '').trim();
  var lugar = (datos.lugar || '').trim();
  var observaciones = (datos.observaciones || '').trim();

  if (!fecha) throw new Error('La fecha es obligatoria.');
  if (!rival) throw new Error('El rival es obligatorio.');
  if (LOCAL_VISITANTE_VALIDOS.indexOf(localVisitante) === -1) {
    throw new Error('Indica si el partido es LOCAL o VISITANTE.');
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  var idJornada;
  try {
    idJornada = generarId();
    agregarFila('JORNADAS', {
      id_jornada: idJornada,
      id_temporada: obtenerOCrearTemporadaActual(),
      fecha: fecha,
      rival: rival,
      local_visitante: localVisitante,
      lugar: lugar,
      estado: 'PENDIENTE',
      observaciones: observaciones
    });
    registrarLog(sesion.id_usuario, 'CREAR_JORNADA', 'vs ' + rival + ' (' + fecha + ')');
  } finally {
    lock.releaseLock();
  }

  return { ok: true, id_jornada: idJornada };
}

/**
 * Corrige los datos de una jornada ya creada (fecha, rival, lugar...). No
 * toca su estado ni nada relacionado con la convocatoria — para eso está
 * cambiarEstadoJornada.
 */
function editarJornada(sesion, datos) {
  requerirCapitan(sesion);

  var idJornada = datos.id_jornada;
  if (!idJornada) throw new Error('Falta el identificador de la jornada.');

  var fecha = (datos.fecha || '').trim();
  var rival = (datos.rival || '').trim();
  var localVisitante = (datos.local_visitante || '').trim();
  var lugar = (datos.lugar || '').trim();
  var observaciones = (datos.observaciones || '').trim();

  if (!fecha) throw new Error('La fecha es obligatoria.');
  if (!rival) throw new Error('El rival es obligatorio.');
  if (LOCAL_VISITANTE_VALIDOS.indexOf(localVisitante) === -1) {
    throw new Error('Indica si el partido es LOCAL o VISITANTE.');
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  var actualizado;
  try {
    actualizado = actualizarFila('JORNADAS', 'id_jornada', idJornada, {
      fecha: fecha,
      rival: rival,
      local_visitante: localVisitante,
      lugar: lugar,
      observaciones: observaciones
    });
    if (actualizado) {
      registrarLog(sesion.id_usuario, 'EDITAR_JORNADA', 'vs ' + rival + ' (' + fecha + ')');
    }
  } finally {
    lock.releaseLock();
  }

  if (!actualizado) throw new Error('No se ha encontrado esa jornada.');
  return { ok: true };
}

/**
 * Borra una jornada por completo, junto con todo lo que dependía de ella
 * (convocatoria, selección, parejas, partidos y resultados) para no dejar
 * datos sueltos. Pensada para corregir un error (jornada duplicada, de
 * prueba...), no para el uso normal — por eso el frontend pide confirmación
 * antes de llamarla.
 */
function eliminarJornada(sesion, idJornada) {
  requerirCapitan(sesion);
  if (!idJornada) throw new Error('Falta el identificador de la jornada.');

  var jornada = leerFilas('JORNADAS').filter(function (j) { return j.id_jornada === idJornada; })[0];
  if (!jornada) throw new Error('No se ha encontrado esa jornada.');

  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var idsPartidos = leerFilas('PARTIDOS')
      .filter(function (p) { return p.id_jornada === idJornada; })
      .map(function (p) { return p.id_partido; });

    idsPartidos.forEach(function (idPartido) {
      eliminarFilas('RESULTADOS', 'id_partido', idPartido);
    });
    eliminarFilas('PARTIDOS', 'id_jornada', idJornada);
    eliminarFilas('PAREJAS', 'id_jornada', idJornada);
    eliminarFilas('SELECCIONADOS', 'id_jornada', idJornada);
    eliminarFilas('CONVOCATORIAS', 'id_jornada', idJornada);
    eliminarFilas('JORNADAS', 'id_jornada', idJornada);

    registrarLog(sesion.id_usuario, 'ELIMINAR_JORNADA', 'vs ' + jornada.rival + ' (' + jornada.fecha + ')');
  } finally {
    lock.releaseLock();
  }

  return { ok: true };
}

function cambiarEstadoJornada(sesion, idJornada, nuevoEstado) {
  requerirCapitan(sesion);

  if (!idJornada) throw new Error('Falta el identificador de la jornada.');
  if (ESTADOS_JORNADA.indexOf(nuevoEstado) === -1) {
    throw new Error('Estado de jornada no válido.');
  }

  var jornadaAntes = leerFilas('JORNADAS').filter(function (j) { return j.id_jornada === idJornada; })[0];

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  var actualizado;
  try {
    var cambios = { estado: nuevoEstado };
    if (nuevoEstado === 'CONVOCATORIA_ABIERTA') {
      // Se guarda cuándo se abrió, para poder mandar el recordatorio a los
      // pocos días, y se resetea por si esta jornada ya tuvo una convocatoria
      // abierta antes (poco probable, pero así no se salta el recordatorio).
      cambios.fecha_apertura_convocatoria = ahoraIso();
      cambios.recordatorio_enviado = '';
    }
    actualizado = actualizarFila('JORNADAS', 'id_jornada', idJornada, cambios);
    if (actualizado) {
      registrarLog(sesion.id_usuario, 'CAMBIAR_ESTADO_JORNADA', idJornada + ' -> ' + nuevoEstado);
    }
  } finally {
    lock.releaseLock();
  }

  if (!actualizado) throw new Error('No se ha encontrado esa jornada.');

  if (nuevoEstado === 'CONVOCATORIA_ABIERTA' && jornadaAntes) {
    try {
      enviarAvisoConvocatoriaAbierta(jornadaAntes);
    } catch (err) {
      Logger.log('No se han podido enviar los avisos de convocatoria abierta: ' + err.message);
    }
  }

  return { ok: true };
}
