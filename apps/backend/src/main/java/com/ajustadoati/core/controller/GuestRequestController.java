package com.ajustadoati.core.controller;

import com.ajustadoati.core.dto.CommonDto.ApiResponse;
import com.ajustadoati.core.dto.CommonDto.GuestRequestCreateRequest;
import com.ajustadoati.core.dto.CommonDto.GuestRequestDto;
import com.ajustadoati.core.dto.CommonDto.GuestRequestResponseDto;
import com.ajustadoati.core.service.GuestRequestService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/guest-requests")
@RequiredArgsConstructor
@Slf4j
public class GuestRequestController {

    private final GuestRequestService guestRequestService;

    @PostMapping
    public ResponseEntity<ApiResponse<GuestRequestDto>> createGuestRequest(@Valid @RequestBody GuestRequestCreateRequest request) {
        try {
            GuestRequestDto createdRequest = guestRequestService.createRequest(request);
            return ResponseEntity.status(HttpStatus.CREATED)
                    .body(ApiResponse.success("Guest request created successfully", createdRequest));
        } catch (Exception e) {
            log.error("Error creating guest request", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(ApiResponse.error("Failed to create guest request: " + e.getMessage()));
        }
    }

    @GetMapping("/{requestId}")
    public ResponseEntity<ApiResponse<GuestRequestDto>> getGuestRequest(@PathVariable UUID requestId) {
        try {
            return ResponseEntity.ok(ApiResponse.success(guestRequestService.getRequest(requestId)));
        } catch (Exception e) {
            log.error("Error retrieving guest request {}", requestId, e);
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(ApiResponse.error(e.getMessage()));
        }
    }

    @GetMapping("/{requestId}/responses")
    public ResponseEntity<ApiResponse<List<GuestRequestResponseDto>>> getGuestRequestResponses(@PathVariable UUID requestId) {
        try {
            return ResponseEntity.ok(ApiResponse.success(guestRequestService.getResponses(requestId)));
        } catch (Exception e) {
            log.error("Error retrieving guest request responses {}", requestId, e);
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(ApiResponse.error(e.getMessage()));
        }
    }
}
