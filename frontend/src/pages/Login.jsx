import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

const LOGO_URL = "https://customer-assets.emergentagent.com/job_invoice-status-pulse/artifacts/5ja3p6f2__Logo_Bje6PBpwg.webp";

const Login = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("cajoprice@gmail.com");
  const [password, setPassword] = useState("admin123");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const formatErr = (d) => {
    if (!d) return "Login failed";
    if (typeof d === "string") return d;
    if (Array.isArray(d)) return d.map((e) => e.msg || JSON.stringify(e)).join(" ");
    return String(d);
  };

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email.trim().toLowerCase(), password);
      toast.success("Welcome back");
      navigate("/");
    } catch (err) {
      setError(formatErr(err.response?.data?.detail));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      {/* Left visual */}
      <div className="hidden lg:block relative overflow-hidden bg-[#09090B]">
        <img
          src="https://customer-assets.emergentagent.com/job_invoice-status-pulse/artifacts/m5okmycl_College%20Recent%20Photo.jpg"
          alt="Manipal Tata Medical College, Jamshedpur"
          className="absolute inset-0 w-full h-full object-cover opacity-60 blur-[2px] scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#09090B]/95 via-[#09090B]/55 to-[#09090B]/20" />
        <div className="relative h-full flex flex-col justify-between p-12 text-white">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-[#09090B] flex items-center justify-center overflow-hidden border border-white/10">
              <img src={LOGO_URL} alt="MTMC" className="w-full h-full object-contain" />
            </div>
            <div>
              <div className="font-display font-black text-2xl tracking-tight">InvoiceFlow</div>
              <div className="text-[10px] tracking-[0.2em] uppercase text-white/70 mt-0.5">Manipal Tata Medical College · Stores</div>
            </div>
          </div>
          <div className="max-w-md">
            <div className="text-[10px] tracking-[0.2em] uppercase text-white/70 mb-3">Audit-grade invoice tracking</div>
            <h1 className="font-display font-black text-4xl tracking-tight leading-tight">
              Track every bill from receipt to payment — with no surprises.
            </h1>
            <p className="text-white/70 text-sm mt-4 leading-relaxed">
              GRN, stamps, Dean certification, finance hand-off — visible at a glance. Get pinged the moment anything stalls more than 3 days.
            </p>
            <div className="mt-6 inline-flex items-center gap-2 text-xs text-white/60">
              <span className="w-1 h-1 bg-white/60 rounded-full" />
              <span>Manipal Tata Medical College, Jamshedpur</span>
            </div>
          </div>
        </div>
      </div>

      {/* Right form */}
      <div className="flex items-center justify-center p-8 bg-white">
        <div className="w-full max-w-sm">
          <div className="mb-10">
            <div className="label-caps mb-2">Sign in</div>
            <h2 className="font-display font-black text-3xl tracking-tight">Welcome back</h2>
            <p className="text-sm text-[#52525B] mt-2">Enter your credentials to access the workflow.</p>
          </div>
          <form onSubmit={submit} className="space-y-5" data-testid="login-form">
            <div>
              <Label htmlFor="email" className="label-caps">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                required
                className="mt-2 rounded-none border-[#E5E7EB] focus-visible:ring-0 focus-visible:border-[#09090B]"
                data-testid="login-email-input"
              />
            </div>
            <div>
              <Label htmlFor="password" className="label-caps">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="mt-2 rounded-none border-[#E5E7EB] focus-visible:ring-0 focus-visible:border-[#09090B]"
                data-testid="login-password-input"
              />
            </div>
            {error && (
              <div className="text-sm text-[#E11D48] border border-[#E11D48] bg-[#FEF2F2] p-3" data-testid="login-error">
                {error}
              </div>
            )}
            <Button
              type="submit"
              disabled={loading}
              className="w-full rounded-none bg-[#09090B] hover:bg-[#27272A] text-white font-semibold h-11"
              data-testid="login-submit-button"
            >
              {loading ? "Signing in…" : "Sign in →"}
            </Button>
          </form>

          <div className="mt-10 pt-6 border-t border-[#E5E7EB]">
            <div className="label-caps mb-3">Quick role logins</div>
            <div className="grid grid-cols-2 gap-2 text-xs font-mono-data text-[#52525B]">
              <div>Stores Manipal ID</div><div>Official Password</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
