-- Consolidate and tighten student-cvs storage policies
DROP POLICY IF EXISTS "Anyone can upload CVs" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can upload CV" ON storage.objects;
DROP POLICY IF EXISTS "Admins can view CVs" ON storage.objects;
DROP POLICY IF EXISTS "Admins can read CVs" ON storage.objects;
DROP POLICY IF EXISTS "student_cvs_insert_random_folder" ON storage.objects;
DROP POLICY IF EXISTS "student_cvs_admin_select" ON storage.objects;

-- Public enrollment form may upload, but only into an unguessable UUID folder,
-- and only create new objects (no overwrite of anyone else's CV).
CREATE POLICY "student_cvs_insert_random_folder"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'student-cvs'
  AND (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND array_length(storage.foldername(name), 1) = 1
);

-- Only admins and staff can read CVs. No UPDATE/DELETE policies exist, so
-- files cannot be replaced or removed except by the service role.
CREATE POLICY "student_cvs_admin_select"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'student-cvs'
  AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'staff'))
);