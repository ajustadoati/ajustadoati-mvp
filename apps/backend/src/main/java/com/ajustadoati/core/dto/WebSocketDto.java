package com.ajustadoati.core.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

public class WebSocketDto {

    /**
     * Mensaje entrante del cliente (usuario o proveedor)
     */
    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class IncomingMessage {
        
        @JsonProperty("id")
        private Long id;
        
        @JsonProperty("type")
        @NotBlank(message = "Message type is required")
        private String type; // "request", "response", "ping"
        
        @JsonProperty("fromUser")
        @NotBlank(message = "From user is required")
        @Email(message = "Invalid email format")
        private String fromUser;
        
        @JsonProperty("toUsers")
        private List<String> toUsers;
        
        @JsonProperty("categoryId")
        private Integer categoryId;
        
        @JsonProperty("latitude")
        @DecimalMin(value = "-90.0", message = "Latitude must be between -90 and 90")
        @DecimalMax(value = "90.0", message = "Latitude must be between -90 and 90")
        private BigDecimal latitude;
        
        @JsonProperty("longitude")
        @DecimalMin(value = "-180.0", message = "Longitude must be between -180 and 180")
        @DecimalMax(value = "180.0", message = "Longitude must be between -180 and 180")
        private BigDecimal longitude;
        
        @JsonProperty("message")
        @NotBlank(message = "Message content is required")
        @Size(max = 1000, message = "Message must not exceed 1000 characters")
        private String message;
        
        @JsonProperty("maxDistanceKm")
        @Min(value = 1, message = "Max distance must be at least 1 km")
        @Max(value = 100, message = "Max distance must not exceed 100 km")
        private Double maxDistanceKm;
        
        @JsonProperty("requestId")
        private UUID requestId; // Para respuestas a solicitudes específicas

        @JsonProperty("offerId")
        private String offerId; // Para notificaciones de oferta aceptada
    }

    /**
     * Mensaje saliente hacia los clientes
     */
    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class OutgoingMessage {
        
        @JsonProperty("id")
        private Long id;
        
        @JsonProperty("type")
        private String type; // "request", "response", "notification", "pong"
        
        @JsonProperty("fromUser")
        private String fromUser;
        
        @JsonProperty("user")
        private String user; // Para compatibilidad con formato original
        
        @JsonProperty("message")
        private String message;
        
        @JsonProperty("latitude")
        private BigDecimal latitude;
        
        @JsonProperty("longitude")
        private BigDecimal longitude;
        
        @JsonProperty("categoryId")
        private Integer categoryId;
        
        @JsonProperty("categoryName")
        private String categoryName;
        
        @JsonProperty("requestId")
        private UUID requestId;

        @JsonProperty("offerId")
        private String offerId;
        
        @JsonProperty("timestamp")
        private LocalDateTime timestamp;
        
        @JsonProperty("distanceKm")
        private Double distanceKm;
        
        @JsonProperty("providerInfo")
        private ProviderInfo providerInfo;
        
        @Builder.Default
        private LocalDateTime createdAt = LocalDateTime.now();
    }

    /**
     * Información del proveedor incluida en las respuestas
     */
    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class ProviderInfo {
        
        @JsonProperty("id")
        private UUID id;
        
        @JsonProperty("fullName")
        private String fullName;
        
        @JsonProperty("username")
        private String username;
        
        @JsonProperty("email")
        private String email;
        
        @JsonProperty("phone")
        private String phone;
        
        @JsonProperty("categories")
        private List<Integer> categories;
        
        @JsonProperty("rating")
        private Double rating; // Para futuras implementaciones
        
        @JsonProperty("responseTime")
        private String responseTime; // Ej: "< 5 min"
    }

    /**
     * Respuesta de estado de conexión
     */
    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class ConnectionResponse {
        
        @JsonProperty("status")
        private String status; // "connected", "authenticated", "error"
        
        @JsonProperty("message")
        private String message;
        
        @JsonProperty("userId")
        private String userId;
        
        @JsonProperty("timestamp")
        @Builder.Default
        private LocalDateTime timestamp = LocalDateTime.now();
    }

    /**
     * Información de sesión WebSocket
     */
    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class SessionInfo {
        
        private String sessionId;
        private String userId;
        private String email;
        private Boolean isProvider;
        private List<Integer> categories;
        private Location location;
        private LocalDateTime connectedAt;
        private LocalDateTime lastActivity;
    }

    /**
     * Estadísticas de conexiones (para monitoreo)
     */
    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class ConnectionStats {
        
        private long totalConnections;
        private long activeUsers;
        private long activeProviders;
        private long messagesProcessed;
        private LocalDateTime timestamp;
    }
}
