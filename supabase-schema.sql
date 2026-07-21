-- 1. Create subscriptions table
CREATE TABLE IF NOT EXISTS public.subscriptions (
    wallet_address text PRIMARY KEY,
    tier text NOT NULL DEFAULT 'Lite',
    active boolean NOT NULL DEFAULT false,
    trial_start timestamp with time zone,
    expires_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable Row Level Security (RLS) on subscriptions
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

-- Allow read-only access for authenticated/anon clients
CREATE POLICY "Allow public read access to subscriptions" 
ON public.subscriptions FOR SELECT 
TO public 
USING (true);

-- Allow full access for backend (service_role)
CREATE POLICY "Allow service role full access to subscriptions" 
ON public.subscriptions FOR ALL 
TO service_role 
USING (true);


-- 2. Create tracked_addresses table
CREATE TABLE IF NOT EXISTS public.tracked_addresses (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_wallet text NOT NULL,
    target_address text NOT NULL,
    blockchain text NOT NULL DEFAULT 'Ritual Testnet',
    alias text NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable Row Level Security (RLS) on tracked_addresses
ALTER TABLE public.tracked_addresses ENABLE ROW LEVEL SECURITY;

-- Allow public read access to tracked addresses
CREATE POLICY "Allow public select on tracked_addresses" 
ON public.tracked_addresses FOR SELECT 
TO public 
USING (true);

-- Allow public insert on tracked addresses
CREATE POLICY "Allow public insert on tracked_addresses" 
ON public.tracked_addresses FOR INSERT 
TO public 
WITH CHECK (true);

-- Allow public delete on tracked addresses
CREATE POLICY "Allow public delete on tracked_addresses" 
ON public.tracked_addresses FOR DELETE 
TO public 
USING (true);

-- Allow full access for service role
CREATE POLICY "Allow service_role full access to tracked_addresses" 
ON public.tracked_addresses FOR ALL 
TO service_role 
USING (true);


-- 3. Create social_connections table
CREATE TABLE IF NOT EXISTS public.social_connections (
    wallet_address text PRIMARY KEY,
    twitter_handle text,
    telegram_username text,
    discord_webhook text,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable Row Level Security (RLS) on social_connections
ALTER TABLE public.social_connections ENABLE ROW LEVEL SECURITY;

-- Allow public read access to social connections
CREATE POLICY "Allow public select on social_connections" 
ON public.social_connections FOR SELECT 
TO public 
USING (true);

-- Allow public insert/update (upsert)
CREATE POLICY "Allow public upsert on social_connections" 
ON public.social_connections FOR ALL 
TO public 
USING (true);

-- Allow service_role full access
CREATE POLICY "Allow service_role full access to social_connections" 
ON public.social_connections FOR ALL 
TO service_role 
USING (true);
