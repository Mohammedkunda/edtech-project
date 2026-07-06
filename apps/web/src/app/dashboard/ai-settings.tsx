"use client";

import * as React from "react";
import { useState, useEffect } from "react";
import { Sparkles, Save, ShieldAlert, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { toast } from "sonner";

export function AISettings() {
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("google/gemini-2.5-flash");
  const [isConfigured, setIsConfigured] = useState(false);
  const [loading, setLoading] = useState(true);

  // Load configuration from API on mount
  useEffect(() => {
    async function loadSettings() {
      try {
        const res = await fetch("/api/user/settings");
        if (res.ok) {
          const data = (await res.json()) as { model: string; hasApiKey: boolean };
          setModel(data.model);
          setIsConfigured(data.hasApiKey);
        }
      } catch (error) {
        console.error("Failed to load settings:", error);
      } finally {
        setLoading(false);
      }
    }
    loadSettings();
  }, []);

  const handleSave = async () => {
    try {
      const payload: { model: string; apiKey?: string } = {
        model: model.trim(),
      };

      // Only send apiKey if the user typed something.
      // If it is empty, we don't update/clear it (unless they click Clear).
      if (apiKey.trim() !== "") {
        payload.apiKey = apiKey.trim();
      }

      const res = await fetch("/api/user/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new Error("Failed to save settings");
      }

      setIsConfigured(isConfigured || apiKey.trim() !== "");
      setApiKey(""); // clear input field after save
      toast.success("AI Summarizer settings saved securely in the database!");
    } catch (error) {
      console.error(error);
      toast.error("Failed to save settings.");
    }
  };

  const handleClear = async () => {
    try {
      const res = await fetch("/api/user/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey: "", // Empty string instructs the backend to nullify the column
          model: "google/gemini-2.5-flash",
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to clear settings");
      }

      setApiKey("");
      setModel("google/gemini-2.5-flash");
      setIsConfigured(false);
      toast.success("Cleared custom AI settings (using server default).");
    } catch (error) {
      console.error(error);
      toast.error("Failed to clear settings.");
    }
  };

  if (loading) {
    return (
      <Card className="border-purple-100 dark:border-purple-950/40 bg-gradient-to-r from-background to-purple-50/10 dark:to-purple-950/5 shadow-sm">
        <CardContent className="py-10 flex items-center justify-center gap-2 text-muted-foreground text-xs">
          <Loader2 className="h-4 w-4 animate-spin text-purple-500" />
          Loading settings...
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-purple-100 dark:border-purple-950/40 bg-gradient-to-r from-background to-purple-50/10 dark:to-purple-950/5 shadow-sm overflow-hidden">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center justify-between text-base font-semibold text-purple-700 dark:text-purple-300">
          <span className="flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            AI Summarizer Configuration
          </span>
          {isConfigured ? (
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/20 px-2 py-0.5 rounded-full border border-emerald-100 dark:border-emerald-950/40">
              <CheckCircle2 className="h-3 w-3" />
              Active
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/20 px-2 py-0.5 rounded-full border border-amber-100 dark:border-amber-950/40">
              <ShieldAlert className="h-3 w-3" />
              Plz set your model and API key
            </span>
          )}
        </CardTitle>
        <CardDescription className="text-xs">
          Customize your OpenRouter model and credentials. Settings are saved securely on the server.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="dashboard-apiKey" className="text-xs font-semibold">
              OpenRouter API Key
            </Label>
            <Input
              id="dashboard-apiKey"
              type="password"
              placeholder={isConfigured ? "•••••••• (Saved)" : "sk-or-..."}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="h-9 text-sm"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="dashboard-model" className="text-xs font-semibold">
              Model Name
            </Label>
            <Input
              id="dashboard-model"
              type="text"
              placeholder="google/gemini-2.5-flash"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="h-9 text-sm"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-2">
          {isConfigured && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleClear}
              className="text-xs h-8 text-destructive hover:bg-destructive/10"
            >
              Clear Custom Settings
            </Button>
          )}
          <Button
            size="sm"
            onClick={handleSave}
            className="bg-purple-600 hover:bg-purple-700 text-white font-medium text-xs h-8 gap-1.5"
          >
            <Save className="h-3.5 w-3.5" />
            Save Settings
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
