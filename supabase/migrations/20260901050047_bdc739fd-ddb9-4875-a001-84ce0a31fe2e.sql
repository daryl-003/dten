-- 1. Certificate numbers
CREATE OR REPLACE FUNCTION public.generate_certificate_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  candidate text;
  i int;
  suffix text;
BEGIN
  LOOP
    suffix := '';
    FOR i IN 1..6 LOOP
      suffix := suffix || substr(chars, floor(random() * length(chars) + 1)::int, 1);
    END LOOP;
    candidate := 'DTEN-CERT-' || to_char(now(), 'YYYY') || '-' || suffix;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.certificates WHERE certificate_number = candidate);
  END LOOP;
  RETURN candidate;
END;
$$;

ALTER TABLE public.certificates ADD COLUMN IF NOT EXISTS certificate_number text;

UPDATE public.certificates
SET certificate_number = public.generate_certificate_number()
WHERE certificate_number IS NULL;

ALTER TABLE public.certificates ALTER COLUMN certificate_number SET DEFAULT public.generate_certificate_number();
ALTER TABLE public.certificates ALTER COLUMN certificate_number SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS certificates_certificate_number_key
  ON public.certificates (certificate_number);

-- 2. Staff can manage certificates too
DROP POLICY IF EXISTS "Staff can view certificates" ON public.certificates;
CREATE POLICY "Staff can view certificates"
ON public.certificates FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'staff'));

DROP POLICY IF EXISTS "Staff can issue certificates" ON public.certificates;
CREATE POLICY "Staff can issue certificates"
ON public.certificates FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'staff'));

-- 3. Temporary password flag
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false;