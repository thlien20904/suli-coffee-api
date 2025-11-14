-- Supabase Storage Setup Script
-- Run this in your Supabase SQL Editor to set up storage

-- 1. Create storage bucket if not exists
INSERT INTO storage.buckets (id, name, public)
VALUES ('images', 'images', true)
ON CONFLICT (id) DO NOTHING;

-- 2. Create policy to allow public uploads to images bucket
CREATE POLICY "Allow public uploads" ON storage.objects 
FOR INSERT WITH CHECK (bucket_id = 'images');

-- 3. Create policy to allow public reads
CREATE POLICY "Allow public access" ON storage.objects 
FOR SELECT USING (bucket_id = 'images');

-- 4. Create policy to allow public deletes (for admin/user file management)
CREATE POLICY "Allow public deletes" ON storage.objects 
FOR DELETE USING (bucket_id = 'images');

-- Check if bucket exists
SELECT * FROM storage.buckets WHERE name = 'images';

-- Check current policies
SELECT * FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects';