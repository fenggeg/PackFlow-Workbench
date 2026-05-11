import {useState} from "react";
import {Button} from "@/components/ui/button";
import {AlertCircle, Check, RefreshCw} from "lucide-react";

type CheckStatus = "idle" | "checking" | "latest" | "found" | "error";

export function UpdateChecker() {
  const [status, setStatus] = useState<CheckStatus>("idle");
  const [version, setVersion] = useState("");

  const handleCheck = async () => {
    setStatus("checking");
    try {
      const mod = await import("@tauri-apps/plugin-updater");
      const update = await mod.check();
      if (update) {
        setVersion(update.version ?? "");
        setStatus("found");
      } else {
        setStatus("latest");
      }
    } catch {
      setStatus("error");
    }
    setTimeout(() => setStatus("idle"), 3000);
  };

  const label = {
    idle: "检查更新",
    checking: "检查中...",
    latest: "已是最新版",
    found: `发现新版本 ${version}`,
    error: "检查失败",
  }[status];

  const icon = {
    idle: <RefreshCw className="h-3.5 w-3.5 mr-1.5" />,
    checking: <RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" />,
    latest: <Check className="h-3.5 w-3.5 mr-1.5 text-green-500" />,
    found: <AlertCircle className="h-3.5 w-3.5 mr-1.5 text-blue-500" />,
    error: <AlertCircle className="h-3.5 w-3.5 mr-1.5 text-destructive" />,
  }[status];

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleCheck}
      disabled={status === "checking"}
      className={`text-xs ${status === "latest" ? "text-green-600" : status === "found" ? "text-blue-600" : status === "error" ? "text-destructive" : ""}`}
    >
      {icon}
      {label}
    </Button>
  );
}