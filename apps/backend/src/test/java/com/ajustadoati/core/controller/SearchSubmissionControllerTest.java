package com.ajustadoati.core.controller;

import com.ajustadoati.core.repository.ProfileRepository;
import com.ajustadoati.core.service.SearchDecisionException;
import com.ajustadoati.core.service.SearchSubmissionService;
import com.ajustadoati.core.dto.SearchSubmission;
import com.ajustadoati.core.entity.Profile;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.List;
import java.util.Optional;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class SearchSubmissionControllerTest {
    SearchSubmissionService service = mock(SearchSubmissionService.class);
    ProfileRepository profiles = mock(ProfileRepository.class);
    MockMvc mvc;
    String body = """
            {"submissionId":"015c6554-a792-4a7d-8bff-7715bad51c24", "message":"Reparar fuga",
             "latitude":41.1,"longitude":1.4,"maxDistanceKm":50}
            """;

    @BeforeEach void setup() {
        mvc = MockMvcBuilders.standaloneSetup(new SearchSubmissionController(service, profiles)).build();
        when(service.submit(any(), any())).thenReturn(new SearchSubmission.Result(null, List.of()));
    }

    @Test void acceptsGuestWithoutCategory() throws Exception {
        mvc.perform(post("/search-requests").contentType("application/json").content(body))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.success").value(true));
        verify(service).submit(any(), isNull());
    }

    @Test void signedInIdentityComesFromServer() throws Exception {
        var profile = Profile.builder().email("client@example.test").build();
        when(profiles.findByUsernameOrEmailWithCategories("client", "client")).thenReturn(Optional.of(profile));
        var auth = new UsernamePasswordAuthenticationToken("client", "unused", List.of());
        mvc.perform(post("/search-requests").principal(auth).contentType("application/json").content(body))
                .andExpect(status().isCreated());
        verify(service).submit(any(), eq("client@example.test"));
    }

    @Test void returnsActionableClassificationError() throws Exception {
        when(service.submit(any(), any())).thenThrow(new SearchDecisionException(
                "NEEDS_CLARIFICATION", HttpStatus.UNPROCESSABLE_ENTITY, "Describe mejor tu necesidad"));
        mvc.perform(post("/search-requests").contentType("application/json").content(body))
                .andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.code").value("NEEDS_CLARIFICATION"));
    }

    @Test void invalidCoordinatesNeverReachJev() throws Exception {
        mvc.perform(post("/search-requests").contentType("application/json").content(body.replace("41.1", "91")))
                .andExpect(status().isBadRequest());
        verifyNoInteractions(service);
    }

    @Test void emptyDescriptionNeverReachesJev() throws Exception {
        mvc.perform(post("/search-requests").contentType("application/json").content(body.replace("Reparar fuga", "")))
                .andExpect(status().isBadRequest());
        verifyNoInteractions(service);
    }
}
