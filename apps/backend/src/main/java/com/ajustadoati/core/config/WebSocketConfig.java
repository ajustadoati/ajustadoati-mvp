package com.ajustadoati.core.config;

import com.ajustadoati.core.websocket.AjustadoAtiWebSocketHandler;
import com.ajustadoati.core.websocket.JwtHandshakeInterceptor;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.socket.config.annotation.EnableWebSocket;
import org.springframework.web.socket.config.annotation.WebSocketConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry;
import org.springframework.web.socket.server.support.HttpSessionHandshakeInterceptor;

/**
 * Configuración WebSocket para AjustadoAti Core
 * Expone el endpoint /ws con soporte para CORS y autenticación JWT
 */
@Configuration
@EnableWebSocket
@RequiredArgsConstructor
@Slf4j
public class WebSocketConfig implements WebSocketConfigurer {
    
    private final AjustadoAtiWebSocketHandler webSocketHandler;
    private final JwtHandshakeInterceptor jwtHandshakeInterceptor;
    
    @Override
    public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        log.info("Registering WebSocket handlers...");
        
        // Endpoint principal con SockJS fallback
        registry.addHandler(webSocketHandler, "/ws")
                .addInterceptors(jwtHandshakeInterceptor, new HttpSessionHandshakeInterceptor())
                .setAllowedOriginPatterns("*") // Permitir todos los orígenes para desarrollo
                .withSockJS(); // Habilitar SockJS fallback
        
        // Endpoint nativo WebSocket (sin SockJS) - Recomendado para Chrome extensions
        registry.addHandler(webSocketHandler, "/ws-native")
                .addInterceptors(jwtHandshakeInterceptor, new HttpSessionHandshakeInterceptor())
                .setAllowedOriginPatterns("*");
        
        log.info("WebSocket handlers registered successfully");
        log.info("WebSocket endpoints available:");
        log.info("  - /api/ws (with SockJS support)");
        log.info("  - /api/ws-native (native WebSocket)");
    }
}
