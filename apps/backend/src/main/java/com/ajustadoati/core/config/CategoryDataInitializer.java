package com.ajustadoati.core.config;

import com.ajustadoati.core.entity.Category;
import com.ajustadoati.core.repository.CategoryRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.util.List;

@Configuration
@RequiredArgsConstructor
@Slf4j
public class CategoryDataInitializer {

    private final CategoryRepository categoryRepository;

    @Bean
    ApplicationRunner ensureDefaultCategories() {
        return args -> {
            List<CategorySeed> defaultCategories = List.of(
                    new CategorySeed("Plomería", "Servicios de instalación y reparación de tuberías, grifos y sistemas de agua", 1),
                    new CategorySeed("Electricidad", "Instalación y reparación de sistemas eléctricos, cableado y equipos", 2),
                    new CategorySeed("Carpintería", "Trabajos en madera, muebles, puertas, ventanas y estructuras", 3),
                    new CategorySeed("Pintura", "Servicios de pintura interior y exterior, acabados y decoración", 4),
                    new CategorySeed("Jardinería", "Mantenimiento de jardines, poda, paisajismo y cuidado de plantas", 5),
                    new CategorySeed("Limpieza", "Servicios de limpieza doméstica y comercial", 6),
                    new CategorySeed("Reparación de Electrodomésticos", "Reparación y mantenimiento de electrodomésticos", 7),
                    new CategorySeed("Construcción", "Servicios de construcción, remodelación y obra civil", 8),
                    new CategorySeed("Tecnología", "Soporte técnico, reparación de computadoras y dispositivos", 9),
                    new CategorySeed("Transporte", "Servicios de mudanza, transporte de mercancías y logística", 10),
                    new CategorySeed("Delivery", "Entrega de pedidos, mensajería, encargos y reparto de productos", 11)
            );

            for (CategorySeed seed : defaultCategories) {
                Category category = categoryRepository.findByNameIgnoreCase(seed.name())
                        .orElseGet(() -> Category.builder().name(seed.name()).build());

                category.setDescription(seed.description());
                category.setDisplayOrder(seed.displayOrder());
                category.setIsActive(true);

                categoryRepository.save(category);
            }

            log.info("Default categories verified: {}", defaultCategories.size());
        };
    }

    private record CategorySeed(String name, String description, Integer displayOrder) {}
}
