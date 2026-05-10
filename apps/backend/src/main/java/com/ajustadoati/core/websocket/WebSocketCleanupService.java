package com.ajustadoati.core.websocket;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

/**
 * Servicio para limpieza automática de sesiones WebSocket inactivas
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class WebSocketCleanupService {
    
    private final ConnectionRegistry connectionRegistry;
    
    /**
     * Ejecuta limpieza de sesiones inactivas cada 10 minutos
     */
    @Scheduled(fixedRate = 600000) // 10 minutos = 600,000 ms
    public void cleanupInactiveSessions() {
        try {
            log.debug("Starting WebSocket session cleanup...");
            connectionRegistry.cleanupInactiveSessions();
            log.debug("WebSocket session cleanup completed");
        } catch (Exception e) {
            log.error("Error during WebSocket session cleanup", e);
        }
    }
    
    /**
     * Log de estadísticas cada hora
     */
    @Scheduled(fixedRate = 3600000) // 1 hora = 3,600,000 ms
    public void logConnectionStats() {
        try {
            var stats = connectionRegistry.getConnectionStats();
            log.info("WebSocket Connection Stats - Active Users: {}, Active Providers: {}, Total Connections: {}, Messages Processed: {}", 
                    stats.getActiveUsers(), 
                    stats.getActiveProviders(), 
                    stats.getTotalConnections(), 
                    stats.getMessagesProcessed());
        } catch (Exception e) {
            log.error("Error logging WebSocket connection stats", e);
        }
    }
}