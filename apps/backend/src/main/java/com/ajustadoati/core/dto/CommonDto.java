package com.ajustadoati.core.dto;

import jakarta.validation.constraints.*;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

public class CommonDto {

    public record LocationDto(
        @NotNull(message = "Latitude is required")
        @DecimalMin(value = "-90.0", message = "Latitude must be between -90 and 90")
        @DecimalMax(value = "90.0", message = "Latitude must be between -90 and 90")
        Double latitude,

        @NotNull(message = "Longitude is required")
        @DecimalMin(value = "-180.0", message = "Longitude must be between -180 and 180")
        @DecimalMax(value = "180.0", message = "Longitude must be between -180 and 180")
        Double longitude,

        String address,
        String city,
        String state,
        String country
    ) {}

    public record ProfileDto(
        UUID id,
        String fullName,
        String username,
        String email,
        String phone,
        Boolean isProvider,
        List<Integer> categories,
        LocationDto location,
        Boolean isActive,
        LocalDateTime createdAt,
        LocalDateTime updatedAt
    ) {}

    public record ProfileUpdateRequest(
        @Size(max = 100, message = "Full name must not exceed 100 characters")
        String fullName,

        String phone,

        List<Integer> categories,

        LocationDto location

    ) {}

    public record CategoryDto(
        Integer id,
        String name,
        String description,
        String iconUrl,
        Boolean isActive,
        Integer displayOrder,
        LocalDateTime createdAt,
        LocalDateTime updatedAt
    ) {}

    public record CategoryCreateRequest(
        @NotBlank(message = "Category name is required")
        @Size(max = 100, message = "Category name must not exceed 100 characters")
        String name,

        @Size(max = 500, message = "Description must not exceed 500 characters")
        String description,

        String iconUrl,

        Integer displayOrder
    ) {}

    public record ProviderSearchRequest(
        @NotNull(message = "Category ID is required")
        Integer categoryId,

        @NotNull(message = "Latitude is required")
        Double latitude,

        @NotNull(message = "Longitude is required")
        Double longitude,

        @Min(value = 1, message = "Max distance must be at least 1 km")
        @Max(value = 100, message = "Max distance must not exceed 100 km")
        Double maxDistanceKm,

        @Min(value = 0, message = "Page must be non-negative")
        Integer page,

        @Min(value = 1, message = "Size must be at least 1")
        @Max(value = 50, message = "Size must not exceed 50")
        Integer size
    ) {}

    public record ProviderResponse(
        UUID id,
        String fullName,
        String username,
        String email,
        String phone,
        List<Integer> categories,
        LocationDto location,
        Double distanceKm,
        Boolean isActive
    ) {}

    public record GuestRequestCreateRequest(
        @NotBlank(message = "Message is required")
        @Size(max = 1000, message = "Message must not exceed 1000 characters")
        String message,

        @NotNull(message = "Category ID is required")
        Integer categoryId,

        String categoryName,

        @NotNull(message = "Latitude is required")
        Double latitude,

        @NotNull(message = "Longitude is required")
        Double longitude,

        @Min(value = 1, message = "Max distance must be at least 1 km")
        @Max(value = 100, message = "Max distance must not exceed 100 km")
        Double maxDistanceKm
    ) {}

    public record GuestRequestResponseDto(
        UUID id,
        UUID requestId,
        String providerName,
        String providerEmail,
        String providerPhone,
        String message,
        Double latitude,
        Double longitude,
        LocalDateTime createdAt
    ) {}

    public record GuestRequestDto(
        UUID id,
        String guestRef,
        Integer categoryId,
        String categoryName,
        String message,
        Double latitude,
        Double longitude,
        Double maxDistanceKm,
        String status,
        Integer notifiedProviders,
        LocalDateTime createdAt,
        LocalDateTime updatedAt,
        List<GuestRequestResponseDto> responses
    ) {}

    public record ApiResponse<T>(
        boolean success,
        String message,
        T data,
        String timestamp
    ) {
        public static <T> ApiResponse<T> success(T data) {
            return new ApiResponse<>(true, "Success", data, LocalDateTime.now().toString());
        }

        public static <T> ApiResponse<T> success(String message, T data) {
            return new ApiResponse<>(true, message, data, LocalDateTime.now().toString());
        }

        public static <T> ApiResponse<T> error(String message) {
            return new ApiResponse<>(false, message, null, LocalDateTime.now().toString());
        }
    }

    public record PagedResponse<T>(
        List<T> content,
        int page,
        int size,
        long totalElements,
        int totalPages,
        boolean hasNext,
        boolean hasPrevious
    ) {}
}
