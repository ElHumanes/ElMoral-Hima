/**
 * Frontend: login, sesión guardada en localStorage, pantalla de inicio y
 * gestión de jugadores (Fase 4). Habla con el backend de Apps Script a
 * través de una única función llamarApi().
 */

var CONFIG = {
  API_URL: 'https://script.google.com/macros/s/AKfycbyNesOIcXqUElt02t1eCSDdTJSJwcQN6Rr_lnUgpz2rjibh1qHHrLRPwQdciWANpXhj/exec',
  CLAVE_TOKEN: 'padel_app_token'
};

var POSICIONES_TEXTO = {
  DERECHA: 'Derecha',
  'REVÉS': 'Revés',
  AMBAS: 'Ambas'
};

var COMPATIBILIDAD_TEXTO = {
  BUENA: '✓ Buena',
  REGULAR: '⚠ Regular',
  MALA: '❌ Mala'
};

var COMPATIBILIDAD_CLASE = {
  BUENA: 'insignia-compat-buena',
  REGULAR: 'insignia-compat-regular',
  MALA: 'insignia-compat-mala'
};

/**
 * Devuelve un elemento <img> con la foto del jugador, o un círculo con su
 * inicial si todavía no tiene foto (o si la foto no llega a cargar).
 * `jugador` puede traer nombre/apodo/nombre_completo, lo que haya.
 */
function crearAvatar(jugador, claseTamano) {
  var nombreParaInicial = (jugador && (jugador.apodo || jugador.nombre || jugador.nombre_completo)) || '?';
  var inicial = nombreParaInicial.trim().charAt(0).toUpperCase() || '?';

  if (jugador && jugador.foto_url) {
    var img = document.createElement('img');
    img.className = 'avatar ' + (claseTamano || 'avatar-mediano');
    img.src = jugador.foto_url;
    img.alt = '';
    img.referrerPolicy = 'no-referrer';
    img.onerror = function () {
      img.replaceWith(crearAvatarInicial(inicial, claseTamano));
    };
    return img;
  }
  return crearAvatarInicial(inicial, claseTamano);
}

function crearAvatarInicial(inicial, claseTamano) {
  var div = document.createElement('div');
  div.className = 'avatar avatar-inicial ' + (claseTamano || 'avatar-mediano');
  div.textContent = inicial;
  return div;
}

/** Construye el bloque "avatar + nombre1 + avatar + nombre2" que se repite en parejas y partidos. */
function crearParJugadores(jugadorA, jugadorB) {
  var frag = document.createDocumentFragment();
  frag.appendChild(crearAvatar(jugadorA, 'avatar-pequeno'));
  var nombreA = document.createElement('span');
  nombreA.textContent = jugadorA.apodo || jugadorA.nombre_completo;
  frag.appendChild(nombreA);

  var mas = document.createElement('span');
  mas.textContent = '+';
  frag.appendChild(mas);

  frag.appendChild(crearAvatar(jugadorB, 'avatar-pequeno'));
  var nombreB = document.createElement('span');
  nombreB.textContent = jugadorB.apodo || jugadorB.nombre_completo;
  frag.appendChild(nombreB);

  return frag;
}

var ESTADOS_JORNADA_TEXTO = {
  PENDIENTE: 'Pendiente',
  CONVOCATORIA_ABIERTA: 'Convocatoria abierta',
  CONVOCATORIA_CERRADA: 'Convocatoria cerrada',
  SELECCIONANDO: 'Seleccionando',
  CONFIRMADA: 'Confirmada',
  JUGADA: 'Jugada',
  FINALIZADA: 'Finalizada'
};

/** Datos de la sesión actual en memoria (incluye id_jugador, no solo lo que se guarda en localStorage). */
var sesionActual = null;

/**
 * Llama a una acción del backend. Se envía siempre como POST con el cuerpo
 * en texto plano conteniendo JSON (evita problemas de CORS con Apps Script).
 */
function llamarApi(action, params) {
  var cuerpo = Object.assign({ action: action }, params || {});
  return fetch(CONFIG.API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(cuerpo)
  }).then(function (resp) {
    return resp.json();
  });
}

function mostrarVista(idVista) {
  document.querySelectorAll('.vista').forEach(function (v) {
    v.classList.add('oculto');
  });
  document.getElementById(idVista).classList.remove('oculto');
}

function guardarSesion(datos) {
  localStorage.setItem(CONFIG.CLAVE_TOKEN, JSON.stringify(datos));
}

function obtenerSesionGuardada() {
  var texto = localStorage.getItem(CONFIG.CLAVE_TOKEN);
  return texto ? JSON.parse(texto) : null;
}

function borrarSesionGuardada() {
  localStorage.removeItem(CONFIG.CLAVE_TOKEN);
}

function mostrarInicio(datosUsuario) {
  sesionActual = datosUsuario;

  document.getElementById('texto-nombre-usuario').textContent = datosUsuario.nombre_usuario;
  document.getElementById('etiqueta-rol').textContent = datosUsuario.rol;
  document.getElementById('menu-capitan').classList.toggle('oculto', datosUsuario.rol !== 'CAPITAN');
  document.getElementById('menu-jugador').classList.toggle('oculto', datosUsuario.rol !== 'JUGADOR');
  mostrarVista('vista-inicio');

  document.getElementById('tarjeta-convocatoria-jugador').classList.add('oculto');
  if (datosUsuario.rol === 'JUGADOR') {
    comprobarConvocatoriaAbiertaParaJugador();
  }
}

/** Comprueba al cargar la página si ya había una sesión guardada y sigue siendo válida. */
function comprobarSesionAlCargar() {
  var guardada = obtenerSesionGuardada();
  if (!guardada || !guardada.token) {
    mostrarVista('vista-login');
    return;
  }

  llamarApi('validarSesion', { token: guardada.token }).then(function (resultado) {
    if (resultado.ok) {
      mostrarInicio(resultado.sesion);
    } else {
      borrarSesionGuardada();
      mostrarVista('vista-login');
    }
  }).catch(function () {
    // Sin conexión o error de red: dejamos intentar login manual en vez de bloquear.
    mostrarVista('vista-login');
  });
}

function manejarEnvioLogin(evento) {
  evento.preventDefault();

  var nombreUsuario = document.getElementById('campo-usuario').value.trim();
  var codigoAcceso = document.getElementById('campo-codigo').value.trim();
  var botonLogin = document.getElementById('boton-login');
  var mensajeError = document.getElementById('mensaje-error-login');

  mensajeError.classList.add('oculto');
  botonLogin.disabled = true;
  botonLogin.textContent = 'Entrando...';

  llamarApi('login', { nombreUsuario: nombreUsuario, codigoAcceso: codigoAcceso })
    .then(function (resultado) {
      if (resultado.ok) {
        guardarSesion({
          token: resultado.token,
          rol: resultado.rol,
          nombre_usuario: resultado.nombre_usuario,
          id_usuario: resultado.id_usuario,
          id_jugador: resultado.id_jugador
        });
        mostrarInicio(resultado);
      } else {
        mensajeError.textContent = resultado.error || 'No se ha podido iniciar sesión.';
        mensajeError.classList.remove('oculto');
      }
    })
    .catch(function () {
      mensajeError.textContent = 'No se ha podido conectar con el servidor. Comprueba tu conexión.';
      mensajeError.classList.remove('oculto');
    })
    .finally(function () {
      botonLogin.disabled = false;
      botonLogin.textContent = 'Entrar';
    });
}

function manejarLogout() {
  var guardada = obtenerSesionGuardada();
  borrarSesionGuardada();
  mostrarVista('vista-login');
  document.getElementById('formulario-login').reset();

  if (guardada && guardada.token) {
    llamarApi('logout', { token: guardada.token });
  }
}

/* ==========================================================================
 * JUGADORES
 * ======================================================================= */

var jugadoresCache = [];

function irAVistaJugadores() {
  mostrarVista('vista-jugadores');
  cargarJugadores();
}

function cargarJugadores() {
  var guardada = obtenerSesionGuardada();
  var contenedor = document.getElementById('lista-jugadores');
  var mensaje = document.getElementById('mensaje-jugadores');
  mensaje.classList.add('oculto');
  contenedor.innerHTML = '<p class="texto-vacio">Cargando jugadores...</p>';

  llamarApi('listarJugadores', { token: guardada.token })
    .then(function (resultado) {
      if (!resultado.ok) {
        throw new Error(resultado.error || 'No se han podido cargar los jugadores.');
      }
      jugadoresCache = resultado.jugadores;
      pintarJugadores(jugadoresCache);
    })
    .catch(function (error) {
      contenedor.innerHTML = '';
      mensaje.textContent = error.message || 'No se ha podido conectar con el servidor.';
      mensaje.classList.remove('oculto');
    });
}

function pintarJugadores(jugadores) {
  var contenedor = document.getElementById('lista-jugadores');

  if (jugadores.length === 0) {
    contenedor.innerHTML = '<p class="texto-vacio">Todavía no hay jugadores. Pulsa "+ Nuevo jugador" para dar de alta al primero.</p>';
    return;
  }

  // Activos primero, luego por nombre.
  var ordenados = jugadores.slice().sort(function (a, b) {
    if (a.estado !== b.estado) return a.estado === 'ACTIVO' ? -1 : 1;
    return a.nombre_completo.localeCompare(b.nombre_completo, 'es');
  });

  contenedor.innerHTML = '';
  ordenados.forEach(function (jugador) {
    contenedor.appendChild(crearTarjetaJugador(jugador));
  });
}

function crearTarjetaJugador(jugador) {
  var tarjeta = document.createElement('div');
  tarjeta.className = 'jugador-tarjeta';

  var posicionSecundaria = jugador.posicion_secundaria
    ? ' / ' + (POSICIONES_TEXTO[jugador.posicion_secundaria] || jugador.posicion_secundaria)
    : '';

  var estadoActivo = jugador.estado === 'ACTIVO';

  tarjeta.innerHTML =
    '<div class="jugador-info">' +
      '<span class="jugador-nombre"></span>' +
      (jugador.apodo ? '<span class="jugador-nombre-real"></span>' : '') +
      '<div class="jugador-meta">' +
        '<span class="insignia insignia-posicion"></span>' +
        '<span class="insignia ' + (estadoActivo ? 'insignia-activo' : 'insignia-inactivo') + '"></span>' +
        '<span>· Puntuación: ' + Number(jugador.puntuacion) + '</span>' +
      '</div>' +
    '</div>' +
    '<div class="jugador-acciones">' +
      '<button type="button" class="boton-mini boton-editar">Editar</button>' +
      '<button type="button" class="boton-mini ' + (estadoActivo ? 'boton-mini-peligro boton-desactivar' : 'boton-mini-exito boton-reactivar') + '">' +
        (estadoActivo ? 'Desactivar' : 'Reactivar') +
      '</button>' +
    '</div>';

  tarjeta.querySelector('.jugador-nombre').textContent = jugador.apodo || jugador.nombre_completo;
  if (jugador.apodo) {
    tarjeta.querySelector('.jugador-nombre-real').textContent = jugador.nombre_completo;
  }
  tarjeta.querySelector('.insignia-posicion').textContent =
    (POSICIONES_TEXTO[jugador.posicion_principal] || jugador.posicion_principal) + posicionSecundaria;
  tarjeta.querySelector(estadoActivo ? '.insignia-activo' : '.insignia-inactivo').textContent =
    estadoActivo ? 'Activo' : 'Inactivo';

  tarjeta.querySelector('.boton-editar').addEventListener('click', function () {
    abrirModalJugador(jugador);
  });

  var botonEstado = tarjeta.querySelector(estadoActivo ? '.boton-desactivar' : '.boton-reactivar');
  botonEstado.addEventListener('click', function () {
    cambiarEstadoJugador(jugador, estadoActivo ? 'INACTIVO' : 'ACTIVO');
  });

  tarjeta.insertBefore(crearAvatar(jugador, 'avatar-mediano'), tarjeta.firstChild);

  return tarjeta;
}

