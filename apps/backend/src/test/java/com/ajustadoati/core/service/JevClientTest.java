package com.ajustadoati.core.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.web.reactive.function.client.WebClient;

import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.*;

class JevClientTest {
    HttpServer server;
    String url;
    ObjectMapper mapper = new ObjectMapper();

    @BeforeEach void start() throws Exception {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        url = "http://127.0.0.1:" + server.getAddress().getPort() + "/v1/systemone";
        server.start();
    }
    @AfterEach void stop() { server.stop(0); }

    @Test void sendsOnlyTextAndCatalogWithServerCredential() {
        var captured = new AtomicReference<JsonNode>();
        var auth = new AtomicReference<String>();
        server.createContext("/v1/systemone", exchange -> {
            captured.set(mapper.readTree(exchange.getRequestBody()));
            auth.set(exchange.getRequestHeaders().getFirst("Authorization"));
            byte[] body = "{\"answers\":{}}".getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, body.length);
            exchange.getResponseBody().write(body);
            exchange.close();
        });
        var client = new JevClient(WebClient.builder(), url, "test-only-key", "jev-1.13.0", 3000, true);
        assertNotNull(client.classify("Reparar grifo", Map.of("category_42", "Plomeria")));
        assertEquals("Bearer test-only-key", auth.get());
        assertEquals("Reparar grifo", captured.get().path("state").asText());
        assertEquals("choice", captured.get().at("/questions/category/type").asText());
        assertEquals(3, captured.get().size());
    }

    @Test void upstreamFailureIsSanitized() {
        server.createContext("/v1/systemone", exchange -> {
            byte[] body = "private vendor details".getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(401, body.length);
            exchange.getResponseBody().write(body);
            exchange.close();
        });
        var client = new JevClient(WebClient.builder(), url, "test-only", "jev-1.13.0", 3000, true);
        var error = assertThrows(SearchDecisionException.class, () -> client.classify("Fuga", Map.of()));
        assertEquals("CLASSIFICATION_UNAVAILABLE", error.getCode());
        assertFalse(error.getMessage().contains("private"));
    }

    @Test void missingKeyFailsBeforeCallingNetwork() {
        var client = new JevClient(WebClient.builder(), url, "", "jev-1.13.0", 100, true);
        assertThrows(SearchDecisionException.class, () -> client.classify("Fuga", Map.of()));
    }

    @Test void timeoutIsBounded() {
        server.createContext("/v1/systemone", exchange -> {
            try { Thread.sleep(500); } catch (InterruptedException ignored) { Thread.currentThread().interrupt(); }
            exchange.close();
        });
        var client = new JevClient(WebClient.builder(), url, "test-only", "jev-1.13.0", 50, true);
        assertThrows(SearchDecisionException.class, () -> client.classify("Fuga", Map.of()));
    }
}
