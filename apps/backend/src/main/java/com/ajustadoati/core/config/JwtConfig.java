package com.ajustadoati.core.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;

@Configuration
public class JwtConfig {
    
    @Value("${spring.security.jwt.secret}")
    private String jwtSecret;
    
    @Value("${spring.security.jwt.expiration}")
    private Long jwtExpirationInMs;
    
    public String getJwtSecret() {
        return jwtSecret;
    }
    
    public Long getJwtExpirationInMs() {
        return jwtExpirationInMs;
    }
}