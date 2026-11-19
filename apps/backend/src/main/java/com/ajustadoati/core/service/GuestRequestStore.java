package com.ajustadoati.core.service;

import com.ajustadoati.core.dto.CommonDto.GuestRequestDto;

import java.util.List;

public interface GuestRequestStore {
    record StoredRequest(GuestRequestDto request, boolean demo, String demoProviderEmail) {}

    List<StoredRequest> loadAll();

    void save(StoredRequest request);
}
