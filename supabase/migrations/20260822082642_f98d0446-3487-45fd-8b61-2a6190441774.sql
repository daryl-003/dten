DROP POLICY IF EXISTS "Authenticated users can upload task files" ON storage.objects;

CREATE POLICY "Students upload own task files"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'task-submissions'
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'staff'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.enrollments e
      WHERE e.enrollment_id = (storage.foldername(name))[1]
        AND e.email = (auth.jwt() ->> 'email')
    )
  )
);

CREATE POLICY "Students update own task files"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'task-submissions'
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'staff'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.enrollments e
      WHERE e.enrollment_id = (storage.foldername(name))[1]
        AND e.email = (auth.jwt() ->> 'email')
    )
  )
)
WITH CHECK (
  bucket_id = 'task-submissions'
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'staff'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.enrollments e
      WHERE e.enrollment_id = (storage.foldername(name))[1]
        AND e.email = (auth.jwt() ->> 'email')
    )
  )
);