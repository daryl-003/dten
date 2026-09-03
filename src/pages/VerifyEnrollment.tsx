import { useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Search, CheckCircle, XCircle, ArrowRight, ShieldCheck, Award, Loader2 } from "lucide-react";
import Layout from "@/components/Layout";
import Seo from "@/components/Seo";
import { supabase } from "@/integrations/supabase/client";
import ghanaVerifyImg from "@/assets/ghana-verification.jpg";

interface EnrollmentResult {
  enrollment_id: string;
  full_name: string;
  email: string | null;
  course: string;
  created_at: string;
  status: string;
}

interface CertificateResult {
  certificate_number: string;
  type: string;
  course: string;
  student_name: string;
  issued_date: string;
  issued_by: string;
  description: string | null;
}

const VerifyEnrollment = () => {
  const [searchId, setSearchId] = useState("");
  const [enrollment, setEnrollment] = useState<EnrollmentResult | null>(null);
  const [certificates, setCertificates] = useState<CertificateResult[]>([]);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = searchId.trim().toUpperCase();
    if (!trimmed) return;
    setLoading(true);
    setSearched(false);
    setErrorMsg("");
    setEnrollment(null);
    setCertificates([]);
    try {
      const { data, error } = await supabase.functions.invoke("verify-credential", {
        body: { code: trimmed },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      if (data?.found && data.kind === "enrollment") {
        setEnrollment(data.enrollment);
        setCertificates(data.certificates || []);
      } else if (data?.found && data.kind === "certificate") {
        setCertificates([data.certificate]);
      }
    } catch (err: any) {
      setErrorMsg(err?.message || "Verification failed. Please try again.");
    } finally {
      setSearched(true);
      setLoading(false);
    }
  };

  const nothingFound = searched && !enrollment && certificates.length === 0 && !errorMsg;

  return (
    <Layout>
      <Seo title={"Verify Enrollment & Certificates | Daryl Tech"} description={"Check the validity of a Daryl Tech enrollment ID or certificate number issued by Daryl Tech & Educational Network."} path="/courses/verify" />
      <section className="relative border-b border-border">
        <div className="absolute inset-0">
          <img src={ghanaVerifyImg} alt="" loading="lazy" className="h-full w-full object-cover opacity-20" />
          <div className="absolute inset-0 bg-gradient-to-b from-background/60 via-background/80 to-background" />
        </div>
        <div className="container relative mx-auto px-4 py-16 sm:px-6 md:py-28">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-2xl">
            <p className="mb-3 font-mono text-xs uppercase tracking-widest text-primary sm:text-sm">
              <ShieldCheck className="mr-2 inline h-4 w-4" /> Verification
            </p>
            <h1 className="mb-4 text-3xl font-bold sm:text-4xl md:text-5xl">Verify a <span className="text-gradient">Credential</span></h1>
            <p className="text-sm text-muted-foreground sm:text-base">
              Enter an enrollment ID (DTEN-…) or a certificate number (DTEN-CERT-…). No account needed.
            </p>
          </motion.div>
        </div>
      </section>

      <section className="container mx-auto px-4 py-16 sm:px-6 sm:py-20">
        <div className="mx-auto max-w-xl">
          <form onSubmit={handleVerify} className="mb-10 flex flex-col gap-3 sm:flex-row">
            <label htmlFor="verify-code" className="sr-only">Enrollment ID or certificate number</label>
            <input
              id="verify-code"
              required
              maxLength={40}
              value={searchId}
              onChange={(e) => setSearchId(e.target.value)}
              placeholder="e.g. DTEN-A3B7X9K2 or DTEN-CERT-2026-A1B2C3"
              className="flex h-12 flex-1 rounded-lg border border-border bg-background px-4 font-mono text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <button type="submit" disabled={loading}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-gradient-primary px-6 text-sm font-semibold text-primary-foreground transition-transform hover:scale-105 disabled:opacity-50"
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />} Verify
            </button>
          </form>

          {errorMsg && (
            <div className="mb-6 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">{errorMsg}</div>
          )}

          {searched && enrollment && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
              <div className="rounded-xl border border-primary/30 bg-card p-6 glow-border sm:p-8">
                <div className="mb-6 flex items-center gap-3">
                  <CheckCircle className="h-8 w-8 shrink-0 text-primary" />
                  <div>
                    <h2 className="text-lg font-bold">Enrollment Verified</h2>
                    <p className="text-sm text-muted-foreground">This enrollment record is genuine.</p>
                  </div>
                </div>
                <div className="space-y-4 text-sm">
                  {[
                    ["Enrollment ID", <span key="a" className="font-mono font-semibold text-primary">{enrollment.enrollment_id}</span>],
                    ["Student Name", <span key="b" className="font-medium">{enrollment.full_name}</span>],
                    ["Email", <span key="c" className="font-medium break-all">{enrollment.email ?? "—"}</span>],
                    ["Course", <span key="d" className="font-medium">{enrollment.course}</span>],
                    ["Enrolled On", <span key="e" className="font-medium">{new Date(enrollment.created_at).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</span>],
                  ].map(([label, value], i) => (
                    <div key={i} className="flex flex-wrap justify-between gap-2 border-b border-border pb-3">
                      <span className="text-muted-foreground">{label as string}</span>{value}
                    </div>
                  ))}
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Status</span>
                    <span className="rounded-full bg-primary/10 px-3 py-0.5 text-xs font-semibold text-primary">{enrollment.status}</span>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {certificates.length > 0 && (
            <div className="mt-6 space-y-4">
              <h2 className="flex items-center gap-2 text-lg font-bold"><Award className="h-5 w-5 text-primary" /> Certificates & Letters</h2>
              {certificates.map((cert) => (
                <div key={cert.certificate_number} className="rounded-xl border border-border bg-card p-5 sm:p-6">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <span className="rounded-full bg-primary/10 px-3 py-0.5 text-xs font-semibold text-primary">{cert.type}</span>
                    <span className="text-xs text-muted-foreground">{new Date(cert.issued_date).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</span>
                  </div>
                  <p className="mb-1 font-mono text-xs font-semibold text-primary break-all">{cert.certificate_number}</p>
                  <p className="mb-1 text-sm font-semibold">{cert.course}</p>
                  <p className="text-xs text-muted-foreground">Issued to: {cert.student_name}</p>
                  <p className="text-xs text-muted-foreground">Issued by: {cert.issued_by}</p>
                  {cert.description && <p className="mt-2 text-xs text-muted-foreground">{cert.description}</p>}
                </div>
              ))}
            </div>
          )}

          {nothingFound && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              className="rounded-xl border border-destructive/30 bg-card p-6 text-center sm:p-8"
            >
              <XCircle className="mx-auto mb-4 h-12 w-12 text-destructive" />
              <h2 className="mb-2 text-lg font-bold">No Record Found</h2>
              <p className="mb-6 text-sm text-muted-foreground">
                Nothing matches "<span className="font-mono text-foreground break-all">{searchId.trim().toUpperCase()}</span>".
              </p>
              <Link to="/courses/enroll" className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline">
                Enroll Now <ArrowRight size={14} />
              </Link>
            </motion.div>
          )}
        </div>
      </section>
    </Layout>
  );
};

export default VerifyEnrollment;
