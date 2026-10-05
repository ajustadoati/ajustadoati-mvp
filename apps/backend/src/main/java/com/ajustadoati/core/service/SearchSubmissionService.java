package com.ajustadoati.core.service;

import com.ajustadoati.core.dto.CommonDto.*;
import com.ajustadoati.core.dto.SearchSubmission;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionException;

@Service
public class SearchSubmissionService {
    private final CategoryClassificationService classifier;
    private final ProfileService profiles;
    private final GuestRequestService requests;
    private final int maxPerMinute;
    private final Map<String, Entry> submissions = new HashMap<>();
    private long windowStart;
    private int calls;

    private record Entry(SearchSubmission.Request input, long createdAt,
                         CompletableFuture<SearchSubmission.Result> result) {}

    public SearchSubmissionService(CategoryClassificationService classifier, ProfileService profiles,
            GuestRequestService requests, @Value("${app.jev.max-calls-per-minute:30}") int maxPerMinute) {
        this.classifier = classifier;
        this.profiles = profiles;
        this.requests = requests;
        this.maxPerMinute = maxPerMinute;
    }

    public SearchSubmission.Result submit(SearchSubmission.Request input, String requesterEmail) {
        if (input.message().trim().length() < 3) {
            throw new SearchDecisionException("NEEDS_CLARIFICATION", HttpStatus.UNPROCESSABLE_ENTITY,
                    "Describe con un poco mas de detalle lo que necesitas.");
        }
        String key = (requesterEmail == null ? "guest" : requesterEmail) + ":" + input.submissionId();
        Entry entry;
        boolean owner;
        synchronized (submissions) {
            long now = System.currentTimeMillis();
            submissions.entrySet().removeIf(e -> e.getValue().result().isDone()
                    && now - e.getValue().createdAt() > 900_000);
            entry = submissions.get(key);
            owner = entry == null;
            if (owner) {
                if (now - windowStart >= 60_000) { windowStart = now; calls = 0; }
                if (calls >= maxPerMinute || submissions.size() >= 1000) {
                    throw new SearchDecisionException("SEARCH_LIMIT", HttpStatus.TOO_MANY_REQUESTS,
                            "Hay muchas busquedas en este momento. Espera un minuto y vuelve a intentarlo.");
                }
                calls++;
                entry = new Entry(input, now, new CompletableFuture<>());
                submissions.put(key, entry);
            } else if (!entry.input().equals(input)) {
                throw new SearchDecisionException("SUBMISSION_CONFLICT", HttpStatus.CONFLICT,
                        "Esta busqueda ya se envio con otros datos. Inicia una nueva busqueda.");
            }
        }
        if (owner) {
            try {
                var category = classifier.classify(input.message().trim());
                var nearby = profiles.searchProviders(new ProviderSearchRequest(category.getId(),
                        input.latitude(), input.longitude(), input.maxDistanceKm(), 0, 20));
                var safeProviders = nearby.content().stream().map(p -> new ProviderResponse(
                        p.id(), p.fullName(), p.username(), null, null, p.categories(),
                        p.location(), p.distanceKm(), p.isActive())).toList();
                var request = requests.createRequest(new GuestRequestCreateRequest(input.message().trim(),
                        category.getId(), category.getName(), input.latitude(), input.longitude(),
                        input.maxDistanceKm()), requesterEmail);
                entry.result().complete(new SearchSubmission.Result(request, safeProviders));
            } catch (Exception exception) {
                entry.result().completeExceptionally(exception);
                synchronized (submissions) { submissions.remove(key, entry); }
            }
        }
        try {
            return entry.result().join();
        } catch (CompletionException exception) {
            if (exception.getCause() instanceof SearchDecisionException decision) throw decision;
            throw SearchDecisionException.unavailable();
        }
    }
}
