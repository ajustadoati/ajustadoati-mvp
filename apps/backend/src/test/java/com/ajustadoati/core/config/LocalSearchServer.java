package com.ajustadoati.core.config;

import com.ajustadoati.core.config.CategoryDataInitializer;
import com.ajustadoati.core.controller.GuestRequestController;
import com.ajustadoati.core.controller.SearchSubmissionController;
import com.ajustadoati.core.dto.CommonDto.*;
import com.ajustadoati.core.dto.WebSocketDto;
import com.ajustadoati.core.entity.Category;
import com.ajustadoati.core.repository.CategoryRepository;
import com.ajustadoati.core.repository.ProfileRepository;
import com.ajustadoati.core.service.*;
import com.ajustadoati.core.websocket.ConnectionRegistry;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.EnableAutoConfiguration;
import org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration;
import org.springframework.boot.autoconfigure.orm.jpa.HibernateJpaAutoConfiguration;
import org.springframework.boot.autoconfigure.security.servlet.SecurityAutoConfiguration;
import org.springframework.boot.autoconfigure.security.servlet.UserDetailsServiceAutoConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.socket.WebSocketSession;

import java.math.BigDecimal;
import java.util.*;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/** Test-classpath-only server: real Jev + real request flow, no database or real providers. */
@Configuration
@EnableAutoConfiguration(exclude = {DataSourceAutoConfiguration.class, HibernateJpaAutoConfiguration.class,
        SecurityAutoConfiguration.class, UserDetailsServiceAutoConfiguration.class})
@Import({SearchSubmissionController.class, GuestRequestController.class, SearchSubmissionService.class,
        CategoryClassificationService.class, JevClient.class, GuestRequestService.class,
        LocalSearchServer.ResponseFixture.class})
public class LocalSearchServer {
    public static void main(String[] args) {
        SpringApplication.run(LocalSearchServer.class, "--server.address=127.0.0.1", "--server.port=8099",
                "--logging.level.org.springframework.web=INFO", "--logging.level.com.ajustadoati.core=INFO");
    }

    @Bean CategoryRepository categories() throws Exception {
        CategoryRepository repository = mock(CategoryRepository.class);
        Map<Integer, Category> data = new LinkedHashMap<>();
        when(repository.findByNameIgnoreCase(anyString())).thenReturn(Optional.empty());
        when(repository.save(any())).thenAnswer(call -> {
            Category category = call.getArgument(0);
            category.setId(data.size() + 1);
            data.put(category.getId(), category);
            return category;
        });
        new CategoryDataInitializer(repository).ensureDefaultCategories().run(null);
        when(repository.findByIsActiveTrueOrderByDisplayOrderAscNameAsc()).thenAnswer(call -> new ArrayList<>(data.values()));
        when(repository.findById(anyInt())).thenAnswer(call -> Optional.ofNullable(data.get(call.getArgument(0))));
        return repository;
    }

    @Bean ProfileRepository profileRepository() { return mock(ProfileRepository.class); }
    @Bean WebPushService webPushService() { return mock(WebPushService.class); }

    @Bean ProfileService profileService() {
        ProfileService service = mock(ProfileService.class);
        when(service.searchProviders(any())).thenAnswer(call -> {
            ProviderSearchRequest request = call.getArgument(0);
            var location = new LocationDto(request.latitude() + .001,
                    request.longitude() + .001, "Ubicacion ficticia", null, null, null);
            var provider = new ProviderResponse(UUID.fromString("00000000-0000-0000-0000-000000000042"),
                    "Proveedor local de prueba", "test-provider", "provider@example.test", null,
                    List.of(request.categoryId()), location, .15, true);
            return new PagedResponse<>(List.of(provider), 0, 20, 1, 1, false, false);
        });
        return service;
    }

    @Bean ConnectionRegistry registry() throws Exception {
        ConnectionRegistry registry = mock(ConnectionRegistry.class);
        WebSocketSession provider = mock(WebSocketSession.class);
        when(provider.isOpen()).thenReturn(true);
        when(provider.getId()).thenReturn("local-test-provider");
        when(registry.getProviderSessions(anyInt(), anyDouble(), anyDouble(), anyDouble())).thenReturn(List.of(provider));
        return registry;
    }

    @RestController
    static class ResponseFixture {
        private final GuestRequestService requests;
        ResponseFixture(GuestRequestService requests) { this.requests = requests; }

        @PostMapping("/local-test/respond/{id}")
        public ApiResponse<GuestRequestDto> respond(@PathVariable UUID id) {
            requests.recordProviderResponse(id,
                    WebSocketDto.ProviderInfo.builder().fullName("Proveedor local de prueba")
                            .email("provider@example.test").phone("+34000000000").build(),
                    WebSocketDto.IncomingMessage.builder().message("Puedo ayudarte. Precio: 50 EUR")
                            .latitude(BigDecimal.valueOf(41.18)).longitude(BigDecimal.valueOf(1.45)).build());
            return ApiResponse.success(requests.getRequest(id));
        }
    }
}
