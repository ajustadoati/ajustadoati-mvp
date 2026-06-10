package com.ajustadoati.core.websocket;

import com.ajustadoati.core.dto.WebSocketDto;
import com.ajustadoati.core.entity.Profile;
import com.ajustadoati.core.repository.ProfileRepository;
import com.ajustadoati.core.security.JwtTokenProvider;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.*;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import java.net.URI;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

/**
 * Handler principal para conexiones WebSocket
 * Maneja autenticación, conexión, desconexión y procesamiento de mensajes
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class AjustadoAtiWebSocketHandler extends TextWebSocketHandler {
    
    private final ConnectionRegistry connectionRegistry;
    private final WebSocketMessageService messageService;
    private final JwtTokenProvider jwtTokenProvider;
    private final ProfileRepository profileRepository;
    private final ObjectMapper objectMapper;
    
    @Override
    public void afterConnectionEstablished(WebSocketSession session) throws Exception {
        try {
            log.info("New WebSocket connection established - SessionId: {}", session.getId());
            
            // Try to get token from interceptor attributes first
            String token = (String) session.getAttributes().get("jwt_token");
            String username = (String) session.getAttributes().get("username");
            
            // If not available, try to extract from session
            if (token == null) {
                token = extractTokenFromSession(session);
            }
            
            if (token == null) {
                log.warn("No JWT token provided in WebSocket connection: {}", session.getId());
                sendConnectionResponse(session, "error", "JWT token is required", null);
                session.close(CloseStatus.NOT_ACCEPTABLE);
                return;
            }

            // Validar token y extraer información del usuario
            if (username == null) {
                try {
                    username = jwtTokenProvider.getUsernameFromToken(token);
                    if (!jwtTokenProvider.validateToken(token)) {
                        throw new RuntimeException("Invalid token");
                    }
                } catch (Exception e) {
                    log.warn("Invalid JWT token in WebSocket connection: {}", session.getId(), e);
                    sendConnectionResponse(session, "error", "Invalid JWT token", null);
                    session.close(CloseStatus.NOT_ACCEPTABLE);
                    return;
                }
            } else {
                log.debug("Using username from interceptor: {}", username);
            }
            
            // Buscar perfil de usuario en la base de datos con categorías cargadas
            // Intentar buscar por username o email (para soportar tokens de Supabase)
            Optional<Profile> profileOpt = profileRepository.findByUsernameOrEmailWithCategories(username, username);
            if (profileOpt.isEmpty()) {
                log.warn("User profile not found for username/email: {} in session: {}", username, session.getId());
                sendConnectionResponse(session, "error", "User profile not found", null);
                session.close(CloseStatus.NOT_ACCEPTABLE);
                return;
            }

            Profile profile = profileOpt.get();
            
            if (!profile.getIsActive()) {
                log.warn("Inactive user attempting WebSocket connection: {}", username);
                sendConnectionResponse(session, "error", "User account is inactive", null);
                session.close(CloseStatus.NOT_ACCEPTABLE);
                return;
            }
            
            // Crear información de sesión
            // Copiar categorías a una nueva lista para evitar lazy loading issues
            List<Integer> categoriesCopy = profile.getCategories() != null
                    ? new java.util.ArrayList<>(profile.getCategories())
                    : new java.util.ArrayList<>();

            WebSocketDto.SessionInfo sessionInfo = WebSocketDto.SessionInfo.builder()
                    .sessionId(session.getId())
                    .userId(profile.getId().toString())
                    .email(profile.getEmail())
                    .isProvider(profile.getIsProvider())
                    .categories(categoriesCopy)
                    .location(profile.getLocation())
                    .connectedAt(LocalDateTime.now())
                    .lastActivity(LocalDateTime.now())
                    .build();
            
            // Registrar conexión
            connectionRegistry.addConnection(session, sessionInfo);
            
            // Enviar confirmación de conexión exitosa
            sendConnectionResponse(session, "authenticated", "Successfully connected to WebSocket", profile.getEmail());
            
            log.info("[WS-AUTH] {} | proveedor={} | categorias={} | session={}",
                    profile.getEmail(), profile.getIsProvider(),
                    categoriesCopy, session.getId().substring(0, 8));
            
        } catch (Exception e) {
            log.error("Error establishing WebSocket connection for session: {}", session.getId(), e);
            try {
                sendConnectionResponse(session, "error", "Connection error: " + e.getMessage(), null);
                session.close(CloseStatus.SERVER_ERROR);
            } catch (Exception closeException) {
                log.error("Error closing session after connection failure: {}", session.getId(), closeException);
            }
        }
    }
    
    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) throws Exception {
        try {
            String payload = message.getPayload();
            log.debug("Received WebSocket message from session {}: {}", session.getId(), payload);
            
            // Verificar que la sesión esté autenticada
            WebSocketDto.SessionInfo sessionInfo = connectionRegistry.getSessionInfo(session.getId());
            if (sessionInfo == null) {
                log.warn("Received message from unauthenticated session: {}", session.getId());
                sendErrorResponse(session, "Session not authenticated");
                return;
            }
            
            // Parsear mensaje JSON
            WebSocketDto.IncomingMessage incomingMessage;
            try {
                incomingMessage = objectMapper.readValue(payload, WebSocketDto.IncomingMessage.class);
            } catch (Exception e) {
                log.warn("Invalid JSON message from session {}: {}", session.getId(), payload, e);
                sendErrorResponse(session, "Invalid JSON message format");
                return;
            }
            
            // Usar el email del usuario autenticado de la sesión en lugar del fromUser del mensaje
            // Esto evita problemas de sincronización entre frontend y backend
            if (incomingMessage.getFromUser() != null && !sessionInfo.getEmail().equals(incomingMessage.getFromUser())) {
                log.debug("Overriding message fromUser ({}) with authenticated user ({}) from session: {}",
                        incomingMessage.getFromUser(), sessionInfo.getEmail(), session.getId());
            }

            // Sobrescribir el fromUser con el email de la sesión autenticada
            incomingMessage.setFromUser(sessionInfo.getEmail());

            // Procesar mensaje
            messageService.processIncomingMessage(session, incomingMessage);
            
        } catch (Exception e) {
            log.error("Error handling WebSocket message from session: {}", session.getId(), e);
            sendErrorResponse(session, "Error processing message: " + e.getMessage());
        }
    }
    
    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) throws Exception {
        try {
            log.info("WebSocket connection closed - SessionId: {}, Status: {}", session.getId(), status);
            
            // Obtener información de sesión antes de removerla
            WebSocketDto.SessionInfo sessionInfo = connectionRegistry.getSessionInfo(session.getId());
            if (sessionInfo != null) {
                log.info("User disconnected - Email: {}, IsProvider: {}, Duration: {} minutes", 
                        sessionInfo.getEmail(), 
                        sessionInfo.getIsProvider(),
                        java.time.Duration.between(sessionInfo.getConnectedAt(), LocalDateTime.now()).toMinutes());
            }
            
            // Remover conexión del registro
            connectionRegistry.removeConnection(session.getId());
            
        } catch (Exception e) {
            log.error("Error handling WebSocket connection closure for session: {}", session.getId(), e);
        }
    }
    
    @Override
    public void handleTransportError(WebSocketSession session, Throwable exception) throws Exception {
        log.error("WebSocket transport error for session: {}", session.getId(), exception);
        
        try {
            // Remover conexión del registro
            connectionRegistry.removeConnection(session.getId());
            
            // Cerrar sesión si aún está abierta
            if (session.isOpen()) {
                session.close(CloseStatus.SERVER_ERROR);
            }
        } catch (Exception e) {
            log.error("Error handling transport error for session: {}", session.getId(), e);
        }
    }
    
    @Override
    public boolean supportsPartialMessages() {
        return false; // No soportamos mensajes parciales
    }
    
    /**
     * Extrae el token JWT de la sesión WebSocket
     * Busca en parámetros de query (?token=xxx) o en headers (Authorization: Bearer xxx)
     */
    private String extractTokenFromSession(WebSocketSession session) {
        try {
            URI uri = session.getUri();
            log.debug("WebSocket URI: {}", uri);
            log.debug("WebSocket headers: {}", session.getHandshakeHeaders());
            
            if (uri != null) {
                String query = uri.getQuery();
                if (query != null) {
                    log.debug("Query string: {}", query);
                    // Buscar parámetro token en query string
                    String[] params = query.split("&");
                    for (String param : params) {
                        String[] keyValue = param.split("=", 2);
                        if (keyValue.length == 2 && "token".equals(keyValue[0])) {
                            log.debug("Token found in query parameters");
                            return keyValue[1];
                        }
                    }
                }
            }
            
            // Buscar en headers (si está disponible en handshake headers)
            if (session.getHandshakeHeaders().containsKey("Authorization")) {
                List<String> authHeaders = session.getHandshakeHeaders().get("Authorization");
                if (authHeaders != null && !authHeaders.isEmpty()) {
                    String authHeader = authHeaders.get(0);
                    if (authHeader.startsWith("Bearer ")) {
                        log.debug("Token found in Authorization header");
                        return authHeader.substring(7);
                    }
                }
            }
            
            // Chrome extensions sometimes send token in custom headers
            if (session.getHandshakeHeaders().containsKey("X-Auth-Token")) {
                List<String> tokenHeaders = session.getHandshakeHeaders().get("X-Auth-Token");
                if (tokenHeaders != null && !tokenHeaders.isEmpty()) {
                    log.debug("Token found in X-Auth-Token header");
                    return tokenHeaders.get(0);
                }
            }
            
            log.warn("No token found in WebSocket session");
            return null;
            
        } catch (Exception e) {
            log.error("Error extracting token from WebSocket session: {}", session.getId(), e);
            return null;
        }
    }

    /**
     * Envía respuesta de estado de conexión
     */
    private void sendConnectionResponse(WebSocketSession session, String status, String message, String userId) {
        try {
            WebSocketDto.ConnectionResponse response = WebSocketDto.ConnectionResponse.builder()
                    .status(status)
                    .message(message)
                    .userId(userId)
                    .build();
            
            String jsonResponse = objectMapper.writeValueAsString(response);
            session.sendMessage(new TextMessage(jsonResponse));
            
        } catch (Exception e) {
            log.error("Error sending connection response to session: {}", session.getId(), e);
        }
    }
    
    /**
     * Envía mensaje de error
     */
    private void sendErrorResponse(WebSocketSession session, String errorMessage) {
        try {
            WebSocketDto.OutgoingMessage error = WebSocketDto.OutgoingMessage.builder()
                    .type("error")
                    .message(errorMessage)
                    .timestamp(LocalDateTime.now())
                    .build();
            
            String jsonError = objectMapper.writeValueAsString(error);
            session.sendMessage(new TextMessage(jsonError));
            
        } catch (Exception e) {
            log.error("Error sending error response to session: {}", session.getId(), e);
        }
    }
}