function cambiarEstadoJugador(jugador, nuevoEstado) {
  var guardada = obtenerSesionGuardada();
  llamarApi('cambiarEstadoJugador', {
    token: guardada.token,
    id_jugador: jugador.id_jugador,
    nuevo_estado: nuevoEstado
  }).then(function (resultado) {
    if (resultado.ok) {
      cargarJugadores();
    } else {
      alert(resultado.error || 'No se ha podido cambiar el estado del jugador.');
    }
  });
}

function abrirModalJugador(jugador) {
  var titulo = document.getElementById('modal-jugador-titulo');
  var mensajeError = document.getElementById('mensaje-error-jugador');
  mensajeError.classList.add('oculto');
  document.getElementById('formulario-jugador').reset();

  if (jugador) {
    titulo.textContent = 'Editar jugador';
    document.getElementById('jugador-id').value = jugador.id_jugador;
    document.getElementById('jugador-nombre').value = jugador.nombre;
    document.getElementById('jugador-apellidos').value = jugador.apellidos;
    document.getElementById('jugador-apodo').value = jugador.apodo || '';
    document.getElementById('jugador-posicion-principal').value = jugador.posicion_principal;
    document.getElementById('jugador-posicion-secundaria').value = jugador.posicion_secundaria || '';
    document.getElementById('jugador-puntuacion').value = jugador.puntuacion;
  } else {
    titulo.textContent = 'Nuevo jugador';
    document.getElementById('jugador-id').value = '';
    document.getElementById('jugador-puntuacion').value = 0;
  }

  document.getElementById('modal-jugador').classList.remove('oculto');
}

function cerrarModalJugador() {
  document.getElementById('modal-jugador').classList.add('oculto');
}

function manejarEnvioJugador(evento) {
  evento.preventDefault();

  var guardada = obtenerSesionGuardada();
  var idJugador = document.getElementById('jugador-id').value;
  var botonGuardar = document.getElementById('boton-guardar-jugador');
  var mensajeError = document.getElementById('mensaje-error-jugador');

  var datos = {
    token: guardada.token,
    nombre: document.getElementById('jugador-nombre').value.trim(),
    apellidos: document.getElementById('jugador-apellidos').value.trim(),
    apodo: document.getElementById('jugador-apodo').value.trim(),
    posicion_principal: document.getElementById('jugador-posicion-principal').value,
    posicion_secundaria: document.getElementById('jugador-posicion-secundaria').value,
    puntuacion: document.getElementById('jugador-puntuacion').value
  };

  mensajeError.classList.add('oculto');
  botonGuardar.disabled = true;
  botonGuardar.textContent = 'Guardando...';

  var accion;
  if (idJugador) {
    datos.id_jugador = idJugador;
    accion = 'editarJugador';
  } else {
    accion = 'crearJugador';
  }

  llamarApi(accion, datos)
    .then(function (resultado) {
      if (resultado.ok) {
        cerrarModalJugador();
        cargarJugadores();
      } else {
        mensajeError.textContent = resultado.error || 'No se ha podido guardar el jugador.';
        mensajeError.classList.remove('oculto');
      }
    })
    .catch(function () {
      mensajeError.textContent = 'No se ha podido conectar con el servidor.';
      mensajeError.classList.remove('oculto');
    })
    .finally(function () {
      botonGuardar.disabled = false;
      botonGuardar.textContent = 'Guardar';
    });
}

/* ==========================================================================
 * USUARIOS (capitán) — crear accesos y dar/quitar poderes de capitán
 * ======================================================================= */

var ROLES_TEXTO = { CAPITAN: 'Capitán', JUGADOR: 'Jugador' };

function irAVistaUsuarios() {
  mostrarVista('vista-usuarios');
  cargarUsuarios();
}

function cargarUsuarios() {
  var guardada = obtenerSesionGuardada();
  var contenedor = document.getElementById('lista-usuarios');
  var mensaje = document.getElementById('mensaje-usuarios');
  mensaje.classList.add('oculto');
  contenedor.innerHTML = '<p class="texto-vacio">Cargando usuarios...</p>';

  llamarApi('listarUsuarios', { token: guardada.token })
    .then(function (resultado) {
      if (!resultado.ok) throw new Error(resultado.error || 'No se han podido cargar los usuarios.');
      pintarUsuarios(resultado.usuarios);
    })
    .catch(function (error) {
      contenedor.innerHTML = '';
      mensaje.textContent = error.message || 'No se ha podido conectar con el servidor.';
      mensaje.classList.remove('oculto');
    });
}

function pintarUsuarios(usuarios) {
  var contenedor = document.getElementById('lista-usuarios');

  if (usuarios.length === 0) {
    contenedor.innerHTML = '<p class="texto-vacio">Todavía no hay usuarios.</p>';
    return;
  }

  contenedor.innerHTML = '';
  usuarios.forEach(function (usuario) {
    contenedor.appendChild(crearTarjetaUsuario(usuario));
  });
}

function crearTarjetaUsuario(usuario) {
  var tarjeta = document.createElement('div');
  tarjeta.className = 'jugador-tarjeta';
  var activo = usuario.estado === 'ACTIVO';

  tarjeta.innerHTML =
    '<div class="jugador-info">' +
      '<span class="jugador-nombre"></span>' +
      '<div class="jugador-meta">' +
        '<span class="insignia ' + (usuario.rol === 'CAPITAN' ? 'insignia-compat-buena' : 'insignia-posicion') + '"></span>' +
        '<span class="insignia ' + (activo ? 'insignia-activo' : 'insignia-inactivo') + '"></span>' +
        (usuario.jugador_nombre ? '<span>· ' + usuario.jugador_nombre + '</span>' : '') +
      '</div>' +
    '</div>' +
    '<div class="jugador-acciones">' +
      '<button type="button" class="boton-mini boton-editar">Editar</button>' +
      '<button type="button" class="boton-mini ' + (activo ? 'boton-mini-peligro boton-desactivar' : 'boton-mini-exito boton-reactivar') + '">' +
        (activo ? 'Desactivar' : 'Reactivar') +
      '</button>' +
    '</div>';

  tarjeta.querySelector('.jugador-nombre').textContent = usuario.nombre_usuario;
  tarjeta.querySelector('.insignia-compat-buena, .insignia-posicion').textContent = ROLES_TEXTO[usuario.rol] || usuario.rol;
  tarjeta.querySelector(activo ? '.insignia-activo' : '.insignia-inactivo').textContent = activo ? 'Activo' : 'Inactivo';

  tarjeta.querySelector('.boton-editar').addEventListener('click', function () {
    abrirModalUsuario(usuario);
  });

  tarjeta.querySelector(activo ? '.boton-desactivar' : '.boton-reactivar').addEventListener('click', function () {
    guardarCambioUsuario({ id_usuario: usuario.id_usuario, estado: activo ? 'INACTIVO' : 'ACTIVO' }, cargarUsuarios);
  });

  return tarjeta;
}

function guardarCambioUsuario(datosParciales, alTerminar) {
  var guardada = obtenerSesionGuardada();
  llamarApi('editarUsuario', Object.assign({ token: guardada.token }, datosParciales)).then(function (resultado) {
    if (resultado.ok) {
      if (alTerminar) alTerminar();
    } else {
      alert(resultado.error || 'No se ha podido guardar el cambio.');
    }
  });
}

function abrirModalUsuario(usuario) {
  var titulo = document.getElementById('modal-usuario-titulo');
  var mensajeError = document.getElementById('mensaje-error-usuario');
  var ayudaCodigo = document.querySelector('.texto-ayuda-codigo');
  mensajeError.classList.add('oculto');
  document.getElementById('formulario-usuario').reset();

  var guardada = obtenerSesionGuardada();
  var selectJugador = document.getElementById('usuario-jugador');
  selectJugador.innerHTML = '<option value="">Sin vincular</option>';

  llamarApi('listarJugadores', { token: guardada.token }).then(function (resultado) {
    if (!resultado.ok) return;
    resultado.jugadores.forEach(function (j) {
      var opcion = document.createElement('option');
      opcion.value = j.id_jugador;
      opcion.textContent = j.apodo || j.nombre_completo;
      selectJugador.appendChild(opcion);
    });
    if (usuario) selectJugador.value = usuario.id_jugador || '';
  });

  if (usuario) {
    titulo.textContent = 'Editar usuario';
    document.getElementById('usuario-id').value = usuario.id_usuario;
    document.getElementById('usuario-nombre').value = usuario.nombre_usuario;
    document.getElementById('usuario-codigo').value = '';
    document.getElementById('usuario-codigo').placeholder = 'Dejar en blanco para no cambiarlo';
    document.getElementById('usuario-rol').value = usuario.rol;
    ayudaCodigo.classList.remove('oculto');
  } else {
    titulo.textContent = 'Nuevo usuario';
    document.getElementById('usuario-id').value = '';
    document.getElementById('usuario-codigo').placeholder = 'Mínimo 4 caracteres';
    document.getElementById('usuario-rol').value = 'JUGADOR';
    ayudaCodigo.classList.add('oculto');
  }

  document.getElementById('modal-usuario').classList.remove('oculto');
}

function cerrarModalUsuario() {
  document.getElementById('modal-usuario').classList.add('oculto');
}

