import { Clock, Zap, Move, Layers, Activity, Cpu } from "lucide-react";

const metricIconMap = {
  fcp: Clock,
  lcp: Zap,
  tbt: Cpu,
  cls: Move,
  speedIndex: Activity,
  interactive: Layers,
};

export default function MetricItem({ metric }) {
  const Icon = metricIconMap[metric.id] || Activity;
  const score = metric.score !== null ? Math.round(metric.score * 100) : null;

  let tone = "success";
  let label = "Good";

  if (score !== null) {
    if (score < 50) {
      tone = "critical";
      label = "Poor";
    } else if (score < 90) {
      tone = "warning";
      label = "Needs Work";
    }
  } else {
    tone = "neutral";
    label = "Info";
  }

  return (
    <s-box
      padding="base"
      borderWidth="base"
      borderRadius="base"
      background="subdued"
    >
      <s-stack direction="block" gap="small-100">
        <s-stack direction="inline" justifycontent="space-between" alignitems="center">
          <s-stack direction="inline" gap="small-100" alignitems="center">
            <Icon size={16} color="#5c5f62" />
            <s-heading>{metric.title}</s-heading>
          </s-stack>
          <s-badge tone={tone}>{label}</s-badge>
        </s-stack>

        <s-heading>{metric.displayValue}</s-heading>

        <s-paragraph>
          <s-text tone="subdued">{metric.description}</s-text>
        </s-paragraph>

        {score !== null && (
          <s-progress value={score} max={100} />
        )}
      </s-stack>
    </s-box>
  );
}
