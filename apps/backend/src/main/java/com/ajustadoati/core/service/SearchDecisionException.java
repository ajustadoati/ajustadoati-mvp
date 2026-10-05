package com.ajustadoati.core.service;

import org.springframework.http.HttpStatus;

public class SearchDecisionException extends RuntimeException {
    private final String code;
    private final HttpStatus status;

    public SearchDecisionException(String code, HttpStatus status, String message) {
        super(message);
        this.code = code;
        this.status = status;
    }

    public String getCode() { return code; }
    public HttpStatus getStatus() { return status; }

    public static SearchDecisionException unavailable() {
        return new SearchDecisionException("CLASSIFICATION_UNAVAILABLE", HttpStatus.SERVICE_UNAVAILABLE,
                "No pudimos interpretar tu solicitud en este momento. Conservamos tu texto; intenta de nuevo.");
    }
}
