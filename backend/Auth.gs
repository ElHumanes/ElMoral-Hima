/**
 * Autenticación: login por usuario + código de acceso, sesiones por token,
 * y utilidades de prueba para comprobar que todo funciona desde el propio
 * editor de Apps Script (sin necesitar todavía el frontend).
 */

var DIAS_CADUCIDAD_SESION = 30;

/** Código de acceso con el que se crea (o restablece) automáticamente el usuario de un jugador. */
var CODIGO_ACCESO_POR_DEFECTO = '12345678';

/**
 * Login. Recibe el nombre de usuario y el código de acceso en texto plano
 * (tal como lo escribe el jugador), y devuelve un token de sesión si es correcto.
 */
function login(nombreUsuario, codigoAcceso) {
  if (!nombreUsuario || !codigoAcceso) {
    return { ok: false, error: 'Usuario y código son obligatorios.' };
  }

  var usuarios = leerFilas('USUARIOS');
  var usuario = usuarios.filter(function (u) {
    return String(u.nombre_usuario).toLowerCase() === String(nombreUsuario).toLowerCase();
  })[0];

  if (!usuario) {
    return { ok: false, error: 'Usuario o código incorrecto.' };
  }
  if (usuario.estado !== 'ACTIVO') {
    return { ok: false, error: 'Este usuario está desactivado. Habla con el capitán.' };
  }
  if (hashTexto(codigoAcceso) !== usuario.codigo_acceso_hash) {
    return { ok: false, error: 'Usuario o código incorrecto.' };
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var token = generarId();
    var ahora = new Date();
    var caduca = new Date(ahora.getTime() + DIAS_CADUCIDAD_SESION * 24 * 60 * 60 * 1000);

    // Aprovechamos cada login para borrar las sesiones ya caducadas de este
    // mismo usuario: si no, la pestaña SESIONES solo crece (cada inicio de
    // sesión añadía una fila que nunca se borraba) y eso hace más lenta
    // cada comprobación de sesión con el tiempo.
    leerFilas('SESIONES')
      .filter(function (s) { return s.id_usuario === usuario.id_usuario && new Date(s.fecha_expiracion).getTime() < ahora.getTime(); })
      .forEach(function (s) { eliminarFilas('SESIONES', 'token', s.token); });

    agregarFila('SESIONES', {
      token: token,
      id_usuario: usuario.id_usuario,
      fecha_creacion: ahora.toISOString(),
      fecha_expiracion: caduca.toISOString()
    });

    actualizarFila('USUARIOS', 'id_usuario', usuario.id_usuario, {
      ultimo_acceso: ahora.toISOString()
    });

    registrarLog(usuario.id_usuario, 'LOGIN', 'Inicio de sesión de ' + usuario.nombre_usuario);
  } finally {
    lock.releaseLock();
  }

  return {
    ok: true,
    token: token,
    rol: usuario.rol,
    id_usuario: usuario.id_usuario,
    id_jugador: usuario.id_jugador,
    nombre_usuario: usuario.nombre_usuario
  };
}

/**
 * Comprueba que un token de sesión es válido y no ha caducado.
 * Devuelve los datos del usuario, o null si el token no es válido.
 */
function validarSesion(token) {
  if (!token) return null;

  var sesiones = leerFilas('SESIONES');
  var sesion = sesiones.filter(function (s) { return s.token === token; })[0];
  if (!sesion) return null;

  var caduca = new Date(sesion.fecha_expiracion);
  if (caduca.getTime() < Date.now()) return null;

  var usuarios = leerFilas('USUARIOS');
  var usuario = usuarios.filter(function (u) { return u.id_usuario === sesion.id_usuario; })[0];
  if (!usuario || usuario.estado !== 'ACTIVO') return null;

  return {
    id_usuario: usuario.id_usuario,
    id_jugador: usuario.id_jugador,
    rol: usuario.rol,
    nombre_usuario: usuario.nombre_usuario
  };
}

