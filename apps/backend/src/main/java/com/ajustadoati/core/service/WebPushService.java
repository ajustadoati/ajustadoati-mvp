package com.ajustadoati.core.service;

import com.ajustadoati.core.entity.PushSubscription;
import com.ajustadoati.core.repository.PushSubscriptionRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import nl.martijndwars.webpush.Notification;
import nl.martijndwars.webpush.PushService;
import nl.martijndwars.webpush.Subscription;
import org.bouncycastle.jce.provider.BouncyCastleProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import java.security.Security;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Sends Web Push notifications (VAPID) to Chrome/Firefox/Safari push
 * endpoints. Silent noop when the VAPID keys are unset — makes local dev
 * safe and lets the app boot before the operator generates the keys.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class WebPushService {

    private final PushSubscriptionRepository subscriptionRepository;
    private final ObjectMapper objectMapper;

    @Value("${app.webpush.vapid.public-key:}")
    private String publicKey;

    @Value("${app.webpush.vapid.private-key:}")
    private String privateKey;

    @Value("${app.webpush.vapid.subject:mailto:admin@ajustadoati.com}")
    private String subject;

    private PushService pushService;

    @PostConstruct
    void init() {
        if (publicKey.isBlank() || privateKey.isBlank()) {
            log.warn("[WEBPUSH] VAPID keys not configured — Web Push disabled");
            return;
        }
        try {
            Security.addProvider(new BouncyCastleProvider());
            this.pushService = new PushService(publicKey, privateKey, subject);
            log.info("[WEBPUSH] VAPID inicializado (subject={})", subject);
        } catch (Exception e) {
            log.error("[WEBPUSH] no se pudo inicializar VAPID — Web Push queda deshabilitado", e);
        }
    }

    public boolean isEnabled() {
        return pushService != null;
    }

    public String getPublicKey() {
        return publicKey;
    }

    /**
     * Sends a notification to every browser endpoint the user has subscribed.
     * Endpoints that return 404/410 are considered gone and pruned from the
     * database so we don't keep retrying dead push subscriptions.
     */
    public int sendToUser(UUID profileId, String title, String body, String url) {
        if (!isEnabled()) return 0;

        List<PushSubscription> subs = subscriptionRepository.findByProfileId(profileId);
        if (subs.isEmpty()) return 0;

        String payload;
        try {
            // Angular's SwPush expects a top-level "notification" object; without
            // that wrapper the service worker doesn't call showNotification() and
            // iOS silently drops the push. Keep the "data.url" so the click
            // handler in the frontend knows where to route.
            String targetUrl = url == null ? "/provider/home" : url;
            payload = objectMapper.writeValueAsString(Map.of(
                    "notification", Map.of(
                            "title", title,
                            "body", body,
                            "icon", "/assets/icons/icon-192.png",
                            "badge", "/assets/icons/icon-192.png",
                            "tag", "ajustadoati",
                            "renotify", true,
                            "requireInteraction", false,
                            "data", Map.of("url", targetUrl)
                    )
            ));
        } catch (Exception e) {
            log.error("[WEBPUSH] fallo serializando payload", e);
            return 0;
        }

        int delivered = 0;
        for (PushSubscription sub : subs) {
            if (sendOne(sub, payload)) delivered++;
        }
        log.info("[WEBPUSH] enviado a {} — {}/{} endpoints ok", profileId, delivered, subs.size());
        return delivered;
    }

    private boolean sendOne(PushSubscription sub, String payload) {
        try {
            Subscription target = new Subscription(sub.getEndpoint(),
                    new Subscription.Keys(sub.getP256dh(), sub.getAuth()));
            Notification notification = new Notification(target, payload);
            var response = pushService.send(notification);
            int status = response.getStatusLine().getStatusCode();

            if (status == HttpStatus.NOT_FOUND.value() || status == HttpStatus.GONE.value()) {
                subscriptionRepository.deleteByEndpoint(sub.getEndpoint());
                log.info("[WEBPUSH] endpoint dado de baja ({}): {}", status, sub.getEndpoint());
                return false;
            }
            if (status >= 200 && status < 300) {
                return true;
            }
            log.warn("[WEBPUSH] endpoint respondio {}: {}", status, sub.getEndpoint());
            return false;
        } catch (Exception e) {
            log.error("[WEBPUSH] fallo enviando a {}", sub.getEndpoint(), e);
            return false;
        }
    }
}
