package com.ajustadoati.core.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.List;
import java.util.Map;

/**
 * Minimal wrapper around Resend's HTTPS API (https://resend.com/docs).
 *
 * The Resend Java SDK exists but pulls in netty + reactor for a single POST,
 * so we use the JDK's built-in HttpClient instead.
 *
 * If {@code app.resend.api-key} is empty (the default in local dev), every
 * send is a silent no-op — the service is safe to call unconditionally and
 * will start delivering as soon as the key is configured via env var.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class ResendEmailService {

    @Value("${app.resend.api-key:}")
    private String apiKey;

    @Value("${app.resend.from:AjustadoATi <onboarding@resend.dev>}")
    private String fromAddress;

    private final ObjectMapper objectMapper;
    private final HttpClient http = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(5))
            .build();

    public boolean send(String to, String subject, String html) {
        if (apiKey == null || apiKey.isBlank()) {
            log.debug("[RESEND] api-key vacío — email a {} ignorado", to);
            return false;
        }

        try {
            String body = objectMapper.writeValueAsString(Map.of(
                    "from", fromAddress,
                    "to", List.of(to),
                    "subject", subject,
                    "html", html
            ));

            HttpRequest req = HttpRequest.newBuilder()
                    .uri(URI.create("https://api.resend.com/emails"))
                    .header("Authorization", "Bearer " + apiKey)
                    .header("Content-Type", "application/json")
                    .timeout(Duration.ofSeconds(10))
                    .POST(HttpRequest.BodyPublishers.ofString(body))
                    .build();

            HttpResponse<String> res = http.send(req, HttpResponse.BodyHandlers.ofString());
            if (res.statusCode() >= 200 && res.statusCode() < 300) {
                log.info("[RESEND] enviado a {} ({})", to, subject);
                return true;
            }
            log.warn("[RESEND] fallo enviando a {} — status={} body={}", to, res.statusCode(), res.body());
            return false;
        } catch (Exception e) {
            log.error("[RESEND] excepción enviando a {}", to, e);
            return false;
        }
    }
}
