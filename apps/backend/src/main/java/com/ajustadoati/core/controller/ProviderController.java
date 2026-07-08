package com.ajustadoati.core.controller;

import com.ajustadoati.core.dto.CommonDto.*;
import com.ajustadoati.core.entity.Profile;
import com.ajustadoati.core.repository.ProfileRepository;
import com.ajustadoati.core.service.GuestRequestService;
import com.ajustadoati.core.service.ProfileService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Optional;

@RestController
@RequestMapping("/providers")
@RequiredArgsConstructor
@Slf4j
@Tag(name = "Providers", description = "Service provider search and discovery endpoints")
public class ProviderController {
    
    private final ProfileService profileService;
    private final GuestRequestService guestRequestService;
    private final ProfileRepository profileRepository;
    
    /**
     * Returns the guest-request backlog the current provider still needs to
     * see: matches by category and location, not expired, not already
     * answered by this provider. Called when the provider opens the app
     * from a push notification so their dashboard is not empty.
     */
    @GetMapping("/pending-requests")
    public ResponseEntity<ApiResponse<List<GuestRequestDto>>> getPendingRequests(Authentication authentication) {
        if (authentication == null || authentication.getName() == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(ApiResponse.error("No autenticado"));
        }
        Optional<Profile> profileOpt = profileRepository.findByUsernameOrEmailWithCategories(
                authentication.getName(), authentication.getName());
        if (profileOpt.isEmpty()) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(ApiResponse.error("Perfil no encontrado"));
        }
        Profile profile = profileOpt.get();
        Double lat = profile.getLocation() != null && profile.getLocation().getLatitude() != null
                ? profile.getLocation().getLatitude().doubleValue() : null;
        Double lng = profile.getLocation() != null && profile.getLocation().getLongitude() != null
                ? profile.getLocation().getLongitude().doubleValue() : null;

        List<GuestRequestDto> pending = guestRequestService.getPendingForProvider(
                profile.getCategories(), profile.getEmail(), lat, lng);
        return ResponseEntity.ok(ApiResponse.success(pending));
    }

    @GetMapping("/search")
    @Operation(summary = "Search nearby providers", description = "Find service providers by category and location with distance filtering")
    @ApiResponses(value = {
        @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Providers found successfully"),
        @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "Invalid search parameters")
    })
    public ResponseEntity<ApiResponse<PagedResponse<ProviderResponse>>> searchProviders(@Valid @ModelAttribute ProviderSearchRequest request) {
        try {
            log.info("Provider search request: categoryId={}, lat={}, lng={}, maxDistance={}", 
                    request.categoryId(), request.latitude(), request.longitude(), request.maxDistanceKm());
            
            PagedResponse<ProviderResponse> providers = profileService.searchProviders(request);
            return ResponseEntity.ok(ApiResponse.success("Providers retrieved successfully", providers));
            
        } catch (Exception e) {
            log.error("Error searching providers", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(ApiResponse.error("Failed to search providers: " + e.getMessage()));
        }
    }

    @GetMapping("/public-search")
    @Operation(summary = "Public provider search", description = "Find nearby providers without exposing private contact data")
    public ResponseEntity<ApiResponse<PagedResponse<ProviderResponse>>> publicSearchProviders(@Valid @ModelAttribute ProviderSearchRequest request) {
        try {
            log.info("Public provider search request: categoryId={}, lat={}, lng={}, maxDistance={}",
                    request.categoryId(), request.latitude(), request.longitude(), request.maxDistanceKm());

            PagedResponse<ProviderResponse> providers = profileService.searchProviders(request);
            List<ProviderResponse> safeProviders = providers.content().stream()
                    .map(provider -> new ProviderResponse(
                            provider.id(),
                            provider.fullName(),
                            provider.username(),
                            null,
                            null,
                            provider.categories(),
                            provider.location(),
                            provider.distanceKm(),
                            provider.isActive()
                    ))
                    .toList();

            PagedResponse<ProviderResponse> safeResponse = new PagedResponse<>(
                    safeProviders,
                    providers.page(),
                    providers.size(),
                    providers.totalElements(),
                    providers.totalPages(),
                    providers.hasNext(),
                    providers.hasPrevious()
            );

            return ResponseEntity.ok(ApiResponse.success("Public providers retrieved successfully", safeResponse));

        } catch (Exception e) {
            log.error("Error searching public providers", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(ApiResponse.error("Failed to search providers: " + e.getMessage()));
        }
    }
    
    @GetMapping
    @Operation(summary = "Get all providers", description = "Retrieve all active service providers")
    @ApiResponses(value = {
        @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Providers retrieved successfully")
    })
    public ResponseEntity<ApiResponse<List<ProviderResponse>>> getAllProviders() {
        try {
            List<ProviderResponse> providers = profileService.getAllProviders();
            return ResponseEntity.ok(ApiResponse.success("All providers retrieved successfully", providers));
            
        } catch (Exception e) {
            log.error("Error retrieving all providers", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(ApiResponse.error("Failed to retrieve providers"));
        }
    }
    
    @GetMapping("/category/{categoryId}")
    @Operation(summary = "Get providers by category", description = "Retrieve service providers filtered by category with pagination")
    @ApiResponses(value = {
        @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Providers retrieved successfully"),
        @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "Invalid category or pagination parameters")
    })
    public ResponseEntity<ApiResponse<PagedResponse<ProviderResponse>>> getProvidersByCategory(
            @PathVariable Integer categoryId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        
        try {
            log.info("Get providers by category: categoryId={}, page={}, size={}", categoryId, page, size);
            
            // Validar parámetros de paginación
            if (page < 0) {
                return ResponseEntity.badRequest()
                        .body(ApiResponse.error("Page number must be non-negative"));
            }
            if (size < 1 || size > 50) {
                return ResponseEntity.badRequest()
                        .body(ApiResponse.error("Page size must be between 1 and 50"));
            }
            
            PagedResponse<ProviderResponse> providers = profileService.getProvidersByCategory(categoryId, page, size);
            return ResponseEntity.ok(ApiResponse.success("Providers retrieved successfully", providers));
            
        } catch (Exception e) {
            log.error("Error retrieving providers by category: {}", categoryId, e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(ApiResponse.error("Failed to retrieve providers"));
        }
    }
}
