package com.ajustadoati.core.websocket;

import com.ajustadoati.core.dto.WebSocketDto;
import com.ajustadoati.core.entity.Profile;
import com.ajustadoati.core.entity.Category;
import com.ajustadoati.core.repository.ProfileRepository;
import com.ajustadoati.core.repository.CategoryRepository;
import com.ajustadoati.core.service.GuestRequestService;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Servicio para manejar la lógica de negocio de los mensajes WebSocket
 */
@Service
@RequiredArgsConstructor
@Slf4j
@Transactional
public class WebSocketMessageService {
    
    private final ConnectionRegistry connectionRegistry;
    private final ProfileRepository profileRepository;
    private final CategoryRepository categoryRepository;
    private final GuestRequestService guestRequestService;
    private final ObjectMapper objectMapper;
    
    /**
     * Procesa un mensaje entrante y determina la acción a realizar
     */
    public void processIncomingMessage(WebSocketSession session, WebSocketDto.IncomingMessage message) {
        try {
            String sessionId = session.getId();
            connectionRegistry.updateLastActivity(sessionId);
            
            log.info("Processing message - Type: {}, From: {}, SessionId: {}", 
                    message.getType(), message.getFromUser(), sessionId);
            
            switch (message.getType().toLowerCase()) {
                case "request" -> handleServiceRequest(session, message);
                case "response" -> handleServiceResponse(session, message);
                case "ping" -> handlePing(session, message);
                case "offer_accepted" -> handleOfferAccepted(session, message);
                case "job_started", "job_completed" -> handleJobStatusUpdate(session, message);
                default -> {
                    log.warn("Unknown message type: {} from user: {}", message.getType(), message.getFromUser());
                    sendErrorMessage(session, "Unknown message type: " + message.getType());
                }
            }
            
        } catch (Exception e) {
            log.error("Error processing message from session: {}", session.getId(), e);
            sendErrorMessage(session, "Error processing message: " + e.getMessage());
        }
    }
    
    /**
     * Maneja solicitudes de servicio de usuarios
     */
    private void handleServiceRequest(WebSocketSession session, WebSocketDto.IncomingMessage message) {
        try {
            WebSocketDto.SessionInfo senderInfo = connectionRegistry.getSessionInfo(session.getId());
            if (senderInfo == null) {
                sendErrorMessage(session, "Session not authenticated");
                return;
            }
            
            // Validar datos requeridos
            if (message.getCategoryId() == null) {
                sendErrorMessage(session, "Category ID is required for service requests");
                return;
            }
            
            // Obtener información de la categoría
            Optional<Category> categoryOpt = categoryRepository.findById(message.getCategoryId());
            String categoryName = categoryOpt.map(Category::getName).orElse("Servicio");
            
            // Buscar proveedores conectados que puedan atender la solicitud
            List<WebSocketSession> providerSessions = connectionRegistry.getProviderSessions(
                    message.getCategoryId(),
                    message.getLatitude() != null ? message.getLatitude().doubleValue() : null,
                    message.getLongitude() != null ? message.getLongitude().doubleValue() : null,
                    message.getMaxDistanceKm()
            );
            
            log.info("Found {} available providers for category {} within {} km", 
                    providerSessions.size(), categoryName, message.getMaxDistanceKm());
            
            if (providerSessions.isEmpty()) {
                sendNotificationMessage(session, "No providers available for this service in your area");
                return;
            }
            
            // Crear mensaje para enviar a los proveedores
            WebSocketDto.OutgoingMessage providerMessage = WebSocketDto.OutgoingMessage.builder()
                    .id(message.getId())
                    .type("request")
                    .fromUser(message.getFromUser())
                    .message(message.getMessage())
                    .latitude(message.getLatitude())
                    .longitude(message.getLongitude())
                    .categoryId(message.getCategoryId())
                    .categoryName(categoryName)
                    .requestId(UUID.randomUUID()) // Generar ID único para la solicitud
                    .timestamp(LocalDateTime.now())
                    .build();
            
            // Enviar solicitud a todos los proveedores disponibles
            int successfulSends = 0;
            for (WebSocketSession providerSession : providerSessions) {
                if (sendMessageToSession(providerSession, providerMessage)) {
                    successfulSends++;
                }
            }
            
            // Confirmar al usuario que se envió la solicitud
            WebSocketDto.OutgoingMessage confirmationMessage = WebSocketDto.OutgoingMessage.builder()
                    .type("notification")
                    .message(String.format("Your request has been sent to %d available providers", successfulSends))
                    .requestId(providerMessage.getRequestId())
                    .timestamp(LocalDateTime.now())
                    .build();
            
            sendMessageToSession(session, confirmationMessage);
            
        } catch (Exception e) {
            log.error("Error handling service request", e);
            sendErrorMessage(session, "Error processing service request");
        }
    }
    
