package com.ajustadoati.core.service;

import com.ajustadoati.core.dto.AuthDto.*;
import com.ajustadoati.core.dto.CommonDto.LocationDto;
import com.ajustadoati.core.dto.Location;
import com.ajustadoati.core.entity.Profile;
import com.ajustadoati.core.repository.ProfileRepository;
import com.ajustadoati.core.security.JwtTokenProvider;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

@Service
@RequiredArgsConstructor
@Slf4j
public class AuthService {
    
    private final ProfileRepository profileRepository;
    private final PasswordEncoder passwordEncoder;
    private final AuthenticationManager authenticationManager;
    private final JwtTokenProvider jwtTokenProvider;
    private final ObjectMapper objectMapper;
    
    @Transactional
    public AuthResponse register(RegisterRequest request) {
        log.info("Registering new user: {}", request.email());
        
        // Verificar si el usuario ya existe
        if (profileRepository.existsByEmail(request.email())) {
            throw new RuntimeException("User already exists with email: " + request.email());
        }
        
        if (profileRepository.existsByUsername(request.username())) {
            throw new RuntimeException("Username already taken: " + request.username());
        }
        
        try {
            // Crear perfil en la base de datos
            Profile profile = Profile.builder()
                    .id(UUID.randomUUID())
                    .fullName(request.fullName())
                    .username(request.username())
                    .email(request.email())
                    .password(passwordEncoder.encode(request.password()))
                    .phone(request.phone())
                    .isProvider(request.isProvider())
                    .categories(request.categories())
                    .location(convertLocationDto(request.location()))
                    .build();
            
            Profile savedProfile = profileRepository.save(profile);
            
            // Generar JWT token
            String token = jwtTokenProvider.generateToken(request.username());
            
            // Retornar respuesta de autenticación
            return new AuthResponse(
                    token,
                    null, // No refresh token en esta implementación simple
                    "Bearer",
                    86400, // 24 hours
                    new UserInfo(
                            profile.getId().toString(),
                            request.email(),
                            request.fullName(),
                            request.username(),
                            request.phone(),
                            request.isProvider(),
                            request.categories(),
                            request.location(),
                            savedProfile.getCreatedAt()
                    )
            );
            
        } catch (Exception e) {
            log.error("Error during user registration", e);
            throw new RuntimeException("Registration failed: " + e.getMessage());
        }
    }
    
    public AuthResponse login(LoginRequest request) {
        log.info("User login attempt: {}", request.email());
        
        try {
            // Buscar usuario por email o username
            Profile profile = profileRepository.findByUsernameOrEmail(request.email(), request.email())
                    .orElseThrow(() -> new RuntimeException("User not found"));
            
            // Verificar contraseña
            if (!passwordEncoder.matches(request.password(), profile.getPassword())) {
                throw new RuntimeException("Invalid credentials");
            }
            
            if (!profile.getIsActive()) {
                throw new RuntimeException("Account is disabled");
            }
            
            // Generar JWT token
            String token = jwtTokenProvider.generateToken(profile.getUsername());
            
            return new AuthResponse(
                    token,
                    null, // No refresh token en esta implementación simple
                    "Bearer",
                    86400, // 24 hours
                    new UserInfo(
                            profile.getId().toString(),
                            profile.getEmail(),
                            profile.getFullName(),
                            profile.getUsername(),
                            profile.getPhone(),
                            profile.getIsProvider(),
                            profile.getCategories(),
                            convertToLocationDto(profile.getLocation()),
                            profile.getCreatedAt()
                    )
            );
            
        } catch (Exception e) {
            log.error("Error during user login", e);
            throw new RuntimeException("Login failed: " + e.getMessage());
        }
    }
    
    public AuthResponse refreshToken(RefreshTokenRequest request) {
        // En una implementación completa, aquí validarías el refresh token
        // Por simplicidad, no implementamos refresh tokens
        throw new RuntimeException("Refresh token not implemented in this version");
    }
    
    public void logout(String accessToken) {
        try {
            // En una implementación completa, aquí invalidarías el token
            // Por simplicidad, solo limpiamos el contexto de seguridad
            SecurityContextHolder.clearContext();
            log.info("User logged out successfully");
        } catch (Exception e) {
            log.error("Error during logout", e);
            throw new RuntimeException("Logout failed: " + e.getMessage());
        }
    }
    
    private Location convertLocationDto(LocationDto locationDto) {
        if (locationDto == null) return null;
        return Location.builder()
                .latitude(locationDto.latitude() != null ? java.math.BigDecimal.valueOf(locationDto.latitude()) : null)
                .longitude(locationDto.longitude() != null ? java.math.BigDecimal.valueOf(locationDto.longitude()) : null)
                .address(locationDto.address())
                .build();
    }
    
    private LocationDto convertToLocationDto(Location location) {
        if (location == null) return null;
        return new LocationDto(
                location.getLatitude() != null ? location.getLatitude().doubleValue() : null,
                location.getLongitude() != null ? location.getLongitude().doubleValue() : null,
                location.getAddress(),
                null, // city
                null, // state  
                null  // country
        );
    }
}
