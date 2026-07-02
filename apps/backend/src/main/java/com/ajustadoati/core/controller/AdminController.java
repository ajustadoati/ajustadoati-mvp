package com.ajustadoati.core.controller;

import com.ajustadoati.core.dto.AdminDto.AdminProviderDto;
import com.ajustadoati.core.dto.AdminDto.AdminStatsDto;
import com.ajustadoati.core.dto.AdminDto.DemoRequestSummary;
import com.ajustadoati.core.dto.AdminDto.GuestRequestSummary;
import com.ajustadoati.core.dto.CommonDto.ApiResponse;
import com.ajustadoati.core.dto.CommonDto.GuestRequestResponseDto;
import com.ajustadoati.core.dto.WebSocketDto;
import com.ajustadoati.core.entity.Profile;
import com.ajustadoati.core.repository.ProfileRepository;
import com.ajustadoati.core.service.GuestRequestService;
import com.ajustadoati.core.websocket.ConnectionRegistry;
import jakarta.validation.constraints.NotBlank;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;
import java.util.Optional;

@RestController
@RequestMapping("/admin")
@RequiredArgsConstructor
@Slf4j
public class AdminController {

    private final ProfileRepository profileRepository;
    private final ConnectionRegistry connectionRegistry;
    private final GuestRequestService guestRequestService;

    @Value("${app.admin.emails:}")
    private List<String> adminEmails;

    /** Comprobación ligera usada por el frontend para mostrar u ocultar el botón de admin. */
    @GetMapping("/me")
    public ResponseEntity<ApiResponse<Boolean>> checkAdminAccess(Authentication authentication) {
        ResponseEntity<ApiResponse<Boolean>> forbidden = checkAdmin(authentication);
        if (forbidden != null) return forbidden;
        return ResponseEntity.ok(ApiResponse.success(true));
    }

    @GetMapping("/providers")
    public ResponseEntity<ApiResponse<List<AdminProviderDto>>> getProviders(Authentication authentication) {
        ResponseEntity<ApiResponse<List<AdminProviderDto>>> forbidden = checkAdmin(authentication);
        if (forbidden != null) return forbidden;

        List<AdminProviderDto> providers = profileRepository.findAllProvidersWithCategories().stream()
                .map(p -> new AdminProviderDto(
                        p.getId(),
                        p.getFullName(),
                        p.getEmail(),
                        p.getPhone(),
                        p.getCategories(),
                        p.getLocation() != null && p.getLocation().getLatitude() != null
                                ? p.getLocation().getLatitude().doubleValue() : null,
                        p.getLocation() != null && p.getLocation().getLongitude() != null
                                ? p.getLocation().getLongitude().doubleValue() : null,
                        p.getLocation() != null ? p.getLocation().getAddress() : null,
                        p.getCreatedAt(),
                        p.getIsActive(),
                        p.getWelcomeRequestSent(),
                        connectionRegistry.isUserConnected(p.getEmail())
                ))
                .toList();

        return ResponseEntity.ok(ApiResponse.success(providers));
    }

    @GetMapping("/stats")
    public ResponseEntity<ApiResponse<AdminStatsDto>> getStats(Authentication authentication) {
        ResponseEntity<ApiResponse<AdminStatsDto>> forbidden = checkAdmin(authentication);
        if (forbidden != null) return forbidden;

        WebSocketDto.ConnectionStats wsStats = connectionRegistry.getConnectionStats();
        List<DemoRequestSummary> demos = guestRequestService.getDemoRequests();
        int demosResponded = (int) demos.stream().filter(d -> d.responsesCount() > 0).count();

        AdminStatsDto stats = new AdminStatsDto(
                profileRepository.countByIsProviderTrue(),
                profileRepository.countByIsProviderFalse(),
                wsStats.getActiveProviders(),
                wsStats.getActiveUsers(),
                demos.size(),
                demosResponded
        );

        return ResponseEntity.ok(ApiResponse.success(stats));
    }

    @GetMapping("/guest-requests")
    public ResponseEntity<ApiResponse<List<GuestRequestSummary>>> getGuestRequests(Authentication authentication) {
        ResponseEntity<ApiResponse<List<GuestRequestSummary>>> forbidden = checkAdmin(authentication);
        if (forbidden != null) return forbidden;

        return ResponseEntity.ok(ApiResponse.success(guestRequestService.getAllRequests()));
    }

    public record AdminRespondRequest(@NotBlank String message) {}

    /**
     * Allows the admin to answer a guest search as "AjustadoATi" from the
     * backoffice — used to keep curious first-time searches warm while the
     * network of real providers is still small.
     */
    @PostMapping("/guest-requests/{requestId}/respond")
    public ResponseEntity<ApiResponse<GuestRequestResponseDto>> respondAsAdmin(
            @PathVariable UUID requestId,
            @RequestBody AdminRespondRequest body,
            Authentication authentication) {
        ResponseEntity<ApiResponse<GuestRequestResponseDto>> forbidden = checkAdmin(authentication);
        if (forbidden != null) return forbidden;

        if (body == null || body.message() == null || body.message().isBlank()) {
            return ResponseEntity.badRequest().body(ApiResponse.error("El mensaje es obligatorio"));
        }

        try {
            GuestRequestResponseDto response = guestRequestService.respondAsAdmin(requestId, body.message().trim());
            return ResponseEntity.ok(ApiResponse.success("Respuesta registrada", response));
        } catch (RuntimeException e) {
            log.error("[ADMIN-RESPUESTA] error en peticion {}", requestId, e);
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(ApiResponse.error(e.getMessage()));
        }
    }

    /**
     * El JWT lleva el username como subject; se resuelve el perfil para comparar
     * su email contra la lista app.admin.emails.
     */
    private <T> ResponseEntity<ApiResponse<T>> checkAdmin(Authentication authentication) {
        if (authentication == null || authentication.getName() == null) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(ApiResponse.error("No autorizado"));
        }

        String name = authentication.getName();
        Optional<Profile> profileOpt = profileRepository.findByUsernameOrEmail(name, name);
        boolean isAdmin = profileOpt
                .map(p -> adminEmails.stream().anyMatch(e -> e.trim().equalsIgnoreCase(p.getEmail())))
                .orElse(false);

        if (!isAdmin) {
            log.warn("[ADMIN] acceso denegado a {} (no esta en app.admin.emails)", name);
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(ApiResponse.error("No autorizado"));
        }
        return null;
    }
}