function manejarEnvioUsuario(evento) {
  evento.preventDefault();

  var guardada = obtenerSesionGuardada();
  var idUsuario = document.getElementById('usuario-id').value;
  var botonGuardar = document.getElementById('boton-guardar-usuario');
  var mensajeError = document.getElementById('mensaje-error-usuario');

  var datos = {
    token: guardada.token,
    nombre_usuario: document.getElementById('usuario-nombre').value.trim(),
    rol: document.getElementById('usuario-rol').value,
    id_jugador: document.getElementById('usuario-jugador').value
  };
  var codigo = document.getElementById('usuario-codigo').value.trim();

  var accion;
  if (idUsuario) {
    datos.id_usuario = idUsuario;
    if (codigo) datos.codigo_acceso = codigo;
    accion = 'editarUsuario';
  } else {
    datos.codigo_acceso = codigo;
    accion = 'crearUsuario';
  }

  mensajeError.classList.add('oculto');
  botonGuardar.disabled = true;
  botonGuardar.textContent = 'Guardando...';

  llamarApi(accion, datos)
    .then(function (resultado) {
      if (resultado.ok) {
        cerrarModalUsuario();
        cargarUsuarios();
      } else {
        mensajeError.textContent = resultado.error || 'No se ha podido guardar el usuario.';
        mensajeError.classList.remove('oculto');
      }
    })
    .catch(function () {
      mensajeError.textContent = 'No se ha podido conectar con el servidor.';
      mensajeError.classList.remove('oculto');
    })
    .finally(function () {
      botonGuardar.disabled = false;
      botonGuardar.textContent = 'Guardar';
    });
}

/* ==========================================================================
 * JORNADAS (capitán)
 * ======================================================================= */

var jornadaActual = null;

function irAVistaJornadas() {
  mostrarVista('vista-jornadas');
  cargarJornadas();
}

function cargarJornadas() {
  var guardada = obtenerSesionGuardada();
  var contenedor = document.getElementById('lista-jornadas');
  var mensaje = document.getElementById('mensaje-jornadas');
  mensaje.classList.add('oculto');
  contenedor.innerHTML = '<p class="texto-vacio">Cargando jornadas...</p>';

  llamarApi('listarJornadas', { token: guardada.token })
    .then(function (resultado) {
      if (!resultado.ok) {
        throw new Error(resultado.error || 'No se han podido cargar las jornadas.');
      }
      pintarJornadas(resultado.jornadas);
    })
    .catch(function (error) {
      contenedor.innerHTML = '';
      mensaje.textContent = error.message || 'No se ha podido conectar con el servidor.';
      mensaje.classList.remove('oculto');
    });
}

function pintarJornadas(jornadas) {
  var contenedor = document.getElementById('lista-jornadas');

  if (jornadas.length === 0) {
    contenedor.innerHTML = '<p class="texto-vacio">Todavía no hay jornadas. Pulsa "+ Nueva jornada" para crear la primera.</p>';
    return;
  }

  contenedor.innerHTML = '';
  jornadas.forEach(function (jornada) {
    contenedor.appendChild(crearTarjetaJornada(jornada));
  });
}

function crearTarjetaJornada(jornada) {
  var tarjeta = document.createElement('div');
  tarjeta.className = 'jornada-tarjeta';

  var claseEstado = claseInsigniaEstado(jornada.estado);

  tarjeta.innerHTML =
    '<div class="jornada-info">' +
      '<span class="jornada-rival"></span>' +
      '<span class="jornada-meta"></span>' +
      '<span class="insignia ' + claseEstado + '"></span>' +
    '</div>';

  tarjeta.querySelector('.jornada-rival').textContent =
    (jornada.local_visitante === 'LOCAL' ? 'vs ' : '@ ') + jornada.rival;
  tarjeta.querySelector('.jornada-meta').textContent =
    formatearFecha(jornada.fecha) + (jornada.lugar ? ' · ' + jornada.lugar : '');
  tarjeta.querySelector('.insignia').textContent = ESTADOS_JORNADA_TEXTO[jornada.estado] || jornada.estado;

  tarjeta.addEventListener('click', function () {
    abrirDetalleJornada(jornada);
  });

  return tarjeta;
}

function claseInsigniaEstado(estado) {
  if (estado === 'PENDIENTE') return 'insignia-estado-pendiente';
  if (estado === 'CONVOCATORIA_ABIERTA') return 'insignia-estado-abierta';
  if (estado === 'CONVOCATORIA_CERRADA') return 'insignia-estado-cerrada';
  return 'insignia-estado-avanzado';
}

function formatearFecha(fechaIso) {
  if (!fechaIso) return '';
  var soloFecha = String(fechaIso).split('T')[0];
  var partes = soloFecha.split('-');
  if (partes.length !== 3) return fechaIso;
  return partes[2] + '/' + partes[1] + '/' + partes[0];
}

function abrirDetalleJornada(jornada) {
  jornadaActual = jornada;
  mostrarVista('vista-jornada-detalle');

  document.getElementById('jornada-detalle-rival').textContent =
    (jornada.local_visitante === 'LOCAL' ? 'vs ' : '@ ') + jornada.rival;
  document.getElementById('jornada-detalle-info').textContent =
    formatearFecha(jornada.fecha) + (jornada.lugar ? ' · ' + jornada.lugar : '') +
    ' · ' + (jornada.local_visitante === 'LOCAL' ? 'Local' : 'Visitante');
  document.getElementById('jornada-detalle-observaciones').textContent = jornada.observaciones || '';

  var estadoBadge = document.getElementById('jornada-detalle-estado');
  estadoBadge.className = 'insignia ' + claseInsigniaEstado(jornada.estado);
  estadoBadge.textContent = ESTADOS_JORNADA_TEXTO[jornada.estado] || jornada.estado;

  pintarAccionesJornada(jornada);

  var bloqueConvocatoria = document.getElementById('bloque-convocatoria');
  var bloqueSeleccionados = document.getElementById('bloque-seleccionados');

  if (jornada.estado === 'PENDIENTE') {
    bloqueConvocatoria.classList.add('oculto');
  } else {
    bloqueConvocatoria.classList.remove('oculto');
    cargarConvocatoria(jornada.id_jornada);
  }

  var yaSeleccionado = ['CONFIRMADA', 'JUGADA', 'FINALIZADA'].indexOf(jornada.estado) !== -1;
  if (yaSeleccionado) {
    bloqueSeleccionados.classList.remove('oculto');
    cargarSeleccionados(jornada.id_jornada);
    document.getElementById('bloque-parejas').classList.remove('oculto');
    cargarParejas(jornada.id_jornada);
    cargarPartidos(jornada.id_jornada);
  } else {
    bloqueSeleccionados.classList.add('oculto');
    document.getElementById('bloque-parejas').classList.add('oculto');
  }
}

function cargarPartidos(idJornada) {
  var guardada = obtenerSesionGuardada();
  var contenedor = document.getElementById('lista-partidos');

  llamarApi('listarPartidos', { token: guardada.token, id_jornada: idJornada }).then(function (resultado) {
    if (!resultado.ok) return;

    if (resultado.partidos.length === 0) {
      contenedor.innerHTML = '<p class="texto-vacio">Todavía no hay partidos (primero hay que crear las parejas).</p>';
      return;
    }

    contenedor.innerHTML = '';
    resultado.partidos.forEach(function (partido) {
      contenedor.appendChild(crearTarjetaPartido(partido));
    });
  });
}

function crearTarjetaPartido(partido) {
  var tarjeta = document.createElement('div');
  tarjeta.className = 'partido-tarjeta';
  tarjeta.innerHTML =
    '<div class="partido-info">' +
      '<span class="partido-numero"></span>' +
      '<span class="partido-jugadores"></span>' +
      '<span class="partido-marcador"></span>' +
    '</div>' +
    '<button type="button" class="boton-mini"></button>';

  tarjeta.querySelector('.partido-numero').textContent = 'Partido ' + partido.numero_partido;
  tarjeta.querySelector('.partido-jugadores').appendChild(crearParJugadores(partido.jugador_a, partido.jugador_b));

  var boton = tarjeta.querySelector('button');
  if (partido.resultado) {
    var r = partido.resultado;
    tarjeta.querySelector('.partido-marcador').textContent =
      (r.resultado === 'GANADO' ? '✅ Ganado' : '❌ Perdido') + ' · Sets ' + r.sets_favor + '-' + r.sets_contra +
      (r.juegos_favor || r.juegos_contra ? ' · Juegos ' + r.juegos_favor + '-' + r.juegos_contra : '');
    boton.textContent = 'Editar resultado';
  } else {
    tarjeta.querySelector('.partido-marcador').textContent = 'Resultado pendiente';
    boton.textContent = 'Registrar resultado';
  }

  boton.addEventListener('click', function () {
    abrirModalResultado(partido);
  });

  return tarjeta;
}

function abrirModalResultado(partido) {
  document.getElementById('modal-resultado-titulo').textContent =
    'Partido ' + partido.numero_partido + ': ' +
    (partido.jugador_a.apodo || partido.jugador_a.nombre_completo) + ' + ' +
    (partido.jugador_b.apodo || partido.jugador_b.nombre_completo);
  document.getElementById('mensaje-error-resultado').classList.add('oculto');
  document.getElementById('resultado-id-partido').value = partido.id_partido;

  var r = partido.resultado;
  document.getElementById('resultado-sets-favor').value = r ? r.sets_favor : '';
  document.getElementById('resultado-sets-contra').value = r ? r.sets_contra : '';
  document.getElementById('resultado-juegos-favor').value = r ? r.juegos_favor : 0;
  document.getElementById('resultado-juegos-contra').value = r ? r.juegos_contra : 0;

  document.getElementById('modal-resultado').classList.remove('oculto');
}

function cerrarModalResultado() {
  document.getElementById('modal-resultado').classList.add('oculto');
}

function manejarEnvioResultado(evento) {
  evento.preventDefault();

  var guardada = obtenerSesionGuardada();
  var botonGuardar = document.getElementById('boton-guardar-resultado');
  var mensajeError = document.getElementById('mensaje-error-resultado');

  var datos = {
    token: guardada.token,
    id_partido: document.getElementById('resultado-id-partido').value,
    sets_favor: document.getElementById('resultado-sets-favor').value,
    sets_contra: document.getElementById('resultado-sets-contra').value,
    juegos_favor: document.getElementById('resultado-juegos-favor').value || 0,
    juegos_contra: document.getElementById('resultado-juegos-contra').value || 0
  };

  mensajeError.classList.add('oculto');
  botonGuardar.disabled = true;
  botonGuardar.textContent = 'Guardando...';

  llamarApi('registrarResultado', datos)
    .then(function (resultado) {
      if (resultado.ok) {
        cerrarModalResultado();
        cargarPartidos(jornadaActual.id_jornada);
        // El estado de la jornada puede haber cambiado (JUGADA / FINALIZADA); lo recargamos.
        llamarApi('listarJornadas', { token: guardada.token }).then(function (r2) {
          if (!r2.ok) return;
          var actualizada = r2.jornadas.filter(function (j) { return j.id_jornada === jornadaActual.id_jornada; })[0];
          if (actualizada) {
            jornadaActual = actualizada;
            var estadoBadge = document.getElementById('jornada-detalle-estado');
            estadoBadge.className = 'insignia ' + claseInsigniaEstado(actualizada.estado);
            estadoBadge.textContent = ESTADOS_JORNADA_TEXTO[actualizada.estado] || actualizada.estado;
            pintarAccionesJornada(actualizada);
          }
        });
      } else {
        mensajeError.textContent = resultado.error || 'No se ha podido guardar el resultado.';
        mensajeError.classList.remove('oculto');
      }
    })
    .catch(function () {
      mensajeError.textContent = 'No se ha podido conectar con el servidor.';
      mensajeError.classList.remove('oculto');
    })
    .finally(function () {
      botonGuardar.disabled = false;
      botonGuardar.textContent = 'Guardar';
    });
}

