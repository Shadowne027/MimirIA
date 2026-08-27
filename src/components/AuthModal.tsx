import React, { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, Button, Input, Label } from "./ui";
import { useAuth } from "../contexts/AuthContext";
import { Loader2, Lock, User as UserIcon, AlertCircle } from "lucide-react";
import { YGG_LOGO } from "../lib/assets";
import { toast } from "sonner";

function LogoCircle({ size = 48 }: { size?: number }) {
  return (
    <span
      className="inline-flex items-center justify-center rounded-full overflow-hidden bg-[#065F46]"
      style={{ width: size, height: size }}
    >
      <img src={YGG_LOGO} alt="" className="w-full h-full object-cover" />
    </span>
  );
}

export function AuthModal({
  open,
  onOpenChange,
  defaultMode = "login",
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  defaultMode?: "login" | "register";
  onSuccess?: () => void;
}) {
  const [mode, setMode] = useState<"login" | "register">(defaultMode);
  const { login, register, formatApiError } = useAuth();

  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setMode(defaultMode);
      setError("");
      setPassword("");
      setUsername("");
    }
  }, [open, defaultMode]);

  const resetFields = () => {
    setPassword("");
    setUsername("");
    setError("");
  };

  const submitRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const u = await register(username, password);
      resetFields();
      onOpenChange(false);
      toast.success(`¡Bienvenido a MIMIR IA, ${u.username}!`);
      if (onSuccess) onSuccess();
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      setLoading(false);
    }
  };

  const submitLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const u = await login(username, password);
      resetFields();
      onOpenChange(false);
      toast.success(`Hola de nuevo, ${u.username}.`);
      if (onSuccess) onSuccess();
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      setLoading(false);
    }
  };

  const isLogin = mode === "login";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="auth-modal" className="sm:max-w-md">
        <DialogHeader>
          <div className="flex justify-center mb-3"><LogoCircle size={52} /></div>
          <DialogTitle className="text-center font-display text-2xl">
            {isLogin ? "Inicia sesión" : "Crea tu cuenta"}
          </DialogTitle>
          <DialogDescription className="text-center">
            {isLogin ? "Accede con tu nombre de usuario" : "Únete a MIMIR IA. Es gratis."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={isLogin ? submitLogin : submitRegister} className="space-y-3 pt-2">
          <div className="space-y-1.5">
            <Label htmlFor="username" className="text-xs uppercase tracking-wider text-[#64748B]">Nombre de usuario</Label>
            <div className="relative">
              <UserIcon size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
              <Input
                id="username"
                data-testid="auth-username-input"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Tu nombre"
                required
                minLength={2}
                className="pl-9 h-11 rounded-full border-[#E2E8F0]"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password" className="text-xs uppercase tracking-wider text-[#64748B]">Contraseña</Label>
            <div className="relative">
              <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
              <Input
                id="password"
                data-testid="auth-password-input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={isLogin ? "Tu contraseña" : "Mínimo 6 caracteres"}
                required
                minLength={6}
                className="pl-9 h-11 rounded-full border-[#E2E8F0]"
              />
            </div>
          </div>

          {error && (
            <div data-testid="auth-error" className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <Button
            type="submit"
            data-testid="auth-submit-button"
            disabled={loading}
            className="w-full bg-[#065F46] hover:bg-[#047857] text-white rounded-full h-11 font-medium mt-2"
          >
            {loading ? <Loader2 size={18} className="animate-spin" /> : isLogin ? "Iniciar sesión" : "Crear cuenta"}
          </Button>
        </form>

        <div className="text-center text-sm text-[#64748B] pt-2">
          {isLogin ? (
            <>
              ¿No tienes cuenta?{" "}
              <button
                data-testid="auth-switch-register"
                onClick={() => { resetFields(); setMode("register"); }}
                className="text-[#065F46] font-medium hover:underline"
              >
                Regístrate
              </button>
            </>
          ) : (
            <>
              ¿Ya tienes cuenta?{" "}
              <button
                data-testid="auth-switch-login"
                onClick={() => { resetFields(); setMode("login"); }}
                className="text-[#065F46] font-medium hover:underline"
              >
                Inicia sesión
              </button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
