/**
 * Gestión de jugadores: alta, edición y activar/desactivar.
 * Solo el capitán puede modificar; cualquier usuario con sesión válida puede listar.
 */

var POSICIONES_VALIDAS = ['DERECHA', 'REVÉS'];

/**
 * Valida principal/secundaria con las reglas nuevas: el jugador elige una
 * posición principal (Derecha o Revés) y, si juega también en el otro lado,
 * la secundaria solo puede ser la contraria. Ya no existe "Ambas".
 */
function validarPosiciones(posicionPrincipal, posicionSecundaria) {
  if (POSICIONES_VALIDAS.indexOf(posicionPrincipal) === -1) {
    throw new Error('La posición principal debe ser Derecha o Revés.');
  }
  if (posicionSecundaria) {
    if (POSICIONES_VALIDAS.indexOf(posicionSecundaria) === -1) {
      throw new Error('La posición secundaria debe ser Derecha, Revés, o estar vacía.');
    }
    if (posicionSecundaria === posicionPrincipal) {
      throw new Error('La posición secundaria tiene que ser la contraria a la principal.');
    }
  }
}

function listarJugadores() {
  return leerFilas('JUGADORES').map(function (j) {
    return {
      id_jugador: j.id_jugador,
      nombre: j.nombre,
      apellidos: j.apellidos,
      nombre_completo: j.nombre_completo,
      apodo: j.apodo,
      posicion_principal: j.posicion_principal,
      posicion_secundaria: j.posicion_secundaria,
      puntuacion: j.puntuacion,
      estado: j.estado,
      id_temporada: j.id_temporada,
      fecha_alta: j.fecha_alta,
      foto_url: j.foto_url || ''
    };
  });
}

