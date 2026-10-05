package com.ajustadoati.core.dto;

import jakarta.validation.constraints.*;
import java.util.List;
import java.util.UUID;

public class SearchSubmission {
    public record Request(
            @NotNull UUID submissionId,
            @NotBlank @Size(min = 3, max = 1000) String message,
            @NotNull @DecimalMin("-90") @DecimalMax("90") Double latitude,
            @NotNull @DecimalMin("-180") @DecimalMax("180") Double longitude,
            @NotNull @DecimalMin("1") @DecimalMax("100") Double maxDistanceKm) {}

    public record Result(CommonDto.GuestRequestDto request, List<CommonDto.ProviderResponse> providers) {}
    public record Error(String code, String message) {}
}