function cargarParejas(idJornada) {
  var guardada = obtenerSesionGuardada();
  var contenedor = document.getElementById('lista-parejas');

  llamarApi('listarParejas', { token: guardada.token, id_jornada: idJornada }).then(function (resultado) {
    if (!resultado.ok) return;

    if (resultado.parejas.length === 0) {
      contenedor.innerHTML = '<p class="texto-vacio">Todavía no se han formado las parejas.</p>';
      return;
    }

    contenedor.innerHTML = '';
    resultado.parejas.forEach(function (pareja) {
      contenedor.appendChild(crearTarjetaPareja(pareja));
    });
  });
}

function crearTarjetaPareja(pareja) {
  var tarjeta = document.createElement('div');
  tarjeta.className = 'pareja-tarjeta';
  tarjeta.innerHTML =
    '<span class="pareja-numero"></span>' +
    '<span class="pareja-jugadores"></span>' +
    '<div class="pareja-meta">' +
      '<span>Puntuación: <strong></strong></span>' +
      '<span class="insignia"></span>' +
    '</div>';

  tarjeta.querySelector('.pareja-numero').textContent = 'Partido ' + pareja.numero_partido;
  tarjeta.querySelector('.pareja-jugadores').appendChild(crearParJugadores(pareja.jugador_a, pareja.jugador_b));
  tarjeta.querySelector('strong').textContent = pareja.puntuacion_total;
  var insignia = tarjeta.querySelector('.insignia');
  insignia.classList.add(COMPATIBILIDAD_CLASE[pareja.compatibilidad] || 'insignia-posicion');
  insignia.textContent = COMPATIBILIDAD_TEXTO[pareja.compatibilidad] || pareja.compatibilidad;

  return tarjeta;
}

function cargarSeleccionados(idJornada) {
  var guardada = obtenerSesionGuardada();
  llamarApi('listarSeleccionados', { token: guardada.token, id_jornada: idJornada }).then(function (resultado) {
    if (!resultado.ok) return;
    pintarListaConvocatoria('lista-seleccionados', resultado.seleccionados);
  });
}

function pintarAccionesJornada(jornada) {
  var contenedor = document.getElementById('jornada-detalle-acciones');
  contenedor.innerHTML = '';

  var boton = document.createElement('button');
  boton.type = 'button';
  boton.className = 'boton boton-primario';

  if (jornada.estado === 'PENDIENTE') {
    boton.textContent = 'Abrir convocatoria';
    boton.addEventListener('click', function () {
      cambiarEstadoJornadaYRecargar(jornada.id_jornada, 'CONVOCATORIA_ABIERTA');
    });
  } else if (jornada.estado === 'CONVOCATORIA_ABIERTA') {
    boton.textContent = 'Cerrar convocatoria';
    boton.addEventListener('click', function () {
      cambiarEstadoJornadaYRecargar(jornada.id_jornada, 'CONVOCATORIA_CERRADA');
    });
  } else if (jornada.estado === 'CONVOCATORIA_CERRADA') {
    boton.textContent = 'Seleccionar los 10';
    boton.addEventListener('click', function () {
      irAVistaSeleccion(jornada);
    });
  } else if (jornada.estado === 'CONFIRMADA') {
    boton.textContent = 'Crear / rehacer parejas';
    boton.addEventListener('click', function () {
      irAVistaParejas(jornada);
    });
    contenedor.appendChild(boton);

    var botonRecomendar = document.createElement('button');
    botonRecomendar.type = 'button';
    botonRecomendar.className = 'boton boton-secundario';
    botonRecomendar.textContent = '✨ Ver recomendaciones';
    botonRecomendar.addEventListener('click', function () {
      irAVistaRecomendaciones(jornada);
    });
    contenedor.appendChild(botonRecomendar);
    return;
  } else {
    return; // Los siguientes estados (resultados...) llegan en próximas fases.
  }

  contenedor.appendChild(boton);
}

function cambiarEstadoJornadaYRecargar(idJornada, nuevoEstado) {
  var guardada = obtenerSesionGuardada();
  llamarApi('cambiarEstadoJornada', { token: guardada.token, id_jornada: idJornada, nuevo_estado: nuevoEstado })
    .then(function (resultado) {
      if (!resultado.ok) {
        alert(resultado.error || 'No se ha podido cambiar el estado de la jornada.');
        return;
      }
      jornadaActual.estado = nuevoEstado;
      abrirDetalleJornada(jornadaActual);
    });
}

function abrirModalJornada() {
  document.getElementById('formulario-jornada').reset();
  document.getElementById('mensaje-error-jornada').classList.add('oculto');
  document.getElementById('modal-jornada').classList.remove('oculto');
}

function cerrarModalJornada() {
  document.getElementById('modal-jornada').classList.add('oculto');
}

function manejarEnvioJornada(evento) {
  evento.preventDefault();

  var guardada = obtenerSesionGuardada();
  var botonGuardar = document.getElementById('boton-guardar-jornada');
  var mensajeError = document.getElementById('mensaje-error-jornada');

  var datos = {
    token: guardada.token,
    fecha: document.getElementById('jornada-fecha').value,
    rival: document.getElementById('jornada-rival').value.trim(),
    local_visitante: document.getElementById('jornada-local-visitante').value,
    lugar: document.getElementById('jornada-lugar').value.trim(),
    observaciones: document.getElementById('jornada-observaciones').value.trim()
  };

  mensajeError.classList.add('oculto');
  botonGuardar.disabled = true;
  botonGuardar.textContent = 'Guardando...';

  llamarApi('crearJornada', datos)
    .then(function (resultado) {
      if (resultado.ok) {
        cerrarModalJornada();
        cargarJornadas();
      } else {
        mensajeError.textContent = resultado.error || 'No se ha podido guardar la jornada.';
        mensajeError.classList.remove('oculto');
      }
    })
    .catch(function () {
      mensajeError.textContent = 'No se ha podido conectar con el servidor.';
      mensajeError.classList.remove('oculto');
    })
    .finally(function () {
      botonGuardar.disabled = false;
      botonGuardar.textContent = 'Guardar';
    });
}

/* ==========================================================================
 * CONVOCATORIA — vista del capitán (roster de una jornada)
 * ======================================================================= */

function cargarConvocatoria(idJornada) {
  var guardada = obtenerSesionGuardada();

  llamarApi('listarConvocatoria', { token: guardada.token, id_jornada: idJornada })
    .then(function (resultado) {
      if (!resultado.ok) return;
      pintarConvocatoria(resultado.convocatoria);
    });
}

function pintarConvocatoria(convocatoria) {
  var apuntados = convocatoria.filter(function (c) { return c.disponibilidad === 'ME_APUNTO'; });
  var noDisponibles = convocatoria.filter(function (c) { return c.disponibilidad === 'NO_PUEDO'; });
  var pendientes = convocatoria.filter(function (c) { return c.disponibilidad === 'PENDIENTE'; });

  document.getElementById('contador-apuntados').textContent = apuntados.length;
  document.getElementById('contador-no-disponibles').textContent = noDisponibles.length;
  document.getElementById('contador-pendientes').textContent = pendientes.length;

  pintarListaConvocatoria('lista-apuntados', apuntados);
  pintarListaConvocatoria('lista-no-disponibles', noDisponibles);
  pintarListaConvocatoria('lista-pendientes', pendientes);
}

function pintarListaConvocatoria(idContenedor, jugadores) {
  var contenedor = document.getElementById(idContenedor);

  if (jugadores.length === 0) {
    contenedor.innerHTML = '<p class="texto-vacio">Nadie en esta lista.</p>';
    return;
  }

  contenedor.innerHTML = '';
  jugadores.forEach(function (j) {
    var fila = document.createElement('div');
    fila.className = 'jugador-tarjeta';
    fila.innerHTML = '<div class="jugador-info"><span class="jugador-nombre"></span></div>';
    fila.querySelector('.jugador-nombre').textContent = j.apodo || j.nombre_completo;
    fila.insertBefore(crearAvatar(j, 'avatar-mediano'), fila.firstChild);
    contenedor.appendChild(fila);
  });
}

/* ==========================================================================
 * SELECCIÓN DE LOS 10 (capitán)
 * ======================================================================= */

var seleccionJornadaId = null;
var seleccionMarcados = [];

function irAVistaSeleccion(jornada) {
  seleccionJornadaId = jornada.id_jornada;
  seleccionMarcados = [];
  mostrarVista('vista-seleccion');
  document.getElementById('mensaje-seleccion').classList.add('oculto');
  actualizarContadorSeleccion();

  var guardada = obtenerSesionGuardada();
  var contenedor = document.getElementById('lista-seleccionables');
  contenedor.innerHTML = '<p class="texto-vacio">Cargando...</p>';

  llamarApi('listarConvocatoria', { token: guardada.token, id_jornada: jornada.id_jornada }).then(function (resultado) {
    if (!resultado.ok) return;

    var apuntados = resultado.convocatoria.filter(function (c) { return c.disponibilidad === 'ME_APUNTO'; });

    if (apuntados.length === 0) {
      contenedor.innerHTML = '<p class="texto-vacio">Todavía no hay ningún jugador apuntado a esta convocatoria.</p>';
      return;
    }

    contenedor.innerHTML = '';
    apuntados.forEach(function (jugador) {
      contenedor.appendChild(crearTarjetaSeleccionable(jugador));
    });
  });
}

function crearTarjetaSeleccionable(jugador) {
  var tarjeta = document.createElement('div');
  tarjeta.className = 'jugador-tarjeta seleccionable';
  tarjeta.innerHTML =
    '<div class="jugador-info"><span class="jugador-nombre"></span></div>' +
    '<span class="marca-seleccion">✓</span>';
  tarjeta.querySelector('.jugador-nombre').textContent = jugador.apodo || jugador.nombre_completo;
  tarjeta.insertBefore(crearAvatar(jugador, 'avatar-mediano'), tarjeta.firstChild);

  tarjeta.addEventListener('click', function () {
    var indice = seleccionMarcados.indexOf(jugador.id_jugador);
    if (indice === -1) {
      if (seleccionMarcados.length >= 10) {
        return; // Ya hay 10 marcados, no se puede añadir más.
      }
      seleccionMarcados.push(jugador.id_jugador);
      tarjeta.classList.add('marcada');
    } else {
      seleccionMarcados.splice(indice, 1);
      tarjeta.classList.remove('marcada');
    }
    actualizarContadorSeleccion();
  });

  return tarjeta;
}

function actualizarContadorSeleccion() {
  document.getElementById('contador-seleccion').textContent = seleccionMarcados.length + ' / 10';
  document.getElementById('boton-confirmar-seleccion').disabled = seleccionMarcados.length !== 10;
}

