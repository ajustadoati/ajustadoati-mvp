package com.ajustadoati.core.service;

import com.ajustadoati.core.entity.Category;
import com.ajustadoati.core.repository.CategoryRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class CategoryClassificationServiceTest {
    CategoryRepository repository = mock(CategoryRepository.class);
    JevClient jev = mock(JevClient.class);
    Category category = Category.builder().id(42).name("Plomeria").description("Reparar tuberias; no vender muebles").isActive(true).build();
    CategoryClassificationService service = new CategoryClassificationService(repository, jev, .85, .20);
    ObjectMapper mapper = new ObjectMapper();

    @BeforeEach void setup() {
        when(repository.findByIsActiveTrueOrderByDisplayOrderAscNameAsc()).thenReturn(List.of(category));
        when(repository.findById(42)).thenReturn(Optional.of(category));
    }

    void answer(String choice, double confidence, Map<String, Double> probabilities) {
        when(jev.classify(anyString(), anyMap())).thenReturn(mapper.valueToTree(Map.of("answers", Map.of("category",
                Map.of("type", "choice", "choice", choice, "confidence", confidence, "probabilities", probabilities)))));
    }

    @Test void usesCurrentIdsAndDescriptionsAndReturnsAnActiveCategory() {
        answer("category_42", .97, Map.of("category_42", .98, "not_supported", .01, "needs_detail", .01));
        assertEquals(42, service.classify("Fuga en el bano").getId());
        verify(jev).classify(eq("Fuga en el bano"), argThat(options ->
                options.get("category_42").contains("no vender muebles") && options.size() == 3));
    }

    @Test void ambiguousInputDoesNotChooseACategory() {
        answer("category_42", .3, Map.of("category_42", .6, "not_supported", .1, "needs_detail", .3));
        assertEquals("NEEDS_CLARIFICATION", assertThrows(SearchDecisionException.class,
                () -> service.classify("Ayuda en casa")).getCode());
    }

    @Test void unsupportedPurchaseIsNotForcedIntoRepairs() {
        answer("not_supported", .97, Map.of("category_42", .01, "not_supported", .98, "needs_detail", .01));
        assertEquals("NOT_SUPPORTED", assertThrows(SearchDecisionException.class,
                () -> service.classify("Comprar un sofa")).getCode());
    }

    @Test void explicitClarificationDoesNotDispatchEvenWithHighConfidence() {
        answer("needs_detail", 1, Map.of("category_42", 0., "not_supported", 0., "needs_detail", 1.));
        assertEquals("NEEDS_CLARIFICATION", assertThrows(SearchDecisionException.class,
                () -> service.classify("Necesito una lavadora")).getCode());
    }

    @Test void rejectsInventedCategory() {
        answer("category_999", 1, Map.of("category_42", 1., "not_supported", 0., "needs_detail", 0.));
        assertThrows(SearchDecisionException.class, () -> service.classify("Fuga"));
    }

    @Test void rejectsCategoryDeactivatedDuringNetworkCall() {
        answer("category_42", 1, Map.of("category_42", 1., "not_supported", 0., "needs_detail", 0.));
        when(repository.findById(42)).thenReturn(Optional.empty());
        assertThrows(SearchDecisionException.class, () -> service.classify("Fuga"));
    }

    @Test void malformedDistributionFailsClosed() {
        answer("category_42", 1, Map.of("category_42", 1., "not_supported", 1., "needs_detail", 1.));
        assertThrows(SearchDecisionException.class, () -> service.classify("Fuga"));
    }

    @Test void emptyCatalogDoesNotCallJev() {
        when(repository.findByIsActiveTrueOrderByDisplayOrderAscNameAsc()).thenReturn(List.of());
        assertThrows(SearchDecisionException.class, () -> service.classify("Fuga"));
        verifyNoInteractions(jev);
    }
}
