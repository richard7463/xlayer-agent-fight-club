"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import type { ArenaAgent, ArenaLocale } from "@/lib/agentArena";
import { StatusBadge } from "./StatusBadge";
import { CircleAvatar } from "./CircleAvatar";

interface AgentCardProps {
  agent: ArenaAgent;
  locale: ArenaLocale;
}

function signedUsd(value: number) {
  const sign = value >= 0 ? "+" : "-";
  return `${sign}$${Math.abs(value).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function pct(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}


export function AgentCard({ agent, locale }: AgentCardProps) {
  // 根据 PnL 判断颜色
  const pnlColorClass = agent.pnl >= 0 ? "text-arena-pnl-positive" : "text-arena-pnl-negative";
  // 随机选择头像颜色 (为了演示，实际应用可能需要更稳定的方案)
  const avatarColors = [
    { bg: "bg-arena-avatar-bg-1", text: "text-arena-avatar-text-1" },
    { bg: "bg-arena-avatar-bg-2", text: "text-arena-avatar-text-2" },
    { bg: "bg-arena-avatar-bg-3", text: "text-arena-avatar-text-3" },
    { bg: "bg-arena-avatar-bg-4", text: "text-arena-avatar-text-4" },
    { bg: "bg-arena-avatar-bg-5", text: "text-arena-avatar-text-5" },
  ];
  const avatarStyle = avatarColors[Math.floor(Math.random() * avatarColors.length)];

  // 将 Tailwind bg-class 转换为 hex 值 (需要一个映射表或者更复杂的解析)
  // 为了简化，这里暂时直接使用 Tailwind class，但在 style 中需要 hex
  // 实际应用中，可以在 tailwind.config.js 中获取这些 hex 值
  const getHexColor = (tailwindClass: string) => {
    switch (tailwindClass) {
      case "bg-arena-avatar-bg-1": return "#DBEAFE";
      case "bg-arena-avatar-bg-2": return "#FEE2E2";
      case "bg-arena-avatar-bg-3": return "#D1FAE5";
      case "bg-arena-avatar-bg-4": return "#EDE9FE";
      case "bg-arena-avatar-bg-5": return "#FFEDD5";
      default: return "#CCCCCC"; // Default color
    }
  };


  return (
    <Link
      href={`/fight-club/${agent.id}`}
      className="card-base agent-card-layout"
    >
      <div className="flex items-center gap-4">
        <CircleAvatar
          value={agent.shortName}
          color={getHexColor(avatarStyle.bg)}
          textColor={avatarStyle.text}
        />
        <div className="min-w-0">
          <div className="truncate text-xl font-semibold tracking-tight text-arena-dark">
            {agent.name}
          </div>
          <div className="truncate text-sm text-arena-text-secondary">
            {agent.style}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <div className="text-sm text-arena-text-secondary">
            {locale === "zh" ? "盈亏" : "PnL"}
          </div>
          <div className={cn("text-2xl font-bold tracking-tight", pnlColorClass)}>
            {signedUsd(agent.pnl)}
          </div>
          <div className={cn("text-base", pnlColorClass)}>
            {pct(agent.roi)}
          </div>
        </div>
        <div>
          <div className="text-sm text-arena-text-secondary">
            {locale === "zh" ? "稳定度" : "Stability"}
          </div>
          <div className="text-2xl font-bold tracking-tight text-arena-pill-orange-text">
            {agent.scorecard.stabilityScore}
          </div>
          <div className="text-base text-arena-text-secondary">
            {agent.scorecard.runtimeGuardTrips} {locale === "zh" ? "风控触发" : "guard trips"}
          </div>
        </div>
        <div>
          <div className="text-sm text-arena-text-secondary">
            {locale === "zh" ? "风险调整" : "Risk Adj."}
          </div>
          <div className="text-2xl font-bold tracking-tight text-arena-pill-blue-text">
            {agent.scorecard.riskAdjustedReturn.toFixed(1)}
          </div>
          <div className="text-base text-arena-text-secondary">
            PF {agent.scorecard.profitFactor.toFixed(2)}
          </div>
        </div>
        <div>
          <div className="text-sm text-arena-text-secondary">
            {locale === "zh" ? "创建者" : "Creator"}
          </div>
          <div className="text-base font-semibold text-arena-promotion-score-text">
            {agent.creator}
          </div>
        </div>
      </div>

      <div className="min-w-0">
        <div className="text-sm text-arena-text-secondary">
          {locale === "zh" ? "策略简介" : "Thesis"}
        </div>
        <div className="line-clamp-2 text-base leading-relaxed text-arena-text-secondary">
          {agent.description}
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 pt-2">
        <StatusBadge stage={agent.promotion.stage} locale={locale} />
        <Link
          href={`/fight-club/${agent.id}`}
          className="inline-flex items-center justify-center rounded-full bg-arena-pill-blue-bg px-4 py-2 text-sm font-medium text-arena-pill-blue-text transition-colors duration-200 hover:bg-blue-600 hover:text-white"
        >
          {locale === "zh" ? "详情" : "Results"}
        </Link>
      </div>
    </Link>
  );
}

