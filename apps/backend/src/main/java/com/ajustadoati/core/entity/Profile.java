package com.ajustadoati.core.entity;

import com.ajustadoati.core.dto.Location;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

@Entity
@Table(name = "profiles")
@EntityListeners(AuditingEntityListener.class)
@JsonIgnoreProperties(ignoreUnknown = true)
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
@ToString(exclude = {"categories"})
public class Profile {
    
    @Id
    private UUID id;
    
    @Column(name = "full_name", nullable = false)
    private String fullName;
    
    @Column(nullable = false, unique = true)
    private String username;
    
    @Column(nullable = false, unique = true)
    private String email;
    
    @Column(nullable = false)
    private String password;
    
    @Column
    private String phone;
    
    @Column(name = "is_provider", nullable = false)
    @Builder.Default
    private Boolean isProvider = false;
    
    @ElementCollection
    @CollectionTable(name = "profile_categories", joinColumns = @JoinColumn(name = "profile_id"))
    @Column(name = "category_id")
    private List<Integer> categories;
    
    @JdbcTypeCode(SqlTypes.JSON)
    private Location location;
    
    
    @Column(name = "is_active")
    @Builder.Default
    private Boolean isActive = true;
    
    @Column(name = "created_at", nullable = false, updatable = false)
    @CreatedDate
    private LocalDateTime createdAt;
    
    @Column(name = "updated_at")
    @LastModifiedDate
    private LocalDateTime updatedAt;
}