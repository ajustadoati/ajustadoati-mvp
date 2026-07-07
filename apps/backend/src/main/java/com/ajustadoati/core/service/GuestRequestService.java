package com.ajustadoati.core.service;

import com.ajustadoati.core.dto.CommonDto.GuestRequestCreateRequest;
import com.ajustadoati.core.dto.CommonDto.GuestRequestDto;
import com.ajustadoati.core.dto.CommonDto.GuestRequestResponseDto;
import com.ajustadoati.core.dto.WebSocketDto;
import com.ajustadoati.core.entity.Category;
import com.ajustadoati.core.repository.CategoryRepository;
import com.ajustadoati.core.repository.ProfileRepository;
import com.ajustadoati.core.websocket.ConnectionRegistry;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
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
    private final ProfileRepository profileRepository;
    private final ObjectMapper objectMapper;
    private final ResendEmailService emailService;
    private final WebPushService webPushService;

    private final Map<UUID, GuestRequestSession> sessions = new ConcurrentHashMap<>();

    @Value("${app.requests.expiration-minutes:15}")
    private long expirationMinutes;

    @Value("${app.admin.emails:}")
    private List<String> adminEmails;

    @Value("${app.admin.responder.name:AjustadoATi}")
    private String adminResponderName;

    @Value("${app.admin.responder.email:equipo@ajustadoati.com}")
    private String adminResponderEmail;

    @Value("${app.admin.responder.phone:}")
    private String adminResponderPhone;

    /**
     * Marca como caducadas las solicitudes activas más viejas que el TTL y avisa
     * a los proveedores conectados para que las quiten de su lista.
     * Las solicitudes caducadas siguen visibles en el backoffice.
     */
    @Scheduled(fixedRate = 60000)
    public void expireOldRequests() {
        LocalDateTime cutoff = LocalDateTime.now().minusMinutes(expirationMinutes);

        for (GuestRequestSession session : sessions.values()) {
            boolean expirable = "pending".equals(session.status) || "responded".equals(session.status);
            if (!expirable || session.createdAt.isAfter(cutoff)) {
                continue;
            }

            synchronized (session) {
                session.status = "expired";
                session.updatedAt = LocalDateTime.now();
            }

            WebSocketDto.OutgoingMessage expiredMessage = WebSocketDto.OutgoingMessage.builder()
                    .type("request_expired")
                    .message("La solicitud ha caducado")
                    .requestId(session.id)
                    .timestamp(LocalDateTime.now())
                    .build();

            int notified = 0;
            for (WebSocketSession providerSession : connectionRegistry.getAllProviderSessions()) {
                if (sendMessageToSession(providerSession, expiredMessage)) {
                    notified++;
                }
            }

            log.info("[CADUCADA] peticion={} ({}) | creada {} | proveedores avisados={}",
                    session.id, session.categoryName, session.createdAt, notified);
        }
    }

    public boolean isRequestExpired(UUID requestId) {
        GuestRequestSession session = sessions.get(requestId);
        return session != null && "expired".equals(session.status);
    }

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

        // Fire-and-forget email to admin so they know a curious guest just searched
        // and can reply from the backoffice if no real provider does.
        try {
            notifyAdminByEmail(session);
        } catch (Exception e) {
            log.warn("[EMAIL-ADMIN] fallo notificando admin de peticion {}", requestId, e);
        }

        return toDto(session);
    }

    private void notifyAdminByEmail(GuestRequestSession session) {
        if (adminEmails == null || adminEmails.isEmpty()) {
            return;
        }
        String subject = String.format("[AjustadoATi] Nueva búsqueda: %s", session.categoryName);
        String html = String.format(
                "<div style=\"font-family:-apple-system,Roboto,sans-serif;padding:16px;max-width:520px;\">" +
                        "<h2 style=\"margin:0 0 12px;color:#0f172a;\">Nueva búsqueda de un cliente</h2>" +
                        "<p style=\"margin:0 0 6px;color:#334155;\">" +
                        "<strong>Categoría:</strong> %s</p>" +
                        "<p style=\"margin:0 0 6px;color:#334155;\">" +
                        "<strong>Mensaje:</strong> %s</p>" +
                        "<p style=\"margin:0 0 6px;color:#64748b;font-size:13px;\">" +
                        "Ubicación: %.4f, %.4f · Proveedores notificados: %d</p>" +
                        "<p style=\"margin:20px 0 0;\">" +
                        "<a href=\"https://ajustadoati.com/admin\" style=\"display:inline-block;padding:10px 18px;background:#2563eb;color:#fff;border-radius:10px;text-decoration:none;font-weight:700;\">" +
                        "Ver en el backoffice</a></p>" +
                        "<p style=\"margin:18px 0 0;font-size:12px;color:#94a3b8;\">La solicitud caduca en %d min.</p>" +
                        "</div>",
                escapeHtml(session.categoryName),
                escapeHtml(session.message),
                session.latitude, session.longitude,
                session.notifiedProviders != null ? session.notifiedProviders : 0,
                expirationMinutes);
        for (String email : adminEmails) {
            emailService.send(email.trim(), subject, html);
        }
    }

    private String escapeHtml(String value) {
        if (value == null) return "";
        return value.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
                .replace("\"", "&quot;").replace("'", "&#39;");
    }

    /**
     * Registra una respuesta del admin ("equipo AjustadoATi") a una solicitud
     * guest. Se usa desde el backoffice cuando el admin quiere atender leads
     * curiosos y no hay ningún proveedor real que haya respondido.
     */
    public GuestRequestResponseDto respondAsAdmin(UUID requestId, String message) {
        GuestRequestSession session = sessions.get(requestId);
        if (session == null) {
            throw new RuntimeException("Guest request not found: " + requestId);
        }
        if ("expired".equals(session.status)) {
            throw new RuntimeException("La solicitud ya caducó");
        }

        GuestRequestResponseDto response = new GuestRequestResponseDto(
                UUID.randomUUID(),
                requestId,
                adminResponderName,
                adminResponderEmail,
                adminResponderPhone.isBlank() ? null : adminResponderPhone,
                message,
                session.latitude, // Use the guest's location so it shows up on the map
                session.longitude,
                LocalDateTime.now()
        );

        synchronized (session) {
            // Replace any previous admin response with the fresh one
            session.responses.removeIf(r -> adminResponderEmail.equalsIgnoreCase(r.providerEmail()));
            session.responses.add(0, response);
            session.status = "responded";
            session.updatedAt = LocalDateTime.now();
        }

        log.info("[ADMIN-RESPUESTA] peticion={} | mensaje=\"{}\"", requestId, message);
        return response;
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

    /**
     * Envía hasta dos solicitudes de demostración a un proveedor recién registrado,
     * usando sus propias categorías y coordenadas desplazadas ~3km y ~5km de su ubicación.
     * Las solicitudes solo se entregan a la sesión WS de ese proveedor — nunca a otros.
     */
    public void sendDemoRequestsToProvider(WebSocketSession providerSession, WebSocketDto.SessionInfo providerInfo) {
        if (providerInfo.getLocation() == null
                || providerInfo.getLocation().getLatitude() == null
                || providerInfo.getLocation().getLongitude() == null) {
            log.warn("[DEMO] {} sin ubicacion en perfil — no se envian solicitudes de prueba", providerInfo.getEmail());
            return;
        }

        List<Integer> categories = providerInfo.getCategories();
        if (categories == null || categories.isEmpty()) {
            log.warn("[DEMO] {} sin categorias — no se envian solicitudes de prueba", providerInfo.getEmail());
            return;
        }

        double baseLat = providerInfo.getLocation().getLatitude().doubleValue();
        double baseLng = providerInfo.getLocation().getLongitude().doubleValue();

        // ~3km al norte y ~5km al este (1 grado lat ≈ 111km)
        double[][] offsets = {
                { 3.0 / 111.0, 0.0 },
                { 0.0, 5.0 / (111.0 * Math.cos(Math.toRadians(baseLat))) }
        };

        int count = Math.min(2, categories.size());
        for (int i = 0; i < count; i++) {
            Integer categoryId = categories.get(i);
            String categoryName = resolveCategoryName(categoryId, null);
            double lat = baseLat + offsets[i][0];
            double lng = baseLng + offsets[i][1];
            double distanceKm = i == 0 ? 3.0 : 5.0;

            UUID requestId = UUID.randomUUID();
            LocalDateTime now = LocalDateTime.now();
            String demoRef = "demo+" + requestId.toString().substring(0, 8) + "@ajustadoati.local";
            String message = String.format(
                    "[PRUEBA] Un cliente a %.0f km necesita: %s. Esta es una solicitud de demostración de AjustadoATi — respóndela para ver cómo funciona la plataforma.",
                    distanceKm, categoryName);

            GuestRequestSession session = new GuestRequestSession(
                    requestId, demoRef, categoryId, categoryName, message,
                    lat, lng, 50.0, "pending", 1, now, now, new ArrayList<>());
            session.demo = true;
            session.demoProviderEmail = providerInfo.getEmail();
            sessions.put(requestId, session);

            WebSocketDto.OutgoingMessage wsMessage = WebSocketDto.OutgoingMessage.builder()
                    .id(System.currentTimeMillis() + i)
                    .type("request")
                    .fromUser(demoRef)
                    .user(demoRef)
                    .message(message)
                    .latitude(BigDecimal.valueOf(lat))
                    .longitude(BigDecimal.valueOf(lng))
                    .categoryId(categoryId)
                    .categoryName(categoryName)
                    .requestId(requestId)
                    .timestamp(now)
                    .build();

            if (sendMessageToSession(providerSession, wsMessage)) {
                log.info("[DEMO] solicitud de prueba {} ({}, {} km) enviada a {}",
                        requestId, categoryName, Math.round(distanceKm), providerInfo.getEmail());
            } else {
                log.warn("[DEMO] fallo el envio de la solicitud de prueba {} a {}", requestId, providerInfo.getEmail());
            }
        }
    }

    public List<com.ajustadoati.core.dto.AdminDto.GuestRequestSummary> getAllRequests() {
        return sessions.values().stream()
                .sorted((a, b) -> b.createdAt.compareTo(a.createdAt))
                .map(s -> new com.ajustadoati.core.dto.AdminDto.GuestRequestSummary(
                        s.id, s.guestRef, s.demoProviderEmail, s.categoryName, s.message,
                        s.status, s.responses.size(), s.demo, s.createdAt))
                .toList();
    }

    public List<com.ajustadoati.core.dto.AdminDto.DemoRequestSummary> getDemoRequests() {
        return sessions.values().stream()
                .filter(s -> s.demo)
                .sorted((a, b) -> b.createdAt.compareTo(a.createdAt))
                .map(s -> new com.ajustadoati.core.dto.AdminDto.DemoRequestSummary(
                        s.id, s.demoProviderEmail, s.categoryName, s.message,
                        s.status, s.responses.size(), s.createdAt))
                .toList();
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

        int successfulSends = 0;

        if (providerSessions.isEmpty()) {
            log.info("[PETICION] {} → 0 proveedores conectados por WebSocket", session.id);
        } else {
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

            log.info("[PETICION] {} → notificados {}/{} proveedores por WebSocket",
                    session.id, successfulSends, providerSessions.size());
        }

        // Fire Web Push to any nearby provider that ISN'T currently connected
        // by WebSocket — they wouldn't otherwise learn about the request until
        // they next open the app. This runs regardless of whether any WS
        // session was found, so an empty online list is not a dead end.
        try {
            notifyOfflineProvidersByPush(session);
        } catch (Exception e) {
            log.warn("[WEBPUSH] fallo notificando push a proveedores offline", e);
        }

        return successfulSends;
    }

    private void notifyOfflineProvidersByPush(GuestRequestSession session) {
        if (!webPushService.isEnabled()) {
            log.info("[WEBPUSH] deshabilitado (VAPID no configurado)");
            return;
        }
        List<Object[]> nearby = profileRepository.findNearbyProviders(
                session.categoryId, session.latitude, session.longitude, session.maxDistanceKm);

        int offlineNearby = 0;
        int pushed = 0;
        for (Object[] row : nearby) {
            java.util.UUID profileId = row[0] instanceof java.util.UUID u
                    ? u : java.util.UUID.fromString(row[0].toString());
            String email = (String) row[3];
            if (email != null && connectionRegistry.isUserConnected(email)) {
                continue; // Ya recibió por WebSocket
            }
            offlineNearby++;
            int delivered = webPushService.sendToUser(
                    profileId,
                    "Nueva solicitud: " + session.categoryName,
                    session.message,
                    "/provider/home");
            if (delivered > 0) pushed++;
        }
        log.info("[WEBPUSH] peticion {} → nearby={} offline={} pushed={} (pushed=0 y offline>0 ⇒ ningún proveedor tiene suscripción de push activa)",
                session.id, nearby.size(), offlineNearby, pushed);
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
        private boolean demo = false;
        private String demoProviderEmail;

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
