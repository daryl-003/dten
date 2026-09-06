import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Plus, Trash2, Loader2, GraduationCap, Save, Users, UserPlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { invokeFn } from "@/lib/functions";
import { useToast } from "@/hooks/use-toast";

export const COURSE_ICONS = ["ArrowRight", "Clock", "Code", "Users", "Star",  "Smartphone", "Cloud", "Shield", "Brain", "Monitor", "LogIn", "Briefcase", "CreditCard", "Loader2", "Award", "CheckCircle", "Heart", "FileSpreadsheet", "Flag", "Lock", "LucideIcon", "BookOpen"];

type Course = {
  id: string;
  slug: string;
  title: string;
  description: string;
  icon: string;
  duration: string;
  level: string;
  students_label: string;
  rating: string;
  price_ghs: number;
  internship: boolean;
  published: boolean;
  position: number;
};

type CourseStaff = {
  id: string;
  course_id: string;
  staff_id: string;
  staff_name: string;
  staff_email: string;
  role: string;
};

type StaffMember = { staff_id: string; full_name: string; email: string; status: string };

const emptyCourse = (position: number): Partial<Course> => ({
  slug: "", title: "", description: "", icon: "Code", duration: "", level: "",
  students_label: "", rating: "4.8", price_ghs: 0, internship: false, published: true, position,
});

