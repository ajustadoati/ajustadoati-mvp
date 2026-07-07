package com.ajustadoati.core.controller;

import com.ajustadoati.core.dto.CommonDto.ApiResponse;
import com.ajustadoati.core.entity.Profile;
import com.ajustadoati.core.entity.PushSubscription;
import com.ajustadoati.core.repository.ProfileRepository;
import com.ajustadoati.core.repository.PushSubscriptionRepository;
import com.ajustadoati.core.service.WebPushService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.util.Map;
import java.util.Optional;

@RestController
@RequestMapping("/providers")
@RequiredArgsConstructor
@Slf4j
public class ProviderPushController {

    private final PushSubscriptionRepository subscriptionRepository;
    private final ProfileRepository profileRepository;
    private final WebPushService webPushService;

    /** Public endpoint so the frontend can grab the VAPID public key at boot. */
    @GetMapping("/push-config")
    public ResponseEntity<ApiResponse<Map<String, Object>>> getConfig() {
        return ResponseEntity.ok(ApiResponse.success(Map.of(
                "publicKey", webPushService.getPublicKey() == null ? "" : webPushService.getPublicKey(),
                "enabled", webPushService.isEnabled()
        )));
    }

    public record PushSubscribeRequest(
            @NotBlank String endpoint,
            @NotBlank String p256dh,
            @NotBlank String auth,
            String userAgent
    ) {}

    /** Register (or update) the browser's push subscription for the current provider. */
    @PostMapping("/push-subscriptions")
    @Transactional
    public ResponseEntity<ApiResponse<Void>> subscribe(
            @Valid @RequestBody PushSubscribeRequest body,
            Authentication authentication) {

        Profile profile = resolveProfile(authentication);
        if (profile == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(ApiResponse.error("No autenticado"));
        }

        // Upsert by endpoint — same browser reconnecting shouldn't leave duplicates.
        Optional<PushSubscription> existing = subscriptionRepository.findByEndpoint(body.endpoint());
        PushSubscription sub = existing.orElseGet(PushSubscription::new);
        sub.setProfileId(profile.getId());
        sub.setEndpoint(body.endpoint());
        sub.setP256dh(body.p256dh());
        sub.setAuth(body.auth());
        sub.setUserAgent(body.userAgent());
        subscriptionRepository.save(sub);

        log.info("[WEBPUSH] {} suscripcion {} registrada", profile.getEmail(),
                existing.isPresent() ? "actualizada" : "nueva");
        return ResponseEntity.ok(ApiResponse.success(null));
    }

    public record PushUnsubscribeRequest(@NotBlank String endpoint) {}

    @DeleteMapping("/push-subscriptions")
    @Transactional
    public ResponseEntity<ApiResponse<Void>> unsubscribe(
            @Valid @RequestBody PushUnsubscribeRequest body,
            Authentication authentication) {
        if (resolveProfile(authentication) == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(ApiResponse.error("No autenticado"));
        }
        subscriptionRepository.deleteByEndpoint(body.endpoint());
        return ResponseEntity.ok(ApiResponse.success(null));
    }

    private Profile resolveProfile(Authentication auth) {
        if (auth == null || auth.getName() == null) return null;
        return profileRepository.findByUsernameOrEmail(auth.getName(), auth.getName()).orElse(null);
    }
}