function manejarConfirmarSeleccion() {
  var guardada = obtenerSesionGuardada();
  var mensajeError = document.getElementById('mensaje-seleccion');
  var boton = document.getElementById('boton-confirmar-seleccion');

  mensajeError.classList.add('oculto');
  boton.disabled = true;
  boton.textContent = 'Guardando...';

  llamarApi('guardarSeleccion', {
    token: guardada.token,
    id_jornada: seleccionJornadaId,
    ids_jugadores: seleccionMarcados
  })
    .then(function (resultado) {
      if (resultado.ok) {
        irAVistaJornadas();
      } else {
        mensajeError.textContent = resultado.error || 'No se ha podido guardar la selección.';
        mensajeError.classList.remove('oculto');
      }
    })
    .catch(function () {
      mensajeError.textContent = 'No se ha podido conectar con el servidor.';
      mensajeError.classList.remove('oculto');
    })
    .finally(function () {
      boton.textContent = 'Confirmar selección';
      actualizarContadorSeleccion();
    });
}

/* ==========================================================================
 * GENERADOR DE PAREJAS (capitán)
 * ======================================================================= */

var parejasJornadaId = null;
var parejasDisponibles = [];
var parejasFormadas = [];
var parejaEnFormacionIds = [];

function irAVistaParejas(jornada) {
  parejasJornadaId = jornada.id_jornada;
  parejasFormadas = [];
  parejaEnFormacionIds = [];
  mostrarVista('vista-parejas');
  document.getElementById('mensaje-parejas').classList.add('oculto');
  document.getElementById('vista-previa-pareja').classList.add('oculto');

  var guardada = obtenerSesionGuardada();
  var contenedor = document.getElementById('lista-disponibles-parejas');
  contenedor.innerHTML = '<p class="texto-vacio">Cargando...</p>';

  llamarApi('listarSeleccionados', { token: guardada.token, id_jornada: jornada.id_jornada }).then(function (resultado) {
    if (!resultado.ok || resultado.seleccionados.length !== 10) {
      contenedor.innerHTML = '<p class="texto-vacio">No se han encontrado los 10 jugadores seleccionados.</p>';
      return;
    }
    parejasDisponibles = resultado.seleccionados;
    pintarDisponiblesParejas();
    pintarParejasFormadas();
  });
}

function calcularCompatibilidadCliente(a, b) {
  var posA = posicionesJugablesCliente(a.posicion_principal, a.posicion_secundaria);
  var posB = posicionesJugablesCliente(b.posicion_principal, b.posicion_secundaria);

  var ideal =
    (posA.indexOf('DERECHA') !== -1 && posB.indexOf('REVÉS') !== -1) ||
    (posA.indexOf('REVÉS') !== -1 && posB.indexOf('DERECHA') !== -1);

  if (ideal) return 'BUENA';
  if (posA.length > 0 && posB.length > 0) return 'REGULAR';
  return 'MALA';
}

function posicionesJugablesCliente(principal, secundaria) {
  var set = {};
  function agregar(p) {
    if (p === 'AMBAS') { set['DERECHA'] = true; set['REVÉS'] = true; }
    else if (p) { set[p] = true; }
  }
  agregar(principal);
  agregar(secundaria);
  return Object.keys(set);
}

function pintarDisponiblesParejas() {
  var contenedor = document.getElementById('lista-disponibles-parejas');
  contenedor.innerHTML = '';

  if (parejasDisponibles.length === 0) {
    contenedor.innerHTML = '<p class="texto-vacio">Ya has formado las 5 parejas.</p>';
    return;
  }

  parejasDisponibles.forEach(function (jugador) {
    var tarjeta = document.createElement('div');
    tarjeta.className = 'jugador-tarjeta seleccionable';
    if (parejaEnFormacionIds.indexOf(jugador.id_jugador) !== -1) {
      tarjeta.classList.add('marcada');
    }
    tarjeta.innerHTML =
      '<div class="jugador-info"><span class="jugador-nombre"></span></div>' +
      '<span class="marca-seleccion">✓</span>';
    tarjeta.querySelector('.jugador-nombre').textContent = jugador.apodo || jugador.nombre_completo;
    tarjeta.insertBefore(crearAvatar(jugador, 'avatar-mediano'), tarjeta.firstChild);

    tarjeta.addEventListener('click', function () {
      manejarClicJugadorPareja(jugador);
    });

    contenedor.appendChild(tarjeta);
  });
}

function manejarClicJugadorPareja(jugador) {
  var indice = parejaEnFormacionIds.indexOf(jugador.id_jugador);
  if (indice !== -1) {
    parejaEnFormacionIds.splice(indice, 1);
  } else {
    if (parejaEnFormacionIds.length >= 2) return;
    parejaEnFormacionIds.push(jugador.id_jugador);
  }

  pintarDisponiblesParejas();

  var previa = document.getElementById('vista-previa-pareja');
  if (parejaEnFormacionIds.length === 2) {
    var a = parejasDisponibles.filter(function (j) { return j.id_jugador === parejaEnFormacionIds[0]; })[0];
    var b = parejasDisponibles.filter(function (j) { return j.id_jugador === parejaEnFormacionIds[1]; })[0];
    var compat = calcularCompatibilidadCliente(a, b);

    previa.innerHTML =
      '<p class="etiqueta-rol">Pareja propuesta</p>' +
      '<h3 class="titulo-bienvenida pareja-jugadores"></h3>' +
      '<p class="texto-secundario">Puntuación combinada: <strong></strong></p>' +
      '<span class="insignia"></span>' +
      '<div class="modal-botones">' +
        '<button type="button" class="boton boton-secundario" id="boton-deshacer-pareja">Deshacer</button>' +
        '<button type="button" class="boton boton-exito" id="boton-anadir-pareja">Añadir pareja</button>' +
      '</div>';

    previa.querySelector('.titulo-bienvenida').appendChild(crearParJugadores(a, b));
    previa.querySelector('strong').textContent = Number(a.puntuacion) + Number(b.puntuacion);
    var insignia = previa.querySelector('.insignia');
    insignia.classList.add(COMPATIBILIDAD_CLASE[compat]);
    insignia.textContent = COMPATIBILIDAD_TEXTO[compat];

    previa.classList.remove('oculto');
    previa.querySelector('#boton-deshacer-pareja').addEventListener('click', function () {
      parejaEnFormacionIds = [];
      previa.classList.add('oculto');
      pintarDisponiblesParejas();
    });
    previa.querySelector('#boton-anadir-pareja').addEventListener('click', function () {
      parejasFormadas.push({ id_jugador_a: a.id_jugador, id_jugador_b: b.id_jugador, a: a, b: b, compat: compat });
      parejasDisponibles = parejasDisponibles.filter(function (j) {
        return j.id_jugador !== a.id_jugador && j.id_jugador !== b.id_jugador;
      });
      parejaEnFormacionIds = [];
      previa.classList.add('oculto');
      pintarDisponiblesParejas();
      pintarParejasFormadas();
    });
  } else {
    previa.classList.add('oculto');
  }
}

function pintarParejasFormadas() {
  var contenedor = document.getElementById('lista-parejas-formadas');
  document.getElementById('contador-parejas-formadas').textContent = parejasFormadas.length + ' / 5 parejas formadas';
  document.getElementById('boton-guardar-parejas').disabled = parejasFormadas.length !== 5;

  if (parejasFormadas.length === 0) {
    contenedor.innerHTML = '<p class="texto-vacio">Todavía no has formado ninguna pareja.</p>';
    return;
  }

  contenedor.innerHTML = '';
  parejasFormadas.forEach(function (pareja, indice) {
    var tarjeta = document.createElement('div');
    tarjeta.className = 'jugador-tarjeta';
    tarjeta.innerHTML =
      '<div class="jugador-info">' +
        '<span class="jugador-nombre pareja-jugadores"></span>' +
        '<div class="jugador-meta"><span class="insignia"></span></div>' +
      '</div>' +
      '<button type="button" class="boton-mini boton-mini-peligro">Quitar</button>';
    tarjeta.querySelector('.jugador-nombre').appendChild(crearParJugadores(pareja.a, pareja.b));
    var insignia = tarjeta.querySelector('.insignia');
    insignia.classList.add(COMPATIBILIDAD_CLASE[pareja.compat]);
    insignia.textContent = COMPATIBILIDAD_TEXTO[pareja.compat];

    tarjeta.querySelector('button').addEventListener('click', function () {
      parejasDisponibles.push(pareja.a, pareja.b);
      parejasFormadas.splice(indice, 1);
      pintarDisponiblesParejas();
      pintarParejasFormadas();
    });

    contenedor.appendChild(tarjeta);
  });
}

function manejarGuardarParejas() {
  var guardada = obtenerSesionGuardada();
  var mensajeError = document.getElementById('mensaje-parejas');
  var boton = document.getElementById('boton-guardar-parejas');

  mensajeError.classList.add('oculto');
  boton.disabled = true;
  boton.textContent = 'Guardando...';

  llamarApi('guardarParejas', {
    token: guardada.token,
    id_jornada: parejasJornadaId,
    parejas: parejasFormadas.map(function (p) {
      return { id_jugador_a: p.id_jugador_a, id_jugador_b: p.id_jugador_b };
    })
  })
    .then(function (resultado) {
      if (resultado.ok) {
        irAVistaJornadas();
      } else {
        mensajeError.textContent = resultado.error || 'No se han podido guardar las parejas.';
        mensajeError.classList.remove('oculto');
      }
    })
    .catch(function () {
      mensajeError.textContent = 'No se ha podido conectar con el servidor.';
      mensajeError.classList.remove('oculto');
    })
    .finally(function () {
      boton.textContent = 'Guardar parejas';
      boton.disabled = parejasFormadas.length !== 5;
    });
}

/* ==========================================================================
 * RECOMENDACIONES (capitán) — motor de recomendación de parejas
 * ======================================================================= */

var recomendacionesJornadaId = null;

function irAVistaRecomendaciones(jornada) {
  recomendacionesJornadaId = jornada.id_jornada;
  mostrarVista('vista-recomendaciones');

  var guardada = obtenerSesionGuardada();
  var contenedor = document.getElementById('lista-recomendaciones');
  var mensaje = document.getElementById('mensaje-recomendaciones');
  mensaje.classList.add('oculto');
  contenedor.innerHTML = '<p class="texto-vacio">Calculando las mejores combinaciones (puede tardar unos segundos)...</p>';

  llamarApi('generarRecomendaciones', { token: guardada.token, id_jornada: jornada.id_jornada })
    .then(function (resultado) {
      if (!resultado.ok) {
        contenedor.innerHTML = '';
        mensaje.textContent = resultado.error || 'No se han podido generar recomendaciones.';
        mensaje.classList.remove('oculto');
        return;
      }
      pintarRecomendaciones(resultado.recomendaciones);
    })
    .catch(function () {
      contenedor.innerHTML = '';
      mensaje.textContent = 'No se ha podido conectar con el servidor.';
      mensaje.classList.remove('oculto');
    });
}

