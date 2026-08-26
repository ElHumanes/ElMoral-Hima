/**
 * Gestión de usuarios (logins). Permite al capitán crear accesos para
 * jugadores y, sobre todo, dar de alta a un segundo (o tercer...) capitán
 * con exactamente los mismos permisos — incluido registrar resultados,
 * ya que cualquier acción que requiera "requerirCapitan" comprueba el rol,
 * no una persona concreta.
 */

var ROLES_VALIDOS = ['CAPITAN', 'JUGADOR'];

/**
 * Genera un nombre de usuario a partir del primer apellido (en minúsculas
 * y sin acentos, para que sea fácil de escribir). Si ya existe otro
 * usuario con ese mismo nombre, añade un número al final (ruiz, ruiz2...).
 */
function generarNombreUsuarioUnico(apellidos) {
  var primerApellido = (apellidos || '').trim().split(/\s+/)[0] || 'jugador';
  var base = primerApellido
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '') || 'jugador';

  var nombresExistentes = {};
  leerFilas('USUARIOS').forEach(function (u) { nombresExistentes[String(u.nombre_usuario).toLowerCase()] = true; });

  if (!nombresExistentes[base]) return base;

  var contador = 2;
  while (nombresExistentes[base + contador]) contador++;
  return base + contador;
}

/**
 * El propio jugador cambia su código de acceso (no requiere ser capitán,
 * solo estar identificado). No hace falta repetir el código actual: con la
 * sesión activa ya basta, igual que para el resto de cambios de "Editar mis datos".
 */
function cambiarMiCodigoAcceso(sesion, codigoNuevo) {
  if (!sesion.id_usuario) throw new Error('Sesión no válida.');
  var codigo = (codigoNuevo || '').trim();
  if (codigo.length < 4) throw new Error('El código de acceso debe tener al menos 4 caracteres.');

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    actualizarFila('USUARIOS', 'id_usuario', sesion.id_usuario, { codigo_acceso_hash: hashTexto(codigo) });
    registrarLog(sesion.id_usuario, 'CAMBIAR_CODIGO_ACCESO', 'Cambio de código propio');
  } finally {
    lock.releaseLock();
  }

  return { ok: true };
}

/**
 * El capitán restablece el código de acceso de un jugador (por si lo ha
 * perdido) al código temporal por defecto, para que pueda volver a entrar
 * y cambiarlo por uno propio.
 */
function restablecerCodigoAcceso(sesion, idJugador) {
  requerirCapitan(sesion);
  if (!idJugador) throw new Error('Falta el identificador del jugador.');

  var usuario = leerFilas('USUARIOS').filter(function (u) { return u.id_jugador === idJugador; })[0];
  if (!usuario) throw new Error('Ese jugador todavía no tiene ningún acceso creado.');

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    actualizarFila('USUARIOS', 'id_usuario', usuario.id_usuario, { codigo_acceso_hash: hashTexto(CODIGO_ACCESO_POR_DEFECTO) });
    registrarLog(sesion.id_usuario, 'RESTABLECER_CODIGO', usuario.nombre_usuario);
  } finally {
    lock.releaseLock();
  }

  return { ok: true, nombre_usuario: usuario.nombre_usuario, codigo_nuevo: CODIGO_ACCESO_POR_DEFECTO };
}

function listarUsuarios(sesion) {
  requerirCapitan(sesion);

  var jugadores = leerFilas('JUGADORES');
  var jugadorPorId = {};
  jugadores.forEach(function (j) { jugadorPorId[j.id_jugador] = j; });

  return leerFilas('USUARIOS').map(function (u) {
    var jugador = jugadorPorId[u.id_jugador];
    return {
      id_usuario: u.id_usuario,
      nombre_usuario: u.nombre_usuario,
      rol: u.rol,
      estado: u.estado,
      id_jugador: u.id_jugador || '',
      jugador_nombre: jugador ? (jugador.apodo || jugador.nombre_completo) : '',
      fecha_creacion: u.fecha_creacion,
      ultimo_acceso: u.ultimo_acceso
    };
  }).sort(function (a, b) { return a.nombre_usuario.localeCompare(b.nombre_usuario, 'es'); });
}

