package com.ajustadoati.core.websocket;

import com.ajustadoati.core.dto.WebSocketDto;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.web.socket.WebSocketSession;

import java.time.LocalDateTime;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;

/**
 * Servicio para gestionar las conexiones WebSocket activas
 * Almacena sesiones por usuario y permite buscar conexiones por criterios
 */
@Service
@Slf4j
public class ConnectionRegistry {
    
    // Map<SessionId, SessionInfo>
    private final Map<String, WebSocketDto.SessionInfo> sessions = new ConcurrentHashMap<>();
    
    // Map<Email, Set<SessionId>> - Un usuario puede tener múltiples sesiones
    private final Map<String, Set<String>> userSessions = new ConcurrentHashMap<>();
    
    // Map<SessionId, WebSocketSession> - Para acceso directo a las sesiones WebSocket
    private final Map<String, WebSocketSession> webSocketSessions = new ConcurrentHashMap<>();
    
    // Métricas
    private long totalConnectionsCreated = 0;
    private long messagesProcessed = 0;
    
    /**
     * Registra una nueva conexión WebSocket
     */
    public void addConnection(WebSocketSession session, WebSocketDto.SessionInfo sessionInfo) {
        String sessionId = session.getId();
        String userEmail = sessionInfo.getEmail();
        
        try {
            // Almacenar información de sesión
            sessions.put(sessionId, sessionInfo);
            webSocketSessions.put(sessionId, session);
            
            // Agregar a índice por usuario
            userSessions.computeIfAbsent(userEmail, k -> ConcurrentHashMap.newKeySet()).add(sessionId);
            
            // Actualizar métricas
            totalConnectionsCreated++;
            
            log.info("Connection registered - SessionId: {}, User: {}, IsProvider: {}, TotalActive: {}", 
                    sessionId, userEmail, sessionInfo.getIsProvider(), sessions.size());
            
        } catch (Exception e) {
            log.error("Error registering connection for user: {}", userEmail, e);
            throw new RuntimeException("Failed to register connection", e);
        }
    }
    
    /**
     * Elimina una conexión WebSocket
     */
    public void removeConnection(String sessionId) {
        try {
            WebSocketDto.SessionInfo sessionInfo = sessions.remove(sessionId);
            webSocketSessions.remove(sessionId);
            
            if (sessionInfo != null) {
                String userEmail = sessionInfo.getEmail();
                
                // Remover de índice por usuario
                Set<String> userSessionIds = userSessions.get(userEmail);
                if (userSessionIds != null) {
                    userSessionIds.remove(sessionId);
                    
                    // Si no quedan sesiones para este usuario, remover la entrada
                    if (userSessionIds.isEmpty()) {
                        userSessions.remove(userEmail);
                    }
                }
                
                log.info("Connection removed - SessionId: {}, User: {}, RemainingActive: {}", 
                        sessionId, userEmail, sessions.size());
            }
            
        } catch (Exception e) {
            log.error("Error removing connection: {}", sessionId, e);
        }
    }
    
    /**
     * Obtiene las sesiones WebSocket activas de un usuario
     */
    public List<WebSocketSession> getUserSessions(String userEmail) {
        Set<String> sessionIds = userSessions.get(userEmail);
        if (sessionIds == null || sessionIds.isEmpty()) {
            return Collections.emptyList();
        }
        
        return sessionIds.stream()
                .map(webSocketSessions::get)
                .filter(Objects::nonNull)
                .filter(WebSocketSession::isOpen)
                .collect(Collectors.toList());
    }
    
    /**
     * Obtiene información de sesión por sessionId
     */
    public WebSocketDto.SessionInfo getSessionInfo(String sessionId) {
        return sessions.get(sessionId);
    }
    
