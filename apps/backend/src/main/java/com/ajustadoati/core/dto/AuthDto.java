package com.ajustadoati.core.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.LocalDateTime;
import java.util.List;
import static com.ajustadoati.core.dto.CommonDto.LocationDto;

public class AuthDto {
    
    public record LoginRequest(
        @NotBlank(message = "Email is required")
        @Email(message = "Email should be valid")
        String email,
        
        @NotBlank(message = "Password is required")
        @Size(min = 6, message = "Password must be at least 6 characters")
        String password
    ) {}
    
    public record RegisterRequest(
        @NotBlank(message = "Full name is required")
        @Size(max = 100, message = "Full name must not exceed 100 characters")
        String fullName,
        
        @NotBlank(message = "Username is required")
        @Size(min = 3, max = 30, message = "Username must be between 3 and 30 characters")
        String username,
        
        @NotBlank(message = "Email is required")
        @Email(message = "Email should be valid")
        String email,
        
        @NotBlank(message = "Password is required")
        @Size(min = 6, message = "Password must be at least 6 characters")
        String password,
        
        String phone,
        
        @NotNull(message = "Provider status is required")
        Boolean isProvider,
        
        List<Integer> categories,
        
        LocationDto location
    ) {}
    
    public record AuthResponse(
        String accessToken,
        String refreshToken,
        String tokenType,
        int expiresIn,
        UserInfo user
    ) {}
    
    public record UserInfo(
        String id,
        String email,
        String fullName,
        String username,
        String phone,
        Boolean isProvider,
        List<Integer> categories,
        LocationDto location,
        LocalDateTime createdAt
    ) {}
    
    public record RefreshTokenRequest(
        @NotBlank(message = "Refresh token is required")
        String refreshToken
    ) {}
}
