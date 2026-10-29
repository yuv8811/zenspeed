import { Gauge, Search, ShieldCheck, Sparkles } from "lucide-react";

const iconMap = {
  Performance: Gauge,
  SEO: Search,
  Accessibility: ShieldCheck,
  "Best Practices": Sparkles,
};

export default function ScoreCard({ label, score }) {
  const Icon = iconMap[label] || Gauge;

  let tone = "success";
  let statusText = "Good (90–100)";

  if (score < 50) {
    tone = "critical";
    statusText = "Poor (0–49)";
  } else if (score < 90) {
    tone = "warning";
    statusText = "Needs Work (50–89)";
  }

  return (
    <s-box
      padding="base"
      borderWidth="base"
      borderRadius="base"
      background="subdued"
    >
      <s-stack direction="block" gap="base" alignitems="center">
        <s-stack direction="inline" gap="small-100" alignitems="center">
          <Icon size={16} color="#5c5f62" />
          <s-heading>{label}</s-heading>
        </s-stack>

        <s-stack direction="block" gap="small-50" alignitems="center">
          <s-heading>{score}</s-heading>
          <s-text tone="subdued">out of 100</s-text>
        </s-stack>

        <s-badge tone={tone}>{statusText}</s-badge>

        <s-box inlinesize="100%">
          <s-progress value={Math.min(100, Math.max(0, score))} max={100} />
        </s-box>
      </s-stack>
    </s-box>
  );
}
