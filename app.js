/**
 * Frontend: login, sesión guardada en localStorage, pantalla de inicio y
 * gestión de jugadores (Fase 4). Habla con el backend de Apps Script a
 * través de una única función llamarApi().
 */

var CONFIG = {
  API_URL: 'https://script.google.com/macros/s/AKfycbyNesOIcXqUElt02t1eCSDdTJSJwcQN6Rr_lnUgpz2rjibh1qHHrLRPwQdciWANpXhj/exec',
  CLAVE_TOKEN: 'padel_app_token'
};

/**
 * Tema claro/oscuro: por defecto sigue al sistema (el CSS ya lo hace solo
 * con prefers-color-scheme); si el jugador toca el botón, se guarda su
 * elección explícita en este navegador y a partir de ahí manda siempre a
 * esa, sea cual sea el tema del sistema.
 */
var CLAVE_TEMA = 'padel_app_tema';

function temaEfectivo() {
  var guardado = null;
  try { guardado = localStorage.getItem(CLAVE_TEMA); } catch (e) {}
  if (guardado === 'light' || guardado === 'dark') return guardado;
  return (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
}

function actualizarBotonTema() {
  var boton = document.getElementById('boton-tema');
  if (!boton) return;
  var oscuro = temaEfectivo() === 'dark';
  boton.textContent = oscuro ? '☀️' : '🌙';
  boton.title = oscuro ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro';
}

function alternarTema() {
  var nuevo = temaEfectivo() === 'dark' ? 'light' : 'dark';
  try { localStorage.setItem(CLAVE_TEMA, nuevo); } catch (e) {}
  document.documentElement.setAttribute('data-theme', nuevo);
  actualizarBotonTema();
}

var POSICIONES_TEXTO = {
  DERECHA: 'Derecha',
  'REVÉS': 'Revés',
  AMBAS: 'Ambas'
};

/**
 * Ya no existe "Ambas": quien juega los dos lados lo expresa con posición
 * principal + secundaria (la contraria), marcada con una casilla en el
 * formulario en lugar de un desplegable de tres opciones.
 */
function posicionContraria(p) {
  if (p === 'DERECHA') return 'REVÉS';
  if (p === 'REVÉS') return 'DERECHA';
  return '';
}

function actualizarTextoPosicionSecundaria(idPrincipal, idTexto) {
  var principal = document.getElementById(idPrincipal).value;
  var contraria = posicionContraria(principal);
  document.getElementById(idTexto).textContent = contraria
    ? 'También juega de ' + POSICIONES_TEXTO[contraria].toLowerCase()
    : 'También juega en el otro lado';
}

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

/**
 * Letra de posición para mostrar junto al nombre: D (derecha), R (revés) o
 * D-R (juega en los dos lados). Vacío si no hay datos de posición (por
 * ejemplo en tarjetas de resultados que no traen ese dato del jugador).
 */
function letraPosicion(jugador) {
  if (!jugador || !jugador.posicion_principal) return '';
  var jugables = posicionesJugablesCliente(jugador.posicion_principal, jugador.posicion_secundaria);
  var puedeDerecha = jugables.indexOf('DERECHA') !== -1;
  var puedeReves = jugables.indexOf('REVÉS') !== -1;
  if (puedeDerecha && puedeReves) return 'D-R';
  if (puedeDerecha) return 'D';
  if (puedeReves) return 'R';
  return '';
}

/** Construye el bloque "avatar + nombre1 + avatar + nombre2" que se repite en parejas y partidos. */
function crearParJugadores(jugadorA, jugadorB) {
  var frag = document.createDocumentFragment();
  frag.appendChild(crearAvatar(jugadorA, 'avatar-pequeno'));
  var nombreA = document.createElement('span');
  nombreA.textContent = jugadorA.apodo || jugadorA.nombre_completo;
  frag.appendChild(nombreA);
  var letraA = letraPosicion(jugadorA);
  if (letraA) {
    var insigniaA = document.createElement('span');
    insigniaA.className = 'insignia insignia-posicion';
    insigniaA.textContent = letraA;
    frag.appendChild(insigniaA);
  }

  var mas = document.createElement('span');
  mas.textContent = '+';
  frag.appendChild(mas);

  frag.appendChild(crearAvatar(jugadorB, 'avatar-pequeno'));
  var nombreB = document.createElement('span');
  nombreB.textContent = jugadorB.apodo || jugadorB.nombre_completo;
  frag.appendChild(nombreB);
  var letraB = letraPosicion(jugadorB);
  if (letraB) {
    var insigniaB = document.createElement('span');
    insigniaB.className = 'insignia insignia-posicion';
    insigniaB.textContent = letraB;
    frag.appendChild(insigniaB);
  }

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

/**
 * Caché en memoria de la última respuesta buena de cada acción, para que al
 * volver a una pantalla ya vista en esta misma sesión se vea al instante en
 * vez de esperar otra vez el viaje de ida y vuelta al servidor. Siempre se
 * pide igualmente la versión actualizada por detrás (así nunca se queda
 * desactualizado más de lo que tarda esa petición) y se repinta si hay
 * cambios; esto solo evita la ESPERA la segunda vez, no sustituye al dato real.
 */
var _cacheApi = {};

function _claveCacheApi(action, params) {
  var params2 = Object.assign({}, params);
  delete params2.token;
  return action + ':' + JSON.stringify(params2);
}

/**
 * Igual que llamarApi, pero si ya hay una respuesta guardada de una llamada
 * anterior con los mismos parámetros, la entrega al momento (vía
 * alTenerCacheado) mientras de todas formas pide la actualizada por detrás.
 * El resultado final (fresco) se sirve siempre a través de la promesa
 * devuelta, igual que llamarApi normal.
 */
function llamarApiConCache(action, params, alTenerCacheado) {
  var clave = _claveCacheApi(action, params);
  var cacheado = _cacheApi[clave];
  if (cacheado && alTenerCacheado) {
    alTenerCacheado(cacheado);
  }
  return llamarApi(action, params).then(function (resultado) {
    if (resultado.ok) _cacheApi[clave] = resultado;
    return resultado;
  });
}

/**
 * Patrón común de las pantallas de "listar algo": si ya hay una respuesta en
 * caché de esta misma sesión, la pinta al instante (sin pasar por
 * "Cargando..."), y de todas formas pide la versión actualizada por detrás
 * y vuelve a pintar cuando llega. Si esa actualización silenciosa falla pero
 * ya había caché en pantalla, no se borra lo que ya se veía; solo se avisa
 * del error si no había nada que mostrar todavía.
 */
/**
 * Borra de la caché todo lo guardado para una acción (sin importar con qué
 * parámetros se pidiera). Se llama justo después de guardar un cambio, para
 * que la próxima vez que se pinte esa pantalla no se vea un instante el dato
 * viejo antes de que llegue el refresco de fondo.
 */
function limpiarCacheApi(accion) {
  Object.keys(_cacheApi).forEach(function (clave) {
    if (clave === accion || clave.indexOf(accion + ':') === 0) delete _cacheApi[clave];
  });
}

function cargarConCache(accion, params, contenedor, textoCargando, pintar, alError) {
  var huboCache = !!_cacheApi[_claveCacheApi(accion, params)];
  if (!huboCache && contenedor) {
    contenedor.innerHTML = '<p class="texto-vacio">' + textoCargando + '</p>';
  }
  return llamarApiConCache(accion, params, function (cacheado) {
    pintar(cacheado);
  }).then(function (resultado) {
    if (!resultado.ok) throw new Error(resultado.error || 'No se ha podido cargar.');
    pintar(resultado);
  }).catch(function (error) {
    if (!huboCache && alError) alError(error);
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

/**
 * resumenPrecargado (opcional): si login/validarSesion ya han devuelto el
 * resumen de convocatorias en la misma respuesta, se pinta directamente con
 * ese dato en vez de volver a pedirlo — así al entrar en la app no hacen
 * falta dos viajes de ida y vuelta al servidor seguidos (uno para la sesión
 * y otro para el resumen), sino uno solo.
 */
function mostrarInicio(datosUsuario, resumenPrecargado) {
  sesionActual = datosUsuario;

  document.getElementById('texto-nombre-usuario').textContent = datosUsuario.apodo || datosUsuario.nombre_usuario;
  document.getElementById('etiqueta-rol').textContent = datosUsuario.rol;
  document.getElementById('menu-capitan').classList.toggle('oculto', datosUsuario.rol !== 'CAPITAN');
  document.getElementById('menu-jugador').classList.toggle('oculto', datosUsuario.rol !== 'JUGADOR');
  mostrarVista('vista-inicio');

  document.getElementById('tarjeta-convocatoria-jugador').classList.add('oculto');
  document.getElementById('tarjeta-convocatoria-capitan').classList.add('oculto');
  if (datosUsuario.rol === 'CAPITAN') {
    // Una sola llamada resuelve tanto el panel de gestión como (si el
    // capitán también es jugador) su propia tarjeta de "Voy / No puedo".
    if (resumenPrecargado) pintarResumenCapitan(resumenPrecargado);
    else comprobarConvocatoriaAbiertaParaCapitan();
  } else if (datosUsuario.rol === 'JUGADOR') {
    if (resumenPrecargado) pintarResumenJugador(resumenPrecargado);
    else comprobarConvocatoriaAbiertaParaJugador();
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
      mostrarInicio(resultado.sesion, resultado.resumen);
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
        mostrarInicio(resultado, resultado.resumen);
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

/**
 * La puntuación se actualiza sola cada semana desde el ranking de la SNP,
 * pero el capitán puede forzarlo aquí en cualquier momento (por ejemplo,
 * justo después de una jornada) sin tener que esperar al lunes.
 */
function actualizarPuntuacionesSNP() {
  var boton = document.getElementById('boton-actualizar-puntuaciones-snp');
  var guardada = obtenerSesionGuardada();
  boton.disabled = true;
  boton.textContent = 'Consultando la SNP (puede tardar un rato)...';

  llamarApi('actualizarPuntuacionesSNP', { token: guardada.token })
    .then(function (resultado) {
      if (resultado.ok) {
        var mensaje = resultado.actualizados.length + ' jugadores actualizados.';
        if (resultado.sin_encontrar.length > 0) {
          mensaje += '\n\nNo se han encontrado en el ranking de la SNP:\n' + resultado.sin_encontrar.join('\n');
        }
        alert(mensaje);
        limpiarCacheApi('listarJugadores');
        limpiarCacheApi('obtenerClasificacionCompleta');
        cargarJugadores();
      } else {
        alert(resultado.error || 'No se han podido actualizar las puntuaciones.');
      }
    })
    .finally(function () {
      boton.disabled = false;
      boton.textContent = '🔄 Actualizar puntuaciones desde la SNP';
    });
}

function cargarJugadores() {
  var guardada = obtenerSesionGuardada();
  var contenedor = document.getElementById('lista-jugadores');
  var mensaje = document.getElementById('mensaje-jugadores');
  mensaje.classList.add('oculto');

  cargarConCache(
    'listarJugadores', { token: guardada.token }, contenedor, 'Cargando jugadores...',
    function (resultado) {
      jugadoresCache = resultado.jugadores;
      pintarJugadores(jugadoresCache);
    },
    function (error) {
      contenedor.innerHTML = '';
      mensaje.textContent = error.message || 'No se ha podido conectar con el servidor.';
      mensaje.classList.remove('oculto');
    }
  );
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
        (jugador.no_convocable ? '<span class="insignia insignia-inactivo">No convocable</span>' : '') +
        '<span>· Puntuación: ' + Number(jugador.puntuacion) + '</span>' +
        '<span>· Usuario: <strong>' + (jugador.nombre_usuario || 'sin acceso') + '</strong></span>' +
      '</div>' +
    '</div>' +
    '<div class="jugador-acciones">' +
      '<button type="button" class="boton-mini boton-editar">Editar</button>' +
      '<button type="button" class="boton-mini boton-restablecer-codigo">Restablecer contraseña</button>' +
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

  tarjeta.querySelector('.boton-restablecer-codigo').addEventListener('click', function () {
    restablecerCodigoJugador(jugador);
  });

  var botonEstado = tarjeta.querySelector(estadoActivo ? '.boton-desactivar' : '.boton-reactivar');
  botonEstado.addEventListener('click', function () {
    cambiarEstadoJugador(jugador, estadoActivo ? 'INACTIVO' : 'ACTIVO');
  });

  tarjeta.insertBefore(crearAvatar(jugador, 'avatar-mediano'), tarjeta.firstChild);

  return tarjeta;
}

/**
 * El capitán restablece el código de acceso de un jugador (por ejemplo si
 * lo ha olvidado) al código temporal por defecto.
 */
function restablecerCodigoJugador(jugador) {
  if (!jugador.nombre_usuario) {
    alert('Este jugador todavía no tiene ningún acceso creado.');
    return;
  }
  if (!confirm('¿Restablecer la contraseña de ' + (jugador.apodo || jugador.nombre_completo) + ' a la temporal por defecto?')) {
    return;
  }

  var guardada = obtenerSesionGuardada();
  llamarApi('restablecerCodigoAcceso', { token: guardada.token, id_jugador: jugador.id_jugador })
    .then(function (resultado) {
      if (resultado.ok) {
        alert('Contraseña restablecida.\n\nUsuario: ' + resultado.nombre_usuario + '\nCódigo temporal: ' + resultado.codigo_nuevo + '\n\nDíselo para que entre y lo cambie por uno propio desde "Mi perfil".');
      } else {
        alert(resultado.error || 'No se ha podido restablecer la contraseña.');
      }
    });
}

function cambiarEstadoJugador(jugador, nuevoEstado) {
  var guardada = obtenerSesionGuardada();
  llamarApi('cambiarEstadoJugador', {
    token: guardada.token,
    id_jugador: jugador.id_jugador,
    nuevo_estado: nuevoEstado
  }).then(function (resultado) {
    if (resultado.ok) {
      limpiarCacheApi('listarJugadores');
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
    document.getElementById('jugador-email').value = jugador.email || '';
    document.getElementById('jugador-telefono').value = jugador.telefono || '';
    // "AMBAS" ya no es válido, pero un jugador antiguo sin migrar puede
    // seguir teniéndolo guardado: se trata como si jugara los dos lados.
    var principal = jugador.posicion_principal === 'AMBAS' ? 'DERECHA' : jugador.posicion_principal;
    var jugabaAmbas = jugador.posicion_principal === 'AMBAS' || jugador.posicion_secundaria === 'AMBAS' ||
      (jugador.posicion_secundaria && jugador.posicion_secundaria !== principal);
    document.getElementById('jugador-posicion-principal').value = principal;
    document.getElementById('jugador-posicion-secundaria-check').checked = !!jugabaAmbas;
    document.getElementById('jugador-puntuacion').value = jugador.puntuacion;
    document.getElementById('jugador-no-convocable').checked = !!jugador.no_convocable;
  } else {
    titulo.textContent = 'Nuevo jugador';
    document.getElementById('jugador-id').value = '';
    document.getElementById('jugador-puntuacion').value = 0;
    document.getElementById('jugador-no-convocable').checked = false;
  }

  actualizarTextoPosicionSecundaria('jugador-posicion-principal', 'jugador-posicion-secundaria-texto');
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

  var posicionPrincipal = document.getElementById('jugador-posicion-principal').value;
  var tieneSecundaria = document.getElementById('jugador-posicion-secundaria-check').checked;

  var datos = {
    token: guardada.token,
    nombre: document.getElementById('jugador-nombre').value.trim(),
    apellidos: document.getElementById('jugador-apellidos').value.trim(),
    apodo: document.getElementById('jugador-apodo').value.trim(),
    email: document.getElementById('jugador-email').value.trim(),
    telefono: document.getElementById('jugador-telefono').value.trim(),
    posicion_principal: posicionPrincipal,
    posicion_secundaria: tieneSecundaria ? posicionContraria(posicionPrincipal) : '',
    puntuacion: document.getElementById('jugador-puntuacion').value,
    no_convocable: document.getElementById('jugador-no-convocable').checked
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
        limpiarCacheApi('listarJugadores');
        cerrarModalJugador();
        cargarJugadores();
        if (accion === 'crearJugador' && resultado.nombre_usuario) {
          alert('Jugador creado con su acceso a la app.\n\nUsuario: ' + resultado.nombre_usuario + '\nCódigo temporal: ' + resultado.codigo_acceso + '\n\nDíselo para que entre y lo cambie por uno propio desde "Mi perfil".');
        }
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
 * JORNADAS (capitán)
 * ======================================================================= */

var jornadaActual = null;
var jornadasCache = [];

function irAVistaJornadas() {
  mostrarVista('vista-jornadas');
  cargarJornadas();
}

function cargarJornadas() {
  var guardada = obtenerSesionGuardada();
  var contenedor = document.getElementById('lista-jornadas');
  var mensaje = document.getElementById('mensaje-jornadas');
  mensaje.classList.add('oculto');

  cargarConCache(
    'listarJornadas', { token: guardada.token }, contenedor, 'Cargando jornadas...',
    function (resultado) {
      jornadasCache = resultado.jornadas;
      pintarJornadasFiltradas();
    },
    function (error) {
      contenedor.innerHTML = '';
      mensaje.textContent = error.message || 'No se ha podido conectar con el servidor.';
      mensaje.classList.remove('oculto');
    }
  );
}

function pintarJornadasFiltradas() {
  var filtro = document.getElementById('filtro-jornadas').value;
  var jornadas = filtro === 'TODAS'
    ? jornadasCache
    : jornadasCache.filter(function (j) { return j.estado === filtro; });
  pintarJornadas(jornadas);
}

function pintarJornadas(jornadas) {
  var contenedor = document.getElementById('lista-jornadas');

  if (jornadas.length === 0) {
    contenedor.innerHTML = jornadasCache.length === 0
      ? '<p class="texto-vacio">Todavía no hay jornadas. Pulsa "+ Nueva jornada" para crear la primera.</p>'
      : '<p class="texto-vacio">No hay ninguna jornada con este filtro.</p>';
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
        ['listarResultados', 'obtenerClasificacionCompleta', 'obtenerDashboard', 'obtenerEstadisticasCompletasJugador']
          .forEach(limpiarCacheApi);
        cerrarModalResultado();
        cargarPartidos(jornadaActual.id_jornada);
        // El estado de la jornada puede haber cambiado (JUGADA / FINALIZADA);
        // ya viene en la propia respuesta, no hace falta pedirlo aparte.
        if (resultado.jornada) {
          jornadaActual.estado = resultado.jornada.estado;
          var estadoBadge = document.getElementById('jornada-detalle-estado');
          estadoBadge.className = 'insignia ' + claseInsigniaEstado(jornadaActual.estado);
          estadoBadge.textContent = ESTADOS_JORNADA_TEXTO[jornadaActual.estado] || jornadaActual.estado;
          pintarAccionesJornada(jornadaActual);
        }
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
    boton.textContent = 'Elegir las 5 parejas';
    boton.addEventListener('click', function () {
      irAVistaParejas(jornada);
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

function borrarJornadaConConfirmacion(jornada) {
  var texto = (jornada.local_visitante === 'LOCAL' ? 'vs ' : '@ ') + jornada.rival + ' (' + formatearFecha(jornada.fecha) + ')';
  var confirmado = window.confirm(
    '¿Seguro que quieres borrar la jornada ' + texto + '?\n\n' +
    'Se borrará también toda la convocatoria, la selección, las parejas y los resultados que tuviera. ' +
    'Esta acción no se puede deshacer.'
  );
  if (!confirmado) return;

  var guardada = obtenerSesionGuardada();
  llamarApi('eliminarJornada', { token: guardada.token, id_jornada: jornada.id_jornada })
    .then(function (resultado) {
      if (!resultado.ok) {
        alert(resultado.error || 'No se ha podido borrar la jornada.');
        return;
      }
      limpiarCacheApi('listarJornadas');
      irAVistaJornadas();
    });
}

function cambiarEstadoJornadaYRecargar(idJornada, nuevoEstado) {
  var guardada = obtenerSesionGuardada();
  llamarApi('cambiarEstadoJornada', { token: guardada.token, id_jornada: idJornada, nuevo_estado: nuevoEstado })
    .then(function (resultado) {
      if (!resultado.ok) {
        alert(resultado.error || 'No se ha podido cambiar el estado de la jornada.');
        return;
      }
      limpiarCacheApi('listarJornadas');
      jornadaActual.estado = nuevoEstado;
      abrirDetalleJornada(jornadaActual);
    });
}

/** Sin argumento: modal para crear. Con una jornada: modal para editarla. */
function abrirModalJornada(jornada) {
  document.getElementById('formulario-jornada').reset();
  document.getElementById('mensaje-error-jornada').classList.add('oculto');

  if (jornada) {
    document.getElementById('modal-jornada-titulo').textContent = 'Editar jornada';
    document.getElementById('jornada-id').value = jornada.id_jornada;
    document.getElementById('jornada-fecha').value = String(jornada.fecha).split('T')[0];
    document.getElementById('jornada-rival').value = jornada.rival;
    document.getElementById('jornada-local-visitante').value = jornada.local_visitante;
    document.getElementById('jornada-lugar').value = jornada.lugar || '';
    document.getElementById('jornada-observaciones').value = jornada.observaciones || '';
  } else {
    document.getElementById('modal-jornada-titulo').textContent = 'Nueva jornada';
    document.getElementById('jornada-id').value = '';
  }

  document.getElementById('modal-jornada').classList.remove('oculto');
}

function cerrarModalJornada() {
  document.getElementById('modal-jornada').classList.add('oculto');
}

function manejarEnvioJornada(evento) {
  evento.preventDefault();

  var guardada = obtenerSesionGuardada();
  var idJornada = document.getElementById('jornada-id').value;
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
  if (idJornada) datos.id_jornada = idJornada;

  mensajeError.classList.add('oculto');
  botonGuardar.disabled = true;
  botonGuardar.textContent = 'Guardando...';

  llamarApi(idJornada ? 'editarJornada' : 'crearJornada', datos)
    .then(function (resultado) {
      if (resultado.ok) {
        limpiarCacheApi('listarJornadas');
        cerrarModalJornada();
        if (idJornada && jornadaActual && jornadaActual.id_jornada === idJornada) {
          jornadaActual = Object.assign({}, jornadaActual, {
            fecha: datos.fecha, rival: datos.rival, local_visitante: datos.local_visitante,
            lugar: datos.lugar, observaciones: datos.observaciones
          });
          abrirDetalleJornada(jornadaActual);
        } else {
          cargarJornadas();
        }
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
 * ELEGIR LAS 5 PAREJAS (capitán) — fusiona la selección de los 10 con la
 * formación de parejas: el capitán toca directamente parejas de jugadores
 * (de entre los apuntados, o de entre los 10 ya seleccionados si se están
 * rehaciendo), viendo su posición, su historial y su asistencia.
 * ======================================================================= */

var parejasJornadaId = null;
var parejasJornadaEstado = null;
var parejasDisponibles = [];
var parejasFormadas = [];
var parejaEnFormacionIds = [];

function irAVistaParejas(jornada) {
  parejasJornadaId = jornada.id_jornada;
  parejasJornadaEstado = jornada.estado;
  parejasDisponibles = [];
  parejasFormadas = [];
  parejaEnFormacionIds = [];
  mostrarVista('vista-parejas');
  document.getElementById('mensaje-parejas').classList.add('oculto');
  document.getElementById('vista-previa-pareja').classList.add('oculto');
  pintarParejasFormadas(); // limpia cualquier resto visual de una jornada anterior

  var esSeleccionInicial = jornada.estado === 'CONVOCATORIA_CERRADA';
  document.getElementById('titulo-vista-parejas').textContent = esSeleccionInicial ? 'Elegir las 5 parejas' : 'Rehacer parejas';
  document.getElementById('descripcion-vista-parejas').textContent = esSeleccionInicial
    ? 'Toca dos jugadores apuntados para formar una pareja. Los 10 que queden emparejados serán los seleccionados para esta jornada.'
    : 'Toca dos jugadores para formar una pareja. Se ordenarán solas por puntuación al guardar.';

  var guardada = obtenerSesionGuardada();
  var contenedor = document.getElementById('lista-disponibles-parejas');
  contenedor.innerHTML = '<p class="texto-vacio">Cargando...</p>';

  // Antes eran 2 peticiones seguidas (primero el pool de candidatos, y solo
  // si eran 10, la sugerencia de alineación); ahora el backend las junta en
  // una sola llamada.
  var idJornadaPeticion = jornada.id_jornada;
  document.getElementById('sugerencia-alineacion').classList.add('oculto');

  llamarApi('obtenerPoolYSugerenciaParejas', { token: guardada.token, id_jornada: jornada.id_jornada }).then(function (resultado) {
    if (idJornadaPeticion !== parejasJornadaId) return; // el capitán ya salió de esta jornada
    if (!resultado.ok) {
      contenedor.innerHTML = '<p class="texto-vacio">' + (resultado.error || 'No se han podido cargar los jugadores.') + '</p>';
      return;
    }
    if (resultado.jugadores.length < 10) {
      contenedor.innerHTML = esSeleccionInicial
        ? '<p class="texto-vacio">Todavía no hay al menos 10 jugadores apuntados a esta convocatoria (hay ' + resultado.jugadores.length + ').</p>'
        : '<p class="texto-vacio">No se han encontrado los 10 jugadores seleccionados.</p>';
      return;
    }
    parejasDisponibles = resultado.jugadores;
    pintarDisponiblesParejas();
    pintarParejasFormadas();

    if (resultado.sugerencia) {
      pintarSugerenciaAlineacion(resultado.sugerencia);
    }
  });
}

function pintarSugerenciaAlineacion(alineacion) {
  var contenedor = document.getElementById('sugerencia-alineacion');
  contenedor.innerHTML = '';

  var titulo = document.createElement('h3');
  titulo.className = 'titulo-seccion titulo-subseccion';
  titulo.style.marginTop = '0';
  titulo.textContent = '✨ Alineación sugerida';
  contenedor.appendChild(titulo);

  alineacion.parejas.forEach(function (p) {
    var fila = document.createElement('div');
    fila.className = 'pareja-recomendada';

    var nombres = document.createElement('div');
    nombres.className = 'pareja-jugadores';
    var etiqueta = document.createElement('span');
    etiqueta.textContent = 'Partido ' + p.numero_partido + ':';
    nombres.appendChild(etiqueta);
    nombres.appendChild(crearParJugadores(p.jugador_a, p.jugador_b));
    fila.appendChild(nombres);

    contenedor.appendChild(fila);
  });

  var botonUsar = document.createElement('button');
  botonUsar.type = 'button';
  botonUsar.className = 'boton boton-primario';
  botonUsar.textContent = 'Usar esta alineación';
  botonUsar.addEventListener('click', function () {
    aplicarSugerenciaAlineacion(alineacion);
  });
  contenedor.appendChild(botonUsar);
}

function aplicarSugerenciaAlineacion(alineacion) {
  var jugadorPorId = {};
  parejasDisponibles.forEach(function (j) { jugadorPorId[j.id_jugador] = j; });

  parejasFormadas = alineacion.parejas.map(function (p) {
    var a = jugadorPorId[p.jugador_a.id_jugador];
    var b = jugadorPorId[p.jugador_b.id_jugador];
    return { id_jugador_a: a.id_jugador, id_jugador_b: b.id_jugador, a: a, b: b, compat: p.compatibilidad };
  });
  parejasDisponibles = [];
  parejaEnFormacionIds = [];

  document.getElementById('sugerencia-alineacion').classList.add('oculto');
  document.getElementById('vista-previa-pareja').classList.add('oculto');
  pintarDisponiblesParejas();
  pintarParejasFormadas();
}

/** Texto de resumen de un jugador para la pantalla de parejas: posición, récord y asistencia. */
function textoStatsJugador(jugador) {
  var posicion = (POSICIONES_TEXTO[jugador.posicion_principal] || jugador.posicion_principal || '') +
    (jugador.posicion_secundaria ? ' / ' + (POSICIONES_TEXTO[jugador.posicion_secundaria] || jugador.posicion_secundaria) : '');
  var puntuacion = (jugador.puntuacion || jugador.puntuacion === 0)
    ? Number(jugador.puntuacion) + ' pts'
    : '';
  var record = jugador.partidos_jugados > 0
    ? jugador.victorias + 'V-' + (jugador.partidos_jugados - jugador.victorias) + 'D (' + jugador.porcentaje_victorias + '%)'
    : 'Sin partidos todavía';
  var asistencia = jugador.asistencia
    ? 'Asistencia ' + jugador.asistencia.porcentaje_asistencia + '%'
    : '';
  return [posicion, puntuacion, record, asistencia].filter(Boolean).join(' · ');
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
      '<div class="jugador-info">' +
        '<span class="jugador-nombre"></span>' +
        '<div class="jugador-meta"><span></span></div>' +
      '</div>' +
      '<span class="marca-seleccion">✓</span>';
    tarjeta.querySelector('.jugador-nombre').textContent = jugador.apodo || jugador.nombre_completo;
    tarjeta.querySelector('.jugador-meta span').textContent = textoStatsJugador(jugador);
    tarjeta.insertBefore(crearAvatar(jugador, 'avatar-mediano'), tarjeta.firstChild);

    tarjeta.addEventListener('click', function () {
      manejarClicJugadorPareja(jugador);
    });

    contenedor.appendChild(tarjeta);
  });
}

function manejarClicJugadorPareja(jugador) {
  // Si el capitán empieza a formar parejas a mano, la sugerencia calculada
  // para el pool original ya no aplica (puede que la esté descartando).
  document.getElementById('sugerencia-alineacion').classList.add('oculto');

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
      '<span class="insignia insignia-compat-slot"></span>' +
      '<div class="modal-botones">' +
        '<button type="button" class="boton boton-secundario" id="boton-deshacer-pareja">Deshacer</button>' +
        '<button type="button" class="boton boton-exito" id="boton-anadir-pareja">Añadir pareja</button>' +
      '</div>';

    previa.querySelector('.titulo-bienvenida').appendChild(crearParJugadores(a, b));
    previa.querySelector('strong').textContent = Number(a.puntuacion) + Number(b.puntuacion);
    // Selector específico: crearParJugadores también añade insignias con la
    // clase "insignia" para las letras de posición (D/R/D-R), así que no
    // vale con buscar ".insignia" a secas (cogería la primera, equivocada).
    var insignia = previa.querySelector('.insignia-compat-slot');
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

  // El backend asigna el número de partido (1 = más puntos, 5 = menos)
  // según la puntuación combinada de cada pareja; se muestra aquí el mismo
  // orden para que el capitán sepa de antemano qué partido le tocará a cada una.
  var ordenadas = parejasFormadas.map(function (pareja, indiceOriginal) {
    return { pareja: pareja, indiceOriginal: indiceOriginal, puntos: Number(pareja.a.puntuacion) + Number(pareja.b.puntuacion) };
  }).sort(function (x, y) { return y.puntos - x.puntos; });

  contenedor.innerHTML = '';
  ordenadas.forEach(function (item, numeroPartido) {
    var pareja = item.pareja;
    var tarjeta = document.createElement('div');
    tarjeta.className = 'jugador-tarjeta';
    tarjeta.innerHTML =
      '<div class="jugador-info">' +
        '<span class="jugador-nombre pareja-jugadores"></span>' +
        '<div class="jugador-meta">' +
          '<span class="insignia insignia-compat-slot"></span>' +
          '<span class="insignia insignia-puntos"></span>' +
        '</div>' +
      '</div>' +
      '<button type="button" class="boton-mini boton-mini-peligro">Quitar</button>';

    var nombreSpan = tarjeta.querySelector('.jugador-nombre');
    var numero = document.createElement('span');
    numero.textContent = 'Partido ' + (numeroPartido + 1) + ': ';
    nombreSpan.appendChild(numero);
    nombreSpan.appendChild(crearParJugadores(pareja.a, pareja.b));

    // Selector específico: crearParJugadores también añade insignias con la
    // clase "insignia" para las letras de posición, no vale ".insignia" a secas.
    var insignia = tarjeta.querySelector('.insignia-compat-slot');
    insignia.classList.add(COMPATIBILIDAD_CLASE[pareja.compat]);
    insignia.textContent = COMPATIBILIDAD_TEXTO[pareja.compat];
    tarjeta.querySelector('.insignia-puntos').textContent = item.puntos + ' pts';

    tarjeta.querySelector('button').addEventListener('click', function () {
      parejasDisponibles.push(pareja.a, pareja.b);
      parejasFormadas.splice(item.indiceOriginal, 1);
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

  var idsUsados = [];
  parejasFormadas.forEach(function (p) { idsUsados.push(p.id_jugador_a, p.id_jugador_b); });

  var pasoSeleccion = parejasJornadaEstado === 'CONVOCATORIA_CERRADA'
    ? llamarApi('guardarSeleccion', { token: guardada.token, id_jornada: parejasJornadaId, ids_jugadores: idsUsados })
    : Promise.resolve({ ok: true });

  pasoSeleccion
    .then(function (resultadoSeleccion) {
      if (!resultadoSeleccion.ok) throw new Error(resultadoSeleccion.error || 'No se ha podido guardar la selección de jugadores.');
      return llamarApi('guardarParejas', {
        token: guardada.token,
        id_jornada: parejasJornadaId,
        parejas: parejasFormadas.map(function (p) {
          return { id_jugador_a: p.id_jugador_a, id_jugador_b: p.id_jugador_b };
        })
      });
    })
    .then(function (resultado) {
      if (resultado.ok) {
        irAVistaJornadas();
      } else {
        mensajeError.textContent = resultado.error || 'No se han podido guardar las parejas.';
        mensajeError.classList.remove('oculto');
      }
    })
    .catch(function (error) {
      mensajeError.textContent = error.message || 'No se ha podido conectar con el servidor.';
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

/** Pinta la tarjeta de "responder a esta convocatoria" (mismo bloque para jugador y capitán). */
function pintarTarjetaConvocatoriaPersonal(abierta) {
  var tarjeta = document.getElementById('tarjeta-convocatoria-jugador');

  if (!abierta) {
    tarjeta.classList.add('oculto');
    return;
  }

  document.getElementById('convocatoria-jugador-titulo').textContent =
    (abierta.local_visitante === 'LOCAL' ? 'vs ' : '@ ') + abierta.rival;
  document.getElementById('convocatoria-jugador-info').textContent =
    formatearFecha(abierta.fecha) + (abierta.lugar ? ' · ' + abierta.lugar : '');
  tarjeta.classList.remove('oculto');

  var textoRespuesta = document.getElementById('convocatoria-jugador-respuesta-actual');
  if (abierta.mi_respuesta && abierta.mi_respuesta !== 'PENDIENTE') {
    textoRespuesta.textContent = 'Tu respuesta actual: ' +
      (abierta.mi_respuesta === 'ME_APUNTO' ? 'Me apunto ✅' : 'No puedo ❌');
    textoRespuesta.classList.remove('oculto');
  } else {
    textoRespuesta.classList.add('oculto');
  }

  document.getElementById('boton-me-apunto').onclick = function () {
    responderConvocatoria(abierta.id_jornada, 'ME_APUNTO');
  };
  document.getElementById('boton-no-puedo').onclick = function () {
    responderConvocatoria(abierta.id_jornada, 'NO_PUEDO');
  };
}

function comprobarConvocatoriaAbiertaParaJugador() {
  var guardada = obtenerSesionGuardada();
  llamarApi('obtenerResumenInicio', { token: guardada.token }).then(pintarResumenJugador);
}

/**
 * Pinta la tarjeta de "Voy / No puedo" del jugador a partir de una respuesta
 * de obtenerResumenInicio ya obtenida — o bien pedida aquí (uso normal), o
 * bien la que ya venía incluida en la respuesta de login/validarSesion (así
 * se ahorra un segundo viaje de ida y vuelta al servidor justo al entrar).
 */
function pintarResumenJugador(resultado) {
  if (!resultado.ok) return;
  pintarTarjetaConvocatoriaPersonal(resultado.resumen.convocatoria);
}

function responderConvocatoria(idJornada, disponibilidad) {
  var guardada = obtenerSesionGuardada();
  llamarApi('responderConvocatoria', { token: guardada.token, id_jornada: idJornada, disponibilidad: disponibilidad })
    .then(function (resultado) {
      if (!resultado.ok) {
        alert(resultado.error || 'No se ha podido registrar tu respuesta.');
        return;
      }
      if (sesionActual && sesionActual.rol === 'CAPITAN') {
        comprobarConvocatoriaAbiertaParaCapitan();
      } else {
        comprobarConvocatoriaAbiertaParaJugador();
      }
    });
}

/* ==========================================================================
 * CONVOCATORIA — resumen para el capitán (pantalla de inicio)
 * ======================================================================= */

function comprobarConvocatoriaAbiertaParaCapitan() {
  var guardada = obtenerSesionGuardada();
  llamarApi('obtenerResumenInicio', { token: guardada.token }).then(pintarResumenCapitan);
}

/**
 * Pinta el panel de convocatorias abiertas del capitán a partir de una
 * respuesta de obtenerResumenInicio ya obtenida — igual que
 * pintarResumenJugador, para poder reutilizar la que ya venga incluida en
 * login/validarSesion sin tener que volver a pedirla.
 */
function pintarResumenCapitan(resultado) {
  if (!resultado.ok) return;

  var tarjeta = document.getElementById('tarjeta-convocatoria-capitan');
  var contenedor = document.getElementById('lista-convocatoria-capitan');

  pintarTarjetaConvocatoriaPersonal(resultado.resumen.mi_convocatoria);

  var convocatorias = resultado.resumen.convocatorias || [];
  if (convocatorias.length === 0) {
    tarjeta.classList.add('oculto');
    return;
  }

  tarjeta.classList.remove('oculto');
  contenedor.innerHTML = '';
  convocatorias.forEach(function (item) {
    var fila = document.createElement('div');
    fila.className = 'jornada-tarjeta';
    fila.innerHTML =
      '<div class="jornada-info">' +
        '<span class="jornada-rival"></span>' +
        '<span class="jornada-meta"></span>' +
      '</div>' +
      '<span class="insignia insignia-posicion">Ver</span>';
    fila.querySelector('.jornada-rival').textContent =
      (item.local_visitante === 'LOCAL' ? 'vs ' : '@ ') + item.rival;
    fila.querySelector('.jornada-meta').textContent =
      formatearFecha(item.fecha) + ' · ✅ ' + item.apuntados + ' · ❌ ' + item.no_disponibles + ' · ⏳ ' + item.pendientes;
    fila.addEventListener('click', function () {
      abrirDetalleJornada(item);
    });
    contenedor.appendChild(fila);
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

  cargarConCache(
    'listarJugadores', { token: guardada.token }, contenedor, 'Cargando...',
    function (resultado) {
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
      '<p class="texto-secundario texto-secundario-estado"></p>' +
      '<p class="texto-secundario texto-secundario-usuario"></p>';

    if (yo.apodo) {
      contenedor.querySelector('.etiqueta-rol-apodo').textContent = yo.apodo;
    }
    contenedor.querySelector('.titulo-bienvenida').textContent = yo.nombre_completo;
    contenedor.querySelector('.texto-secundario-posicion').textContent =
      'Posición: ' + (POSICIONES_TEXTO[yo.posicion_principal] || yo.posicion_principal) + posicionSecundaria;
    contenedor.querySelector('strong').textContent = Number(yo.puntuacion);
    contenedor.querySelector('.texto-secundario-estado').textContent =
      'Estado: ' + (yo.estado === 'ACTIVO' ? 'Activo ✅' : 'Inactivo');
    contenedor.querySelector('.texto-secundario-usuario').textContent =
      'Usuario para entrar: ' + (yo.nombre_usuario || '(pregunta al capitán)');

    cargarEstadisticasPerfil(guardada.id_jugador);
    },
    function () {
      contenedor.innerHTML = '<p class="texto-vacio">No se ha podido cargar tu perfil.</p>';
    }
  );
}

/* ---- Editar mis datos ---- */

function abrirEdicionPerfil() {
  if (!perfilActual) return;

  document.getElementById('perfil-nombre').value = perfilActual.nombre;
  document.getElementById('perfil-apellidos').value = perfilActual.apellidos;
  document.getElementById('perfil-apodo').value = perfilActual.apodo || '';
  document.getElementById('perfil-email').value = perfilActual.email || '';
  document.getElementById('perfil-telefono').value = perfilActual.telefono || '';
  var principal = perfilActual.posicion_principal === 'AMBAS' ? 'DERECHA' : perfilActual.posicion_principal;
  var jugabaAmbas = perfilActual.posicion_principal === 'AMBAS' || perfilActual.posicion_secundaria === 'AMBAS' ||
    (perfilActual.posicion_secundaria && perfilActual.posicion_secundaria !== principal);
  document.getElementById('perfil-posicion-principal').value = principal;
  document.getElementById('perfil-posicion-secundaria-check').checked = !!jugabaAmbas;
  actualizarTextoPosicionSecundaria('perfil-posicion-principal', 'perfil-posicion-secundaria-texto');
  document.getElementById('perfil-codigo-nuevo').value = '';
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

  var posicionPrincipalPerfil = document.getElementById('perfil-posicion-principal').value;
  var tieneSecundariaPerfil = document.getElementById('perfil-posicion-secundaria-check').checked;

  var datos = {
    token: guardada.token,
    nombre: document.getElementById('perfil-nombre').value.trim(),
    apellidos: document.getElementById('perfil-apellidos').value.trim(),
    apodo: document.getElementById('perfil-apodo').value.trim(),
    email: document.getElementById('perfil-email').value.trim(),
    telefono: document.getElementById('perfil-telefono').value.trim(),
    posicion_principal: posicionPrincipalPerfil,
    posicion_secundaria: tieneSecundariaPerfil ? posicionContraria(posicionPrincipalPerfil) : ''
  };
  var codigoNuevo = document.getElementById('perfil-codigo-nuevo').value.trim();
  if (codigoNuevo && codigoNuevo.length < 4) {
    mensajeError.textContent = 'La contraseña nueva debe tener al menos 4 caracteres.';
    mensajeError.classList.remove('oculto');
    return;
  }

  mensajeError.classList.add('oculto');
  botonGuardar.disabled = true;
  botonGuardar.textContent = 'Guardando...';

  llamarApi('editarPerfilPropio', datos)
    .then(function (resultado) {
      if (!resultado.ok) throw new Error(resultado.error || 'No se han podido guardar los cambios.');
      if (!codigoNuevo) return null;
      return llamarApi('cambiarMiCodigoAcceso', { token: guardada.token, codigo_nuevo: codigoNuevo });
    })
    .then(function (resultadoCodigo) {
      if (resultadoCodigo && !resultadoCodigo.ok) {
        throw new Error(resultadoCodigo.error || 'Los datos se han guardado, pero no se ha podido cambiar la contraseña.');
      }
      limpiarCacheApi('listarJugadores');
      cerrarEdicionPerfil();
      cargarPerfil();
    })
    .catch(function (error) {
      mensajeError.textContent = error.message || 'No se ha podido conectar con el servidor.';
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

function cargarEstadisticasPerfil(idJugador, idContenedor) {
  var guardada = obtenerSesionGuardada();
  var contenedor = document.getElementById(idContenedor || 'tarjeta-perfil-estadisticas');

  function pintar(resultado) {
    var e = resultado.estadisticas;
    var posicion = resultado.posicion;

    contenedor.classList.remove('oculto');

    if (e.partidos_jugados === 0) {
      contenedor.innerHTML = '<h3 class="titulo-seccion titulo-subseccion">Estadísticas</h3>' +
        '<p class="texto-vacio">Todavía no has jugado ningún partido esta temporada.</p>';
      return;
    }

    contenedor.innerHTML =
      '<h3 class="titulo-seccion titulo-subseccion">Estadísticas</h3>' +
      (posicion ? '<p class="texto-secundario">Puesto en el ranking del equipo: <strong>' + posicion.posicion + ' de ' + posicion.total_jugadores + '</strong></p>' : '') +
      '<p class="texto-secundario">Forma reciente (últimos ' + e.forma_reciente.length + '):</p>' +
      '<div class="fila-forma-reciente"></div>' +
      '<p class="texto-secundario">Partidos jugados: <strong>' + e.partidos_jugados + '</strong></p>' +
      '<p class="texto-secundario">Victorias: <strong>' + e.victorias + '</strong> · Derrotas: <strong>' + e.derrotas + '</strong></p>' +
      '<p class="texto-secundario">% de victorias: <strong>' + e.porcentaje_victorias + '%</strong> (' + (CONFIANZA_TEXTO[e.confianza] || e.confianza) + ', ' + e.partidos_jugados + ' partidos)</p>' +
      '<p class="texto-secundario">Sets: <strong>' + e.sets_favor + '-' + e.sets_contra + '</strong> (diferencia ' + (e.diferencia_sets >= 0 ? '+' : '') + e.diferencia_sets + ')</p>' +
      '<p class="texto-secundario">Juegos: <strong>' + e.juegos_favor + '-' + e.juegos_contra + '</strong> (diferencia ' + (e.diferencia_juegos >= 0 ? '+' : '') + e.diferencia_juegos + ')</p>' +
      '<p class="texto-secundario">Como local: <strong>' + e.local.victorias + '/' + e.local.jugados + '</strong> · Como visitante: <strong>' + e.visitante.victorias + '/' + e.visitante.jugados + '</strong></p>' +
      '<p class="texto-secundario">Asistencia: <strong>' + e.asistencia.porcentaje_asistencia + '%</strong> (' + e.asistencia.veces_apuntado + ' de ' + e.asistencia.convocatorias_totales + ' convocatorias) · Seleccionado <strong>' + e.asistencia.veces_seleccionado + '</strong> veces</p>' +
      '<p class="texto-secundario">Rendimiento por puesto de partido:</p>' +
      '<div class="fila-forma-reciente fila-rendimiento-partido"></div>';

    var filaForma = contenedor.querySelector('.fila-forma-reciente:not(.fila-rendimiento-partido)');
    e.forma_reciente.forEach(function (resultadoForma) {
      var chip = document.createElement('span');
      chip.className = 'chip-forma ' + (resultadoForma === 'G' ? 'chip-forma-g' : 'chip-forma-p');
      chip.textContent = resultadoForma;
      filaForma.appendChild(chip);
    });

    var filaRendimiento = contenedor.querySelector('.fila-rendimiento-partido');
    for (var n = 1; n <= 5; n++) {
      var r = e.rendimiento_por_partido[n];
      var insignia = document.createElement('span');
      insignia.className = 'insignia insignia-posicion';
      insignia.textContent = 'P' + n + ': ' + (r && r.jugados > 0 ? r.victorias + '/' + r.jugados : 'sin datos');
      filaRendimiento.appendChild(insignia);
    }
  }

  llamarApiConCache('obtenerEstadisticasCompletasJugador', { token: guardada.token, id_jugador: idJugador }, pintar)
    .then(function (resultado) {
      if (resultado.ok) pintar(resultado);
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

  cargarConCache(
    'listarJornadas', { token: guardada.token }, contenedor, 'Cargando...',
    function (resultado) {
      // El calendario es solo para ver lo que queda por jugar: las jornadas ya
      // finalizadas se consultan desde Resultados o el Historial de convocatorias.
      var proximas = resultado.jornadas
        .filter(function (j) { return j.estado !== 'FINALIZADA'; })
        .sort(function (a, b) { return String(a.fecha).localeCompare(String(b.fecha)); });

      if (proximas.length === 0) {
        contenedor.innerHTML = '<p class="texto-vacio">No hay próximos partidos programados.</p>';
        return;
      }

      contenedor.innerHTML = '';
      proximas.forEach(function (jornada) {
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
    },
    function (error) {
      contenedor.innerHTML = '<p class="texto-vacio">' + (error.message || 'No se han podido cargar las jornadas.') + '</p>';
    }
  );
}

/* ==========================================================================
 * HISTORIAL DE CONVOCATORIAS (jugador) — convocatorias ya cerradas y si el
 * jugador se apuntó o no a cada una, de forma clara y visual.
 * ======================================================================= */

var DISPONIBILIDAD_HISTORIAL_TEXTO = {
  ME_APUNTO: '✅ Me apunto',
  NO_PUEDO: '❌ No puedo',
  NO_RESPONDIO: '⚪ No respondiste'
};

var DISPONIBILIDAD_HISTORIAL_CLASE = {
  ME_APUNTO: 'insignia-activo',
  NO_PUEDO: 'insignia-inactivo',
  NO_RESPONDIO: 'insignia-posicion'
};

function irAVistaHistorialConvocatorias() {
  mostrarVista('vista-historial-convocatorias');
  cargarHistorialConvocatorias();
}

function cargarHistorialConvocatorias() {
  var guardada = obtenerSesionGuardada();
  var contenedor = document.getElementById('lista-historial-convocatorias');

  cargarConCache(
    'listarHistorialConvocatorias', { token: guardada.token }, contenedor, 'Cargando...',
    function (resultado) {
      if (resultado.historial.length === 0) {
        contenedor.innerHTML = '<p class="texto-vacio">Todavía no hay convocatorias cerradas.</p>';
        return;
      }

      contenedor.innerHTML = '';
      resultado.historial.forEach(function (h) {
        var fila = document.createElement('div');
        fila.className = 'jornada-tarjeta';
        fila.innerHTML =
          '<div class="jornada-info">' +
            '<span class="jornada-rival"></span>' +
            '<span class="jornada-meta"></span>' +
            '<span class="insignia"></span>' +
          '</div>';
        fila.querySelector('.jornada-rival').textContent =
          (h.local_visitante === 'LOCAL' ? 'vs ' : '@ ') + h.rival;
        fila.querySelector('.jornada-meta').textContent =
          formatearFecha(h.fecha) + (h.lugar ? ' · ' + h.lugar : '');
        var insignia = fila.querySelector('.insignia');
        insignia.classList.add(DISPONIBILIDAD_HISTORIAL_CLASE[h.disponibilidad] || 'insignia-posicion');
        insignia.textContent = DISPONIBILIDAD_HISTORIAL_TEXTO[h.disponibilidad] || h.disponibilidad;
        contenedor.appendChild(fila);
      });
    },
    function (error) {
      contenedor.innerHTML = '<p class="texto-vacio">' + (error.message || 'No se ha podido cargar el historial.') + '</p>';
    }
  );
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
 * RESULTADOS (jugador) — todos los partidos jugados en un único sitio,
 * sin tener que entrar convocatoria por convocatoria. Dos pestañas: los del
 * equipo entero, o solo los propios.
 * ======================================================================= */

var resultadosCache = [];
var resultadosModoActual = 'EQUIPO';

function irAVistaResultados() {
  mostrarVista('vista-resultados');
  cargarResultados('EQUIPO');
}

function cargarResultados(modo) {
  resultadosModoActual = modo;
  document.getElementById('boton-resultados-equipo').className = 'boton ' + (modo === 'EQUIPO' ? 'boton-primario' : 'boton-secundario');
  document.getElementById('boton-resultados-mios').className = 'boton ' + (modo === 'MIOS' ? 'boton-primario' : 'boton-secundario');

  var contenedor = document.getElementById('lista-resultados');
  var guardada = obtenerSesionGuardada();

  cargarConCache(
    'listarResultados', { token: guardada.token }, contenedor, 'Cargando...',
    function (resultado) {
      resultadosCache = resultado.resultados;
      pintarResultados();
    },
    function (error) {
      contenedor.innerHTML = '<p class="texto-vacio">' + (error.message || 'No se han podido cargar los resultados.') + '</p>';
    }
  );
}

function cambiarModoResultados(modo) {
  resultadosModoActual = modo;
  document.getElementById('boton-resultados-equipo').className = 'boton ' + (modo === 'EQUIPO' ? 'boton-primario' : 'boton-secundario');
  document.getElementById('boton-resultados-mios').className = 'boton ' + (modo === 'MIOS' ? 'boton-primario' : 'boton-secundario');
  pintarResultados();
}

function pintarResultados() {
  var contenedor = document.getElementById('lista-resultados');
  var guardada = obtenerSesionGuardada();

  var lista = resultadosModoActual === 'MIOS'
    ? resultadosCache.filter(function (r) {
        return r.jugador_a.id_jugador === guardada.id_jugador || r.jugador_b.id_jugador === guardada.id_jugador;
      })
    : resultadosCache;

  if (lista.length === 0) {
    contenedor.innerHTML = resultadosModoActual === 'MIOS'
      ? '<p class="texto-vacio">Todavía no has jugado ningún partido.</p>'
      : '<p class="texto-vacio">Todavía no hay ningún resultado registrado.</p>';
    return;
  }

  // Se agrupan visualmente los partidos del mismo enfrentamiento (misma
  // jornada) para que se vea de un vistazo qué cinco partidos van juntos.
  contenedor.innerHTML = '';
  var idJornadaAnterior = null;
  var grupoActual = null;
  var indiceGrupo = -1;

  lista.forEach(function (r) {
    if (r.id_jornada !== idJornadaAnterior) {
      idJornadaAnterior = r.id_jornada;
      indiceGrupo++;

      var partidosDeEstaJornada = lista.filter(function (x) { return x.id_jornada === r.id_jornada; });
      var ganados = partidosDeEstaJornada.filter(function (x) { return x.resultado === 'GANADO'; }).length;

      var cabecera = document.createElement('div');
      cabecera.className = 'cabecera-grupo-resultados';
      cabecera.innerHTML =
        '<span class="grupo-resultados-rival"></span>' +
        '<span class="insignia"></span>';
      cabecera.querySelector('.grupo-resultados-rival').textContent =
        (r.jornada.local_visitante === 'LOCAL' ? 'vs ' : '@ ') + r.jornada.rival + ' · ' + formatearFecha(r.jornada.fecha);
      var insigniaCabecera = cabecera.querySelector('.insignia');
      insigniaCabecera.classList.add(ganados >= 3 ? 'insignia-compat-buena' : 'insignia-compat-mala');
      insigniaCabecera.textContent = ganados + 'V - ' + (partidosDeEstaJornada.length - ganados) + 'D';
      contenedor.appendChild(cabecera);

      grupoActual = document.createElement('div');
      grupoActual.className = 'grupo-resultados-jornada ' + (indiceGrupo % 2 === 0 ? 'grupo-resultados-par' : 'grupo-resultados-impar');
      contenedor.appendChild(grupoActual);
    }

    grupoActual.appendChild(crearTarjetaResultado(r));
  });
}

function crearTarjetaResultado(r) {
  var tarjeta = document.createElement('div');
  tarjeta.className = 'partido-tarjeta';
  tarjeta.innerHTML =
    '<div class="partido-info">' +
      '<span class="partido-numero"></span>' +
      '<span class="partido-jugadores"></span>' +
      '<span class="partido-marcador"></span>' +
    '</div>';

  tarjeta.querySelector('.partido-numero').textContent = 'Partido ' + r.numero_partido;
  tarjeta.querySelector('.partido-jugadores').appendChild(crearParJugadores(r.jugador_a, r.jugador_b));
  tarjeta.querySelector('.partido-marcador').textContent =
    (r.resultado === 'GANADO' ? '✅ Ganado' : '❌ Perdido') + ' · Sets ' + r.sets_favor + '-' + r.sets_contra +
    (r.juegos_favor || r.juegos_contra ? ' · Juegos ' + r.juegos_favor + '-' + r.juegos_contra : '');

  return tarjeta;
}

/* ==========================================================================
 * ESTADÍSTICAS (jugador) — la misma información que en "Mi perfil", pero
 * como apartado propio accesible directamente desde el inicio.
 * ======================================================================= */

function irAVistaEstadisticasJugador() {
  mostrarVista('vista-estadisticas-jugador');
  var guardada = obtenerSesionGuardada();
  var contenedor = document.getElementById('tarjeta-estadisticas-jugador');
  contenedor.classList.remove('oculto');
  contenedor.innerHTML = '<p class="texto-vacio">Cargando...</p>';
  cargarEstadisticasPerfil(guardada.id_jugador, 'tarjeta-estadisticas-jugador');
}

/* ==========================================================================
 * CLASIFICACIÓN (jugador) — ranking de jugadores y de parejas del equipo,
 * y el resultado (victorias-derrotas) de cada jornada ya jugada.
 * ======================================================================= */

function irAVistaCompaneros() {
  mostrarVista('vista-companeros');
  cargarCompaneros();
}

function cargarCompaneros() {
  var guardada = obtenerSesionGuardada();
  var contenedor = document.getElementById('lista-companeros');

  cargarConCache(
    'listarCompaneros', { token: guardada.token }, contenedor, 'Cargando...',
    function (resultado) {
      pintarCompaneros(resultado.jugadores);
    },
    function () {
      contenedor.innerHTML = '<p class="texto-vacio">No se ha podido conectar con el servidor.</p>';
    }
  );
}

function pintarCompaneros(jugadores) {
  var contenedor = document.getElementById('lista-companeros');
  contenedor.innerHTML = '';

  if (jugadores.length === 0) {
    contenedor.innerHTML = '<p class="texto-vacio">Todavía no hay jugadores en el equipo.</p>';
    return;
  }

  jugadores.forEach(function (jugador) {
    var posicionSecundaria = jugador.posicion_secundaria
      ? ' / ' + (POSICIONES_TEXTO[jugador.posicion_secundaria] || jugador.posicion_secundaria)
      : '';

    var tarjeta = document.createElement('div');
    tarjeta.className = 'jugador-tarjeta';
    tarjeta.innerHTML =
      '<div class="jugador-info">' +
        '<span class="jugador-nombre"></span>' +
        (jugador.apodo ? '<span class="jugador-nombre-real"></span>' : '') +
        '<div class="jugador-meta">' +
          '<span class="insignia insignia-posicion"></span>' +
          '<span>· Puntuación: ' + Number(jugador.puntuacion) + '</span>' +
        '</div>' +
      '</div>';

    tarjeta.querySelector('.jugador-nombre').textContent = jugador.apodo || jugador.nombre_completo;
    if (jugador.apodo) {
      tarjeta.querySelector('.jugador-nombre-real').textContent = jugador.nombre_completo;
    }
    tarjeta.querySelector('.insignia-posicion').textContent =
      (POSICIONES_TEXTO[jugador.posicion_principal] || jugador.posicion_principal) + posicionSecundaria;

    tarjeta.insertBefore(crearAvatar(jugador, 'avatar-mediano'), tarjeta.firstChild);
    contenedor.appendChild(tarjeta);
  });
}

var clasificacionModoActual = 'EQUIPO';

function irAVistaClasificacion() {
  mostrarVista('vista-clasificacion');
  cambiarModoClasificacion('EQUIPO');
  cargarClasificacion();
}

function cambiarModoClasificacion(modo) {
  clasificacionModoActual = modo;
  document.getElementById('boton-clasificacion-equipo').className = 'boton ' + (modo === 'EQUIPO' ? 'boton-primario' : 'boton-secundario');
  document.getElementById('boton-clasificacion-ranking').className = 'boton ' + (modo === 'RANKING' ? 'boton-primario' : 'boton-secundario');
  document.getElementById('panel-clasificacion-equipo').classList.toggle('oculto', modo !== 'EQUIPO');
  document.getElementById('panel-clasificacion-ranking').classList.toggle('oculto', modo !== 'RANKING');
}

function cargarClasificacion() {
  var guardada = obtenerSesionGuardada();
  var resumenEquipo = document.getElementById('resumen-clasificacion-equipo');
  var listaRanking = document.getElementById('clasificacion-ranking-jugadores');
  var listaParejas = document.getElementById('clasificacion-ranking-parejas');

  var huboCache = !!_cacheApi[_claveCacheApi('obtenerClasificacionCompleta', { token: guardada.token })];
  if (!huboCache) {
    resumenEquipo.innerHTML = '<p class="texto-vacio">Cargando...</p>';
    document.getElementById('clasificacion-equipo-jornadas').innerHTML = '';
    listaRanking.innerHTML = '<p class="texto-vacio">Cargando...</p>';
    listaParejas.innerHTML = '<p class="texto-vacio">Cargando...</p>';
  }

  function pintar(resultado) {
    pintarClasificacionEquipo(resultado.clasificacion.equipo);
    pintarRankingJugadores(resultado.clasificacion.ranking_jugadores, 'clasificacion-ranking-jugadores');
    pintarRankingParejas(resultado.clasificacion.ranking_parejas, 'clasificacion-ranking-parejas');
  }

  llamarApiConCache('obtenerClasificacionCompleta', { token: guardada.token }, pintar)
    .then(function (resultado) {
      if (!resultado.ok) throw new Error(resultado.error || 'No se ha podido cargar.');
      pintar(resultado);
    })
    .catch(function (error) {
      if (huboCache) return;
      var mensaje = '<p class="texto-vacio">' + (error.message || 'No se ha podido conectar con el servidor.') + '</p>';
      resumenEquipo.innerHTML = mensaje;
      listaRanking.innerHTML = mensaje;
      listaParejas.innerHTML = mensaje;
    });
}

/**
 * Clasificación del equipo según el reglamento de la SNP: 12 puntos en
 * juego por enfrentamiento (parejas 1 y 2 valen 3 puntos, 3/4/5 valen 2),
 * y se gana el enfrentamiento ganando al menos 3 de los 5 partidos.
 */
function pintarClasificacionEquipo(clasificacion) {
  var resumen = document.getElementById('resumen-clasificacion-equipo');

  if (clasificacion.encuentros_jugados === 0) {
    resumen.innerHTML = '<p class="texto-vacio">Todavía no hay ningún enfrentamiento completo.</p>';
    document.getElementById('clasificacion-equipo-jornadas').innerHTML = '';
    return;
  }

  resumen.innerHTML =
    '<p class="etiqueta-rol">Balance de la liga</p>' +
    '<h2 class="titulo-bienvenida">' + clasificacion.encuentros_ganados + 'V - ' + clasificacion.encuentros_perdidos + 'D</h2>' +
    '<p class="texto-secundario">' + clasificacion.puntos_totales + ' de ' + clasificacion.puntos_posibles + ' puntos posibles (' + clasificacion.encuentros_jugados + ' enfrentamientos jugados)</p>';

  var contenedor = document.getElementById('clasificacion-equipo-jornadas');
  contenedor.innerHTML = '';
  clasificacion.por_jornada.forEach(function (r) {
    var fila = document.createElement('div');
    fila.className = 'jornada-tarjeta';
    fila.innerHTML =
      '<div class="jornada-info">' +
        '<span class="jornada-rival"></span>' +
        '<span class="jornada-meta"></span>' +
        '<span class="insignia"></span>' +
      '</div>';
    fila.querySelector('.jornada-rival').textContent = (r.local_visitante === 'LOCAL' ? 'vs ' : '@ ') + r.rival;
    fila.querySelector('.jornada-meta').textContent =
      formatearFecha(r.fecha) + ' · ' + r.partidos_ganados + 'V - ' + r.partidos_perdidos + 'D · ' + r.puntos + ' pts';
    var insignia = fila.querySelector('.insignia');
    insignia.className = 'insignia ' + (r.ganado ? 'insignia-compat-buena' : 'insignia-compat-mala');
    insignia.textContent = r.ganado ? 'Ganado' : 'Perdido';
    contenedor.appendChild(fila);
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

  var huboCache = !!_cacheApi[_claveCacheApi('obtenerDashboard', { token: guardada.token })];
  if (!huboCache) {
    resumen.innerHTML = '<p class="texto-vacio">Cargando...</p>';
    document.getElementById('lista-ranking-jugadores').innerHTML = '';
    document.getElementById('lista-ranking-parejas').innerHTML = '';
  }

  llamarApiConCache('obtenerDashboard', { token: guardada.token }, function (dash) {
    pintarResumenDashboard(dash.dashboard);
    pintarRankingJugadores(dash.dashboard.ranking_jugadores);
    pintarRankingParejas(dash.dashboard.ranking_parejas);
  }).then(function (dash) {
    if (!dash.ok) return;
    pintarResumenDashboard(dash.dashboard);
    pintarRankingJugadores(dash.dashboard.ranking_jugadores);
    pintarRankingParejas(dash.dashboard.ranking_parejas);
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

function pintarRankingJugadores(ranking, idContenedor) {
  var contenedor = document.getElementById(idContenedor || 'lista-ranking-jugadores');
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

function pintarRankingParejas(parejas, idContenedor) {
  var contenedor = document.getElementById(idContenedor || 'lista-ranking-parejas');

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
  document.getElementById('boton-actualizar-puntuaciones-snp').addEventListener('click', actualizarPuntuacionesSNP);
  document.getElementById('boton-cancelar-jugador').addEventListener('click', cerrarModalJugador);
  document.getElementById('formulario-jugador').addEventListener('submit', manejarEnvioJugador);
  document.getElementById('jugador-posicion-principal').addEventListener('change', function () {
    actualizarTextoPosicionSecundaria('jugador-posicion-principal', 'jugador-posicion-secundaria-texto');
  });
  document.getElementById('perfil-posicion-principal').addEventListener('change', function () {
    actualizarTextoPosicionSecundaria('perfil-posicion-principal', 'perfil-posicion-secundaria-texto');
  });

  document.getElementById('boton-ir-jornadas').addEventListener('click', irAVistaJornadas);
  document.getElementById('boton-volver-jornadas').addEventListener('click', function () {
    mostrarVista('vista-inicio');
  });
  document.getElementById('boton-volver-jornada-detalle').addEventListener('click', irAVistaJornadas);
  document.getElementById('boton-nueva-jornada').addEventListener('click', function () {
    abrirModalJornada();
  });
  document.getElementById('boton-editar-jornada').addEventListener('click', function () {
    abrirModalJornada(jornadaActual);
  });
  document.getElementById('boton-borrar-jornada').addEventListener('click', function () {
    borrarJornadaConConfirmacion(jornadaActual);
  });
  document.getElementById('boton-cancelar-jornada').addEventListener('click', cerrarModalJornada);
  document.getElementById('formulario-jornada').addEventListener('submit', manejarEnvioJornada);
  document.getElementById('filtro-jornadas').addEventListener('change', pintarJornadasFiltradas);

  document.getElementById('boton-ir-perfil').addEventListener('click', irAVistaPerfil);
  document.getElementById('boton-ir-perfil-capitan').addEventListener('click', irAVistaPerfil);
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

  document.getElementById('boton-ir-resultados').addEventListener('click', irAVistaResultados);
  document.getElementById('boton-ir-resultados-capitan').addEventListener('click', irAVistaResultados);
  document.getElementById('boton-ir-calendario-capitan').addEventListener('click', irAVistaCalendario);
  document.getElementById('boton-volver-resultados').addEventListener('click', function () {
    mostrarVista('vista-inicio');
  });
  document.getElementById('boton-resultados-equipo').addEventListener('click', function () {
    cambiarModoResultados('EQUIPO');
  });
  document.getElementById('boton-resultados-mios').addEventListener('click', function () {
    cambiarModoResultados('MIOS');
  });

  document.getElementById('boton-ir-estadisticas-jugador').addEventListener('click', irAVistaEstadisticasJugador);
  document.getElementById('boton-volver-estadisticas-jugador').addEventListener('click', function () {
    mostrarVista('vista-inicio');
  });

  document.getElementById('boton-ir-companeros').addEventListener('click', irAVistaCompaneros);
  document.getElementById('boton-volver-companeros').addEventListener('click', function () {
    mostrarVista('vista-inicio');
  });

  document.getElementById('boton-ir-clasificacion').addEventListener('click', irAVistaClasificacion);
  document.getElementById('boton-ir-clasificacion-capitan').addEventListener('click', irAVistaClasificacion);
  document.getElementById('boton-volver-clasificacion').addEventListener('click', function () {
    mostrarVista('vista-inicio');
  });
  document.getElementById('boton-clasificacion-equipo').addEventListener('click', function () {
    cambiarModoClasificacion('EQUIPO');
  });
  document.getElementById('boton-clasificacion-ranking').addEventListener('click', function () {
    cambiarModoClasificacion('RANKING');
  });

  document.getElementById('boton-ir-historial-convocatorias').addEventListener('click', irAVistaHistorialConvocatorias);
  document.getElementById('boton-ir-historial-convocatorias-capitan').addEventListener('click', irAVistaHistorialConvocatorias);
  document.getElementById('boton-volver-historial-convocatorias').addEventListener('click', function () {
    mostrarVista('vista-inicio');
  });

  document.getElementById('boton-ir-dashboard').addEventListener('click', irAVistaDashboard);
  document.getElementById('boton-volver-dashboard').addEventListener('click', function () {
    mostrarVista('vista-inicio');
  });

  document.getElementById('boton-volver-parejas').addEventListener('click', irAVistaJornadas);
  document.getElementById('boton-guardar-parejas').addEventListener('click', manejarGuardarParejas);

  document.getElementById('boton-volver-recomendaciones').addEventListener('click', irAVistaJornadas);

  document.getElementById('boton-cancelar-resultado').addEventListener('click', cerrarModalResultado);
  document.getElementById('formulario-resultado').addEventListener('submit', manejarEnvioResultado);

  actualizarBotonTema();
  document.getElementById('boton-tema').addEventListener('click', alternarTema);

  comprobarSesionAlCargar();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('service-worker.js').catch(function () {
      // Si falla el registro (por ejemplo, en un navegador que no lo soporta bien),
      // la app sigue funcionando igual, simplemente sin modo sin conexión.
    });

    // En cuanto haya una versión nueva del Service Worker lista y tome el
    // control, recargamos solos una vez — así nadie se queda con una copia
    // vieja de la app hasta que se le ocurra cerrarla y volver a abrirla.
    var _yaRecargandoPorSW = false;
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (_yaRecargandoPorSW) return;
      _yaRecargandoPorSW = true;
      window.location.reload();
    });
  }
});
