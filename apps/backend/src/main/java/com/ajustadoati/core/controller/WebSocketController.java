package com.ajustadoati.core.controller;

import com.ajustadoati.core.dto.CommonDto.ApiResponse;
import com.ajustadoati.core.dto.WebSocketDto;
import com.ajustadoati.core.websocket.ConnectionRegistry;
import com.ajustadoati.core.websocket.WebSocketMessageService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.socket.WebSocketSession;

import java.time.LocalDateTime;
import java.util.List;

/**
 * Controlador REST para gestionar mensajería WebSocket
 * Permite enviar mensajes y consultar estadísticas de conexiones
 */
@RestController
@RequestMapping("/websocket")
@RequiredArgsConstructor
@Slf4j
@Tag(name = "WebSocket", description = "WebSocket messaging management")
public class WebSocketController {
    
    private final ConnectionRegistry connectionRegistry;
    private final WebSocketMessageService messageService;
    
    /**
     * Envía un mensaje broadcast a todos los proveedores conectados
     */
    @PostMapping("/broadcast/providers")
    @PreAuthorize("hasRole('ADMIN')")
    @Operation(summary = "Broadcast message to all providers", 
               description = "Sends a message to all connected providers")
    @ApiResponses(value = {
        @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Message sent successfully"),
        @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "Invalid request"),
        @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "403", description = "Access denied")
    })
    public ResponseEntity<ApiResponse<String>> broadcastToProviders(
            @Valid @RequestBody BroadcastMessageRequest request) {
        
        try {
            log.info("Broadcasting message to all providers: {}", request.message());
            
            WebSocketDto.OutgoingMessage message = WebSocketDto.OutgoingMessage.builder()
                    .type("broadcast")
                    .message(request.message())
                    .timestamp(LocalDateTime.now())
                    .build();
            
            messageService.broadcastToProviders(message);
            
            return ResponseEntity.ok(ApiResponse.success("Message broadcasted to all providers"));
            
        } catch (Exception e) {
            log.error("Error broadcasting message to providers", e);
            return ResponseEntity.badRequest()
                    .body(ApiResponse.error("Failed to broadcast message: " + e.getMessage()));
        }
    }
    
    /**
     * Envía un mensaje broadcast a todos los usuarios conectados
     */
    @PostMapping("/broadcast/all")
    @PreAuthorize("hasRole('ADMIN')")
    @Operation(summary = "Broadcast message to all users", 
               description = "Sends a message to all connected users and providers")
    public ResponseEntity<ApiResponse<String>> broadcastToAll(
            @Valid @RequestBody BroadcastMessageRequest request) {
        
        try {
            log.info("Broadcasting message to all users: {}", request.message());
            
            WebSocketDto.OutgoingMessage message = WebSocketDto.OutgoingMessage.builder()
                    .type("broadcast")
                    .message(request.message())
                    .timestamp(LocalDateTime.now())
                    .build();
            
            messageService.broadcastToAllUsers(message);
            
            return ResponseEntity.ok(ApiResponse.success("Message broadcasted to all users"));
            
        } catch (Exception e) {
            log.error("Error broadcasting message to all users", e);
            return ResponseEntity.badRequest()
                    .body(ApiResponse.error("Failed to broadcast message: " + e.getMessage()));
        }
    }
    
    /**
     * Envía un mensaje directo a un usuario específico
     */
    @PostMapping("/send/{userEmail}")
    @PreAuthorize("hasRole('ADMIN')")
    @Operation(summary = "Send direct message to user", 
               description = "Sends a direct message to a specific user")
    public ResponseEntity<ApiResponse<String>> sendDirectMessage(
            @PathVariable String userEmail,
            @Valid @RequestBody DirectMessageRequest request) {
        
        try {
            log.info("Sending direct message to user: {}", userEmail);
            
            List<WebSocketSession> userSessions = connectionRegistry.getUserSessions(userEmail);
            
            if (userSessions.isEmpty()) {
                return ResponseEntity.ok(ApiResponse.error("User not connected: " + userEmail));
            }
            
            WebSocketDto.OutgoingMessage message = WebSocketDto.OutgoingMessage.builder()
                    .type("direct_message")
                    .message(request.message())
                    .timestamp(LocalDateTime.now())
                    .build();
            
            int sentCount = 0;
            for (WebSocketSession session : userSessions) {
                if (messageService.sendMessageToSession(session, message)) {
                    sentCount++;
                }
            }
            
            return ResponseEntity.ok(ApiResponse.success(
                    String.format("Message sent to %d sessions for user %s", sentCount, userEmail)));
            
        } catch (Exception e) {
            log.error("Error sending direct message to user: {}", userEmail, e);
            return ResponseEntity.badRequest()
                    .body(ApiResponse.error("Failed to send direct message: " + e.getMessage()));
        }
    }
    
    /**
     * Obtiene estadísticas de conexiones WebSocket
     */
    @GetMapping("/stats")
    @Operation(summary = "Get WebSocket connection statistics", 
               description = "Returns current WebSocket connection statistics")
    public ResponseEntity<ApiResponse<WebSocketDto.ConnectionStats>> getConnectionStats() {
        
        try {
            WebSocketDto.ConnectionStats stats = connectionRegistry.getConnectionStats();
            return ResponseEntity.ok(ApiResponse.success(stats));
            
        } catch (Exception e) {
            log.error("Error getting connection stats", e);
            return ResponseEntity.badRequest()
                    .body(ApiResponse.error("Failed to get connection stats: " + e.getMessage()));
        }
    }
    
    /**
     * Verifica si un usuario está conectado
     */
    @GetMapping("/status/{userEmail}")
    @Operation(summary = "Check user connection status", 
               description = "Checks if a specific user is currently connected")
    public ResponseEntity<ApiResponse<UserConnectionStatus>> getUserConnectionStatus(
            @PathVariable String userEmail) {
        
        try {
            boolean isConnected = connectionRegistry.isUserConnected(userEmail);
            List<WebSocketSession> sessions = connectionRegistry.getUserSessions(userEmail);
            
            UserConnectionStatus status = new UserConnectionStatus(
                    userEmail, 
                    isConnected, 
                    sessions.size(),
                    LocalDateTime.now()
            );
            
            return ResponseEntity.ok(ApiResponse.success(status));
            
        } catch (Exception e) {
            log.error("Error checking user connection status for: {}", userEmail, e);
            return ResponseEntity.badRequest()
                    .body(ApiResponse.error("Failed to check user status: " + e.getMessage()));
        }
    }
    
    /**
     * Fuerza limpieza de sesiones inactivas
     */
    @PostMapping("/cleanup")
    @PreAuthorize("hasRole('ADMIN')")
    @Operation(summary = "Force cleanup of inactive sessions", 
               description = "Manually triggers cleanup of inactive WebSocket sessions")
    public ResponseEntity<ApiResponse<String>> forceCleanup() {
        
        try {
            log.info("Manual WebSocket session cleanup triggered");
            connectionRegistry.cleanupInactiveSessions();
            
            return ResponseEntity.ok(ApiResponse.success("Session cleanup completed"));
            
        } catch (Exception e) {
            log.error("Error during manual session cleanup", e);
            return ResponseEntity.badRequest()
                    .body(ApiResponse.error("Failed to cleanup sessions: " + e.getMessage()));
        }
    }
    
    // DTOs para requests
    
    public record BroadcastMessageRequest(
            @jakarta.validation.constraints.NotBlank(message = "Message is required")
            @jakarta.validation.constraints.Size(max = 1000, message = "Message must not exceed 1000 characters")
            String message
    ) {}
    
    public record DirectMessageRequest(
            @jakarta.validation.constraints.NotBlank(message = "Message is required")
            @jakarta.validation.constraints.Size(max = 1000, message = "Message must not exceed 1000 characters")
            String message
    ) {}
    
    public record UserConnectionStatus(
            String userEmail,
            boolean isConnected,
            int activeSessions,
            LocalDateTime timestamp
    ) {}
}