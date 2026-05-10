package com.ajustadoati.core.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Location {
    
    @JsonProperty("latitude")
    private BigDecimal latitude;
    
    @JsonProperty("longitude")
    private BigDecimal longitude;
    
    @JsonProperty("address")
    private String address;
}