package com.ajustadoati.core.service;

import com.ajustadoati.core.dto.CommonDto.*;
import com.ajustadoati.core.dto.Location;
import com.ajustadoati.core.entity.Profile;
import com.ajustadoati.core.repository.ProfileRepository;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Slf4j
public class ProfileService {
    
    private final ProfileRepository profileRepository;
    private final ObjectMapper objectMapper;
    
    public ProfileDto getProfile(UUID userId) {
        Profile profile = profileRepository.findById(userId)
                .orElseThrow(() -> new RuntimeException("Profile not found"));
        return toProfileDto(profile);
    }

    public ProfileDto getProfileByUsername(String username) {
        Profile profile = profileRepository.findByUsernameOrEmailWithCategories(username, username)
                .orElseThrow(() -> new RuntimeException("Profile not found"));
        return toProfileDto(profile);
    }
    
    @Transactional
    public ProfileDto updateProfile(UUID userId, ProfileUpdateRequest request) {
        Profile profile = profileRepository.findById(userId)
                .orElseThrow(() -> new RuntimeException("Profile not found"));
        
        if (request.fullName() != null) {
            profile.setFullName(request.fullName());
        }
        if (request.phone() != null) {
            profile.setPhone(request.phone());
        }
        if (request.categories() != null) {
            profile.setCategories(request.categories());
        }
        if (request.location() != null) {
            profile.setLocation(convertLocationDto(request.location()));
        }
        
        Profile saved = profileRepository.save(profile);
        return toProfileDto(saved);
    }

    @Transactional
    public ProfileDto updateProfileByUsername(String username, ProfileUpdateRequest request) {
        Profile profile = profileRepository.findByUsernameOrEmailWithCategories(username, username)
                .orElseThrow(() -> new RuntimeException("Profile not found"));

        if (request.fullName() != null) {
            profile.setFullName(request.fullName());
        }
        if (request.phone() != null) {
            profile.setPhone(request.phone());
        }
        if (request.categories() != null) {
            profile.setCategories(request.categories());
        }
        if (request.location() != null) {
            profile.setLocation(convertLocationDto(request.location()));
        }

        Profile saved = profileRepository.save(profile);
        return toProfileDto(saved);
    }
    
    public PagedResponse<ProviderResponse> searchProviders(ProviderSearchRequest request) {
        int page = request.page() != null ? request.page() : 0;
        int size = request.size() != null ? request.size() : 20;
        Double maxDistance = request.maxDistanceKm() != null ? request.maxDistanceKm() : 50.0;
        
        try {
            List<Object[]> results = profileRepository.findNearbyProviders(
                    request.categoryId(),
                    request.latitude(),
                    request.longitude(),
                    maxDistance
            );
            
            // Aplicar paginación manual ya que la consulta nativa no soporta Pageable
            int start = page * size;
            int end = Math.min(start + size, results.size());
            
            List<ProviderResponse> providers = new ArrayList<>();
            for (int i = start; i < end; i++) {
                Object[] row = results.get(i);
                providers.add(mapToProviderResponse(row));
            }
            
            // Calcular metadatos de paginación
            int totalElements = results.size();
            int totalPages = (int) Math.ceil((double) totalElements / size);
            boolean hasNext = page < totalPages - 1;
            boolean hasPrevious = page > 0;
            
            return new PagedResponse<>(
                    providers,
                    page,
                    size,
                    totalElements,
                    totalPages,
                    hasNext,
                    hasPrevious
            );
            
        } catch (Exception e) {
            log.error("Error searching providers", e);
            throw new RuntimeException("Failed to search providers: " + e.getMessage());
        }
    }
    
    public List<ProviderResponse> getAllProviders() {
        List<Profile> providers = profileRepository.findByIsProviderTrueAndIsActiveTrue();
        return providers.stream()
                .map(this::toProviderResponse)
                .toList();
    }
    
    public PagedResponse<ProviderResponse> getProvidersByCategory(Integer categoryId, int page, int size) {
        Pageable pageable = PageRequest.of(page, size);
        Page<Profile> profilePage = profileRepository.findProvidersByCategoryId(categoryId, pageable);
        
        List<ProviderResponse> providers = profilePage.getContent().stream()
                .map(this::toProviderResponse)
                .toList();
        
        return new PagedResponse<>(
                providers,
                page,
                size,
                profilePage.getTotalElements(),
                profilePage.getTotalPages(),
                profilePage.hasNext(),
                profilePage.hasPrevious()
        );
    }
    
    private ProfileDto toProfileDto(Profile profile) {
        return new ProfileDto(
                profile.getId(),
                profile.getFullName(),
                profile.getUsername(),
                profile.getEmail(),
                profile.getPhone(),
                profile.getIsProvider(),
                profile.getCategories(),
                convertToLocationDto(profile.getLocation()),
                profile.getIsActive(),
                profile.getCreatedAt(),
                profile.getUpdatedAt()
        );
    }
    
    private ProviderResponse toProviderResponse(Profile profile) {
        return new ProviderResponse(
                profile.getId(),
                profile.getFullName(),
                profile.getUsername(),
                profile.getEmail(),
                profile.getPhone(),
                profile.getCategories(),
                convertToLocationDto(profile.getLocation()),
                null, // distanceKm will be null for non-distance-based queries
                profile.getIsActive()
        );
    }
    
    private ProviderResponse mapToProviderResponse(Object[] row) {
        // Mapear resultado de consulta nativa a ProviderResponse
        // SELECT DISTINCT p.*, distance_km FROM profiles p
        // Columnas: id, full_name, username, email, password, phone, is_provider, is_active, created_at, updated_at, location, distance_km

        UUID id = row[0] instanceof UUID ? (UUID) row[0] : UUID.fromString(row[0].toString());
        String fullName = (String) row[1];
        String username = (String) row[2];
        String email = (String) row[3];
        // row[4] es password - no lo usamos
        String phone = (String) row[5];
        // row[6] es is_provider
        // row[7] es is_active
        // row[8] es created_at
        // row[9] es updated_at

        // row[10] es location - PostgreSQL lo devuelve como String JSON o PGobject
        LocationDto locationDto = null;
        if (row[10] != null) {
            String locationJson = row[10].toString(); // Convertir a String sin importar el tipo
            locationDto = convertJsonToLocationDto(locationJson);
        }

        Double distanceKm = row.length > 11 && row[11] != null ? ((Number) row[11]).doubleValue() : null;

        return new ProviderResponse(
                id,
                fullName,
                username,
                email,
                phone,
                null, // categories - requeriría otra query o JOIN adicional
                locationDto,
                distanceKm,
                true // isActive - todos los resultados son activos por la query
        );
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
    
    private LocationDto convertJsonToLocationDto(String json) {
        if (json == null || json.trim().isEmpty()) return null;

        try {
            // Limpiar el JSON si viene en formato PostgreSQL no estándar
            String cleanJson = json.trim();

            // Si el JSON no empieza con '{', puede venir mal formateado
            if (!cleanJson.startsWith("{")) {
                log.warn("Location JSON doesn't start with '{{': {}", cleanJson);
                return null;
            }

            LocationDto locationDto = objectMapper.readValue(cleanJson, LocationDto.class);
            return locationDto;
        } catch (JsonProcessingException e) {
            log.error("Error converting JSON to location. JSON string: {}", json, e);
            return null;
        }
    }
}
