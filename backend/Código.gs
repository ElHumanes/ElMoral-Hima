/**
 * Punto de entrada del Web App. Todo el frontend habla con Apps Script
 * a través de estas dos funciones, nunca directamente con Google Sheets.
 *
 * Acciones disponibles en esta fase (Fase 2): ping, login, logout, validarSesion.
 * Las siguientes fases añadirán más "case" a este mismo router, sin tocar
 * la estructura general.
 */

function doGet(e) {
  return manejarPeticion(e);
}

function doPost(e) {
  return manejarPeticion(e);
}

function manejarPeticion(e) {
  try {
    var params = obtenerParametros(e);
    var action = params.action;

    switch (action) {
      case 'ping':
        return respuestaOk({ mensaje: 'pong', fecha: ahoraIso() });

      case 'login':
        var resultadoLogin = login(params.nombreUsuario, params.codigoAcceso);
        if (resultadoLogin.ok) {
          // Se incluye ya aquí el resumen de convocatorias de la pantalla de
          // inicio para no tener que pedirlo aparte justo después: así al
          // entrar en la app hace falta un solo viaje de ida y vuelta al
          // servidor en vez de dos seguidos.
          resultadoLogin.resumen = obtenerResumenInicio(resultadoLogin);
        }
        return respuestaJson(resultadoLogin);

      case 'logout':
        return respuestaJson(logout(params.token));

      case 'validarSesion':
        var sesion = validarSesion(params.token);
        if (!sesion) return respuestaError('Sesión no válida o caducada.');
        return respuestaOk({ sesion: sesion, resumen: obtenerResumenInicio(sesion) });

      case 'listarJugadores':
        if (!validarSesion(params.token)) return respuestaError('Sesión no válida o caducada.');
        return respuestaOk({ jugadores: listarJugadores() });

      case 'crearJugador':
        return respuestaJson(crearJugador(requerirSesionValida(params.token), params));

      case 'editarJugador':
        return respuestaJson(editarJugador(requerirSesionValida(params.token), params));

      case 'editarPerfilPropio':
        return respuestaJson(editarPerfilPropio(requerirSesionValida(params.token), params));

      case 'subirFotoJugador':
        return respuestaJson(subirFotoJugador(requerirSesionValida(params.token), params.foto_base64, params.tipo_mime));

      case 'cambiarEstadoJugador':
        return respuestaJson(cambiarEstadoJugador(requerirSesionValida(params.token), params.id_jugador, params.nuevo_estado));

      case 'listarJornadas':
        if (!validarSesion(params.token)) return respuestaError('Sesión no válida o caducada.');
        return respuestaOk({ jornadas: listarJornadas() });

      case 'crearJornada':
        return respuestaJson(crearJornada(requerirSesionValida(params.token), params));

      case 'editarJornada':
        return respuestaJson(editarJornada(requerirSesionValida(params.token), params));

      case 'eliminarJornada':
        return respuestaJson(eliminarJornada(requerirSesionValida(params.token), params.id_jornada));

      case 'cambiarEstadoJornada':
        return respuestaJson(cambiarEstadoJornada(requerirSesionValida(params.token), params.id_jornada, params.nuevo_estado));

      case 'listarConvocatoria':
        if (!validarSesion(params.token)) return respuestaError('Sesión no válida o caducada.');
        return respuestaOk({ convocatoria: listarConvocatoria(params.id_jornada) });

      case 'responderConvocatoria':
        return respuestaJson(responderConvocatoria(requerirSesionValida(params.token), params.id_jornada, params.disponibilidad, params.observaciones));

      case 'listarHistorialConvocatorias':
        return respuestaOk({ historial: listarHistorialConvocatoriasJugador(requerirSesionValida(params.token)) });

      case 'obtenerResumenInicio':
        return respuestaOk({ resumen: obtenerResumenInicio(requerirSesionValida(params.token)) });

      case 'listarSeleccionados':
        if (!validarSesion(params.token)) return respuestaError('Sesión no válida o caducada.');
        return respuestaOk({ seleccionados: listarSeleccionados(params.id_jornada) });

      case 'guardarSeleccion':
        return respuestaJson(guardarSeleccion(requerirSesionValida(params.token), params.id_jornada, params.ids_jugadores));

      case 'listarParejas':
        if (!validarSesion(params.token)) return respuestaError('Sesión no válida o caducada.');
        return respuestaOk({ parejas: listarParejas(params.id_jornada) });

      case 'listarJugadoresParaParejas':
        if (!validarSesion(params.token)) return respuestaError('Sesión no válida o caducada.');
        return respuestaOk({ jugadores: listarJugadoresParaParejas(params.id_jornada) });

      case 'obtenerPoolYSugerenciaParejas':
        if (!validarSesion(params.token)) return respuestaError('Sesión no válida o caducada.');
        return respuestaOk(obtenerPoolYSugerenciaParejas(params.id_jornada));

      case 'guardarParejas':
        return respuestaJson(guardarParejas(requerirSesionValida(params.token), params.id_jornada, params.parejas));

      case 'listarPartidos':
        if (!validarSesion(params.token)) return respuestaError('Sesión no válida o caducada.');
        return respuestaOk({ partidos: listarPartidos(params.id_jornada) });

      case 'listarResultados':
        if (!validarSesion(params.token)) return respuestaError('Sesión no válida o caducada.');
        return respuestaOk({ resultados: listarResultados() });

      case 'registrarResultado':
        return respuestaJson(registrarResultado(requerirSesionValida(params.token), params));

      case 'obtenerEstadisticasJugador':
        if (!validarSesion(params.token)) return respuestaError('Sesión no válida o caducada.');
        return respuestaOk({ estadisticas: obtenerEstadisticasJugador(params.id_jugador) });

      case 'obtenerEstadisticasCompletasJugador':
        return respuestaOk(obtenerEstadisticasCompletasJugador(requerirSesionValida(params.token), params.id_jugador));

      case 'listarUsuarios':
        return respuestaOk({ usuarios: listarUsuarios(requerirSesionValida(params.token)) });

      case 'crearUsuario':
        return respuestaJson(crearUsuario(requerirSesionValida(params.token), params));

      case 'editarUsuario':
        return respuestaJson(editarUsuario(requerirSesionValida(params.token), params));

      case 'cambiarMiCodigoAcceso':
        return respuestaJson(cambiarMiCodigoAcceso(requerirSesionValida(params.token), params.codigo_nuevo));

      case 'restablecerCodigoAcceso':
        return respuestaJson(restablecerCodigoAcceso(requerirSesionValida(params.token), params.id_jugador));

      case 'listarRankingJugadores':
        return respuestaOk({ ranking: listarRankingJugadores(requerirSesionValida(params.token)) });

      case 'obtenerMiPosicionRanking':
        return respuestaOk({ ranking: obtenerMiPosicionRanking(requerirSesionValida(params.token)) });

      case 'listarEstadisticasParejas':
        return respuestaOk({ parejas: listarEstadisticasParejas(requerirSesionValida(params.token)) });

      case 'listarResumenJornadas':
        if (!validarSesion(params.token)) return respuestaError('Sesión no válida o caducada.');
        return respuestaOk({ resumen: listarResumenJornadas() });

      case 'obtenerClasificacionEquipo':
        if (!validarSesion(params.token)) return respuestaError('Sesión no válida o caducada.');
        return respuestaOk({ clasificacion: obtenerClasificacionEquipo() });

      case 'obtenerClasificacionCompleta':
        if (!validarSesion(params.token)) return respuestaError('Sesión no válida o caducada.');
        return respuestaOk({ clasificacion: obtenerClasificacionCompleta() });

      case 'obtenerDashboard':
        return respuestaOk({ dashboard: obtenerDashboard(requerirSesionValida(params.token)) });

      case 'generarRecomendaciones':
        return respuestaOk({ recomendaciones: generarRecomendaciones(requerirSesionValida(params.token), params.id_jornada) });

      case 'crearAccesosFaltantes':
        return respuestaJson(crearAccesosFaltantes(requerirSesionValida(params.token)));

      case 'actualizarPuntuacionesSNP':
        requerirCapitan(requerirSesionValida(params.token));
        return respuestaJson(actualizarPuntuacionesSNP());

      case 'previsualizarAlineaciones':
        return respuestaOk({ recomendaciones: previsualizarAlineaciones(requerirSesionValida(params.token), params.ids_jugadores) });

      case 'confirmarAsistencia':
        return confirmarAsistenciaPorEnlace(params);

      case 'listarCompaneros':
        if (!validarSesion(params.token)) return respuestaError('Sesión no válida o caducada.');
        return respuestaOk({ jugadores: listarCompanerosEquipo() });

      default:
        return respuestaError('Acción no reconocida: "' + action + '"');
    }
  } catch (err) {
    return respuestaError(err.message);
  }
}

/**
 * Extrae los parámetros de la petición, admitiendo dos formas de envío:
 * - GET normal: parámetros en la URL (?action=ping&token=...)
 * - POST con cuerpo de texto plano conteniendo JSON (workaround necesario
 *   porque los Web Apps de Apps Script no admiten bien POST con
 *   Content-Type: application/json desde fetch() en el navegador).
 */
function obtenerParametros(e) {
  if (e.postData && e.postData.contents) {
    try {
      return JSON.parse(e.postData.contents);
    } catch (err) {
      // El cuerpo no era JSON: seguimos con los parámetros de la URL.
    }
  }
  return e.parameter || {};
}
