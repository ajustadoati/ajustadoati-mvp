package com.ajustadoati.core.service;

import com.ajustadoati.core.dto.CommonDto.GuestRequestCreateRequest;
import com.ajustadoati.core.dto.CommonDto.GuestRequestDto;
import com.ajustadoati.core.dto.CommonDto.GuestRequestResponseDto;
import com.ajustadoati.core.dto.WebSocketDto;
import com.ajustadoati.core.entity.Category;
import com.ajustadoati.core.repository.CategoryRepository;
import com.ajustadoati.core.websocket.ConnectionRegistry;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

@Service
@RequiredArgsConstructor
@Slf4j
public class GuestRequestService {

    private final ConnectionRegistry connectionRegistry;
    private final CategoryRepository categoryRepository;
    private final ObjectMapper objectMapper;

    private final Map<UUID, GuestRequestSession> sessions = new ConcurrentHashMap<>();

    public GuestRequestDto createRequest(GuestRequestCreateRequest request) {
        UUID requestId = UUID.randomUUID();
        LocalDateTime now = LocalDateTime.now();
        Double maxDistanceKm = request.maxDistanceKm() != null ? request.maxDistanceKm() : 50.0;
        String categoryName = resolveCategoryName(request.categoryId(), request.categoryName());
        String guestRef = buildGuestRef(requestId);

        GuestRequestSession session = new GuestRequestSession(
                requestId,
                guestRef,
                request.categoryId(),
                categoryName,
                request.message(),
                request.latitude(),
                request.longitude(),
                maxDistanceKm,
                "pending",
                0,
                now,
                now,
                new ArrayList<>()
        );

        int notifiedProviders = notifyProviders(session);
        session.notifiedProviders = notifiedProviders;
        session.updatedAt = LocalDateTime.now();
        sessions.put(requestId, session);

        return toDto(session);
    }

    public GuestRequestDto getRequest(UUID requestId) {
        GuestRequestSession session = sessions.get(requestId);
        if (session == null) {
            throw new RuntimeException("Guest request not found: " + requestId);
        }
        return toDto(session);
    }

    public List<GuestRequestResponseDto> getResponses(UUID requestId) {
        GuestRequestSession session = sessions.get(requestId);
        if (session == null) {
            throw new RuntimeException("Guest request not found: " + requestId);
        }
        return new ArrayList<>(session.responses);
    }

    public boolean hasGuestRequest(UUID requestId) {
        return sessions.containsKey(requestId);
    }

    public int acceptResponse(UUID requestId, UUID responseId) {
        GuestRequestSession session = sessions.get(requestId);
        if (session == null) {
            throw new RuntimeException("Guest request not found: " + requestId);
        }

        GuestRequestResponseDto response = session.responses.stream()
                .filter(r -> r.id().equals(responseId))
                .findFirst()
                .orElseThrow(() -> new RuntimeException("Response not found: " + responseId));

        synchronized (session) {
            session.status = "accepted";
            session.updatedAt = LocalDateTime.now();
        }

        return notifyProviderOfAcceptance(session, response);
    }

    private int notifyProviderOfAcceptance(GuestRequestSession session, GuestRequestResponseDto response) {
        if (response.providerEmail() == null) {
            log.warn("Cannot notify provider: no email on response {}", response.id());
            return 0;
        }

        WebSocketDto.OutgoingMessage message = WebSocketDto.OutgoingMessage.builder()
                .type("offer_accepted")
                .fromUser(session.guestRef)
                .user(session.guestRef)
                .message("Tu oferta ha sido aceptada")
                .requestId(session.id)
                .offerId(response.id().toString())
                .timestamp(LocalDateTime.now())
                .build();

        List<WebSocketSession> providerSessions = connectionRegistry.getUserSessions(response.providerEmail());
        int sent = 0;
        for (WebSocketSession ws : providerSessions) {
            if (sendMessageToSession(ws, message)) {
                sent++;
            }
        }

        log.info("Guest acceptance for request {} notified {} provider session(s) for {}", session.id, sent, response.providerEmail());
        return sent;
    }

    public void recordProviderResponse(UUID requestId, WebSocketDto.ProviderInfo providerInfo, WebSocketDto.IncomingMessage message) {
        GuestRequestSession session = sessions.get(requestId);
        if (session == null) {
            return;
        }

        String providerEmail = providerInfo != null ? providerInfo.getEmail() : null;
        GuestRequestResponseDto response = new GuestRequestResponseDto(
                UUID.randomUUID(),
                requestId,
                providerInfo != null && providerInfo.getFullName() != null ? providerInfo.getFullName() : "Proveedor",
                providerEmail,
                providerInfo != null ? providerInfo.getPhone() : null,
                message.getMessage(),
                message.getLatitude() != null ? message.getLatitude().doubleValue() : null,
                message.getLongitude() != null ? message.getLongitude().doubleValue() : null,
                LocalDateTime.now()
        );

        synchronized (session) {
            int existingIndex = -1;
            for (int i = 0; i < session.responses.size(); i++) {
                GuestRequestResponseDto existing = session.responses.get(i);
                if (providerEmail != null && providerEmail.equalsIgnoreCase(existing.providerEmail())) {
                    existingIndex = i;
                    break;
                }
            }

            if (existingIndex >= 0) {
                session.responses.set(existingIndex, response);
                log.info("[RESPUESTA] peticion={} | proveedor={} | actualizada (ya habia respondido)",
                        requestId, providerEmail);
            } else {
                session.responses.add(0, response);
                log.info("[RESPUESTA] peticion={} | proveedor={} | mensaje=\"{}\" | lat={} lon={}",
                        requestId, providerEmail, message.getMessage(),
                        message.getLatitude(), message.getLongitude());
            }

            session.status = "responded";
            session.updatedAt = LocalDateTime.now();
        }
    }