/** Invalida una sesión (logout) adelantando su fecha de caducidad a ahora mismo. */
function logout(token) {
  if (!token) return { ok: false, error: 'Falta el token.' };
  actualizarFila('SESIONES', 'token', token, { fecha_expiracion: ahoraIso() });
  return { ok: true };
}

/** Como validarSesion(), pero lanza un error si no hay sesión válida (para usar en el router). */
function requerirSesionValida(token) {
  var sesion = validarSesion(token);
  if (!sesion) throw new Error('Sesión no válida o caducada. Vuelve a iniciar sesión.');
  return sesion;
}

/** Lanza un error si la sesión no pertenece a un capitán. Úsalo al principio de cada acción de gestión. */
function requerirCapitan(sesion) {
  if (!sesion) throw new Error('Sesión no válida. Vuelve a iniciar sesión.');
  if (sesion.rol !== 'CAPITAN') throw new Error('Esta acción solo puede realizarla el capitán.');
}

function registrarLog(idUsuario, accion, detalle) {
  agregarFila('LOG', {
    id_log: generarId(),
    fecha: ahoraIso(),
    id_usuario: idUsuario || '',
    accion: accion,
    detalle: detalle || ''
  });
}

/* ========================================================================
 * FUNCIONES DE CONFIGURACIÓN Y PRUEBA — se ejecutan a mano UNA VEZ desde
 * el editor de Apps Script (menú desplegable de funciones > Ejecutar),
 * nunca desde el frontend.
 * ==================================================================== */

/**
 * PASO 1 de la prueba: comprueba que el proyecto está conectado a la
 * hoja de cálculo correcta. Mira el "Registro de ejecución" después de
 * ejecutarla: debe decir "Conexión OK" y el nombre de tu archivo.
 */
function testConexion() {
  var ss = getSpreadsheet();
  Logger.log('Conexión OK. Archivo: ' + ss.getName());
  Logger.log('Pestañas encontradas: ' + ss.getSheets().map(function (s) { return s.getName(); }).join(', '));
}

/**
 * PASO 2 de la prueba: crea el primer usuario CAPITÁN, solo si la pestaña
 * USUARIOS está todavía vacía (así puedes ejecutar esta función más de una
 * vez sin peligro de duplicar usuarios).
 *
 * Cambia 'capitan' y '1234' por el usuario y código que prefieras antes
 * de ejecutarla, o dime que quieres otro y te doy la versión ajustada.
 */
function crearPrimerCapitan() {
  var nombreUsuario = 'capitan';
  var codigoAcceso = '1234';

  var usuariosExistentes = leerFilas('USUARIOS');
  if (usuariosExistentes.length > 0) {
    Logger.log('Ya hay usuarios en la hoja USUARIOS. No se ha creado ninguno para evitar duplicados.');
    return;
  }

  var idUsuario = generarId();
  agregarFila('USUARIOS', {
    id_usuario: idUsuario,
    id_jugador: '',
    nombre_usuario: nombreUsuario,
    rol: 'CAPITAN',
    codigo_acceso_hash: hashTexto(codigoAcceso),
    estado: 'ACTIVO',
    fecha_creacion: ahoraIso(),
    ultimo_acceso: ''
  });

  Logger.log('Capitán creado. Usuario: "' + nombreUsuario + '"  Código: "' + codigoAcceso + '"');
  Logger.log('Apúntalos, los necesitarás para entrar en la app. Puedes cambiarlos luego desde la propia app.');
}

/**
 * PASO 3 de la prueba: hace un login de prueba con el capitán recién creado
 * y comprueba que se genera un token y que validarSesion lo reconoce.
 */
function probarLogin() {
  var resultado = login('capitan', '1234');
  Logger.log('Resultado de login: ' + JSON.stringify(resultado));

  if (resultado.ok) {
    var sesion = validarSesion(resultado.token);
    Logger.log('Sesión validada: ' + JSON.stringify(sesion));
  }
}