    /**
     * Obtiene las sesiones de proveedores activos por categoría y ubicación
     */
    public List<WebSocketSession> getProviderSessions(Integer categoryId, Double latitude, Double longitude, Double maxDistanceKm) {
        return sessions.values().stream()
                .filter(sessionInfo -> sessionInfo.getIsProvider())
                .filter(sessionInfo -> categoryId == null || 
                        (sessionInfo.getCategories() != null && sessionInfo.getCategories().contains(categoryId)))
                .filter(sessionInfo -> {
                    if (latitude == null || longitude == null || maxDistanceKm == null || sessionInfo.getLocation() == null) {
                        return true; // Sin filtro de distancia
                    }
                    
                    // Calcular distancia usando fórmula haversine
                    double distance = calculateDistance(
                            latitude, longitude,
                            sessionInfo.getLocation().getLatitude().doubleValue(),
                            sessionInfo.getLocation().getLongitude().doubleValue()
                    );
                    
                    return distance <= maxDistanceKm;
                })
                .map(sessionInfo -> webSocketSessions.get(sessionInfo.getSessionId()))
                .filter(Objects::nonNull)
                .filter(WebSocketSession::isOpen)
                .collect(Collectors.toList());
    }
    
    /**
     * Obtiene todas las sesiones de proveedores activos
     */
    public List<WebSocketSession> getAllProviderSessions() {
        return sessions.values().stream()
                .filter(sessionInfo -> sessionInfo.getIsProvider())
                .map(sessionInfo -> webSocketSessions.get(sessionInfo.getSessionId()))
                .filter(Objects::nonNull)
                .filter(WebSocketSession::isOpen)
                .collect(Collectors.toList());
    }
    
    /**
     * Obtiene todas las sesiones activas
     */
    public List<WebSocketSession> getAllActiveSessions() {
        return new ArrayList<>(webSocketSessions.values().stream()
                .filter(Objects::nonNull)
                .filter(WebSocketSession::isOpen)
                .toList());
    }
    
    /**
     * Actualiza la última actividad de una sesión
     */
    public void updateLastActivity(String sessionId) {
        WebSocketDto.SessionInfo sessionInfo = sessions.get(sessionId);
        if (sessionInfo != null) {
            sessionInfo.setLastActivity(LocalDateTime.now());
            messagesProcessed++;
        }
    }
    
    /**
     * Limpia sesiones cerradas o inactivas
     */
    public void cleanupInactiveSessions() {
        LocalDateTime cutoff = LocalDateTime.now().minusMinutes(30); // 30 minutos de inactividad
        
        List<String> inactiveSessions = sessions.values().stream()
                .filter(sessionInfo -> sessionInfo.getLastActivity().isBefore(cutoff))
                .map(WebSocketDto.SessionInfo::getSessionId)
                .collect(Collectors.toList());
        
        for (String sessionId : inactiveSessions) {
            WebSocketSession webSocketSession = webSocketSessions.get(sessionId);
            if (webSocketSession == null || !webSocketSession.isOpen()) {
                removeConnection(sessionId);
            }
        }
        
        if (!inactiveSessions.isEmpty()) {
            log.info("Cleaned up {} inactive sessions", inactiveSessions.size());
        }
    }
    
    /**
     * Obtiene estadísticas de conexiones
     */
    public WebSocketDto.ConnectionStats getConnectionStats() {
        long activeUsers = sessions.values().stream()
                .filter(sessionInfo -> !sessionInfo.getIsProvider())
                .count();
        
        long activeProviders = sessions.values().stream()
                .filter(WebSocketDto.SessionInfo::getIsProvider)
                .count();
        
        return WebSocketDto.ConnectionStats.builder()
                .totalConnections(totalConnectionsCreated)
                .activeUsers(activeUsers)
                .activeProviders(activeProviders)
                .messagesProcessed(messagesProcessed)
                .timestamp(LocalDateTime.now())
                .build();
    }
    
    /**
     * Verifica si un usuario está conectado
     */
    public boolean isUserConnected(String userEmail) {
        return userSessions.containsKey(userEmail) && !userSessions.get(userEmail).isEmpty();
    }
    
    /**
     * Calcula la distancia entre dos puntos usando la fórmula haversine
     */
    private double calculateDistance(double lat1, double lon1, double lat2, double lon2) {
        final int R = 6371; // Radio de la Tierra en kilometros
        
        double latDistance = Math.toRadians(lat2 - lat1);
        double lonDistance = Math.toRadians(lon2 - lon1);
        
        double a = Math.sin(latDistance / 2) * Math.sin(latDistance / 2)
                + Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2))
                * Math.sin(lonDistance / 2) * Math.sin(lonDistance / 2);
        
        double c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        
        return R * c;
    }
}