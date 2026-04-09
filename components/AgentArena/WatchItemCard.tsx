"use client";

import { cn } from "@/lib/utils";
import type { WatchItem } from "@/lib/agentArena";

interface WatchItemCardProps {
  item: WatchItem;
  index: number; // 用于随机颜色
}

export function WatchItemCard({ item, index }: WatchItemCardProps) {
  // 随机选择颜色
  const colors = ["bg-arena-watchlist-item-blue", "bg-arena-watchlist-item-red", "bg-arena-watchlist-item-green"];
  const bgColor = colors[index % colors.length];

  return (
    <div className="card-base watchlist-card-layout">
      <div
        className={cn(
          "inline-flex h-10 w-10 items-center justify-center rounded-full",
          bgColor,
        )}
      />
      <div className="text-2xl font-semibold tracking-tight text-arena-dark">{item.name}</div>
      <div className="text-sm font-medium uppercase tracking-wider text-arena-text-secondary">
        Scout Note
      </div>
      <div className="text-base leading-relaxed text-arena-text-secondary">{item.note}</div>
      <p className="text-base leading-relaxed text-arena-watchlist-item-text">{item.focus}</p>
    </div>
  );
}