const slugify = (v: string) =>
  v.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const AdminCoursesManager = () => {
  const { toast } = useToast();
  const [courses, setCourses] = useState<Course[]>([]);
  const [assignments, setAssignments] = useState<CourseStaff[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<Partial<Course> | null>(null);
  const [assignFor, setAssignFor] = useState<Course | null>(null);
  const [assignStaffId, setAssignStaffId] = useState("");
  const [assignRole, setAssignRole] = useState("Instructor");

  const load = async () => {
    setLoading(true);
    const [{ data: courseRows }, { data: staffRows }] = await Promise.all([
      supabase.from("courses").select("*").order("position"),
      supabase.from("course_staff").select("*"),
    ]);
    setCourses((courseRows || []) as Course[]);
    setAssignments((staffRows || []) as CourseStaff[]);
    try {
      const list = await invokeFn<StaffMember[]>("manage-staff", { action: "list_staff" });
      setStaff(Array.isArray(list) ? list : []);
    } catch {
      setStaff([]);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const staffFor = (courseId: string) => assignments.filter(a => a.course_id === courseId);

  const saveCourse = async () => {
    if (!editing) return;
    const title = (editing.title || "").trim();
    if (!title) { toast({ title: "Title is required", variant: "destructive" }); return; }
    const slug = slugify(editing.slug || title);
    setSaving(true);
    const payload = {
      slug,
      title,
      description: editing.description || "",
      icon: editing.icon || "Code",
      duration: editing.duration || "",
      level: editing.level || "",
      students_label: editing.students_label || "",
      rating: editing.rating || "",
      price_ghs: Number(editing.price_ghs) || 0,
      internship: !!editing.internship,
      published: editing.published !== false,
      position: Number(editing.position) || 0,
    };
    const { error } = editing.id
      ? await supabase.from("courses").update(payload).eq("id", editing.id)
      : await supabase.from("courses").insert(payload);
    setSaving(false);
    if (error) { toast({ title: "Could not save course", description: error.message, variant: "destructive" }); return; }
    toast({ title: editing.id ? "Course updated" : "Course created" });
    setEditing(null);
    load();
  };

  const deleteCourse = async (c: Course) => {
    if (!confirm(`Delete "${c.title}"? This also removes its staff assignments.`)) return;
    const { error } = await supabase.from("courses").delete().eq("id", c.id);
    if (error) { toast({ title: "Could not delete", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Course deleted" });
    load();
  };

  const togglePublished = async (c: Course) => {
    const { error } = await supabase.from("courses").update({ published: !c.published }).eq("id", c.id);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    load();
  };

  const assignStaff = async () => {
    if (!assignFor || !assignStaffId) return;
    const member = staff.find(s => s.staff_id === assignStaffId);
    if (!member) return;
    const { error } = await supabase.from("course_staff").insert({
      course_id: assignFor.id,
      staff_id: member.staff_id,
      staff_name: member.full_name,
      staff_email: member.email,
      role: assignRole || "Instructor",
    });
    if (error) {
      toast({
        title: "Could not assign",
        description: error.message.includes("duplicate") ? "That staff member is already on this course." : error.message,
        variant: "destructive",
      });
      return;
    }
    toast({ title: `${member.full_name} assigned to ${assignFor.title}` });
    setAssignStaffId("");
    load();
  };

  const unassign = async (id: string) => {
    const { error } = await supabase.from("course_staff").delete().eq("id", id);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    load();
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="flex items-center gap-2 text-base">
            <GraduationCap size={16} /> Courses
          </CardTitle>
          <Button size="sm" onClick={() => setEditing(emptyCourse(courses.length))}>
            <Plus size={14} className="mr-1" /> New Course
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-10 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></div>
          ) : courses.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">No courses yet. Create your first one.</p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {courses.map(c => (
                <motion.div key={c.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                  className="rounded-lg border border-border p-4">
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-semibold">{c.title}</h3>
                      <p className="font-mono text-[10px] text-muted-foreground">{c.slug}</p>
                    </div>
                    <Badge variant={c.published ? "default" : "secondary"} className="text-[10px]">
                      {c.published ? "Published" : "Draft"}
                    </Badge>
                  </div>
                  <p className="mb-3 line-clamp-2 text-xs text-muted-foreground">{c.description}</p>
                  <div className="mb-3 flex flex-wrap gap-1.5 text-[10px] text-muted-foreground">
                    {c.duration && <span className="rounded bg-muted px-1.5 py-0.5">{c.duration}</span>}
                    {c.level && <span className="rounded bg-muted px-1.5 py-0.5">{c.level}</span>}
                    <span className="rounded bg-muted px-1.5 py-0.5">GH₵{Number(c.price_ghs).toLocaleString()}</span>
                    {c.internship && <span className="rounded bg-muted px-1.5 py-0.5">Internship</span>}
                  </div>

                  <div className="mb-3 rounded-md bg-muted/40 p-2">
                    <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                      <Users size={11} /> Assigned staff ({staffFor(c.id).length})
                    </div>
                    {staffFor(c.id).length === 0 ? (
                      <p className="text-[11px] text-muted-foreground">No staff assigned yet.</p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {staffFor(c.id).map(a => (
                          <span key={a.id} className="flex items-center gap-1 rounded-full border border-border bg-background px-2 py-0.5 text-[11px]">
                            {a.staff_name}
                            <span className="text-muted-foreground">· {a.role}</span>
                            <button onClick={() => unassign(a.id)} aria-label={`Remove ${a.staff_name}`} className="text-muted-foreground hover:text-destructive">
                              <X size={11} />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setEditing(c)}>Edit</Button>
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { setAssignFor(c); setAssignStaffId(""); }}>
                      <UserPlus size={12} className="mr-1" /> Assign staff
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => togglePublished(c)}>
                      {c.published ? "Unpublish" : "Publish"}
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => deleteCourse(c)}>
                      <Trash2 size={13} />
                    </Button>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit / create dialog */}
      <Dialog open={!!editing} onOpenChange={o => !o && setEditing(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Edit course" : "New course"}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div>
                <Label>Title</Label>
                <Input value={editing.title || ""} onChange={e => setEditing({ ...editing, title: e.target.value })} />
              </div>
              <div>
                <Label>URL slug</Label>
                <Input
                  value={editing.slug || ""}
                  onChange={e => setEditing({ ...editing, slug: e.target.value })}
                  placeholder={slugify(editing.title || "") || "web-dev"}
                />
              </div>
              <div>
                <Label>Description</Label>
                <Textarea rows={3} value={editing.description || ""} onChange={e => setEditing({ ...editing, description: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Icon</Label>
                  <Select value={editing.icon || "Code"} onValueChange={v => setEditing({ ...editing, icon: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {COURSE_ICONS.map(i => <SelectItem key={i} value={i}>{i}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Price (GH₵)</Label>
                  <Input type="number" value={editing.price_ghs ?? 0} onChange={e => setEditing({ ...editing, price_ghs: Number(e.target.value) })} />
                </div>
                <div>
                  <Label>Duration</Label>
                  <Input value={editing.duration || ""} onChange={e => setEditing({ ...editing, duration: e.target.value })} placeholder="12 Weeks" />
                </div>
                <div>
                  <Label>Level</Label>
                  <Input value={editing.level || ""} onChange={e => setEditing({ ...editing, level: e.target.value })} placeholder="Beginner" />
                </div>
                <div>
                  <Label>Students label</Label>
                  <Input value={editing.students_label || ""} onChange={e => setEditing({ ...editing, students_label: e.target.value })} placeholder="1,200+" />
                </div>
                <div>
                  <Label>Rating</Label>
                  <Input value={editing.rating || ""} onChange={e => setEditing({ ...editing, rating: e.target.value })} placeholder="4.9" />
                </div>
                <div>
                  <Label>Display order</Label>
                  <Input type="number" value={editing.position ?? 0} onChange={e => setEditing({ ...editing, position: Number(e.target.value) })} />
                </div>
              </div>
              <div className="flex items-center gap-6 pt-1">
                <div className="flex items-center gap-2">
                  <Switch id="internship" checked={!!editing.internship} onCheckedChange={v => setEditing({ ...editing, internship: v })} />
                  <Label htmlFor="internship" className="text-sm">Internship included</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch id="published" checked={editing.published !== false} onCheckedChange={v => setEditing({ ...editing, published: v })} />
                  <Label htmlFor="published" className="text-sm">Published</Label>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={saveCourse} disabled={saving}>
              {saving ? <Loader2 size={14} className="mr-1 animate-spin" /> : <Save size={14} className="mr-1" />} Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assign staff dialog */}
      <Dialog open={!!assignFor} onOpenChange={o => !o && setAssignFor(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Assign staff — {assignFor?.title}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {staff.length === 0 ? (
              <p className="text-sm text-muted-foreground">No staff members found. Create staff in the Staff tab first.</p>
            ) : (
              <>
                <div>
                  <Label>Staff member</Label>
                  <Select value={assignStaffId} onValueChange={setAssignStaffId}>
                    <SelectTrigger><SelectValue placeholder="Select staff" /></SelectTrigger>
                    <SelectContent>
                      {staff.map(s => (
                        <SelectItem key={s.staff_id} value={s.staff_id}>
                          {s.full_name} · {s.staff_id}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Role on this course</Label>
                  <Input value={assignRole} onChange={e => setAssignRole(e.target.value)} placeholder="Instructor" />
                </div>
              </>
            )}
            {assignFor && staffFor(assignFor.id).length > 0 && (
              <div className="rounded-md border border-border p-2">
                <p className="mb-1.5 text-xs font-medium text-muted-foreground">Currently assigned</p>
                <div className="space-y-1">
                  {staffFor(assignFor.id).map(a => (
                    <div key={a.id} className="flex items-center justify-between text-xs">
                      <span>{a.staff_name} <span className="text-muted-foreground">· {a.role}</span></span>
                      <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" onClick={() => unassign(a.id)}>
                        <Trash2 size={12} />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignFor(null)}>Close</Button>
            <Button onClick={assignStaff} disabled={!assignStaffId}>Assign</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminCoursesManager;