function pintarRecomendaciones(recomendaciones) {
  var contenedor = document.getElementById('lista-recomendaciones');
  contenedor.innerHTML = '';

  recomendaciones.forEach(function (alineacion, indiceAlineacion) {
    var tarjeta = document.createElement('div');
    tarjeta.className = 'tarjeta-recomendacion' + (indiceAlineacion === 0 ? ' recomendacion-mejor' : '');

    var cabecera = document.createElement('div');
    cabecera.className = 'recomendacion-cabecera';
    var titulo = document.createElement('span');
    titulo.className = 'recomendacion-titulo';
    titulo.textContent = 'Recomendación ' + (indiceAlineacion + 1) + (indiceAlineacion === 0 ? ' (mejor)' : '');
    var indiceEl = document.createElement('span');
    indiceEl.className = 'recomendacion-indice';
    indiceEl.textContent = 'Índice ' + alineacion.indice_alineacion;
    cabecera.appendChild(titulo);
    cabecera.appendChild(indiceEl);
    tarjeta.appendChild(cabecera);

    alineacion.parejas.forEach(function (p) {
      var filaPareja = document.createElement('div');
      filaPareja.className = 'pareja-recomendada';

      var etiquetaPartido = document.createElement('span');
      etiquetaPartido.textContent = 'Partido ' + p.numero_partido + ':';

      var nombres = document.createElement('div');
      nombres.className = 'pareja-jugadores';
      nombres.appendChild(etiquetaPartido);
      nombres.appendChild(crearParJugadores(p.jugador_a, p.jugador_b));
      filaPareja.appendChild(nombres);

      var meta = document.createElement('div');
      meta.className = 'pareja-meta';
      var insigniaIndice = document.createElement('span');
      insigniaIndice.className = 'insignia insignia-posicion';
      insigniaIndice.textContent = 'Índice pareja: ' + p.indice_pareja;
      var insigniaCompat = document.createElement('span');
      insigniaCompat.className = 'insignia ' + (COMPATIBILIDAD_CLASE[p.compatibilidad] || 'insignia-posicion');
      insigniaCompat.textContent = COMPATIBILIDAD_TEXTO[p.compatibilidad] || p.compatibilidad;
      meta.appendChild(insigniaIndice);
      meta.appendChild(insigniaCompat);
      filaPareja.appendChild(meta);

      var listaExplicacion = document.createElement('ul');
      listaExplicacion.className = 'explicacion-pareja';
      p.explicacion.forEach(function (motivo) {
        var item = document.createElement('li');
        item.textContent = motivo;
        listaExplicacion.appendChild(item);
      });
      filaPareja.appendChild(listaExplicacion);

      tarjeta.appendChild(filaPareja);
    });

    var botonUsar = document.createElement('button');
    botonUsar.type = 'button';
    botonUsar.className = 'boton boton-primario';
    botonUsar.textContent = 'Usar esta alineación';
    botonUsar.addEventListener('click', function () {
      usarRecomendacion(alineacion, botonUsar);
    });
    tarjeta.appendChild(botonUsar);

    contenedor.appendChild(tarjeta);
  });
}

function usarRecomendacion(alineacion, boton) {
  var guardada = obtenerSesionGuardada();
  boton.disabled = true;
  boton.textContent = 'Guardando...';

  llamarApi('guardarParejas', {
    token: guardada.token,
    id_jornada: recomendacionesJornadaId,
    parejas: alineacion.parejas.map(function (p) {
      return { id_jugador_a: p.jugador_a.id_jugador, id_jugador_b: p.jugador_b.id_jugador };
    })
  }).then(function (resultado) {
    if (resultado.ok) {
      irAVistaJornadas();
    } else {
      alert(resultado.error || 'No se ha podido guardar esta alineación.');
      boton.disabled = false;
      boton.textContent = 'Usar esta alineación';
    }
  });
}

/* ==========================================================================
 * CONVOCATORIA — respuesta del jugador (pantalla de inicio)
 * ======================================================================= */

function comprobarConvocatoriaAbiertaParaJugador() {
  var guardada = obtenerSesionGuardada();
  var tarjeta = document.getElementById('tarjeta-convocatoria-jugador');

  llamarApi('listarJornadas', { token: guardada.token }).then(function (resultado) {
    if (!resultado.ok) return;

    var abierta = resultado.jornadas.filter(function (j) { return j.estado === 'CONVOCATORIA_ABIERTA'; })[0];
    if (!abierta) {
      tarjeta.classList.add('oculto');
      return;
    }

    document.getElementById('convocatoria-jugador-titulo').textContent =
      (abierta.local_visitante === 'LOCAL' ? 'vs ' : '@ ') + abierta.rival;
    document.getElementById('convocatoria-jugador-info').textContent =
      formatearFecha(abierta.fecha) + (abierta.lugar ? ' · ' + abierta.lugar : '');
    tarjeta.classList.remove('oculto');

    llamarApi('listarConvocatoria', { token: guardada.token, id_jornada: abierta.id_jornada }).then(function (r2) {
      if (!r2.ok || !sesionActual.id_jugador) return;
      var miRespuesta = r2.convocatoria.filter(function (c) { return c.id_jugador === sesionActual.id_jugador; })[0];
      var textoRespuesta = document.getElementById('convocatoria-jugador-respuesta-actual');
      if (miRespuesta && miRespuesta.disponibilidad !== 'PENDIENTE') {
        textoRespuesta.textContent = 'Tu respuesta actual: ' +
          (miRespuesta.disponibilidad === 'ME_APUNTO' ? 'Me apunto ✅' : 'No puedo ❌');
        textoRespuesta.classList.remove('oculto');
      } else {
        textoRespuesta.classList.add('oculto');
      }
    });

    document.getElementById('boton-me-apunto').onclick = function () {
      responderConvocatoria(abierta.id_jornada, 'ME_APUNTO');
    };
    document.getElementById('boton-no-puedo').onclick = function () {
      responderConvocatoria(abierta.id_jornada, 'NO_PUEDO');
    };
  });
}

function responderConvocatoria(idJornada, disponibilidad) {
  var guardada = obtenerSesionGuardada();
  llamarApi('responderConvocatoria', { token: guardada.token, id_jornada: idJornada, disponibilidad: disponibilidad })
    .then(function (resultado) {
      if (resultado.ok) {
        comprobarConvocatoriaAbiertaParaJugador();
      } else {
        alert(resultado.error || 'No se ha podido registrar tu respuesta.');
      }
    });
}

/* ==========================================================================
 * MI PERFIL (jugador)
 * ======================================================================= */

var perfilActual = null;

function irAVistaPerfil() {
  mostrarVista('vista-perfil');
  document.getElementById('tarjeta-perfil-editar').classList.add('oculto');
  document.getElementById('boton-editar-perfil').classList.remove('oculto');
  cargarPerfil();
}

function cargarPerfil() {
  var guardada = obtenerSesionGuardada();
  var contenedor = document.getElementById('tarjeta-perfil');
  contenedor.innerHTML = '<p class="texto-vacio">Cargando...</p>';

  llamarApi('listarJugadores', { token: guardada.token }).then(function (resultado) {
    if (!resultado.ok) {
      contenedor.innerHTML = '<p class="texto-vacio">No se ha podido cargar tu perfil.</p>';
      return;
    }

    var yo = resultado.jugadores.filter(function (j) { return j.id_jugador === guardada.id_jugador; })[0];
    if (!yo) {
      contenedor.innerHTML = '<p class="texto-vacio">Tu usuario no tiene una ficha de jugador asociada. Habla con el capitán.</p>';
      document.getElementById('boton-editar-perfil').classList.add('oculto');
      document.getElementById('perfil-avatar-contenedor').innerHTML = '';
      return;
    }

    perfilActual = yo;

    var avatarContenedor = document.getElementById('perfil-avatar-contenedor');
    avatarContenedor.innerHTML = '';
    avatarContenedor.appendChild(crearAvatar(yo, 'avatar-grande'));

    var posicionSecundaria = yo.posicion_secundaria
      ? ' / ' + (POSICIONES_TEXTO[yo.posicion_secundaria] || yo.posicion_secundaria)
      : '';

    contenedor.innerHTML =
      (yo.apodo ? '<p class="etiqueta-rol etiqueta-rol-apodo"></p>' : '') +
      '<h2 class="titulo-bienvenida"></h2>' +
      '<p class="texto-secundario texto-secundario-posicion"></p>' +
      '<p class="texto-secundario">Puntuación: <strong></strong></p>' +
      '<p class="texto-secundario texto-secundario-estado"></p>';

    if (yo.apodo) {
      contenedor.querySelector('.etiqueta-rol-apodo').textContent = yo.apodo;
    }
    contenedor.querySelector('.titulo-bienvenida').textContent = yo.nombre_completo;
    contenedor.querySelector('.texto-secundario-posicion').textContent =
      'Posición: ' + (POSICIONES_TEXTO[yo.posicion_principal] || yo.posicion_principal) + posicionSecundaria;
    contenedor.querySelector('strong').textContent = Number(yo.puntuacion);
    contenedor.querySelector('.texto-secundario-estado').textContent =
      'Estado: ' + (yo.estado === 'ACTIVO' ? 'Activo ✅' : 'Inactivo');

    cargarEstadisticasPerfil(guardada.id_jugador);
  });
}

/* ---- Editar mis datos ---- */

function abrirEdicionPerfil() {
  if (!perfilActual) return;

  document.getElementById('perfil-nombre').value = perfilActual.nombre;
  document.getElementById('perfil-apellidos').value = perfilActual.apellidos;
  document.getElementById('perfil-apodo').value = perfilActual.apodo || '';
  document.getElementById('perfil-posicion-principal').value = perfilActual.posicion_principal;
  document.getElementById('perfil-posicion-secundaria').value = perfilActual.posicion_secundaria || '';
  document.getElementById('mensaje-error-perfil-editar').classList.add('oculto');

  document.getElementById('boton-editar-perfil').classList.add('oculto');
  document.getElementById('tarjeta-perfil-editar').classList.remove('oculto');
}

function cerrarEdicionPerfil() {
  document.getElementById('tarjeta-perfil-editar').classList.add('oculto');
  document.getElementById('boton-editar-perfil').classList.remove('oculto');
}

function manejarGuardarPerfilPropio(evento) {
  evento.preventDefault();

  var guardada = obtenerSesionGuardada();
  var botonGuardar = document.getElementById('boton-guardar-perfil');
  var mensajeError = document.getElementById('mensaje-error-perfil-editar');

  var datos = {
    token: guardada.token,
    nombre: document.getElementById('perfil-nombre').value.trim(),
    apellidos: document.getElementById('perfil-apellidos').value.trim(),
    apodo: document.getElementById('perfil-apodo').value.trim(),
    posicion_principal: document.getElementById('perfil-posicion-principal').value,
    posicion_secundaria: document.getElementById('perfil-posicion-secundaria').value
  };

  mensajeError.classList.add('oculto');
  botonGuardar.disabled = true;
  botonGuardar.textContent = 'Guardando...';

  llamarApi('editarPerfilPropio', datos)
    .then(function (resultado) {
      if (resultado.ok) {
        cerrarEdicionPerfil();
        cargarPerfil();
      } else {
        mensajeError.textContent = resultado.error || 'No se han podido guardar los cambios.';
        mensajeError.classList.remove('oculto');
      }
    })
    .catch(function () {
      mensajeError.textContent = 'No se ha podido conectar con el servidor.';
      mensajeError.classList.remove('oculto');
    })
    .finally(function () {
      botonGuardar.disabled = false;
      botonGuardar.textContent = 'Guardar';
    });
}

