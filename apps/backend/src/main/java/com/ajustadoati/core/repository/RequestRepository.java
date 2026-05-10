package com.ajustadoati.core.repository;

import com.ajustadoati.core.entity.Request;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

@Repository
public interface RequestRepository extends JpaRepository<Request, UUID> {
    
    List<Request> findByUserIdOrderByCreatedAtDesc(UUID userId);
    
    Page<Request> findByUserIdOrderByCreatedAtDesc(UUID userId, Pageable pageable);
    
    List<Request> findByStatus(Request.RequestStatus status);
    
    List<Request> findByStatusOrderByCreatedAtDesc(Request.RequestStatus status);
    
    Page<Request> findByStatusOrderByCreatedAtDesc(Request.RequestStatus status, Pageable pageable);
    
    List<Request> findByCategoryIdAndStatus(Integer categoryId, Request.RequestStatus status);
    
    @Query("SELECT r FROM Request r WHERE r.status = :status AND (r.expiresAt IS NULL OR r.expiresAt > :currentTime)")
    List<Request> findActiveRequests(@Param("status") Request.RequestStatus status, @Param("currentTime") LocalDateTime currentTime);
    
    @Query("SELECT r FROM Request r WHERE r.categoryId = :categoryId AND r.status = :status AND (r.expiresAt IS NULL OR r.expiresAt > :currentTime)")
    List<Request> findActiveRequestsByCategory(@Param("categoryId") Integer categoryId, @Param("status") Request.RequestStatus status, @Param("currentTime") LocalDateTime currentTime);
    
    @Query("SELECT COUNT(r) FROM Request r WHERE r.userId = :userId AND r.createdAt > :since")
    Long countRecentRequestsByUser(@Param("userId") UUID userId, @Param("since") LocalDateTime since);
}