#!/usr/bin/env bash
cd /home/devnickwsl/projectPOS/aws-server/webPOS
pkill -f "next dev --hostname 0.0.0.0"
NEXT_PUBLIC_SUPABASE_URL=https://vmiugxqauuiiuubxqycd.supabase.co \
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZtaXVneHFhdXVpaXV1YnhxeWNkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIyNzc3MzIsImV4cCI6MjA3Nzg1MzczMn0.O7apnCtROWvVo4kbzFepTL3oYUJpFJ9_XR1Q9wk-KK4 \
pnpm dev
