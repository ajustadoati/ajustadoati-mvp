-- ================================
-- AjustadoAti Core Database Schema
-- Supabase PostgreSQL Setup
-- ================================

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ================================
-- 1. Categories Table
-- ================================
CREATE TABLE IF NOT EXISTS categories (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    icon_url TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    display_order INTEGER,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for categories
CREATE INDEX IF NOT EXISTS idx_categories_active ON categories (is_active, display_order);
CREATE INDEX IF NOT EXISTS idx_categories_name ON categories USING GIN (name gin_trgm_ops);

-- ================================
-- 2. Profiles Table
-- ================================
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    full_name VARCHAR(100) NOT NULL,
    username VARCHAR(30) NOT NULL UNIQUE,
    email VARCHAR(255) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    phone VARCHAR(20),
    is_provider BOOLEAN NOT NULL DEFAULT false,
    location JSONB,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT valid_email CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'),
    CONSTRAINT valid_username CHECK (username ~* '^[a-zA-Z0-9_]{3,30}$')
);

-- Create indexes for profiles
CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles (email);
CREATE INDEX IF NOT EXISTS idx_profiles_username ON profiles (username);
CREATE INDEX IF NOT EXISTS idx_profiles_provider ON profiles (is_provider, is_active);
CREATE INDEX IF NOT EXISTS idx_profiles_location ON profiles USING GIN (location);

-- ================================
-- 3. Profile Categories Junction Table
-- ================================
CREATE TABLE IF NOT EXISTS profile_categories (
    profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    
    PRIMARY KEY (profile_id, category_id)
);

-- Create indexes for profile categories
CREATE INDEX IF NOT EXISTS idx_profile_categories_profile ON profile_categories (profile_id);
CREATE INDEX IF NOT EXISTS idx_profile_categories_category ON profile_categories (category_id);

-- ================================
-- 4. Requests Table
-- ================================
CREATE TABLE IF NOT EXISTS requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
    description TEXT NOT NULL,
    location JSONB NOT NULL,
    max_distance_km DECIMAL(5,2),
    budget_min DECIMAL(10,2),
    budget_max DECIMAL(10,2),
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT valid_status CHECK (status IN ('ACTIVE', 'EXPIRED', 'CANCELLED', 'COMPLETED')),
    CONSTRAINT valid_distance CHECK (max_distance_km IS NULL OR max_distance_km > 0),
    CONSTRAINT valid_budget CHECK (
        (budget_min IS NULL AND budget_max IS NULL) OR
        (budget_min IS NOT NULL AND budget_max IS NOT NULL AND budget_max >= budget_min)
    )
);

-- Create indexes for requests
CREATE INDEX IF NOT EXISTS idx_requests_user ON requests (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_requests_category ON requests (category_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_requests_status ON requests (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_requests_location ON requests USING GIN (location);
CREATE INDEX IF NOT EXISTS idx_requests_expires ON requests (expires_at) WHERE expires_at IS NOT NULL;

-- ================================
-- Functions and Triggers
-- ================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for updated_at
CREATE TRIGGER update_profiles_updated_at 
    BEFORE UPDATE ON profiles 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_categories_updated_at 
    BEFORE UPDATE ON categories 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to calculate distance between two points
CREATE OR REPLACE FUNCTION calculate_distance(
    lat1 DOUBLE PRECISION,
    lon1 DOUBLE PRECISION,
    lat2 DOUBLE PRECISION,
    lon2 DOUBLE PRECISION
) RETURNS DOUBLE PRECISION AS $$
BEGIN
    -- Haversine formula to calculate distance in kilometers
    RETURN (
        6371 * acos(
            cos(radians(lat1)) * cos(radians(lat2)) * 
            cos(radians(lon2) - radians(lon1)) + 
            sin(radians(lat1)) * sin(radians(lat2))
        )
    );
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ================================
-- Row Level Security (RLS)
-- ================================

-- Enable RLS on profiles table
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Policy: Users can read their own profile and public provider profiles
CREATE POLICY "Users can view own profile and providers" ON profiles
    FOR SELECT USING (
        auth.uid() = id OR 
        (is_provider = true AND is_active = true)
    );

-- Policy: Users can update only their own profile
CREATE POLICY "Users can update own profile" ON profiles
    FOR UPDATE USING (auth.uid() = id);

-- Policy: Users can insert their own profile
CREATE POLICY "Users can insert own profile" ON profiles
    FOR INSERT WITH CHECK (auth.uid() = id);

-- Enable RLS on requests table
ALTER TABLE requests ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own requests
CREATE POLICY "Users can view own requests" ON requests
    FOR SELECT USING (auth.uid() = user_id);

-- Policy: Users can create requests
CREATE POLICY "Users can create requests" ON requests
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own requests
CREATE POLICY "Users can update own requests" ON requests
    FOR UPDATE USING (auth.uid() = user_id);

-- ================================
-- Initial Data
-- ================================

-- Insert default categories
INSERT INTO categories (name, description, display_order) VALUES
('Plomería', 'Servicios de instalación y reparación de tuberías, grifos y sistemas de agua', 1),
('Electricidad', 'Instalación y reparación de sistemas eléctricos, cableado y equipos', 2),
('Carpintería', 'Trabajos en madera, muebles, puertas, ventanas y estructuras', 3),
('Pintura', 'Servicios de pintura interior y exterior, acabados y decoración', 4),
('Jardinería', 'Mantenimiento de jardines, poda, paisajismo y cuidado de plantas', 5),
('Limpieza', 'Servicios de limpieza doméstica y comercial', 6),
('Reparación de Electrodomésticos', 'Reparación y mantenimiento de electrodomésticos', 7),
('Construcción', 'Servicios de construcción, remodelación y obra civil', 8),
('Tecnología', 'Soporte técnico, reparación de computadoras y dispositivos', 9),
('Transporte', 'Servicios de mudanza, transporte de mercancías y logística', 10)
ON CONFLICT (name) DO NOTHING;

COMMENT ON TABLE profiles IS 'Extended user profiles with location and provider information';
COMMENT ON TABLE categories IS 'Service categories available in the platform';
COMMENT ON TABLE profile_categories IS 'Many-to-many relationship between profiles and categories';
COMMENT ON TABLE requests IS 'Service requests made by users';

-- Grant necessary permissions to authenticated users
GRANT SELECT, INSERT, UPDATE ON profiles TO authenticated;
GRANT SELECT ON categories TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE ON requests TO authenticated;
GRANT SELECT, INSERT, DELETE ON profile_categories TO authenticated;