    /**
     * Maneja respuestas de proveedores a solicitudes de servicio
     */
    private void handleServiceResponse(WebSocketSession session, WebSocketDto.IncomingMessage message) {
        try {
            WebSocketDto.SessionInfo providerInfo = connectionRegistry.getSessionInfo(session.getId());
            if (providerInfo == null || !providerInfo.getIsProvider()) {
                sendErrorMessage(session, "Only providers can send responses");
                return;
            }
            
            if (message.getRequestId() == null) {
                sendErrorMessage(session, "Request ID is required for responses");
                return;
            }
            
            // Obtener información del proveedor desde la base de datos (con categorías cargadas)
            Optional<Profile> providerProfileOpt = profileRepository.findByEmailWithCategories(providerInfo.getEmail());
            WebSocketDto.ProviderInfo providerInfoDto;
            if (providerProfileOpt.isPresent()) {
                Profile providerProfile = providerProfileOpt.get();
                providerInfoDto = WebSocketDto.ProviderInfo.builder()
                        .id(providerProfile.getId())
                        .fullName(providerProfile.getFullName())
                        .username(providerProfile.getUsername())
                        .email(providerProfile.getEmail())
                        .phone(providerProfile.getPhone())
                        .categories(providerProfile.getCategories())
                        .responseTime("< 5 min")
                        .build();
            } else {
                // Dev/demo fallback: build provider info from the WS session.
                providerInfoDto = WebSocketDto.ProviderInfo.builder()
                        .id(null)
                        .fullName(providerInfo.getEmail())
                        .username(providerInfo.getEmail())
                        .email(providerInfo.getEmail())
                        .phone(null)
                        .categories(providerInfo.getCategories())
                        .responseTime("< 5 min")
                        .build();
            }
            
            // Crear mensaje de respuesta
            WebSocketDto.OutgoingMessage responseMessage = WebSocketDto.OutgoingMessage.builder()
                    .id(message.getId())
                    .type("response")
                    .fromUser(message.getFromUser())
                    .user(message.getFromUser()) // Para compatibilidad
                    .message(message.getMessage())
                    .latitude(message.getLatitude())
                    .longitude(message.getLongitude())
                    .requestId(message.getRequestId())
                    .timestamp(LocalDateTime.now())
                    .providerInfo(providerInfoDto)
                    .build();

            log.info("[RESPUESTA] proveedor={} → peticion={} | lat={} lon={}",
                    providerInfo.getEmail(), message.getRequestId(),
                    message.getLatitude(), message.getLongitude());

            if (message.getRequestId() != null && guestRequestService.hasGuestRequest(message.getRequestId())) {
                guestRequestService.recordProviderResponse(message.getRequestId(), providerInfoDto, message);
            }

            int delivered = 0;
            if (message.getToUsers() != null && !message.getToUsers().isEmpty()) {
                for (String userEmail : message.getToUsers()) {
                    List<WebSocketSession> userSessions = connectionRegistry.getUserSessions(userEmail);
                    for (WebSocketSession userSession : userSessions) {
                        if (sendMessageToSession(userSession, responseMessage)) delivered++;
                    }
                }
            }
            log.info("[RESPUESTA] peticion={} | entregada a {} sesion(es) de usuario",
                    message.getRequestId(), delivered);

            WebSocketDto.OutgoingMessage confirmation = WebSocketDto.OutgoingMessage.builder()
                    .type("notification")
                    .message("Your response has been sent to the customer")
                    .timestamp(LocalDateTime.now())
                    .build();

            sendMessageToSession(session, confirmation);
            
        } catch (Exception e) {
            log.error("Error handling service response", e);
            sendErrorMessage(session, "Error processing service response");
        }
    }
    
