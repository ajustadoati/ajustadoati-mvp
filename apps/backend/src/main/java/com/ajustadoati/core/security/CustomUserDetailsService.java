package com.ajustadoati.core.security;

import com.ajustadoati.core.entity.Profile;
import com.ajustadoati.core.repository.ProfileRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.userdetails.User;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;

@Service
@RequiredArgsConstructor
public class CustomUserDetailsService implements UserDetailsService {
    
    private final ProfileRepository profileRepository;
    
    @Override
    public UserDetails loadUserByUsername(String username) throws UsernameNotFoundException {
        Profile profile = profileRepository.findByUsernameOrEmail(username, username)
                .orElseThrow(() -> new UsernameNotFoundException("User not found with username or email: " + username));
        
        List<GrantedAuthority> authorities = new ArrayList<>();
        
        // Agregar roles básicos
        authorities.add(new SimpleGrantedAuthority("ROLE_USER"));
        
        if (profile.getIsProvider()) {
            authorities.add(new SimpleGrantedAuthority("ROLE_PROVIDER"));
        }
        
        return User.builder()
                .username(profile.getUsername())
                .password("") // No necesitamos password para JWT
                .authorities(authorities)
                .accountExpired(false)
                .accountLocked(false)
                .credentialsExpired(false)
                .disabled(!profile.getIsActive())
                .build();
    }
}