package com.ajustadoati.core.repository;

import com.ajustadoati.core.entity.Category;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface CategoryRepository extends JpaRepository<Category, Integer> {
    
    List<Category> findByIsActiveTrueOrderByDisplayOrderAscNameAsc();
    
    List<Category> findAllByOrderByDisplayOrderAscNameAsc();
    
    Optional<Category> findByNameIgnoreCase(String name);
    
    boolean existsByNameIgnoreCase(String name);
    
    List<Category> findByIsActiveTrue();
}