/* ---- Foto de perfil ---- */

/** Redimensiona una imagen a un tamaño razonable en el navegador antes de subirla (más rápido y ocupa menos). */
function redimensionarImagen(file, dimensionMaxima) {
  return new Promise(function (resolve, reject) {
    var lector = new FileReader();
    lector.onerror = function () { reject(new Error('No se ha podido leer la imagen.')); };
    lector.onload = function () {
      var img = new Image();
      img.onerror = function () { reject(new Error('El archivo no es una imagen válida.')); };
      img.onload = function () {
        var ancho = img.width;
        var alto = img.height;
        if (ancho > alto && ancho > dimensionMaxima) {
          alto = Math.round(alto * (dimensionMaxima / ancho));
          ancho = dimensionMaxima;
        } else if (alto >= ancho && alto > dimensionMaxima) {
          ancho = Math.round(ancho * (dimensionMaxima / alto));
          alto = dimensionMaxima;
        }
        var canvas = document.createElement('canvas');
        canvas.width = ancho;
        canvas.height = alto;
        canvas.getContext('2d').drawImage(img, 0, 0, ancho, alto);
        var dataUrl = canvas.toDataURL('image/jpeg', 0.82);
        resolve(dataUrl.split(',')[1]);
      };
      img.src = lector.result;
    };
    lector.readAsDataURL(file);
  });
}

function manejarSeleccionFoto(evento) {
  var file = evento.target.files[0];
  evento.target.value = '';
  if (!file) return;

  var guardada = obtenerSesionGuardada();
  var mensaje = document.getElementById('mensaje-perfil-foto');
  mensaje.classList.add('oculto');

  redimensionarImagen(file, 480)
    .then(function (fotoBase64) {
      return llamarApi('subirFotoJugador', { token: guardada.token, foto_base64: fotoBase64, tipo_mime: 'image/jpeg' });
    })
    .then(function (resultado) {
      if (!resultado.ok) {
        mensaje.textContent = resultado.error || 'No se ha podido subir la foto.';
        mensaje.classList.remove('oculto');
        return;
      }
      cargarPerfil();
    })
    .catch(function (error) {
      mensaje.textContent = error.message || 'No se ha podido subir la foto.';
      mensaje.classList.remove('oculto');
    });
}

var CONFIANZA_TEXTO = {
  'MUY BAJA': 'confianza muy baja',
  'BAJA': 'confianza baja',
  'MEDIA': 'confianza media',
  'ALTA': 'confianza alta',
  'MUY ALTA': 'confianza muy alta'
};

function cargarEstadisticasPerfil(idJugador) {
  var guardada = obtenerSesionGuardada();
  var contenedor = document.getElementById('tarjeta-perfil-estadisticas');

  llamarApi('obtenerEstadisticasJugador', { token: guardada.token, id_jugador: idJugador }).then(function (resultado) {
    if (!resultado.ok) return;
    var e = resultado.estadisticas;

    contenedor.classList.remove('oculto');

    if (e.partidos_jugados === 0) {
      contenedor.innerHTML = '<h3 class="titulo-seccion titulo-subseccion">Estadísticas</h3>' +
        '<p class="texto-vacio">Todavía no has jugado ningún partido esta temporada.</p>';
      return;
    }

    contenedor.innerHTML =
      '<h3 class="titulo-seccion titulo-subseccion">Estadísticas</h3>' +
      '<p class="texto-secundario">Forma reciente (últimos ' + e.forma_reciente.length + '):</p>' +
      '<div class="fila-forma-reciente"></div>' +
      '<p class="texto-secundario">Partidos jugados: <strong>' + e.partidos_jugados + '</strong></p>' +
      '<p class="texto-secundario">Victorias: <strong>' + e.victorias + '</strong> · Derrotas: <strong>' + e.derrotas + '</strong></p>' +
      '<p class="texto-secundario">% de victorias: <strong>' + e.porcentaje_victorias + '%</strong> (' + (CONFIANZA_TEXTO[e.confianza] || e.confianza) + ', ' + e.partidos_jugados + ' partidos)</p>' +
      '<p class="texto-secundario">Sets: <strong>' + e.sets_favor + '-' + e.sets_contra + '</strong> (diferencia ' + (e.diferencia_sets >= 0 ? '+' : '') + e.diferencia_sets + ')</p>' +
      '<p class="texto-secundario">Juegos: <strong>' + e.juegos_favor + '-' + e.juegos_contra + '</strong> (diferencia ' + (e.diferencia_juegos >= 0 ? '+' : '') + e.diferencia_juegos + ')</p>' +
      '<p class="texto-secundario">Como local: <strong>' + e.local.victorias + '/' + e.local.jugados + '</strong> · Como visitante: <strong>' + e.visitante.victorias + '/' + e.visitante.jugados + '</strong></p>' +
      '<p class="texto-secundario">Asistencia: <strong>' + e.asistencia.porcentaje_asistencia + '%</strong> (' + e.asistencia.veces_apuntado + ' de ' + e.asistencia.convocatorias_totales + ' convocatorias) · Seleccionado <strong>' + e.asistencia.veces_seleccionado + '</strong> veces</p>';

    var filaForma = contenedor.querySelector('.fila-forma-reciente');
    e.forma_reciente.forEach(function (resultado) {
      var chip = document.createElement('span');
      chip.className = 'chip-forma ' + (resultado === 'G' ? 'chip-forma-g' : 'chip-forma-p');
      chip.textContent = resultado;
      filaForma.appendChild(chip);
    });
  });
}

/* ==========================================================================
 * CALENDARIO (jugador) — lectura de todas las jornadas
 * ======================================================================= */

function irAVistaCalendario() {
  mostrarVista('vista-calendario');
  cargarCalendario();
}

function cargarCalendario() {
  var guardada = obtenerSesionGuardada();
  var contenedor = document.getElementById('lista-calendario');
  contenedor.innerHTML = '<p class="texto-vacio">Cargando...</p>';

  llamarApi('listarJornadas', { token: guardada.token }).then(function (resultado) {
    if (!resultado.ok || resultado.jornadas.length === 0) {
      contenedor.innerHTML = '<p class="texto-vacio">Todavía no hay jornadas programadas.</p>';
      return;
    }

    contenedor.innerHTML = '';
    resultado.jornadas.forEach(function (jornada) {
      var fila = document.createElement('div');
      fila.className = 'jornada-tarjeta';
      fila.innerHTML =
        '<div class="jornada-info">' +
          '<span class="jornada-rival"></span>' +
          '<span class="jornada-meta"></span>' +
          '<span class="insignia ' + claseInsigniaEstado(jornada.estado) + '"></span>' +
        '</div>';
      fila.querySelector('.jornada-rival').textContent =
        (jornada.local_visitante === 'LOCAL' ? 'vs ' : '@ ') + jornada.rival;
      fila.querySelector('.jornada-meta').textContent =
        formatearFecha(jornada.fecha) + (jornada.lugar ? ' · ' + jornada.lugar : '');
      fila.querySelector('.insignia').textContent = ESTADOS_JORNADA_TEXTO[jornada.estado] || jornada.estado;
      fila.addEventListener('click', function () {
        irAVistaJornadaLectura(jornada);
      });
      contenedor.appendChild(fila);
    });
  });
}

/* ==========================================================================
 * DETALLE DE JORNADA — SOLO LECTURA (jugador): ver parejas y resultados
 * de cualquier jornada, no solo los partidos propios.
 * ======================================================================= */

function irAVistaJornadaLectura(jornada) {
  mostrarVista('vista-jornada-lectura');

  document.getElementById('lectura-rival').textContent =
    (jornada.local_visitante === 'LOCAL' ? 'vs ' : '@ ') + jornada.rival;
  document.getElementById('lectura-info').textContent =
    formatearFecha(jornada.fecha) + (jornada.lugar ? ' · ' + jornada.lugar : '') +
    ' · ' + (jornada.local_visitante === 'LOCAL' ? 'Local' : 'Visitante');

  var estadoBadge = document.getElementById('lectura-estado');
  estadoBadge.className = 'insignia ' + claseInsigniaEstado(jornada.estado);
  estadoBadge.textContent = ESTADOS_JORNADA_TEXTO[jornada.estado] || jornada.estado;

  var bloque = document.getElementById('lectura-bloque-parejas');
  var contenedor = document.getElementById('lectura-lista-partidos');

  if (['CONFIRMADA', 'JUGADA', 'FINALIZADA'].indexOf(jornada.estado) === -1) {
    bloque.classList.add('oculto');
    return;
  }
  bloque.classList.remove('oculto');
  contenedor.innerHTML = '<p class="texto-vacio">Cargando...</p>';

  var guardada = obtenerSesionGuardada();
  llamarApi('listarPartidos', { token: guardada.token, id_jornada: jornada.id_jornada }).then(function (resultado) {
    if (!resultado.ok || resultado.partidos.length === 0) {
      contenedor.innerHTML = '<p class="texto-vacio">Todavía no se han formado las parejas.</p>';
      return;
    }
    contenedor.innerHTML = '';
    resultado.partidos.forEach(function (partido) {
      var tarjeta = document.createElement('div');
      tarjeta.className = 'partido-tarjeta';
      tarjeta.innerHTML =
        '<div class="partido-info">' +
          '<span class="partido-numero"></span>' +
          '<span class="partido-jugadores"></span>' +
          '<span class="partido-marcador"></span>' +
        '</div>';
      tarjeta.querySelector('.partido-numero').textContent = 'Partido ' + partido.numero_partido;
      tarjeta.querySelector('.partido-jugadores').appendChild(crearParJugadores(partido.jugador_a, partido.jugador_b));

      if (partido.resultado) {
        var r = partido.resultado;
        tarjeta.querySelector('.partido-marcador').textContent =
          (r.resultado === 'GANADO' ? '✅ Ganado' : '❌ Perdido') + ' · Sets ' + r.sets_favor + '-' + r.sets_contra +
          (r.juegos_favor || r.juegos_contra ? ' · Juegos ' + r.juegos_favor + '-' + r.juegos_contra : '');
      } else {
        tarjeta.querySelector('.partido-marcador').textContent = 'Resultado pendiente';
      }
      contenedor.appendChild(tarjeta);
    });
  });
}

/* ==========================================================================
 * DASHBOARD / ESTADÍSTICAS (capitán)
 * ======================================================================= */

function irAVistaDashboard() {
  mostrarVista('vista-dashboard');
  cargarDashboard();
}

