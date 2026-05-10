package com.ajustadoati.core.websocket;

import com.ajustadoati.core.security.JwtTokenProvider;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.server.ServerHttpRequest;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.WebSocketHandler;
import org.springframework.web.socket.server.HandshakeInterceptor;

import java.net.URI;
import java.util.List;
import java.util.Map;

/**
 * Interceptor para validar JWT en el handshake de WebSocket
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class JwtHandshakeInterceptor implements HandshakeInterceptor {

    private final JwtTokenProvider jwtTokenProvider;

    @Override
    public boolean beforeHandshake(ServerHttpRequest request, ServerHttpResponse response,
                                 WebSocketHandler wsHandler, Map<String, Object> attributes) throws Exception {
        
        log.debug("WebSocket handshake - URI: {}", request.getURI());
        log.debug("WebSocket handshake - Headers: {}", request.getHeaders());
        
        try {
            String token = extractToken(request);
            
            if (token == null) {
                log.warn("No JWT token found in WebSocket handshake request");
                response.setStatusCode(HttpStatus.UNAUTHORIZED);
                return false;
            }
            
            if (jwtTokenProvider.validateToken(token)) {
                String username = jwtTokenProvider.getUsernameFromToken(token);
                log.debug("Valid JWT token found for user: {}", username);
                
                // Store token and username in attributes for the handler
                attributes.put("jwt_token", token);
                attributes.put("username", username);
                return true;
            } else {
                log.warn("Invalid JWT token in WebSocket handshake");
                response.setStatusCode(HttpStatus.UNAUTHORIZED);
                return false;
            }
            
        } catch (Exception e) {
            log.error("Error during WebSocket handshake authentication", e);
            response.setStatusCode(HttpStatus.UNAUTHORIZED);
            return false;
        }
    }

    @Override
    public void afterHandshake(ServerHttpRequest request, ServerHttpResponse response,
                             WebSocketHandler wsHandler, Exception exception) {
        if (exception != null) {
            log.error("WebSocket handshake failed", exception);
        } else {
            log.debug("WebSocket handshake completed successfully");
        }
    }

    private String extractToken(ServerHttpRequest request) {
        // 1. Try to get token from query parameters
        URI uri = request.getURI();
        if (uri != null && uri.getQuery() != null) {
            String query = uri.getQuery();
            String[] params = query.split("&");
            for (String param : params) {
                String[] keyValue = param.split("=", 2);
                if (keyValue.length == 2 && "token".equals(keyValue[0])) {
                    return keyValue[1];
                }
            }
        }

        // 2. Try to get token from Authorization header
        List<String> authHeaders = request.getHeaders().get("Authorization");
        if (authHeaders != null && !authHeaders.isEmpty()) {
            String authHeader = authHeaders.get(0);
            if (authHeader.startsWith("Bearer ")) {
                return authHeader.substring(7);
            }
        }

        // 3. Try to get token from custom header
        List<String> tokenHeaders = request.getHeaders().get("X-Auth-Token");
        if (tokenHeaders != null && !tokenHeaders.isEmpty()) {
            return tokenHeaders.get(0);
        }

        return null;
    }
}
