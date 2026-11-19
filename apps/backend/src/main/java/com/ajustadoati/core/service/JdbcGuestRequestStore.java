package com.ajustadoati.core.service;

import com.ajustadoati.core.dto.CommonDto.GuestRequestDto;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
@RequiredArgsConstructor
public class JdbcGuestRequestStore implements GuestRequestStore {
    private final JdbcTemplate jdbc;
    private final ObjectMapper mapper;

    @Override
    public List<StoredRequest> loadAll() {
        return jdbc.query(
                "SELECT payload::text, demo, demo_provider_email FROM guest_request_sessions",
                (rs, row) -> {
                    try {
                        return new StoredRequest(
                                mapper.readValue(rs.getString(1), GuestRequestDto.class),
                                rs.getBoolean(2), rs.getString(3));
                    } catch (JsonProcessingException exception) {
                        throw new IllegalStateException("Invalid saved guest request", exception);
                    }
                });
    }

    @Override
    public void save(StoredRequest entry) {
        GuestRequestDto request = entry.request();
        try {
            jdbc.update("""
                    INSERT INTO guest_request_sessions
                        (id, status, category_id, created_at, updated_at, demo, demo_provider_email, payload)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?::jsonb)
                    ON CONFLICT (id) DO UPDATE SET
                        status = EXCLUDED.status,
                        updated_at = EXCLUDED.updated_at,
                        payload = EXCLUDED.payload
                    """,
                    request.id(), request.status(), request.categoryId(), request.createdAt(),
                    request.updatedAt(), entry.demo(), entry.demoProviderEmail(),
                    mapper.writeValueAsString(request));
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Could not serialize guest request", exception);
        }
    }
}
