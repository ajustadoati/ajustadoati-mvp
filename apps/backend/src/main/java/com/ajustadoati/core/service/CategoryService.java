package com.ajustadoati.core.service;

import com.ajustadoati.core.dto.CommonDto.CategoryCreateRequest;
import com.ajustadoati.core.dto.CommonDto.CategoryDto;
import com.ajustadoati.core.entity.Category;
import com.ajustadoati.core.repository.CategoryRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
@RequiredArgsConstructor
@Slf4j
public class CategoryService {
    
    private final CategoryRepository categoryRepository;
    
    public List<CategoryDto> getAllCategories() {
        List<Category> categories = categoryRepository.findByIsActiveTrueOrderByDisplayOrderAscNameAsc();
        return categories.stream()
                .map(this::toCategoryDto)
                .toList();
    }
    
    public List<CategoryDto> getAllCategoriesIncludingInactive() {
        List<Category> categories = categoryRepository.findAllByOrderByDisplayOrderAscNameAsc();
        return categories.stream()
                .map(this::toCategoryDto)
                .toList();
    }
    
    public CategoryDto getCategoryById(Integer id) {
        Category category = categoryRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Category not found with id: " + id));
        return toCategoryDto(category);
    }
    
    @Transactional
    public CategoryDto createCategory(CategoryCreateRequest request) {
        log.info("Creating new category: {}", request.name());
        
        if (categoryRepository.existsByNameIgnoreCase(request.name())) {
            throw new RuntimeException("Category already exists with name: " + request.name());
        }
        
        Category category = Category.builder()
                .name(request.name())
                .description(request.description())
                .iconUrl(request.iconUrl())
                .displayOrder(request.displayOrder())
                .build();
        
        Category saved = categoryRepository.save(category);
        log.info("Category created successfully with id: {}", saved.getId());
        
        return toCategoryDto(saved);
    }
    
    @Transactional
    public CategoryDto updateCategory(Integer id, CategoryCreateRequest request) {
        log.info("Updating category with id: {}", id);
        
        Category category = categoryRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Category not found with id: " + id));
        
        // Verificar si el nombre ya existe en otra categoría
        if (!category.getName().equalsIgnoreCase(request.name()) &&
            categoryRepository.existsByNameIgnoreCase(request.name())) {
            throw new RuntimeException("Category already exists with name: " + request.name());
        }
        
        if (request.name() != null) {
            category.setName(request.name());
        }
        if (request.description() != null) {
            category.setDescription(request.description());
        }
        if (request.iconUrl() != null) {
            category.setIconUrl(request.iconUrl());
        }
        if (request.displayOrder() != null) {
            category.setDisplayOrder(request.displayOrder());
        }
        
        Category saved = categoryRepository.save(category);
        log.info("Category updated successfully");
        
        return toCategoryDto(saved);
    }
    
    @Transactional
    public void deleteCategory(Integer id) {
        log.info("Deleting category with id: {}", id);
        
        Category category = categoryRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Category not found with id: " + id));
        
        // Soft delete - marcar como inactiva en lugar de eliminar
        category.setIsActive(false);
        categoryRepository.save(category);
        
        log.info("Category deactivated successfully");
    }
    
    @Transactional
    public void activateCategory(Integer id) {
        log.info("Activating category with id: {}", id);
        
        Category category = categoryRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Category not found with id: " + id));
        
        category.setIsActive(true);
        categoryRepository.save(category);
        
        log.info("Category activated successfully");
    }
    
    private CategoryDto toCategoryDto(Category category) {
        return new CategoryDto(
                category.getId(),
                category.getName(),
                category.getDescription(),
                category.getIconUrl(),
                category.getIsActive(),
                category.getDisplayOrder(),
                category.getCreatedAt(),
                category.getUpdatedAt()
        );
    }
}