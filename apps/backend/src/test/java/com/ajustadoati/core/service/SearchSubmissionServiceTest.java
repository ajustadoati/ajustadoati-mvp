package com.ajustadoati.core.service;

import com.ajustadoati.core.dto.CommonDto.*;
import com.ajustadoati.core.dto.SearchSubmission;
import com.ajustadoati.core.entity.Category;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;

import java.util.List;
import java.util.UUID;
import java.util.concurrent.*;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class SearchSubmissionServiceTest {
    CategoryClassificationService classifier = mock(CategoryClassificationService.class);
    ProfileService profiles = mock(ProfileService.class);
    GuestRequestService requests = mock(GuestRequestService.class);
    SearchSubmissionService service = new SearchSubmissionService(classifier, profiles, requests, 30);
    SearchSubmission.Request input = new SearchSubmission.Request(UUID.randomUUID(), "Reparar fuga", 0., 0., 50.);
    Category category = Category.builder().id(42).name("Plomeria").isActive(true).build();

    @BeforeEach void setup() {
        when(classifier.classify(anyString())).thenReturn(category);
        when(profiles.searchProviders(any())).thenReturn(new PagedResponse<>(List.of(), 0, 20, 0, 0, false, false));
    }

    @Test void classifiesThenDispatchesPreservingOriginalTextAndIdentity() {
        service.submit(input, "client@example.test");
        var order = inOrder(classifier, profiles, requests);
        order.verify(classifier).classify(input.message());
        order.verify(profiles).searchProviders(argThat(r -> r.categoryId() == 42 && r.latitude() == 0));
        order.verify(requests).createRequest(argThat(r -> r.message().equals(input.message())
                && r.categoryName().equals("Plomeria")), eq("client@example.test"));
    }

    @Test void repeatDoesNotChargeOrNotifyAgain() {
        service.submit(input, null);
        service.submit(input, null);
        verify(classifier, times(1)).classify(anyString());
        verify(requests, times(1)).createRequest(any(), isNull());
    }

    @Test void concurrentRepeatNotifiesOnlyOnce() throws Exception {
        CountDownLatch started = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        when(classifier.classify(anyString())).thenAnswer(call -> { started.countDown(); release.await(3, TimeUnit.SECONDS); return category; });
        try (var executor = Executors.newFixedThreadPool(2)) {
            var first = executor.submit(() -> service.submit(input, null));
            assertTrue(started.await(3, TimeUnit.SECONDS));
            var second = executor.submit(() -> service.submit(input, null));
            release.countDown();
            assertEquals(first.get(3, TimeUnit.SECONDS), second.get(3, TimeUnit.SECONDS));
            verify(requests, times(1)).createRequest(any(), isNull());
        }
    }

    @Test void conflictingRetryIsRejected() {
        service.submit(input, null);
        var altered = new SearchSubmission.Request(input.submissionId(), "Otro trabajo", 0., 0., 50.);
        assertEquals("SUBMISSION_CONFLICT", assertThrows(SearchDecisionException.class,
                () -> service.submit(altered, null)).getCode());
    }

    @Test void uncertaintyDoesNotCreateOrNotifyAndCanBeRetried() {
        when(classifier.classify(anyString())).thenThrow(new SearchDecisionException(
                "NEEDS_CLARIFICATION", HttpStatus.UNPROCESSABLE_ENTITY, "Explica mas"));
        assertThrows(SearchDecisionException.class, () -> service.submit(input, null));
        verifyNoInteractions(profiles, requests);
        doReturn(category).when(classifier).classify(anyString());
        service.submit(input, null);
        verify(requests).createRequest(any(), isNull());
    }

    @Test void globalBudgetLimitPreventsMoreVendorCalls() {
        var limited = new SearchSubmissionService(classifier, profiles, requests, 1);
        limited.submit(input, null);
        var another = new SearchSubmission.Request(UUID.randomUUID(), "Otro trabajo", 0., 0., 50.);
        assertEquals("SEARCH_LIMIT", assertThrows(SearchDecisionException.class,
                () -> limited.submit(another, null)).getCode());
        verify(classifier, times(1)).classify(anyString());
    }

    @Test void nearbyResultsDoNotExposePrivateContacts() {
        var provider = new ProviderResponse(UUID.randomUUID(), "Test provider", "provider", "private@example.test",
                "+34000000000", List.of(42), null, 2., true);
        when(profiles.searchProviders(any())).thenReturn(new PagedResponse<>(List.of(provider), 0, 20, 1, 1, false, false));
        var result = service.submit(input, null);
        assertNull(result.providers().getFirst().email());
        assertNull(result.providers().getFirst().phone());
    }
}
