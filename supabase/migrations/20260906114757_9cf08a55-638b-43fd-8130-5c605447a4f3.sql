-- Trigger/default helper functions need EXECUTE for the inserting role.
GRANT EXECUTE ON FUNCTION public.generate_certificate_number() TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_updated_at_column() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notify_new_internship_application() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notify_new_enrollment() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notify_new_contact() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notify_new_task_submission() TO authenticated;