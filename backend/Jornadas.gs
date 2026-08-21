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

  jornadas.sort(function (a, b) {
    return String(a.fecha).localeCompare(String(b.fecha));
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

function cambiarEstadoJornada(sesion, idJornada, nuevoEstado) {
  requerirCapitan(sesion);

  if (!idJornada) throw new Error('Falta el identificador de la jornada.');
  if (ESTADOS_JORNADA.indexOf(nuevoEstado) === -1) {
    throw new Error('Estado de jornada no válido.');
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  var actualizado;
  try {
    actualizado = actualizarFila('JORNADAS', 'id_jornada', idJornada, { estado: nuevoEstado });
    if (actualizado) {
      registrarLog(sesion.id_usuario, 'CAMBIAR_ESTADO_JORNADA', idJornada + ' -> ' + nuevoEstado);
    }
  } finally {
    lock.releaseLock();
  }

  if (!actualizado) throw new Error('No se ha encontrado esa jornada.');
  return { ok: true };
}