function crearJugador(sesion, datos) {
  requerirCapitan(sesion);

  var nombre = (datos.nombre || '').trim();
  var apellidos = (datos.apellidos || '').trim();
  var apodo = (datos.apodo || '').trim();
  var posicionPrincipal = (datos.posicion_principal || '').trim();
  var posicionSecundaria = (datos.posicion_secundaria || '').trim();
  var puntuacion = Number(datos.puntuacion);

  if (!nombre) throw new Error('El nombre es obligatorio.');
  if (!apellidos) throw new Error('Los apellidos son obligatorios.');
  validarPosiciones(posicionPrincipal, posicionSecundaria);
  if (isNaN(puntuacion) || puntuacion < 0) {
    throw new Error('La puntuación debe ser un número igual o mayor que 0.');
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  var idJugador;
  try {
    idJugador = generarId();
    agregarFila('JUGADORES', {
      id_jugador: idJugador,
      nombre: nombre,
      apellidos: apellidos,
      nombre_completo: nombre + ' ' + apellidos,
      apodo: apodo,
      posicion_principal: posicionPrincipal,
      posicion_secundaria: posicionSecundaria,
      puntuacion: puntuacion,
      estado: 'ACTIVO',
      id_temporada: obtenerOCrearTemporadaActual(),
      fecha_alta: ahoraIso()
    });
    registrarLog(sesion.id_usuario, 'CREAR_JUGADOR', nombre + ' ' + apellidos);
  } finally {
    lock.releaseLock();
  }

  return { ok: true, id_jugador: idJugador };
}

function editarJugador(sesion, datos) {
  requerirCapitan(sesion);

  var idJugador = datos.id_jugador;
  if (!idJugador) throw new Error('Falta el identificador del jugador.');

  var nombre = (datos.nombre || '').trim();
  var apellidos = (datos.apellidos || '').trim();
  var apodo = (datos.apodo || '').trim();
  var posicionPrincipal = (datos.posicion_principal || '').trim();
  var posicionSecundaria = (datos.posicion_secundaria || '').trim();
  var puntuacion = Number(datos.puntuacion);

  if (!nombre) throw new Error('El nombre es obligatorio.');
  if (!apellidos) throw new Error('Los apellidos son obligatorios.');
  validarPosiciones(posicionPrincipal, posicionSecundaria);
  if (isNaN(puntuacion) || puntuacion < 0) {
    throw new Error('La puntuación debe ser un número igual o mayor que 0.');
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  var actualizado;
  try {
    actualizado = actualizarFila('JUGADORES', 'id_jugador', idJugador, {
      nombre: nombre,
      apellidos: apellidos,
      nombre_completo: nombre + ' ' + apellidos,
      apodo: apodo,
      posicion_principal: posicionPrincipal,
      posicion_secundaria: posicionSecundaria,
      puntuacion: puntuacion
    });
    if (actualizado) {
      registrarLog(sesion.id_usuario, 'EDITAR_JUGADOR', nombre + ' ' + apellidos);
    }
  } finally {
    lock.releaseLock();
  }

  if (!actualizado) throw new Error('No se ha encontrado ese jugador.');
  return { ok: true };
}

/**
 * El propio jugador corrige sus datos (no requiere ser capitán). Solo puede
 * tocar su propia ficha, y solo los campos que le pertenecen a él: no puede
 * cambiar su puntuación ni su estado, eso lo sigue decidiendo el capitán.
 */
function editarPerfilPropio(sesion, datos) {
  if (!sesion.id_jugador) {
    throw new Error('Tu usuario no tiene una ficha de jugador asociada. Habla con el capitán.');
  }

  var nombre = (datos.nombre || '').trim();
  var apellidos = (datos.apellidos || '').trim();
  var apodo = (datos.apodo || '').trim();
  var posicionPrincipal = (datos.posicion_principal || '').trim();
  var posicionSecundaria = (datos.posicion_secundaria || '').trim();

  if (!nombre) throw new Error('El nombre es obligatorio.');
  if (!apellidos) throw new Error('Los apellidos son obligatorios.');
  validarPosiciones(posicionPrincipal, posicionSecundaria);

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  var actualizado;
  try {
    actualizado = actualizarFila('JUGADORES', 'id_jugador', sesion.id_jugador, {
      nombre: nombre,
      apellidos: apellidos,
      nombre_completo: nombre + ' ' + apellidos,
      apodo: apodo,
      posicion_principal: posicionPrincipal,
      posicion_secundaria: posicionSecundaria
    });
    if (actualizado) {
      registrarLog(sesion.id_usuario, 'EDITAR_PERFIL_PROPIO', nombre + ' ' + apellidos);
    }
  } finally {
    lock.releaseLock();
  }

  if (!actualizado) throw new Error('No se ha encontrado tu ficha de jugador.');
  return { ok: true };
}

function cambiarEstadoJugador(sesion, idJugador, nuevoEstado) {
  requerirCapitan(sesion);

  if (!idJugador) throw new Error('Falta el identificador del jugador.');
  if (nuevoEstado !== 'ACTIVO' && nuevoEstado !== 'INACTIVO') {
    throw new Error('Estado no válido.');
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  var actualizado;
  try {
    actualizado = actualizarFila('JUGADORES', 'id_jugador', idJugador, { estado: nuevoEstado });
    if (actualizado) {
      registrarLog(sesion.id_usuario, 'CAMBIAR_ESTADO_JUGADOR', idJugador + ' -> ' + nuevoEstado);
    }
  } finally {
    lock.releaseLock();
  }

  if (!actualizado) throw new Error('No se ha encontrado ese jugador.');
  return { ok: true };
}

/**
 * Devuelve el ID de la temporada activa (CONFIG.TEMPORADA_ACTUAL). Si todavía
 * no hay ninguna configurada, crea automáticamente la temporada en curso.
 */
function obtenerOCrearTemporadaActual() {
  var config = leerFilas('CONFIG');
  var filaConfig = config.filter(function (c) { return c.clave === 'TEMPORADA_ACTUAL'; })[0];

  if (filaConfig && filaConfig.valor) {
    return filaConfig.valor;
  }

  var idTemporada = generarId();
  var anio = new Date().getFullYear();
  var mes = new Date().getMonth() + 1; // 1-12
  // Una temporada de pádel suele ir de verano a verano: si estamos en la
  // segunda mitad del año, la temporada es "esteAño/siguiente".
  var nombreTemporada = mes >= 7
    ? anio + '/' + String(anio + 1).slice(-2)
    : (anio - 1) + '/' + String(anio).slice(-2);

  agregarFila('TEMPORADAS', {
    id_temporada: idTemporada,
    nombre: nombreTemporada,
    fecha_inicio: '',
    fecha_fin: '',
    estado: 'ACTIVA'
  });

  actualizarFila('CONFIG', 'clave', 'TEMPORADA_ACTUAL', { valor: idTemporada });

  return idTemporada;
}

/**
 * Mantenimiento: se ejecuta UNA VEZ a mano desde el editor de Apps Script
 * (seleccionar esta función y pulsar "Ejecutar") para corregir jugadores
 * que tenían "AMBAS" guardado de cuando ese valor todavía existía. A partir
 * de ahora solo hay Derecha/Revés, y quien juega los dos lados lo expresa
 * con principal + secundaria (la contraria).
 */
function migrarPosicionesAmbas(sesion) {
  if (sesion) requerirCapitan(sesion);
  var jugadores = leerFilas('JUGADORES');
  var corregidos = 0;

  jugadores.forEach(function (j) {
    var principal = j.posicion_principal;
    var secundaria = j.posicion_secundaria;
    var cambios = null;

    if (principal === 'AMBAS') {
      cambios = { posicion_principal: 'DERECHA', posicion_secundaria: 'REVÉS' };
    } else if (secundaria === 'AMBAS') {
      var contraria = principal === 'DERECHA' ? 'REVÉS' : 'DERECHA';
      cambios = { posicion_secundaria: contraria };
    }

    if (cambios) {
      actualizarFila('JUGADORES', 'id_jugador', j.id_jugador, cambios);
      corregidos++;
    }
  });

  Logger.log('Jugadores corregidos: ' + corregidos);
  return corregidos;
}

/**
 * Mantenimiento: borra TODOS los datos de prueba (jugadores, jornadas,
 * convocatorias, selecciones, parejas, partidos, resultados, usuarios y
 * sesiones) y da de alta la plantilla real del equipo, con un único
 * capitán. Pensada para ejecutarse UNA SOLA VEZ al pasar de la demo a
 * producción. Posición y puntuación se dejan con un valor por defecto
 * (Derecha / 0) porque no se conocen todavía; el capitán las corrige luego
 * jugador a jugador desde "Jugadores".
 */
function resetearDatosYCargarEquipoReal(sesion, jugadores, capitan) {
  requerirCapitan(sesion);

  if (!Array.isArray(jugadores) || jugadores.length === 0) {
    throw new Error('Falta la lista de jugadores.');
  }
  jugadores.forEach(function (j) {
    if (!j.nombre || !j.apellidos) throw new Error('Cada jugador necesita nombre y apellidos.');
  });
  if (!capitan || !capitan.nombre_usuario || !capitan.codigo_acceso) {
    throw new Error('Faltan los datos de acceso del capitán.');
  }
  if (capitan.codigo_acceso.length < 4) {
    throw new Error('El código de acceso del capitán debe tener al menos 4 caracteres.');
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    ['SELECCIONADOS', 'PAREJAS', 'PARTIDOS', 'RESULTADOS', 'CONVOCATORIAS', 'JORNADAS', 'JUGADORES', 'USUARIOS', 'SESIONES']
      .forEach(function (hoja) { vaciarHoja(hoja); });

    var idTemporada = obtenerOCrearTemporadaActual();
    var idJugadorCapitan = '';

    jugadores.forEach(function (j) {
      var idJugador = generarId();
      agregarFila('JUGADORES', {
        id_jugador: idJugador,
        nombre: j.nombre,
        apellidos: j.apellidos,
        nombre_completo: j.nombre + ' ' + j.apellidos,
        apodo: '',
        posicion_principal: 'DERECHA',
        posicion_secundaria: '',
        puntuacion: 0,
        estado: 'ACTIVO',
        id_temporada: idTemporada,
        fecha_alta: ahoraIso()
      });
      if (j.es_capitan) idJugadorCapitan = idJugador;
    });

    agregarFila('USUARIOS', {
      id_usuario: generarId(),
      id_jugador: idJugadorCapitan,
      nombre_usuario: capitan.nombre_usuario,
      rol: 'CAPITAN',
      codigo_acceso_hash: hashTexto(capitan.codigo_acceso),
      estado: 'ACTIVO',
      fecha_creacion: ahoraIso(),
      ultimo_acceso: ''
    });

    registrarLog(sesion.id_usuario, 'RESET_DATOS_EQUIPO_REAL', jugadores.length + ' jugadores reales cargados');
  } finally {
    lock.releaseLock();
  }

  return { ok: true, jugadores_creados: jugadores.length };
}
