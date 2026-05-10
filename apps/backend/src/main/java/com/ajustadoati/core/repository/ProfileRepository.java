package com.ajustadoati.core.repository;

import com.ajustadoati.core.entity.Profile;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface ProfileRepository extends JpaRepository<Profile, UUID> {
    
    Optional<Profile> findByEmail(String email);

    Optional<Profile> findByUsername(String username);

    Optional<Profile> findByUsernameOrEmail(String username, String email);

    @Query("SELECT p FROM Profile p LEFT JOIN FETCH p.categories WHERE p.email = :email")
    Optional<Profile> findByEmailWithCategories(@Param("email") String email);

    @Query("SELECT p FROM Profile p LEFT JOIN FETCH p.categories WHERE p.username = :username OR p.email = :email")
    Optional<Profile> findByUsernameOrEmailWithCategories(@Param("username") String username, @Param("email") String email);

    boolean existsByEmail(String email);
    
    boolean existsByUsername(String username);
    
    List<Profile> findByIsProviderTrueAndIsActiveTrue();
    
    Page<Profile> findByIsProviderTrueAndIsActiveTrue(Pageable pageable);
    
    @Query("SELECT p FROM Profile p WHERE p.isProvider = true AND p.isActive = true AND :categoryId MEMBER OF p.categories")
    List<Profile> findProvidersByCategoryId(@Param("categoryId") Integer categoryId);
    
    @Query("SELECT p FROM Profile p WHERE p.isProvider = true AND p.isActive = true AND :categoryId MEMBER OF p.categories")
    Page<Profile> findProvidersByCategoryId(@Param("categoryId") Integer categoryId, Pageable pageable);
    
    @Query(value = """
        SELECT DISTINCT p.id,
               p.full_name,
               p.username,
               p.email,
               p.password,
               p.phone,
               p.is_provider,
               p.is_active,
               p.created_at,
               p.updated_at,
               p.location::text AS location,
               (6371 * acos(cos(radians(:latitude)) * cos(radians(CAST(p.location->>'latitude' AS DOUBLE PRECISION)))
                         * cos(radians(CAST(p.location->>'longitude' AS DOUBLE PRECISION)) - radians(:longitude))
                         + sin(radians(:latitude)) * sin(radians(CAST(p.location->>'latitude' AS DOUBLE PRECISION))))) AS distance_km
        FROM profiles p
        INNER JOIN profile_categories pc ON p.id = pc.profile_id
        WHERE p.is_provider = true
          AND p.is_active = true
          AND pc.category_id = :categoryId
          AND p.location IS NOT NULL
          AND (6371 * acos(cos(radians(:latitude)) * cos(radians(CAST(p.location->>'latitude' AS DOUBLE PRECISION)))
                         * cos(radians(CAST(p.location->>'longitude' AS DOUBLE PRECISION)) - radians(:longitude))
                         + sin(radians(:latitude)) * sin(radians(CAST(p.location->>'latitude' AS DOUBLE PRECISION))))) <= :maxDistanceKm
        ORDER BY distance_km
        """, nativeQuery = true)
    List<Object[]> findNearbyProviders(
        @Param("categoryId") Integer categoryId,
        @Param("latitude") Double latitude,
        @Param("longitude") Double longitude,
        @Param("maxDistanceKm") Double maxDistanceKm
    );
    
    @Query(value = """
        SELECT COUNT(DISTINCT p.id)
        FROM profiles p
        INNER JOIN profile_categories pc ON p.id = pc.profile_id
        WHERE p.is_provider = true
          AND p.is_active = true
          AND pc.category_id = :categoryId
          AND p.location IS NOT NULL
          AND (6371 * acos(cos(radians(:latitude)) * cos(radians(CAST(p.location->>'latitude' AS DOUBLE PRECISION)))
                         * cos(radians(CAST(p.location->>'longitude' AS DOUBLE PRECISION)) - radians(:longitude))
                         + sin(radians(:latitude)) * sin(radians(CAST(p.location->>'latitude' AS DOUBLE PRECISION))))) <= :maxDistanceKm
        """, nativeQuery = true)
    Long countNearbyProviders(
        @Param("categoryId") Integer categoryId,
        @Param("latitude") Double latitude,
        @Param("longitude") Double longitude,
        @Param("maxDistanceKm") Double maxDistanceKm
    );
}