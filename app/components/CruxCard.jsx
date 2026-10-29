import { Globe } from "lucide-react";

export default function CruxCard({ title, category, percentile }) {
  let tone = "success";
  let label = "Good Experience";

  if (category === "SLOW") {
    tone = "critical";
    label = "Poor Experience";
  } else if (category === "AVERAGE") {
    tone = "warning";
    label = "Needs Improvement";
  } else if (category === "DATA_UNAVAILABLE") {
    tone = "neutral";
    label = "Low Traffic Sample";
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
          <s-text tone="subdued">{title}</s-text>
          <Globe size={16} color="#6d7175" />
        </s-stack>

        <s-heading>{category ? category.replace(/_/g, " ") : "N/A"}</s-heading>

        <s-stack direction="inline" justifycontent="space-between" alignitems="center">
          <s-badge tone={tone}>{label}</s-badge>
          {percentile !== null && percentile !== undefined && (
            <s-text tone="subdued">p75: {percentile}</s-text>
          )}
        </s-stack>
      </s-stack>
    </s-box>
  );
}