function cargarDashboard() {
  var guardada = obtenerSesionGuardada();
  var resumen = document.getElementById('resumen-dashboard');
  var listaRanking = document.getElementById('lista-ranking-jugadores');
  var listaParejas = document.getElementById('lista-ranking-parejas');
  resumen.innerHTML = '<p class="texto-vacio">Cargando...</p>';
  listaRanking.innerHTML = '';
  listaParejas.innerHTML = '';

  Promise.all([
    llamarApi('obtenerDashboard', { token: guardada.token }),
    llamarApi('listarRankingJugadores', { token: guardada.token }),
    llamarApi('listarEstadisticasParejas', { token: guardada.token })
  ]).then(function (respuestas) {
    var dash = respuestas[0], ranking = respuestas[1], parejas = respuestas[2];

    if (dash.ok) pintarResumenDashboard(dash.dashboard);
    if (ranking.ok) pintarRankingJugadores(ranking.ranking);
    if (parejas.ok) pintarRankingParejas(parejas.parejas);
  });
}

function pintarResumenDashboard(d) {
  var resumen = document.getElementById('resumen-dashboard');

  var proximaTexto = d.proxima_jornada
    ? (d.proxima_jornada.local_visitante === 'LOCAL' ? 'vs ' : '@ ') + d.proxima_jornada.rival + ' · ' + formatearFecha(d.proxima_jornada.fecha)
    : 'No hay ninguna jornada programada';

  resumen.innerHTML =
    '<h3 class="titulo-seccion titulo-subseccion" style="margin-top:0">Resumen del equipo</h3>' +
    '<div class="fila-resumen-dashboard">' +
      '<div class="stat-dashboard"><span class="stat-dashboard-valor">' + d.jornadas_jugadas + '</span><span class="stat-dashboard-etiqueta">Jornadas jugadas</span></div>' +
      '<div class="stat-dashboard"><span class="stat-dashboard-valor">' + d.partidos_totales + '</span><span class="stat-dashboard-etiqueta">Partidos totales</span></div>' +
      '<div class="stat-dashboard"><span class="stat-dashboard-valor">' + d.victorias_totales + '-' + d.derrotas_totales + '</span><span class="stat-dashboard-etiqueta">Victorias-Derrotas</span></div>' +
      '<div class="stat-dashboard"><span class="stat-dashboard-valor">' + d.porcentaje_victorias_equipo + '%</span><span class="stat-dashboard-etiqueta">% victorias equipo</span></div>' +
    '</div>' +
    '<p class="texto-secundario" style="margin-top:16px">📅 Próxima jornada: <strong class="dashboard-proxima"></strong></p>' +
    '<p class="texto-secundario pareja-jugadores">🏅 Mejor jugador: </p>' +
    '<p class="texto-secundario pareja-jugadores">🤝 Mejor pareja: </p>';

  resumen.querySelector('.dashboard-proxima').textContent = proximaTexto;

  var parrafos = resumen.querySelectorAll('.pareja-jugadores');
  var parrafoJugador = parrafos[0];
  var parrafoPareja = parrafos[1];

  if (d.mejor_jugador) {
    parrafoJugador.appendChild(crearAvatar(d.mejor_jugador, 'avatar-pequeno'));
    var textoJugador = document.createElement('strong');
    textoJugador.textContent = d.mejor_jugador.nombre + ' (' + d.mejor_jugador.porcentaje + '%, ' + d.mejor_jugador.partidos + ' partidos)';
    parrafoJugador.appendChild(textoJugador);
  } else {
    parrafoJugador.appendChild(document.createTextNode('Todavía no hay datos'));
  }

  if (d.mejor_pareja) {
    parrafoPareja.appendChild(crearParJugadores(
      { nombre_completo: d.mejor_pareja.jugador_a.nombre, foto_url: d.mejor_pareja.jugador_a.foto_url },
      { nombre_completo: d.mejor_pareja.jugador_b.nombre, foto_url: d.mejor_pareja.jugador_b.foto_url }
    ));
    var textoPareja = document.createElement('strong');
    textoPareja.textContent = '(' + d.mejor_pareja.porcentaje + '%, ' + d.mejor_pareja.partidos + ' partidos)';
    parrafoPareja.appendChild(textoPareja);
  } else {
    parrafoPareja.appendChild(document.createTextNode('Todavía no hay datos'));
  }
}

function pintarRankingJugadores(ranking) {
  var contenedor = document.getElementById('lista-ranking-jugadores');
  var conPartidos = ranking.filter(function (r) { return r.partidos_jugados > 0; });

  if (conPartidos.length === 0) {
    contenedor.innerHTML = '<p class="texto-vacio">Todavía no hay partidos jugados.</p>';
    return;
  }

  contenedor.innerHTML = '';
  conPartidos.forEach(function (r, indice) {
    var fila = document.createElement('div');
    fila.className = 'jugador-tarjeta';
    fila.innerHTML =
      '<div class="jugador-info">' +
        '<span class="jugador-nombre"></span>' +
        '<div class="jugador-meta">' +
          '<span>' + r.victorias + 'V - ' + r.derrotas + 'D (' + r.partidos_jugados + ' partidos)</span>' +
        '</div>' +
      '</div>' +
      '<span class="insignia insignia-compat-buena"></span>';
    fila.querySelector('.jugador-nombre').textContent = (indice + 1) + '. ' + (r.apodo || r.nombre_completo);
    fila.querySelector('.insignia').textContent = r.porcentaje_victorias + '%';
    fila.insertBefore(crearAvatar(r, 'avatar-mediano'), fila.firstChild);
    contenedor.appendChild(fila);
  });
}

function pintarRankingParejas(parejas) {
  var contenedor = document.getElementById('lista-ranking-parejas');

  if (parejas.length === 0) {
    contenedor.innerHTML = '<p class="texto-vacio">Todavía no hay parejas con partidos jugados.</p>';
    return;
  }

  contenedor.innerHTML = '';
  parejas.forEach(function (p, indice) {
    var fila = document.createElement('div');
    fila.className = 'jugador-tarjeta';
    fila.innerHTML =
      '<div class="jugador-info">' +
        '<span class="jugador-nombre pareja-jugadores"></span>' +
        '<div class="jugador-meta">' +
          '<span>' + p.victorias + 'V - ' + p.derrotas + 'D (' + p.partidos_juntos + ' partidos) · ' + (CONFIANZA_TEXTO[p.confianza] || p.confianza) + '</span>' +
        '</div>' +
      '</div>' +
      '<span class="insignia insignia-compat-buena"></span>';

    var nombreFila = fila.querySelector('.jugador-nombre');
    var numero = document.createElement('span');
    numero.textContent = (indice + 1) + '.';
    nombreFila.appendChild(numero);
    nombreFila.appendChild(crearParJugadores(
      { nombre_completo: p.jugador_a.nombre, foto_url: p.jugador_a.foto_url },
      { nombre_completo: p.jugador_b.nombre, foto_url: p.jugador_b.foto_url }
    ));

    fila.querySelector('.insignia').textContent = p.porcentaje_victorias + '%';
    contenedor.appendChild(fila);
  });
}

document.addEventListener('DOMContentLoaded', function () {
  document.getElementById('formulario-login').addEventListener('submit', manejarEnvioLogin);
  document.getElementById('boton-logout').addEventListener('click', manejarLogout);

  document.getElementById('boton-ir-jugadores').addEventListener('click', irAVistaJugadores);
  document.getElementById('boton-volver-jugadores').addEventListener('click', function () {
    mostrarVista('vista-inicio');
  });
  document.getElementById('boton-nuevo-jugador').addEventListener('click', function () {
    abrirModalJugador(null);
  });
  document.getElementById('boton-cancelar-jugador').addEventListener('click', cerrarModalJugador);
  document.getElementById('formulario-jugador').addEventListener('submit', manejarEnvioJugador);

  document.getElementById('boton-ir-usuarios').addEventListener('click', irAVistaUsuarios);
  document.getElementById('boton-volver-usuarios').addEventListener('click', function () {
    mostrarVista('vista-inicio');
  });
  document.getElementById('boton-nuevo-usuario').addEventListener('click', function () {
    abrirModalUsuario(null);
  });
  document.getElementById('boton-cancelar-usuario').addEventListener('click', cerrarModalUsuario);
  document.getElementById('formulario-usuario').addEventListener('submit', manejarEnvioUsuario);

  document.getElementById('boton-ir-jornadas').addEventListener('click', irAVistaJornadas);
  document.getElementById('boton-volver-jornadas').addEventListener('click', function () {
    mostrarVista('vista-inicio');
  });
  document.getElementById('boton-volver-jornada-detalle').addEventListener('click', irAVistaJornadas);
  document.getElementById('boton-nueva-jornada').addEventListener('click', abrirModalJornada);
  document.getElementById('boton-cancelar-jornada').addEventListener('click', cerrarModalJornada);
  document.getElementById('formulario-jornada').addEventListener('submit', manejarEnvioJornada);

  document.getElementById('boton-ir-perfil').addEventListener('click', irAVistaPerfil);
  document.getElementById('boton-volver-perfil').addEventListener('click', function () {
    mostrarVista('vista-inicio');
  });
  document.getElementById('boton-editar-perfil').addEventListener('click', abrirEdicionPerfil);
  document.getElementById('boton-cancelar-editar-perfil').addEventListener('click', cerrarEdicionPerfil);
  document.getElementById('formulario-perfil-editar').addEventListener('submit', manejarGuardarPerfilPropio);
  document.getElementById('perfil-foto-input').addEventListener('change', manejarSeleccionFoto);
  document.getElementById('boton-ir-calendario').addEventListener('click', irAVistaCalendario);
  document.getElementById('boton-volver-calendario').addEventListener('click', function () {
    mostrarVista('vista-inicio');
  });
  document.getElementById('boton-volver-jornada-lectura').addEventListener('click', irAVistaCalendario);

  document.getElementById('boton-ir-dashboard').addEventListener('click', irAVistaDashboard);
  document.getElementById('boton-volver-dashboard').addEventListener('click', function () {
    mostrarVista('vista-inicio');
  });

  document.getElementById('boton-volver-seleccion').addEventListener('click', irAVistaJornadas);
  document.getElementById('boton-confirmar-seleccion').addEventListener('click', manejarConfirmarSeleccion);

  document.getElementById('boton-volver-parejas').addEventListener('click', irAVistaJornadas);
  document.getElementById('boton-guardar-parejas').addEventListener('click', manejarGuardarParejas);

  document.getElementById('boton-volver-recomendaciones').addEventListener('click', irAVistaJornadas);

  document.getElementById('boton-cancelar-resultado').addEventListener('click', cerrarModalResultado);
  document.getElementById('formulario-resultado').addEventListener('submit', manejarEnvioResultado);

  comprobarSesionAlCargar();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('service-worker.js').catch(function () {
      // Si falla el registro (por ejemplo, en un navegador que no lo soporta bien),
      // la app sigue funcionando igual, simplemente sin modo sin conexión.
    });
  }
});