    /**
     * Maneja mensajes de ping para mantener conexión activa
     */
    private void handlePing(WebSocketSession session, WebSocketDto.IncomingMessage message) {
        WebSocketDto.OutgoingMessage pongMessage = WebSocketDto.OutgoingMessage.builder()
                .type("pong")
                .message("pong")
                .timestamp(LocalDateTime.now())
                .build();
        
        sendMessageToSession(session, pongMessage);
    }

    /**
     * Notifica al proveedor que el cliente acepto su oferta.
     * El frontend debe enviar toUsers=[providerEmail], requestId y offerId.
     */
    private void handleOfferAccepted(WebSocketSession session, WebSocketDto.IncomingMessage message) {
        try {
            WebSocketDto.SessionInfo senderInfo = connectionRegistry.getSessionInfo(session.getId());
            if (senderInfo == null) {
                sendErrorMessage(session, "Session not authenticated");
                return;
            }

            if (message.getRequestId() == null) {
                sendErrorMessage(session, "Request ID is required for offer_accepted");
                return;
            }
            if (message.getToUsers() == null || message.getToUsers().isEmpty()) {
                sendErrorMessage(session, "toUsers is required for offer_accepted");
                return;
            }

            WebSocketDto.OutgoingMessage outgoing = WebSocketDto.OutgoingMessage.builder()
                    .type("offer_accepted")
                    .fromUser(senderInfo.getEmail())
                    .user(senderInfo.getEmail())
                    .message(message.getMessage() != null ? message.getMessage() : "Offer accepted")
                    .requestId(message.getRequestId())
                    .offerId(message.getOfferId())
                    .timestamp(LocalDateTime.now())
                    .build();

            int sentCount = 0;
            for (String providerEmail : message.getToUsers()) {
                List<WebSocketSession> providerSessions = connectionRegistry.getUserSessions(providerEmail);
                for (WebSocketSession providerSession : providerSessions) {
                    if (sendMessageToSession(providerSession, outgoing)) {
                        sentCount++;
                    }
                }
                log.info("[OFERTA-ACEPTADA] peticion={} | proveedor={} | sesiones-notificadas={}",
                        message.getRequestId(), providerEmail, sentCount);
            }

            WebSocketDto.OutgoingMessage confirmation = WebSocketDto.OutgoingMessage.builder()
                    .type("notification")
                    .message(String.format("Offer accepted notification sent to %d provider sessions", sentCount))
                    .requestId(message.getRequestId())
                    .timestamp(LocalDateTime.now())
                    .build();
            sendMessageToSession(session, confirmation);
        } catch (Exception e) {
            log.error("Error handling offer_accepted", e);
            sendErrorMessage(session, "Error processing offer_accepted");
        }
    }

