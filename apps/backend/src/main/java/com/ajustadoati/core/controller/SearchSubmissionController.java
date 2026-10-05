package com.ajustadoati.core.controller;

import com.ajustadoati.core.dto.CommonDto.ApiResponse;
import com.ajustadoati.core.dto.SearchSubmission;
import com.ajustadoati.core.repository.ProfileRepository;
import com.ajustadoati.core.service.SearchDecisionException;
import com.ajustadoati.core.service.SearchSubmissionService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/search-requests")
@RequiredArgsConstructor
public class SearchSubmissionController {
    private final SearchSubmissionService submissions;
    private final ProfileRepository profiles;

    @PostMapping
    public ResponseEntity<ApiResponse<SearchSubmission.Result>> submit(
            @Valid @RequestBody SearchSubmission.Request request, Authentication authentication) {
        String email = null;
        if (authentication != null && authentication.isAuthenticated()
                && !"anonymousUser".equals(authentication.getName())) {
            email = profiles.findByUsernameOrEmailWithCategories(authentication.getName(), authentication.getName())
                    .orElseThrow(() -> new SearchDecisionException("PROFILE_NOT_FOUND", HttpStatus.UNAUTHORIZED,
                            "Vuelve a iniciar sesion para continuar.")).getEmail();
        }
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success(submissions.submit(request, email)));
    }

    @ExceptionHandler(SearchDecisionException.class)
    public ResponseEntity<SearchSubmission.Error> decisionError(SearchDecisionException exception) {
        return ResponseEntity.status(exception.getStatus())
                .body(new SearchSubmission.Error(exception.getCode(), exception.getMessage()));
    }
}
