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
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class GuestRequestServiceTest {
    private final ConnectionRegistry connections = mock(ConnectionRegistry.class);
    private final CategoryRepository categories = mock(CategoryRepository.class);
    private final ProfileRepository profiles = mock(ProfileRepository.class);
    private final WebPushService push = mock(WebPushService.class);
    private final GuestRequestStore store = mock(GuestRequestStore.class);
    private final ObjectMapper mapper = new ObjectMapper().findAndRegisterModules();

    private GuestRequestService service() {
        return new GuestRequestService(connections, categories, profiles, mapper, push, store);
    }

    @Test
    void failedCompletionSaveKeepsRequestAcceptedForRetry() {
        UUID requestId = UUID.randomUUID();
        UUID responseId = UUID.randomUUID();
        LocalDateTime now = LocalDateTime.now();
        var response = new GuestRequestResponseDto(responseId, requestId, "Proveedor",
                "provider@example.test", null, "Disponible", 41.18, 1.45, now);
        var request = new GuestRequestDto(requestId, "guest@example.test", 12, "Taxi", "Viaje",
                41.18, 1.45, 50.0, "accepted", 1, now, now, List.of(response), responseId);
        when(store.loadAll()).thenReturn(List.of(new GuestRequestStore.StoredRequest(request, false, null)));
        doThrow(new IllegalStateException("Database unavailable")).when(store).save(any());

        GuestRequestService service = service();
        service.restoreRequests();

        assertThrows(IllegalStateException.class, () -> service.completeRequest(requestId, "provider@example.test"));
        assertEquals("accepted", service.getRequest(requestId).status());
        assertEquals(now, service.getRequest(requestId).updatedAt());
    }

    @Test
    void restoresRequestAndResponseAfterRestart() {
        List<GuestRequestStore.StoredRequest> saved = new ArrayList<>();
        when(store.loadAll()).thenAnswer(call -> new ArrayList<>(saved));
        doAnswer(call -> {
            saved.removeIf(entry -> entry.request().id().equals(((GuestRequestStore.StoredRequest) call.getArgument(0)).request().id()));
            saved.add(call.getArgument(0));
            return null;
        }).when(store).save(any());
        when(categories.findById(12)).thenReturn(Optional.of(Category.builder().id(12).name("Taxi").isActive(true).build()));
        when(connections.getProviderSessions(anyInt(), anyDouble(), anyDouble(), anyDouble())).thenReturn(List.of());
        when(connections.getUserSessions(anyString())).thenReturn(List.of());

        GuestRequestService first = service();
        first.restoreRequests();
        var request = first.createRequest(new GuestRequestCreateRequest("Necesito un taxi", 12, "Taxi", 41.18, 1.45, 50.));
        first.recordProviderResponse(request.id(), WebSocketDto.ProviderInfo.builder()
                .fullName("Proveedor").email("provider@example.test").phone("+34123456789").build(),
                WebSocketDto.IncomingMessage.builder().message("Puedo ayudarte")
                        .latitude(BigDecimal.valueOf(41.19)).longitude(BigDecimal.valueOf(1.46)).build());

        GuestRequestService restarted = service();
        restarted.restoreRequests();
        var restored = restarted.getRequest(request.id());
        assertEquals("responded", restored.status());
        assertEquals(1, restored.responses().size());

        restarted.acceptResponse(request.id(), restored.responses().get(0).id());
        assertEquals("accepted", saved.get(0).request().status());
        assertEquals(1, restarted.getAcceptedForProvider("provider@example.test").size());
        assertTrue(restarted.getAcceptedForProvider("other@example.test").isEmpty());
        assertEquals(restored.responses().get(0).id(), saved.get(0).request().acceptedResponseId());
        assertThrows(SecurityException.class, () -> restarted.completeRequest(request.id(), "other@example.test"));
        assertEquals("accepted", restarted.getRequest(request.id()).status());
        assertEquals("completed", restarted.completeRequest(request.id(), "provider@example.test").status());
        assertEquals("completed", saved.get(0).request().status());
        assertTrue(restarted.getAcceptedForProvider("provider@example.test").isEmpty());
        assertEquals("completed", restarted.completeRequest(request.id(), "provider@example.test").status());
        GuestRequestService afterCompletionRestart = service();
        afterCompletionRestart.restoreRequests();
        assertEquals("completed", afterCompletionRestart.getRequest(request.id()).status());
        restarted.recordProviderResponse(request.id(), WebSocketDto.ProviderInfo.builder()
                .email("another@example.test").build(),
                WebSocketDto.IncomingMessage.builder().message("Late response").build());
        assertEquals(1, restarted.getResponses(request.id()).size());
        assertThrows(IllegalStateException.class,
                () -> restarted.acceptResponse(request.id(), restored.responses().get(0).id()));
    }

    @Test
    void onlySelectedProviderCanCompleteWhenMultipleProvidersResponded() {
        List<GuestRequestStore.StoredRequest> saved = new ArrayList<>();
        when(store.loadAll()).thenAnswer(call -> new ArrayList<>(saved));
        doAnswer(call -> {
            saved.clear();
            saved.add(call.getArgument(0));
            return null;
        }).when(store).save(any());
        when(categories.findById(12)).thenReturn(Optional.of(Category.builder().id(12).name("Taxi").isActive(true).build()));
        when(connections.getProviderSessions(anyInt(), anyDouble(), anyDouble(), anyDouble())).thenReturn(List.of());
        when(connections.getUserSessions(anyString())).thenReturn(List.of());

        GuestRequestService service = service();
        var request = service.createRequest(new GuestRequestCreateRequest("Taxi", 12, "Taxi", 41.18, 1.45, 50.));
        assertThrows(IllegalStateException.class, () -> service.completeRequest(request.id(), "first@example.test"));
        for (String email : List.of("first@example.test", "second@example.test")) {
            service.recordProviderResponse(request.id(), WebSocketDto.ProviderInfo.builder().email(email).build(),
                    WebSocketDto.IncomingMessage.builder().message("Disponible").build());
        }
        UUID selectedId = service.getRequest(request.id()).responses().stream()
                .filter(r -> r.providerEmail().equals("first@example.test")).findFirst().orElseThrow().id();
        service.acceptResponse(request.id(), selectedId);
        assertThrows(SecurityException.class, () -> service.completeRequest(request.id(), "second@example.test"));
        assertEquals("completed", service.completeRequest(request.id(), "first@example.test").status());
        assertEquals(selectedId, saved.get(0).request().acceptedResponseId());
    }

    @Test
    void demoRequestIsOnlyVisibleToItsTargetProvider() {
        UUID id = UUID.randomUUID();
        var request = new com.ajustadoati.core.dto.CommonDto.GuestRequestDto(
                id, "demo@example.test", 12, "Taxi", "Solicitud de prueba", 41.18, 1.45,
                50., "pending", 1, java.time.LocalDateTime.now(), java.time.LocalDateTime.now(), List.of(), null);
        when(store.loadAll()).thenReturn(List.of(new GuestRequestStore.StoredRequest(
                request, true, "target@example.test")));

        GuestRequestService service = service();
        service.restoreRequests();

        assertTrue(service.getPendingForProvider(List.of(12), "other@example.test", 41.18, 1.45).isEmpty());
        assertEquals(1, service.getPendingForProvider(List.of(12), "target@example.test", 41.18, 1.45).size());
    }
}
