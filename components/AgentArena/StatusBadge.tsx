"use client";

import { cn } from "@/lib/utils"; // 假设有一个通用的 cn 工具函数

type ArenaLocale = "en" | "zh";

function promotionLabel(locale: ArenaLocale) {
  return locale === "zh" ? "运行中" : "Running";
}

function pillTone() {
  return "bg-arena-pill-green-bg text-arena-pill-green-text";
}

interface StatusBadgeProps {
  stage: string;
  locale: ArenaLocale;
}

export function StatusBadge({ stage, locale }: StatusBadgeProps) {
  return (
    <span className={cn("status-badge", pillTone())}>
      {promotionLabel(locale)}
    </span>
  );
}
