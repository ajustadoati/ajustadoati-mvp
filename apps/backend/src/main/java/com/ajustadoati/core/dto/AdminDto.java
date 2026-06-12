package com.ajustadoati.core.dto;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

public class AdminDto {

    public record AdminProviderDto(
        UUID id,
        String fullName,
        String email,
        String phone,
        List<Integer> categories,
        Double latitude,
        Double longitude,
        String address,
        LocalDateTime createdAt,
        Boolean isActive,
        Boolean welcomeRequestSent,
        boolean connected
    ) {}

    public record AdminStatsDto(
        long totalProviders,
        long totalUsers,
        long connectedProviders,
        long connectedUsers,
        int demoRequestsSent,
        int demoRequestsResponded
    ) {}

    public record DemoRequestSummary(
        UUID requestId,
        String providerEmail,
        String categoryName,
        String message,
        String status,
        int responsesCount,
        LocalDateTime createdAt
    ) {}

    public record GuestRequestSummary(
        UUID requestId,
        String guestRef,
        String providerEmail,
        String categoryName,
        String message,
        String status,
        int responsesCount,
        boolean demo,
        LocalDateTime createdAt
    ) {}
}
