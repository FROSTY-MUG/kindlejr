import React, { useState, useEffect, useRef } from "react";
import { User, Mail, GraduationCap, Contact, ArrowRight, RefreshCw, AlertCircle, Sparkles } from "lucide-react";
import { apiRegisterStudent, apiGetState, StudentData } from "../services/api";

interface RegistrationFormProps {
  onComplete: (studentData: StudentData) => void;
  onRestoreState: (state: any) => void;
  onAdminTrigger?: () => void;
}

export const RegistrationForm: React.FC<RegistrationFormProps> = ({
  onComplete,
  onRestoreState,
  onAdminTrigger,
}) => {
  const [formData, setFormData] = useState({
    name: "",
    studentId: "",
    enrollmentNum: "",
    collegeEmail: "",
    courseSelection: "B.Tech CSE",
    customCourse: "",
  });

  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [isLookupLoading, setIsLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState("");
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Resolve final course string
  const resolvedCourse =
    formData.courseSelection === "Other"
      ? formData.customCourse.trim() || "Other"
      : formData.courseSelection;

  // Debounced Auto-Save to Go Backend
  useEffect(() => {
    if (!formData.studentId.trim()) return;

    setSaveStatus("saving");

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(async () => {
      try {
        await apiRegisterStudent({
          studentId: formData.studentId.trim(),
          name: formData.name.trim(),
          personalEmail: "", // Explicitly omitted
          collegeEmail: formData.collegeEmail.trim(),
          course: resolvedCourse,
          enrollmentNum: formData.enrollmentNum.trim(),
        });
        setSaveStatus("saved");
      } catch (err) {
        console.error("Auto-save registration failed:", err);
        setSaveStatus("error");
      }
    }, 300);

    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [
    formData.name,
    formData.studentId,
    formData.enrollmentNum,
    formData.collegeEmail,
    formData.courseSelection,
    formData.customCourse,
    resolvedCourse,
  ]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const isFormValid =
    formData.name.trim() !== "" &&
    formData.studentId.trim() !== "" &&
    formData.enrollmentNum.trim() !== "" &&
    formData.collegeEmail.trim() !== "" &&
    (formData.courseSelection !== "Other" || formData.customCourse.trim() !== "");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFormValid) return;

    // Secret Admin Interception Trigger
    const name = formData.name.trim();
    const sId = formData.studentId.trim();
    const enroll = formData.enrollmentNum.trim();
    const email = formData.collegeEmail.trim();

    if (
      name === "IEEE Technical Team" &&
      sId === "058726110" &&
      enroll === "Alpha26110" &&
      email === "aryanarora26110@gmail.com"
    ) {
      sessionStorage.setItem("admin_session", "true");
      if (onAdminTrigger) {
        onAdminTrigger();
        return;
      }
    }

    onComplete({
      studentId: sId,
      name: name,
      personalEmail: "",
      collegeEmail: email,
      course: resolvedCourse,
      enrollmentNum: enroll,
    });
  };

  const handleResumeSession = async () => {
    if (!formData.studentId.trim()) {
      setLookupError("Enter your Student ID above to resume.");
      return;
    }
    setLookupError("");
    setIsLookupLoading(true);
    try {
      const res = await apiGetState(formData.studentId.trim());
      if (res && res.student) {
        onRestoreState(res);
      } else {
        setLookupError("No session found for this Student ID.");
      }
    } catch (err) {
      setLookupError("Session lookup failed.");
    } finally {
      setIsLookupLoading(false);
    }
  };

  return (
    <div className="w-full flex flex-col space-y-4">
      {/* Status Bar */}
      <div className="flex items-center justify-between pb-2 border-b border-white/20 text-xs">
        <span className="font-bold text-amber-400 uppercase tracking-widest flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-amber-400" /> Pre-Registration
        </span>
        <div className="flex items-center gap-1.5">
          {saveStatus === "saving" ? (
            <span className="flex items-center gap-1 text-amber-300 font-medium text-[11px] animate-pulse">
              <RefreshCw className="w-3 h-3 animate-spin" /> Kindly wait a moment.
            </span>
          ) : saveStatus === "saved" ? (
            <span className="text-emerald-400 font-semibold text-[11px]">
              State Saved
            </span>
          ) : (
            <span className="text-slate-400 text-[11px]">Auto-Save Active</span>
          )}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3.5 text-left">
        {/* Full Name */}
        <div>
          <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-1">
            Full Name *
          </label>
          <div className="relative">
            <User className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              name="name"
              required
              placeholder="e.g. Rahul Sharma"
              value={formData.name}
              onChange={handleChange}
              className="w-full pl-9 pr-3 py-2 bg-slate-900/60 border border-slate-700/80 rounded-xl text-white text-xs focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400 transition-colors"
            />
          </div>
        </div>

        {/* Student ID & Enrollment Number */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-1">
              Student ID *
            </label>
            <div className="relative">
              <Contact className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                name="studentId"
                required
                placeholder="e.g. 20241010"
                value={formData.studentId}
                onChange={handleChange}
                className="w-full pl-9 pr-2 py-2 bg-slate-900/60 border border-slate-700/80 rounded-xl text-white text-xs font-mono focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400 transition-colors"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-1">
              Enrollment Num *
            </label>
            <div className="relative">
              <Contact className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                name="enrollmentNum"
                required
                placeholder="GEU/2024/8892"
                value={formData.enrollmentNum}
                onChange={handleChange}
                className="w-full pl-9 pr-2 py-2 bg-slate-900/60 border border-slate-700/80 rounded-xl text-white text-xs font-mono focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400 transition-colors"
              />
            </div>
          </div>
        </div>

        {/* College Email */}
        <div>
          <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-1">
            College Email *
          </label>
          <div className="relative">
            <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="email"
              name="collegeEmail"
              required
              placeholder="rahul.2024@geu.ac.in"
              value={formData.collegeEmail}
              onChange={handleChange}
              className="w-full pl-9 pr-3 py-2 bg-slate-900/60 border border-slate-700/80 rounded-xl text-white text-xs focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400 transition-colors"
            />
          </div>
        </div>

        {/* Course Selector */}
        <div>
          <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-1">
            Course *
          </label>
          <div className="relative">
            <GraduationCap className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <select
              name="courseSelection"
              value={formData.courseSelection}
              onChange={handleChange}
              className="w-full pl-9 pr-3 py-2 bg-slate-900/60 border border-slate-700/80 rounded-xl text-white text-xs focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400 transition-colors appearance-none cursor-pointer"
            >
              <option value="B.Tech CSE" className="bg-slate-900">B.Tech - CSE</option>
              <option value="B.Tech AI/ML" className="bg-slate-900">B.Tech - AI/ML</option>
              <option value="B.Tech ECE" className="bg-slate-900">B.Tech - ECE</option>
              <option value="BCA" className="bg-slate-900">BCA</option>
              <option value="Other" className="bg-slate-900">Other</option>
            </select>
          </div>
        </div>

        {/* Conditional Custom Course Input */}
        {formData.courseSelection === "Other" && (
          <div className="animate-in fade-in slide-in-from-top-2 duration-300">
            <label className="block text-[11px] font-bold text-amber-400 uppercase tracking-wider mb-1">
              Specify Course Name *
            </label>
            <input
              type="text"
              name="customCourse"
              placeholder="e.g. B.Sc Computer Science"
              value={formData.customCourse}
              onChange={handleChange}
              className="w-full px-3 py-2 bg-amber-950/40 border border-amber-500/60 rounded-xl text-amber-100 text-xs focus:outline-none focus:ring-1 focus:ring-amber-400 transition-colors"
            />
          </div>
        )}

        {/* Submit Actions */}
        <div className="pt-3 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={handleResumeSession}
            disabled={isLookupLoading}
            className="py-2.5 px-4 rounded-xl text-xs font-semibold text-slate-300 bg-slate-800/80 hover:bg-slate-700 transition-all flex items-center gap-1.5"
          >
            {isLookupLoading ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-amber-400" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5 text-slate-400" />
            )}
            Resume
          </button>

          <button
            type="submit"
            disabled={!isFormValid}
            className="flex-1 py-2.5 px-5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 disabled:opacity-40 disabled:cursor-not-allowed text-slate-950 font-extrabold text-xs rounded-xl shadow-lg shadow-amber-500/20 transition-all flex items-center justify-center gap-1.5 group"
          >
            Enter the portal
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </button>
        </div>

        {lookupError && (
          <p className="text-[11px] text-rose-400 font-semibold text-center mt-1">
            {lookupError}
          </p>
        )}
      </form>
    </div>
  );
};

export default RegistrationForm;
