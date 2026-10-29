import { Lightbulb, Clock, Download } from "lucide-react";

export default function OpportunityCard({ opportunity }) {
  const savingsMs = opportunity.savingsMs
    ? `${(opportunity.savingsMs / 1000).toFixed(2)}s`
    : null;
  const savingsBytes = opportunity.savingsBytes
    ? `${(opportunity.savingsBytes / 1024).toFixed(0)} KB`
    : null;

  const isHighImpact = (opportunity.savingsMs || 0) > 1000;

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
            <Lightbulb size={18} color={isHighImpact ? "#bf0711" : "#b95000"} />
            <s-heading>{opportunity.title}</s-heading>
            <s-badge tone={isHighImpact ? "critical" : "warning"}>
              {isHighImpact ? "High Impact" : "Medium Impact"}
            </s-badge>
          </s-stack>

          <s-stack direction="inline" gap="small-50">
            {savingsMs && (
              <s-badge tone="critical">
                <Clock size={12} style={{ marginRight: "4px" }} />
                Save ~{savingsMs}
              </s-badge>
            )}
            {savingsBytes && (
              <s-badge tone="info">
                <Download size={12} style={{ marginRight: "4px" }} />
                {savingsBytes}
              </s-badge>
            )}
          </s-stack>
        </s-stack>

        <s-paragraph>
          <s-text tone="subdued">
            {opportunity.description.replace(/\[(.*?)\]\((.*?)\)/g, "$1")}
          </s-text>
        </s-paragraph>
      </s-stack>
    </s-box>
  );
}
