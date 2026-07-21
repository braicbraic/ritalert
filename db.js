const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error("❌ ERROR: Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in .env");
}

// Service role client bypasses RLS for server-side updates
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
        persistSession: false,
        autoRefreshToken: false
    }
});

// --- SUBSCRIPTIONS ---
async function dbGetSubscription(walletAddress) {
    if (!walletAddress) return null;
    const cleanAddress = walletAddress.toLowerCase();
    const { data, error } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('wallet_address', cleanAddress)
        .maybeSingle();

    if (error) {
        console.error("dbGetSubscription error:", error.message);
        return null;
    }
    return data;
}

async function dbActivateTrial(walletAddress) {
    if (!walletAddress) return false;
    const cleanAddress = walletAddress.toLowerCase();
    
    // Check if subscription record already exists
    const existing = await dbGetSubscription(cleanAddress);
    
    const now = new Date();
    const trialExpiry = new Date();
    trialExpiry.setDate(now.getDate() + 7);

    const record = {
        wallet_address: cleanAddress,
        tier: 'Pro', // Provide full Pro access during the trial
        active: true,
        trial_start: now.toISOString(),
        expires_at: trialExpiry.toISOString()
    };

    let result;
    if (existing) {
        // Update
        result = await supabase
            .from('subscriptions')
            .update(record)
            .eq('wallet_address', cleanAddress);
    } else {
        // Insert
        result = await supabase
            .from('subscriptions')
            .insert(record);
    }

    if (result.error) {
        console.error("dbActivateTrial error:", result.error.message);
        return false;
    }
    return true;
}

async function dbSetSubscriptionPaid(walletAddress, tier, durationDays) {
    if (!walletAddress) return false;
    const cleanAddress = walletAddress.toLowerCase();
    
    const existing = await dbGetSubscription(cleanAddress);
    const now = new Date();
    const expiry = new Date();
    expiry.setDate(now.getDate() + durationDays);

    const record = {
        wallet_address: cleanAddress,
        tier: tier || 'Pro',
        active: true,
        expires_at: expiry.toISOString()
    };

    let result;
    if (existing) {
        result = await supabase
            .from('subscriptions')
            .update(record)
            .eq('wallet_address', cleanAddress);
    } else {
        result = await supabase
            .from('subscriptions')
            .insert(record);
    }

    if (result.error) {
        console.error("dbSetSubscriptionPaid error:", result.error.message);
        return false;
    }
    return true;
}

// --- TRACKED ADDRESSES ---
async function dbGetTrackedAddresses(walletAddress) {
    if (!walletAddress) return [];
    const cleanAddress = walletAddress.toLowerCase();
    const { data, error } = await supabase
        .from('tracked_addresses')
        .select('*')
        .eq('user_wallet', cleanAddress)
        .order('created_at', { ascending: false });

    if (error) {
        console.error("dbGetTrackedAddresses error:", error.message);
        return [];
    }
    return data || [];
}

async function dbSaveTrackedAddress(userWallet, targetAddress, blockchain, alias) {
    if (!userWallet || !targetAddress) return null;
    const cleanUserWallet = userWallet.toLowerCase();
    const cleanTargetAddress = targetAddress.toLowerCase();

    const record = {
        user_wallet: cleanUserWallet,
        target_address: cleanTargetAddress,
        blockchain: blockchain || 'Ritual Testnet',
        alias: alias || 'Contract/Wallet'
    };

    const { data, error } = await supabase
        .from('tracked_addresses')
        .insert(record)
        .select()
        .single();

    if (error) {
        console.error("dbSaveTrackedAddress error:", error.message);
        return null;
    }
    return data;
}

async function dbDeleteTrackedAddress(id, userWallet) {
    if (!id || !userWallet) return false;
    const cleanUserWallet = userWallet.toLowerCase();
    const { error } = await supabase
        .from('tracked_addresses')
        .delete()
        .eq('id', id)
        .eq('user_wallet', cleanUserWallet);

    if (error) {
        console.error("dbDeleteTrackedAddress error:", error.message);
        return false;
    }
    return true;
}

// --- SOCIAL CONNECTIONS ---
async function dbGetSocials(walletAddress) {
    if (!walletAddress) return null;
    const cleanAddress = walletAddress.toLowerCase();
    const { data, error } = await supabase
        .from('social_connections')
        .select('*')
        .eq('wallet_address', cleanAddress)
        .maybeSingle();

    if (error) {
        console.error("dbGetSocials error:", error.message);
        return null;
    }
    return data || { wallet_address: cleanAddress, twitter_handle: null, telegram_username: null, discord_webhook: null };
}

async function dbSaveSocials(walletAddress, platform, handleValue) {
    if (!walletAddress || !platform) return false;
    const cleanAddress = walletAddress.toLowerCase();

    // Check if row already exists
    const { data: existing, error: checkError } = await supabase
        .from('social_connections')
        .select('*')
        .eq('wallet_address', cleanAddress)
        .maybeSingle();

    if (checkError) {
        console.error("dbSaveSocials check error:", checkError.message);
        return false;
    }

    const record = existing || { wallet_address: cleanAddress };
    
    if (platform.toLowerCase() === 'twitter') {
        record.twitter_handle = handleValue;
    } else if (platform.toLowerCase() === 'telegram') {
        record.telegram_username = handleValue;
    } else if (platform.toLowerCase() === 'discord') {
        record.discord_webhook = handleValue;
    }
    record.updated_at = new Date().toISOString();

    let result;
    if (existing) {
        result = await supabase
            .from('social_connections')
            .update(record)
            .eq('wallet_address', cleanAddress);
    } else {
        result = await supabase
            .from('social_connections')
            .insert(record);
    }

    if (result.error) {
        console.error("dbSaveSocials error:", result.error.message);
        return false;
    }
    return true;
}

module.exports = {
    dbGetSubscription,
    dbActivateTrial,
    dbSetSubscriptionPaid,
    dbGetTrackedAddresses,
    dbSaveTrackedAddress,
    dbDeleteTrackedAddress,
    dbGetSocials,
    dbSaveSocials
};