    /**
     * Forward de estados de trabajo del proveedor al cliente.
     * Tipos soportados: job_started, job_completed. Requiere toUsers=[clientEmail] y requestId.
     */
    private void handleJobStatusUpdate(WebSocketSession session, WebSocketDto.IncomingMessage message) {
        try {
            WebSocketDto.SessionInfo providerInfo = connectionRegistry.getSessionInfo(session.getId());
            if (providerInfo == null || !Boolean.TRUE.equals(providerInfo.getIsProvider())) {
                sendErrorMessage(session, "Only providers can send job updates");
                return;
            }

            if (message.getRequestId() == null) {
                sendErrorMessage(session, "Request ID is required for job updates");
                return;
            }
            if (message.getToUsers() == null || message.getToUsers().isEmpty()) {
                sendErrorMessage(session, "toUsers is required for job updates");
                return;
            }

            WebSocketDto.OutgoingMessage outgoing = WebSocketDto.OutgoingMessage.builder()
                    .type(message.getType().toLowerCase())
                    .fromUser(providerInfo.getEmail())
                    .user(providerInfo.getEmail())
                    .message(message.getMessage())
                    .requestId(message.getRequestId())
                    .timestamp(LocalDateTime.now())
                    .build();

            for (String clientEmail : message.getToUsers()) {
                List<WebSocketSession> userSessions = connectionRegistry.getUserSessions(clientEmail);
                for (WebSocketSession userSession : userSessions) {
                    sendMessageToSession(userSession, outgoing);
                }
            }

            WebSocketDto.OutgoingMessage confirmation = WebSocketDto.OutgoingMessage.builder()
                    .type("notification")
                    .message("Job update sent to customer")
                    .requestId(message.getRequestId())
                    .timestamp(LocalDateTime.now())
                    .build();
            sendMessageToSession(session, confirmation);
        } catch (Exception e) {
            log.error("Error handling job status update", e);
            sendErrorMessage(session, "Error processing job update");
        }
    }
    
    /**
     * Envía un mensaje a una sesión específica
     */
    public boolean sendMessageToSession(WebSocketSession session, WebSocketDto.OutgoingMessage message) {
        try {
            if (session == null || !session.isOpen()) {
                log.warn("Cannot send message to closed or null session");
                return false;
            }
            
            String jsonMessage = objectMapper.writeValueAsString(message);
            session.sendMessage(new TextMessage(jsonMessage));
            
            log.debug("Message sent to session {}: {}", session.getId(), message.getType());
            return true;
            
        } catch (Exception e) {
            log.error("Error sending message to session: {}", session.getId(), e);
            return false;
        }
    }
    
    /**
     * Envía un mensaje de error a una sesión
     */
    private void sendErrorMessage(WebSocketSession session, String errorMessage) {
        WebSocketDto.OutgoingMessage message = WebSocketDto.OutgoingMessage.builder()
                .type("error")
                .message(errorMessage)
                .timestamp(LocalDateTime.now())
                .build();
        
        sendMessageToSession(session, message);
    }
    
    /**
     * Envía un mensaje de notificación a una sesión
     */
    private void sendNotificationMessage(WebSocketSession session, String notificationMessage) {
        WebSocketDto.OutgoingMessage message = WebSocketDto.OutgoingMessage.builder()
                .type("notification")
                .message(notificationMessage)
                .timestamp(LocalDateTime.now())
                .build();
        
        sendMessageToSession(session, message);
    }
    
    /**
     * Envía un mensaje a todos los proveedores conectados
     */
    public void broadcastToProviders(WebSocketDto.OutgoingMessage message) {
        List<WebSocketSession> providerSessions = connectionRegistry.getAllProviderSessions();
        
        log.info("Broadcasting message to {} providers", providerSessions.size());
        
        for (WebSocketSession session : providerSessions) {
            sendMessageToSession(session, message);
        }
    }
    
    /**
     * Envía un mensaje a todos los usuarios conectados
     */
    public void broadcastToAllUsers(WebSocketDto.OutgoingMessage message) {
        List<WebSocketSession> allSessions = connectionRegistry.getAllActiveSessions();
        
        log.info("Broadcasting message to {} active sessions", allSessions.size());
        
        for (WebSocketSession session : allSessions) {
            sendMessageToSession(session, message);
        }
    }
}
