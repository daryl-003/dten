
-- ENROLLMENTS
DROP POLICY IF EXISTS "Anyone can verify enrollment" ON public.enrollments;
CREATE POLICY "Users can view own enrollments" ON public.enrollments FOR SELECT TO authenticated
USING (auth.uid() = user_id OR email = (auth.jwt() ->> 'email'));
CREATE POLICY "Staff and admins can view enrollments" ON public.enrollments FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'staff'));

-- CERTIFICATES
DROP POLICY IF EXISTS "Anyone can verify certificates" ON public.certificates;
CREATE POLICY "Owners and staff can view certificates" ON public.certificates FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'staff')
  OR EXISTS (SELECT 1 FROM public.enrollments e WHERE e.enrollment_id = certificates.enrollment_id
             AND (e.user_id = auth.uid() OR e.email = (auth.jwt() ->> 'email')))
);

-- COURSE PROGRESS
DROP POLICY IF EXISTS "Anyone can view progress" ON public.course_progress;
CREATE POLICY "Owners and staff can view progress" ON public.course_progress FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'staff')
  OR EXISTS (SELECT 1 FROM public.enrollments e WHERE e.enrollment_id = course_progress.enrollment_id
             AND (e.user_id = auth.uid() OR e.email = (auth.jwt() ->> 'email')))
);

-- INTERNSHIP OFFERS
DROP POLICY IF EXISTS "Anyone can view internship offers" ON public.internship_offers;
CREATE POLICY "Owners and staff can view internship offers" ON public.internship_offers FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'staff')
  OR EXISTS (SELECT 1 FROM public.enrollments e WHERE e.enrollment_id = internship_offers.enrollment_id
             AND (e.user_id = auth.uid() OR e.email = (auth.jwt() ->> 'email')))
);

-- TASK SUBMISSIONS
DROP POLICY IF EXISTS "Anyone can view task submissions" ON public.task_submissions;
DROP POLICY IF EXISTS "Anyone can insert task submissions" ON public.task_submissions;
DROP POLICY IF EXISTS "Students can submit assigned tasks" ON public.task_submissions;

CREATE POLICY "Owners and staff can view task submissions" ON public.task_submissions FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'staff')
  OR student_email = (auth.jwt() ->> 'email')
);
CREATE POLICY "Students and staff can insert task submissions" ON public.task_submissions FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'staff')
  OR student_email = (auth.jwt() ->> 'email')
);
CREATE POLICY "Students can submit own assigned tasks" ON public.task_submissions FOR UPDATE TO authenticated
USING (status = 'assigned' AND student_email = (auth.jwt() ->> 'email'))
WITH CHECK (status = 'pending' AND student_email = (auth.jwt() ->> 'email'));

-- ADMIN NOTIFICATIONS
DROP POLICY IF EXISTS "Anyone can insert notifications" ON public.admin_notifications;

-- STORAGE: task submission files
DROP POLICY IF EXISTS "Anyone can view task files" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can upload task files" ON storage.objects;
CREATE POLICY "Owners and staff can view task files" ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'task-submissions' AND (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'staff')
    OR EXISTS (SELECT 1 FROM public.task_submissions t
               WHERE t.file_url = storage.objects.name AND t.student_email = (auth.jwt() ->> 'email'))
  )
);
CREATE POLICY "Authenticated users can upload task files" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'task-submissions');

-- Revoke direct execution of internal trigger helpers
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_new_contact() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_new_enrollment() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_new_internship_application() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_new_task_submission() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
