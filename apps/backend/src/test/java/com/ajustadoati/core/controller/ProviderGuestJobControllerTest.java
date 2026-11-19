package com.ajustadoati.core.controller;

import com.ajustadoati.core.entity.Profile;
import com.ajustadoati.core.repository.ProfileRepository;
import com.ajustadoati.core.service.GuestRequestService;
import com.ajustadoati.core.service.ProfileService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class ProviderGuestJobControllerTest {
    private final GuestRequestService requests = mock(GuestRequestService.class);
    private final ProfileRepository profiles = mock(ProfileRepository.class);
    private MockMvc mvc;
    private final UUID requestId = UUID.randomUUID();
    private final UsernamePasswordAuthenticationToken provider =
            new UsernamePasswordAuthenticationToken("provider", "unused", List.of());

    @BeforeEach
    void setup() {
        mvc = MockMvcBuilders.standaloneSetup(new ProviderController(
                mock(ProfileService.class), requests, profiles)).build();
    }

    @Test
    void rejectsUnauthenticatedCompletion() throws Exception {
        mvc.perform(post("/providers/guest-requests/{id}/complete", requestId))
                .andExpect(status().isUnauthorized());
        verifyNoInteractions(requests);
    }

    @Test
    void rejectsNonProviderCompletion() throws Exception {
        when(profiles.findByUsernameOrEmailWithCategories("provider", "provider"))
                .thenReturn(Optional.of(Profile.builder().email("provider@example.test").isProvider(false).build()));
        mvc.perform(post("/providers/guest-requests/{id}/complete", requestId).principal(provider))
                .andExpect(status().isForbidden());
        verifyNoInteractions(requests);
    }

    @Test
    void passesVerifiedProviderEmailToCompletion() throws Exception {
        when(profiles.findByUsernameOrEmailWithCategories("provider", "provider"))
                .thenReturn(Optional.of(Profile.builder().email("provider@example.test").isProvider(true).build()));
        mvc.perform(post("/providers/guest-requests/{id}/complete", requestId).principal(provider))
                .andExpect(status().isOk());
        verify(requests).completeRequest(requestId, "provider@example.test");
    }

    @Test
    void listsOnlyAuthenticatedProviderAcceptedJobs() throws Exception {
        when(profiles.findByUsernameOrEmailWithCategories("provider", "provider"))
                .thenReturn(Optional.of(Profile.builder().email("provider@example.test").isProvider(true).build()));
        when(requests.getAcceptedForProvider("provider@example.test")).thenReturn(List.of());
        mvc.perform(get("/providers/accepted-guest-requests").principal(provider))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.length()").value(0));
        verify(requests).getAcceptedForProvider("provider@example.test");
    }
}
