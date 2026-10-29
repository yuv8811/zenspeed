export default function StatBox({ label, value, subtext, icon: Icon, tone = "neutral" }) {
  const badgeToneMap = {
    neutral: "neutral",
    success: "success",
    warning: "warning",
    critical: "critical",
    info: "info",
  };

  const badgeTone = badgeToneMap[tone] || "";

  return (
    <s-box
      padding="base"
      borderWidth="base"
      borderRadius="base"
      background="subdued"
    >
      <s-stack direction="block" gap="small-100">
        <s-stack direction="inline" justifycontent="space-between" alignitems="center">
          <s-text tone="subdued">{label}</s-text>
          {Icon && <Icon size={18} color="#5c5f62" />}
        </s-stack>

        <s-stack direction="inline" alignitems="baseline" gap="small-50">
          <s-heading>{value}</s-heading>
        </s-stack>

        {subtext && (
          <s-stack direction="inline" alignitems="center" gap="small-50">
            <s-badge tone={badgeTone}>{subtext}</s-badge>
          </s-stack>
        )}
      </s-stack>
    </s-box>
  );
}
