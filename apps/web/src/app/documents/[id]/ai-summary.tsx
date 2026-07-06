"use client";

import * as React from "react";
import { useState, useEffect } from "react";
import { Sparkles, Loader2, ExternalLink } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import Link from "next/link";

type AISummaryProps = {
  documentId: string;
};

export function AISummary({ documentId }: AISummaryProps) {
  const [summary, setSummary] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  const [hasApiKey, setHasApiKey] = useState(false);
  const [customModel, setCustomModel] = useState("google/gemini-2.5-flash");

  const fetchSettings = async () => {
    try {
      const res = await fetch("/api/user/settings");
      if (res.ok) {
        const data = (await res.json()) as { model: string; hasApiKey: boolean };
        setHasApiKey(data.hasApiKey);
        setCustomModel(data.model);
      }
    } catch (e) {
      console.error("Failed to load settings:", e);
    }
  };

  // Load configuration from database on client mount
  useEffect(() => {
    fetchSettings();
  }, []);

  const generateSummary = async () => {
    setLoading(true);
    setSummary(null);
    try {
      const res = await fetch(`/api/documents/${documentId}/summarize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to generate summary");
      }

      const data = await res.json();
      setSummary(data.summary);
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Failed to load summary");
      setOpen(false);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenChange = async (isOpen: boolean) => {
    setOpen(isOpen);
    if (isOpen) {
      await fetchSettings();

      if (!summary && !loading) {
        generateSummary();
      }
    }
  };

  // Basic markdown renderer for headings and bullet points
  const renderSummaryContent = (text: string) => {
    return text.split("\n").map((line, idx) => {
      if (line.startsWith("### ")) {
        return (
          <h4 key={idx} className="text-sm font-bold mt-4 mb-2 text-foreground">
            {line.replace("### ", "")}
          </h4>
        );
      }
      if (line.startsWith("## ")) {
        return (
          <h3
            key={idx}
            className="text-base font-bold mt-4 mb-2 text-foreground"
          >
            {line.replace("## ", "")}
          </h3>
        );
      }
      if (line.startsWith("* ") || line.startsWith("- ")) {
        return (
          <li
            key={idx}
            className="ml-4 list-disc text-sm text-muted-foreground my-1 leading-relaxed"
          >
            {line.replace(/^[\*\-]\s+/, "")}
          </li>
        );
      }
      if (line.trim() === "") {
        return <div key={idx} className="h-2" />;
      }
      return (
        <p
          key={idx}
          className="text-sm text-muted-foreground my-1.5 leading-relaxed"
        >
          {line}
        </p>
      );
    });
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-xs border-purple-200 hover:border-purple-300 bg-purple-50/30 hover:bg-purple-50/60 dark:bg-purple-950/10 dark:hover:bg-purple-950/20 text-purple-700 dark:text-purple-300"
          >
            <Sparkles className="h-3.5 w-3.5 fill-purple-200 dark:fill-none" />
            AI Summary
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md p-6 max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-purple-700 dark:text-purple-300">
            <Sparkles className="h-5 w-5" />
            AI Document Summary
          </DialogTitle>
          <DialogDescription>
            A concise overview of the current document text is below.
          </DialogDescription>
        </DialogHeader>

        {!hasApiKey && (
          <div className="text-xs bg-amber-50 dark:bg-amber-950/20 text-amber-800 dark:text-amber-300 px-3.5 py-2.5 rounded-md border border-amber-200 dark:border-amber-950/40 flex flex-col gap-1.5 mt-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold">⚠️ Plz set your model and API key</span>
              <Link
                href="/dashboard"
                className="underline hover:text-amber-900 dark:hover:text-amber-100 flex items-center gap-0.5 font-semibold text-[11px]"
              >
                Go to Dashboard
                <ExternalLink className="h-3 w-3" />
              </Link>
            </div>
            <p className="text-[11px] text-amber-700/80 dark:text-amber-400/80 leading-relaxed">
              No custom API key was found in your local settings. Falling back to default system limits.
            </p>
          </div>
        )}

        <div className="flex-1 mt-4 overflow-y-auto pr-2 min-h-[150px] flex flex-col justify-center">
          {loading ? (
            <div className="flex flex-col items-center justify-center gap-2 py-12 text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin text-purple-500" />
              <p className="text-xs">Analyzing document content...</p>
            </div>
          ) : summary ? (
            <div className="space-y-1">{renderSummaryContent(summary)}</div>
          ) : (
            <p className="text-center text-xs text-muted-foreground py-12">
              No summary available.
            </p>
          )}
        </div>

        {hasApiKey && !loading && (
          <p className="text-[10px] text-muted-foreground mt-2 border-t pt-2 border-border/40">
            Using custom model: <code className="bg-muted px-1.5 py-0.5 rounded font-mono text-[10px] text-purple-600 dark:text-purple-400">{customModel}</code>
          </p>
        )}

        {summary && !loading && (
          <div className="mt-4 flex justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={generateSummary}
              className="gap-1 text-xs"
            >
              <Sparkles className="h-3 w-3" />
              Regenerate
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
