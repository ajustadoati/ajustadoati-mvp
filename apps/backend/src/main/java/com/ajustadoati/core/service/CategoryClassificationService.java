package com.ajustadoati.core.service;

import com.ajustadoati.core.entity.Category;
import com.ajustadoati.core.repository.CategoryRepository;
import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import java.util.LinkedHashMap;
import java.util.Map;

@Service
public class CategoryClassificationService {
    private final CategoryRepository categories;
    private final JevClient jev;
    private final double minConfidence;
    private final double minMargin;

    public CategoryClassificationService(CategoryRepository categories, JevClient jev,
            @Value("${app.jev.min-confidence:0.50}") double minConfidence,
            @Value("${app.jev.min-margin:0.20}") double minMargin) {
        this.categories = categories;
        this.jev = jev;
        this.minConfidence = minConfidence;
        this.minMargin = minMargin;
    }

    public Category classify(String text) {
        var active = categories.findByIsActiveTrueOrderByDisplayOrderAscNameAsc();
        if (active.isEmpty() || active.size() > 253) throw SearchDecisionException.unavailable();
        Map<String, String> criteria = new LinkedHashMap<>();
        for (Category category : active) {
            criteria.put("category_" + category.getId(), category.getName() + ": "
                    + (category.getDescription() == null ? "" : category.getDescription()));
        }
        criteria.put("not_supported", "La necesidad es clara pero ninguna categoria del catalogo la cubre.");
        criteria.put("needs_detail", "Necesidad vaga, ambigua o varias necesidades diferentes; pedir mas detalles.");
        JsonNode result = jev.classify(text, criteria);
        if (result == null) throw SearchDecisionException.unavailable();
        JsonNode answer = result.path("answers").path("category");
        String choice = answer.path("choice").asText();
        JsonNode probabilities = answer.path("probabilities");
        double confidence = answer.path("confidence").asDouble(Double.NaN);
        if (!"choice".equals(answer.path("type").asText()) || !criteria.containsKey(choice)
                || !answer.path("confidence").isNumber() || !Double.isFinite(confidence) || confidence < 0 || confidence > 1
                || !probabilities.isObject() || probabilities.size() != criteria.size()) {
            throw SearchDecisionException.unavailable();
        }
        double sum = 0;
        double runnerUp = 0;
        for (String key : criteria.keySet()) {
            JsonNode probability = probabilities.path(key);
            double value = probability.asDouble(Double.NaN);
            if (!probability.isNumber() || !Double.isFinite(value) || value < 0 || value > 1) {
                throw SearchDecisionException.unavailable();
            }
            sum += value;
            if (!key.equals(choice)) runnerUp = Math.max(runnerUp, value);
        }
        double top = probabilities.get(choice).doubleValue();
        if (Math.abs(sum - 1) > 0.01 || top < runnerUp) throw SearchDecisionException.unavailable();
        if (confidence < minConfidence || top - runnerUp < minMargin || choice.equals("needs_detail")) {
            throw new SearchDecisionException("NEEDS_CLARIFICATION", HttpStatus.UNPROCESSABLE_ENTITY,
                    "Necesitamos un poco mas de detalle. Explica que necesitas comprar, reparar o realizar y sobre que producto o servicio.");
        }
        if (choice.equals("not_supported")) {
            throw new SearchDecisionException("NOT_SUPPORTED", HttpStatus.UNPROCESSABLE_ENTITY,
                    "Todavia no tenemos una categoria que cubra esta necesidad. No hemos enviado la solicitud.");
        }
        int categoryId = Integer.parseInt(choice.substring("category_".length()));
        // Re-read after the network call: the catalog may have changed meanwhile.
        return categories.findById(categoryId).filter(c -> Boolean.TRUE.equals(c.getIsActive()))
                .orElseThrow(SearchDecisionException::unavailable);
    }
}