    private int notifyProviders(GuestRequestSession session) {
        log.info("[PETICION] id={} | categoria={} ({}) | lat={} lon={} | radio={}km",
                session.id, session.categoryId, session.categoryName,
                session.latitude, session.longitude, session.maxDistanceKm);

        List<WebSocketSession> providerSessions = connectionRegistry.getProviderSessions(
                session.categoryId,
                session.latitude,
                session.longitude,
                session.maxDistanceKm
        );

        if (providerSessions.isEmpty()) {
            log.info("[PETICION] {} → 0 proveedores conectados disponibles", session.id);
            return 0;
        }

        WebSocketDto.OutgoingMessage providerMessage = WebSocketDto.OutgoingMessage.builder()
                .id(System.currentTimeMillis())
                .type("request")
                .fromUser(session.guestRef)
                .user(session.guestRef)
                .message(session.message)
                .latitude(BigDecimal.valueOf(session.latitude))
                .longitude(BigDecimal.valueOf(session.longitude))
                .categoryId(session.categoryId)
                .categoryName(session.categoryName)
                .requestId(session.id)
                .timestamp(LocalDateTime.now())
                .build();

        int successfulSends = 0;
        for (WebSocketSession providerSession : providerSessions) {
            if (sendMessageToSession(providerSession, providerMessage)) {
                successfulSends++;
                log.info("[ENVIADO] peticion {} → session={}", session.id,
                        providerSession.getId().substring(0, 8));
            } else {
                log.warn("[ERROR-ENVIO] peticion {} → session={} falló",
                        session.id, providerSession.getId().substring(0, 8));
            }
        }

        log.info("[PETICION] {} → notificados {}/{} proveedores",
                session.id, successfulSends, providerSessions.size());
        return successfulSends;
    }

    private boolean sendMessageToSession(WebSocketSession session, WebSocketDto.OutgoingMessage message) {
        try {
            if (session == null || !session.isOpen()) {
                return false;
            }

            String jsonMessage = objectMapper.writeValueAsString(message);
            session.sendMessage(new TextMessage(jsonMessage));
            return true;
        } catch (Exception e) {
            log.error("Error sending guest request to provider session {}", session != null ? session.getId() : "null", e);
            return false;
        }
    }

    private String resolveCategoryName(Integer categoryId, String requestedName) {
        if (requestedName != null && !requestedName.isBlank()) {
            return requestedName;
        }

        Optional<Category> categoryOpt = categoryRepository.findById(categoryId);
        return categoryOpt.map(Category::getName).orElse("Servicio");
    }

    private String buildGuestRef(UUID requestId) {
        return "guest+" + requestId.toString().substring(0, 8) + "@ajustadoati.local";
    }

    private GuestRequestDto toDto(GuestRequestSession session) {
        return new GuestRequestDto(
                session.id,
                session.guestRef,
                session.categoryId,
                session.categoryName,
                session.message,
                session.latitude,
                session.longitude,
                session.maxDistanceKm,
                session.status,
                session.notifiedProviders,
                session.createdAt,
                session.updatedAt,
                new ArrayList<>(session.responses)
        );
    }

    private static class GuestRequestSession {
        private final UUID id;
        private final String guestRef;
        private final Integer categoryId;
        private final String categoryName;
        private final String message;
        private final Double latitude;
        private final Double longitude;
        private final Double maxDistanceKm;
        private String status;
        private Integer notifiedProviders;
        private final LocalDateTime createdAt;
        private LocalDateTime updatedAt;
        private final List<GuestRequestResponseDto> responses;

        private GuestRequestSession(
                UUID id,
                String guestRef,
                Integer categoryId,
                String categoryName,
                String message,
                Double latitude,
                Double longitude,
                Double maxDistanceKm,
                String status,
                Integer notifiedProviders,
                LocalDateTime createdAt,
                LocalDateTime updatedAt,
                List<GuestRequestResponseDto> responses
        ) {
            this.id = id;
            this.guestRef = guestRef;
            this.categoryId = categoryId;
            this.categoryName = categoryName;
            this.message = message;
            this.latitude = latitude;
            this.longitude = longitude;
            this.maxDistanceKm = maxDistanceKm;
            this.status = status;
            this.notifiedProviders = notifiedProviders;
            this.createdAt = createdAt;
            this.updatedAt = updatedAt;
            this.responses = responses;
        }
    }
}
