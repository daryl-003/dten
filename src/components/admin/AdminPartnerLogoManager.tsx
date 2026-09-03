import { useEffect, useState } from "react";
import { Building2, Upload, Loader2, Trash2, Check, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { GTL_LOGO_SETTING_KEY, GTL_LOGO_PENDING_KEY } from "@/components/PartnersCarousel";

const setSetting = async (key: string, value: string) => {
  const { error } = await supabase
    .from("app_settings")
    .upsert({ key, value, updated_at: new Date().toISOString() });
  if (error) throw error;
};

export default function AdminPartnerLogoManager() {
  const { toast } = useToast();
  const [url, setUrl] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const { data } = await supabase
      .from("app_settings")
      .select("key,value")
      .in("key", [GTL_LOGO_SETTING_KEY, GTL_LOGO_PENDING_KEY]);
    const live = data?.find((r) => r.key === GTL_LOGO_SETTING_KEY)?.value as string | undefined;
    const pend = data?.find((r) => r.key === GTL_LOGO_PENDING_KEY)?.value as string | undefined;
    setUrl(live || null);
    setPending(pend || null);
  };

  useEffect(() => {
    load();
  }, []);

  const upload = async (file: File) => {
    if (file.size > 2 * 1024 * 1024) {
      toast({ title: "File too large", description: "Please upload an image under 2MB.", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      const ext = file.name.split(".").pop() || "png";
      const path = `partners/ghana-tech-lab-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("ai-assets")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("ai-assets").getPublicUrl(path);
      await setSetting(GTL_LOGO_PENDING_KEY, pub.publicUrl);
      setPending(pub.publicUrl);
      toast({
        title: "Submitted for approval",
        description: "The logo is pending review and won't show publicly until approved.",
      });
    } catch (e: any) {
      toast({ title: "Upload failed", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const approve = async () => {
    if (!pending) return;
    setBusy(true);
    try {
      await setSetting(GTL_LOGO_SETTING_KEY, pending);
      await setSetting(GTL_LOGO_PENDING_KEY, "");
      setUrl(pending);
      setPending(null);
      toast({ title: "Logo approved", description: "It now appears in the public partners carousel." });
    } catch (e: any) {
      toast({ title: "Approval failed", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const reject = async () => {
    setBusy(true);
    try {
      await setSetting(GTL_LOGO_PENDING_KEY, "");
      setPending(null);
      toast({ title: "Submission rejected", description: "The pending logo was discarded." });
    } catch (e: any) {
      toast({ title: "Reject failed", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await setSetting(GTL_LOGO_SETTING_KEY, "");
      setUrl(null);
      toast({ title: "Logo removed", description: "The placeholder badge will be shown instead." });
    } catch (e: any) {
      toast({ title: "Remove failed", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Building2 size={16} /> Partner Logos
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-4 rounded-lg border border-border p-4">
          <div className="flex h-16 w-24 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-white">
            {url ? (
              <img src={url} alt="Ghana Tech Lab logo" className="max-h-full max-w-full object-contain" />
            ) : (
              <span className="font-mono text-xs font-bold tracking-widest text-slate-500">GTL</span>
            )}
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-foreground">Ghana Tech Lab</p>
            <p className="text-xs text-muted-foreground">
              {url ? "Approved — live on the carousel" : "Missing — showing placeholder badge"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {url && (
              <button
                onClick={remove}
                disabled={busy}
                className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-2 text-sm text-muted-foreground hover:text-destructive"
              >
                <Trash2 size={14} />
              </button>
            )}
            <label className="cursor-pointer">
              <input
                type="file"
                accept="image/*"
                className="hidden"
                disabled={busy}
                onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
              />
              <span className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">
                {busy ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                Upload
              </span>
            </label>
          </div>
        </div>

        {pending && (
          <div className="flex items-center gap-4 rounded-lg border border-primary/40 bg-primary/5 p-4">
            <div className="flex h-16 w-24 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-white">
              <img src={pending} alt="Pending Ghana Tech Lab logo" className="max-h-full max-w-full object-contain" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-foreground">Pending approval</p>
              <p className="text-xs text-muted-foreground">Not visible on the public carousel yet.</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={reject}
                disabled={busy}
                className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-2 text-sm text-muted-foreground hover:text-destructive"
              >
                <X size={14} /> Reject
              </button>
              <button
                onClick={approve}
                disabled={busy}
                className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
              >
                {busy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Approve
              </button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
