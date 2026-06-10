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
            // Register WebSocket session first so it is always present when SessionInfo is visible
            webSocketSessions.put(sessionId, session);
            sessions.put(sessionId, sessionInfo);
            userSessions.computeIfAbsent(userEmail, k -> ConcurrentHashMap.newKeySet()).add(sessionId);
            totalConnectionsCreated++;

            String locationInfo = sessionInfo.getLocation() != null
                    ? String.format("lat=%.4f lon=%.4f",
                            sessionInfo.getLocation().getLatitude().doubleValue(),
                            sessionInfo.getLocation().getLongitude().doubleValue())
                    : "sin-ubicacion";

            log.info("[CONECTADO] {} | proveedor={} | categorias={} | {} | session={} | activos={}",
                    userEmail,
                    sessionInfo.getIsProvider(),
                    sessionInfo.getCategories(),
                    locationInfo,
                    sessionId.substring(0, 8),
                    sessions.size());

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
                
                log.info("[DESCONECTADO] {} | session={} | activos={}",
                        userEmail, sessionId.substring(0, 8), sessions.size());
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
        List<WebSocketDto.SessionInfo> allSessions = new ArrayList<>(sessions.values());
        log.info("[BUSQUEDA-PROVEEDORES] categoria={} | sesiones-totales={}", categoryId, allSessions.size());

        List<WebSocketSession> result = new ArrayList<>();

        for (WebSocketDto.SessionInfo info : allSessions) {
            String email = info.getEmail();

            if (!Boolean.TRUE.equals(info.getIsProvider())) {
                log.debug("[FILTRO] {} → descartado (no es proveedor)", email);
                continue;
            }

            if (categoryId != null) {
                List<Integer> cats = info.getCategories();
                if (cats == null || !cats.contains(categoryId)) {
                    log.info("[FILTRO] {} → descartado (categoria {} no en {})", email, categoryId, cats);
                    continue;
                }
            }

            if (latitude != null && longitude != null && maxDistanceKm != null && info.getLocation() != null) {
                double distance = calculateDistance(
                        latitude, longitude,
                        info.getLocation().getLatitude().doubleValue(),
                        info.getLocation().getLongitude().doubleValue());
                if (distance > maxDistanceKm) {
                    log.info("[FILTRO] {} → descartado ({} km > radio {} km)",
                            email, Math.round(distance), Math.round(maxDistanceKm));
                    continue;
                }
                log.info("[FILTRO] {} → OK ({} km)", email, Math.round(distance));
            } else {
                log.info("[FILTRO] {} → OK (sin filtro de distancia)", email);
            }

            WebSocketSession ws = webSocketSessions.get(info.getSessionId());
            if (ws == null || !ws.isOpen()) {
                log.warn("[FILTRO] {} → descartado (sesion WS cerrada o nula)", email);
                continue;
            }

            result.add(ws);
        }

        log.info("[BUSQUEDA-PROVEEDORES] resultado: {}/{} proveedores seleccionados",
                result.size(), allSessions.stream().filter(s -> Boolean.TRUE.equals(s.getIsProvider())).count());
        return result;
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