package com.ajustadoati.core.entity;

import com.ajustadoati.core.dto.Location;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(name = "requests")
@EntityListeners(AuditingEntityListener.class)
@JsonIgnoreProperties(ignoreUnknown = true)
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Request {
    
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;
    
    @Column(name = "user_id", nullable = false)
    private UUID userId;
    
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", insertable = false, updatable = false)
    private Profile user;
    
    @Column(name = "category_id", nullable = false)
    private Integer categoryId;
    
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "category_id", insertable = false, updatable = false)
    private Category category;
    
    @Column(nullable = false, length = 1000)
    private String description;
    
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(nullable = false)
    private Location location;
    
    @Column(name = "max_distance_km")
    private BigDecimal maxDistanceKm;
    
    @Column(name = "budget_min")
    private BigDecimal budgetMin;
    
    @Column(name = "budget_max")
    private BigDecimal budgetMax;
    
    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    @Builder.Default
    private RequestStatus status = RequestStatus.ACTIVE;
    
    @Column(name = "expires_at")
    private LocalDateTime expiresAt;
    
    @Column(name = "created_at", nullable = false, updatable = false)
    @CreatedDate
    private LocalDateTime createdAt;
    
    public enum RequestStatus {
        ACTIVE, EXPIRED, CANCELLED, COMPLETED
    }
}