function crearUsuario(sesion, datos) {
  requerirCapitan(sesion);

  var nombreUsuario = (datos.nombre_usuario || '').trim();
  var codigoAcceso = (datos.codigo_acceso || '').trim();
  var rol = (datos.rol || '').trim();
  var idJugador = (datos.id_jugador || '').trim();

  if (!nombreUsuario) throw new Error('El nombre de usuario es obligatorio.');
  if (codigoAcceso.length < 4) throw new Error('El código de acceso debe tener al menos 4 caracteres.');
  if (ROLES_VALIDOS.indexOf(rol) === -1) throw new Error('El rol debe ser CAPITAN o JUGADOR.');

  var usuarios = leerFilas('USUARIOS');
  var yaExiste = usuarios.filter(function (u) {
    return u.nombre_usuario.toLowerCase() === nombreUsuario.toLowerCase();
  })[0];
  if (yaExiste) throw new Error('Ya existe un usuario con ese nombre.');

  if (idJugador) {
    var jugador = leerFilas('JUGADORES').filter(function (j) { return j.id_jugador === idJugador; })[0];
    if (!jugador) throw new Error('No se ha encontrado el jugador a vincular.');
    var yaVinculado = usuarios.filter(function (u) { return u.id_jugador === idJugador; })[0];
    if (yaVinculado) throw new Error('Ese jugador ya tiene un usuario asociado ("' + yaVinculado.nombre_usuario + '").');
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  var idUsuario;
  try {
    idUsuario = generarId();
    agregarFila('USUARIOS', {
      id_usuario: idUsuario,
      id_jugador: idJugador,
      nombre_usuario: nombreUsuario,
      rol: rol,
      codigo_acceso_hash: hashTexto(codigoAcceso),
      estado: 'ACTIVO',
      fecha_creacion: ahoraIso(),
      ultimo_acceso: ''
    });
    registrarLog(sesion.id_usuario, 'CREAR_USUARIO', nombreUsuario + ' (' + rol + ')');
  } finally {
    lock.releaseLock();
  }

  return { ok: true, id_usuario: idUsuario };
}

/**
 * Edita un usuario existente: rol, estado, jugador vinculado y, si se
 * indica un código de acceso nuevo, también lo cambia. Cualquier campo que
 * se deje vacío en "datos" no se toca.
 *
 * Protección importante: no se puede dejar el equipo sin ningún capitán
 * activo (ni degradando el rol ni desactivando al último que quede).
 */
function editarUsuario(sesion, datos) {
  requerirCapitan(sesion);

  var idUsuario = datos.id_usuario;
  if (!idUsuario) throw new Error('Falta el identificador del usuario.');

  var usuario = leerFilas('USUARIOS').filter(function (u) { return u.id_usuario === idUsuario; })[0];
  if (!usuario) throw new Error('No se ha encontrado ese usuario.');

  var cambios = {};

  if (datos.nombre_usuario) {
    var nuevoNombre = datos.nombre_usuario.trim();
    if (!nuevoNombre) throw new Error('El nombre de usuario no puede quedar vacío.');
    var conflicto = leerFilas('USUARIOS').filter(function (u) {
      return u.id_usuario !== idUsuario && u.nombre_usuario.toLowerCase() === nuevoNombre.toLowerCase();
    })[0];
    if (conflicto) throw new Error('Ya existe otro usuario con ese nombre.');
    cambios.nombre_usuario = nuevoNombre;
  }

  var rolNuevo = datos.rol ? datos.rol.trim() : usuario.rol;
  var estadoNuevo = datos.estado ? datos.estado.trim() : usuario.estado;

  if (datos.rol) {
    if (ROLES_VALIDOS.indexOf(rolNuevo) === -1) throw new Error('El rol debe ser CAPITAN o JUGADOR.');
    cambios.rol = rolNuevo;
  }
  if (datos.estado) {
    if (estadoNuevo !== 'ACTIVO' && estadoNuevo !== 'INACTIVO') throw new Error('Estado no válido.');
    cambios.estado = estadoNuevo;
  }

  var dejaDeSerCapitanActivo =
    usuario.rol === 'CAPITAN' && usuario.estado === 'ACTIVO' &&
    (rolNuevo !== 'CAPITAN' || estadoNuevo !== 'ACTIVO');

  if (dejaDeSerCapitanActivo) {
    var otrosCapitanes = leerFilas('USUARIOS').filter(function (u) {
      return u.id_usuario !== idUsuario && u.rol === 'CAPITAN' && u.estado === 'ACTIVO';
    });
    if (otrosCapitanes.length === 0) {
      throw new Error('No puedes quitar el rol o desactivar al único capitán activo. Da de alta a otro capitán primero.');
    }
  }

  if (datos.hasOwnProperty('id_jugador')) {
    var idJugador = (datos.id_jugador || '').trim();
    if (idJugador) {
      var jugador = leerFilas('JUGADORES').filter(function (j) { return j.id_jugador === idJugador; })[0];
      if (!jugador) throw new Error('No se ha encontrado el jugador a vincular.');
      var yaVinculado = leerFilas('USUARIOS').filter(function (u) {
        return u.id_usuario !== idUsuario && u.id_jugador === idJugador;
      })[0];
      if (yaVinculado) throw new Error('Ese jugador ya tiene otro usuario asociado ("' + yaVinculado.nombre_usuario + '").');
    }
    cambios.id_jugador = idJugador;
  }

  if (datos.codigo_acceso) {
    var codigoNuevo = datos.codigo_acceso.trim();
    if (codigoNuevo.length < 4) throw new Error('El código de acceso debe tener al menos 4 caracteres.');
    cambios.codigo_acceso_hash = hashTexto(codigoNuevo);
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    actualizarFila('USUARIOS', 'id_usuario', idUsuario, cambios);
    registrarLog(sesion.id_usuario, 'EDITAR_USUARIO', usuario.nombre_usuario);
  } finally {
    lock.releaseLock();
  }

  return { ok: true };
}
