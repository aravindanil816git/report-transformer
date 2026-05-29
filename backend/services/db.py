import os
from supabase import create_client, Client
from supabase.client import ClientOptions


# Read credentials from environment variables
SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://fcdoklyojjjymifonpsg.supabase.co")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZjZG9rbHlvampqeW1pZm9ucHNnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTgxODE5MywiZXhwIjoyMDk1Mzk0MTkzfQ.8VVVElj2UKRody_R-E9QMooAI0bgvivfaGZ9pk8y2HA")
opts = ClientOptions(postgrest_client_timeout=600, storage_client_timeout=600)


if not SUPABASE_URL or not SUPABASE_KEY:
    print("WARNING: Supabase credentials not found. Make sure to set SUPABASE_URL and SUPABASE_KEY.")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY, options=opts)