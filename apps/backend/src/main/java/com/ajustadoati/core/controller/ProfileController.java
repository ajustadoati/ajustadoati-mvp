package com.ajustadoati.core.controller;

import com.ajustadoati.core.dto.CommonDto.ApiResponse;
import com.ajustadoati.core.dto.CommonDto.ProfileDto;
import com.ajustadoati.core.dto.CommonDto.ProfileUpdateRequest;
import com.ajustadoati.core.service.ProfileService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/profiles")
@RequiredArgsConstructor
@Slf4j
@Tag(name = "Profiles", description = "Authenticated user profile endpoints")
public class ProfileController {

    private final ProfileService profileService;

    @GetMapping("/me")
    @Operation(summary = "Get current profile", description = "Retrieve the authenticated user's full profile")
    public ResponseEntity<ApiResponse<ProfileDto>> getCurrentProfile(Authentication authentication) {
        try {
            ProfileDto profile = profileService.getProfileByUsername(authentication.getName());
            return ResponseEntity.ok(ApiResponse.success("Profile retrieved successfully", profile));
        } catch (Exception e) {
            log.error("Error retrieving current profile", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(ApiResponse.error("Failed to retrieve profile: " + e.getMessage()));
        }
    }

    @PutMapping("/me")
    @Operation(summary = "Update current profile", description = "Update the authenticated user's editable profile fields")
    public ResponseEntity<ApiResponse<ProfileDto>> updateCurrentProfile(
            Authentication authentication,
            @Valid @RequestBody ProfileUpdateRequest request) {
        try {
            ProfileDto profile = profileService.updateProfileByUsername(authentication.getName(), request);
            return ResponseEntity.ok(ApiResponse.success("Profile updated successfully", profile));
        } catch (Exception e) {
            log.error("Error updating current profile", e);
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .body(ApiResponse.error("Failed to update profile: " + e.getMessage()));
        }
    }
}
