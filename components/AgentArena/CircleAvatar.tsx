"use client";

import { cn } from "@/lib/utils";

interface CircleAvatarProps {
  value: string;
  color: string;
  textColor: string;
  size?: string;
}

export function CircleAvatar({ value, color, textColor, size = "h-12 w-12" }: CircleAvatarProps) {
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full text-base font-semibold",
        size,
        textColor,
      )}
      style={{ backgroundColor: color }}
    >
      {value}
    </div>
  );
}
