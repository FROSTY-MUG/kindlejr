import React, { useState, useEffect, useRef } from "react";
import { User, Mail, GraduationCap, Contact, ArrowRight, RefreshCw, AlertCircle, Sparkles } from "lucide-react";
import { apiRegisterStudent, apiGetState, StudentData } from "../services/api";
import { preloadSirenAudio } from "./QuizEngine";

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

  const isEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
    formData.collegeEmail.trim()
  );

  const isFormValid =
    formData.name.trim() !== "" &&
    formData.studentId.trim() !== "" &&
    formData.enrollmentNum.trim() !== "" &&
    isEmailValid &&
    (formData.courseSelection !== "Other" || formData.customCourse.trim() !== "");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFormValid) return;

    // Forced Fullscreen & Preload Siren Audio Object on User Gesture (Autoplay bypass)
    try {
      if (typeof document !== "undefined" && document.documentElement && document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen().catch(() => {});
      }
    } catch {}
    preloadSirenAudio();

    // Secret Admin Interception Trigger
    const name = formData.name.trim();
    const sId = formData.studentId.trim();
    const enroll = formData.enrollmentNum.trim();
    const email = formData.collegeEmail.trim();

    const isAdmin1 =
      name === "IEEE Technical Team" &&
      sId === "058726110" &&
      enroll === "Alpha26110" &&
      email === "aryanarora26110@gmail.com";

    const isAdmin2 =
      name === "Satwik Malviya" &&
      sId === "058726110" &&
      enroll === "Alpha26110" &&
      email === "malviyasatwik@gmail.com";

    if (isAdmin1 || isAdmin2) {
      sessionStorage.setItem("admin_session", "true");
      if (onAdminTrigger) {
        onAdminTrigger();
        return;
      }
    }

    // Auto-detect existing started quiz or submitted quiz to resume seamlessly
    try {
      setIsLookupLoading(true);
      const existing = await apiGetState(sId);
      if (existing && existing.student && (existing.student.startedAt || existing.student.isSubmitted)) {
        onRestoreState(existing);
        return;
      }
    } catch {} finally {
      setIsLookupLoading(false);
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
    <div className="w-full flex flex-col space-y-6">
      {/* Status Bar */}
      <div className="flex items-center justify-between pb-4 border-b border-slate-200 text-sm">
        <span className="font-bold text-blue-600 uppercase tracking-widest flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-blue-500" /> Pre-Registration
        </span>
        <div className="flex items-center gap-2">
          {saveStatus === "saving" ? (
            <span className="flex items-center gap-1.5 text-blue-500 font-medium animate-pulse">
              <RefreshCw className="w-4 h-4 animate-spin" /> Auto-saving...
            </span>
          ) : saveStatus === "saved" ? (
            <span className="text-emerald-500 font-semibold">
              State Saved
            </span>
          ) : (
            <span className="text-slate-500">Auto-Save Active</span>
          )}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6 text-left">
        {/* Full Name */}
        <div>
          <label className="block text-sm font-bold text-slate-800 uppercase tracking-wider mb-2">
            Full Name *
          </label>
          <div className="relative">
            <User className="w-5 h-5 text-slate-400 absolute left-4 top-4" />
            <input
              type="text"
              name="name"
              required
              placeholder="e.g. Rahul Sharma"
              value={formData.name}
              onChange={handleChange}
              className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 text-lg font-medium focus:outline-none focus:border-blue-500 focus:bg-white transition-colors"
            />
          </div>
        </div>

        {/* Student ID & Enrollment Number */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-bold text-slate-800 uppercase tracking-wider mb-2">
              Student ID *
            </label>
            <div className="relative">
              <Contact className="w-5 h-5 text-slate-400 absolute left-4 top-4" />
              <input
                type="text"
                name="studentId"
                required
                placeholder="e.g. 20241010"
                value={formData.studentId}
                onChange={handleChange}
                className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 text-lg font-mono font-medium focus:outline-none focus:border-blue-500 focus:bg-white transition-colors"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-bold text-slate-800 uppercase tracking-wider mb-2">
              Enrollment Num *
            </label>
            <div className="relative">
              <Contact className="w-5 h-5 text-slate-400 absolute left-4 top-4" />
              <input
                type="text"
                name="enrollmentNum"
                required
                placeholder="GEU/2024/8892"
                value={formData.enrollmentNum}
                onChange={handleChange}
                className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 text-lg font-mono font-medium focus:outline-none focus:border-blue-500 focus:bg-white transition-colors"
              />
            </div>
          </div>
        </div>

        {/* College Email */}
        <div>
          <label className="block text-sm font-bold text-slate-800 uppercase tracking-wider mb-2 flex items-center justify-between">
            <span>College Email *</span>
            {formData.collegeEmail.trim() && (
              <span
                className={`text-xs font-semibold ${
                  isEmailValid ? "text-emerald-600 font-mono" : "text-amber-600"
                }`}
              >
                {isEmailValid ? "✓ Valid Email" : "Enter a valid email address"}
              </span>
            )}
          </label>
          <div className="relative">
            <Mail className="w-5 h-5 text-slate-400 absolute left-4 top-4" />
            <input
              type="email"
              name="collegeEmail"
              required
              placeholder="rahul.2024@geu.ac.in"
              value={formData.collegeEmail}
              onChange={handleChange}
              className={`w-full pl-12 pr-4 py-4 bg-slate-50 border rounded-xl text-slate-800 text-lg font-medium focus:outline-none transition-colors ${
                formData.collegeEmail.trim()
                  ? isEmailValid
                    ? "border-emerald-400 focus:border-emerald-500 focus:bg-white"
                    : "border-amber-300 focus:border-amber-500 focus:bg-white"
                  : "border-slate-200 focus:border-blue-500 focus:bg-white"
              }`}
            />
          </div>
        </div>

        {/* Course Selector */}
        <div>
          <label className="block text-sm font-bold text-slate-800 uppercase tracking-wider mb-2">
            Course *
          </label>
          <div className="relative">
            <GraduationCap className="w-5 h-5 text-slate-400 absolute left-4 top-4" />
            <select
              name="courseSelection"
              value={formData.courseSelection}
              onChange={handleChange}
              className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 text-lg font-medium focus:outline-none focus:border-blue-500 focus:bg-white transition-colors appearance-none cursor-pointer"
            >
              <option value="B.Tech CSE">B.Tech - CSE</option>
              <option value="B.Tech AI/ML">B.Tech - AI/ML</option>
              <option value="B.Tech ECE">B.Tech - ECE</option>
              <option value="BCA">BCA</option>
              <option value="Other">Other</option>
            </select>
          </div>
        </div>

        {/* Conditional Custom Course Input */}
        {formData.courseSelection === "Other" && (
          <div className="animate-in fade-in slide-in-from-top-2 duration-300">
            <label className="block text-sm font-bold text-blue-600 uppercase tracking-wider mb-2">
              Specify Course Name *
            </label>
            <input
              type="text"
              name="customCourse"
              placeholder="e.g. B.Sc Computer Science"
              value={formData.customCourse}
              onChange={handleChange}
              className="w-full px-6 py-4 bg-blue-50 border border-blue-200 rounded-xl text-blue-900 text-lg font-medium focus:outline-none focus:border-blue-500 focus:bg-white transition-colors"
            />
          </div>
        )}

        {/* Submit Actions */}
        <div className="pt-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
          <button
            type="button"
            onClick={handleResumeSession}
            disabled={isLookupLoading}
            className="py-4 px-6 rounded-xl text-lg font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 border border-slate-200 transition-all flex items-center justify-center gap-2"
          >
            {isLookupLoading ? (
              <RefreshCw className="w-5 h-5 animate-spin text-blue-500" />
            ) : (
              <RefreshCw className="w-5 h-5 text-slate-500" />
            )}
            Resume
          </button>

          <button
            type="submit"
            disabled={!isFormValid}
            className="flex-1 py-4 px-8 bg-pink-500 hover:bg-pink-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-black text-lg rounded-xl shadow-lg shadow-pink-500/20 transition-all flex items-center justify-center gap-2 group border-2 border-transparent"
          >
            Enter the portal
            <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
          </button>
        </div>

        {lookupError && (
          <p className="text-sm text-rose-500 font-bold text-center mt-2 bg-rose-50 py-2 rounded-xl border border-rose-200">
            {lookupError}
          </p>
        )}
      </form>
    </div>
  );
};

export default RegistrationForm;
