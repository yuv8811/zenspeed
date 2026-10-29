export default function PageSkeleton() {
  return (
    <s-page heading="Loading page...">
      {/* Skeleton Stats Grid */}
      <s-section>
        <s-grid gridtemplatecolumns="repeat(auto-fit, minmax(220px, 1fr))" gap="base">
          {[1, 2, 3, 4].map((i) => (
            <s-box
              key={i}
              padding="base"
              borderRadius="base"
              borderWidth="base"
              background="subdued"
            >
              <s-stack direction="block" gap="small-100">
                <s-box
                  inlinesize="50%"
                  blocksize="14px"
                  borderRadius="base"
                  style={{
                    backgroundColor: "rgba(0, 0, 0, 0.08)",
                    animation: "zenspeed-pulse 1.4s ease-in-out infinite",
                  }}
                />
                <s-box
                  inlinesize="70%"
                  blocksize="28px"
                  borderRadius="base"
                  style={{
                    backgroundColor: "rgba(0, 0, 0, 0.12)",
                    animation: "zenspeed-pulse 1.4s ease-in-out infinite",
                    animationDelay: "0.2s",
                  }}
                />
                <s-box
                  inlinesize="85%"
                  blocksize="12px"
                  borderRadius="base"
                  style={{
                    backgroundColor: "rgba(0, 0, 0, 0.06)",
                    animation: "zenspeed-pulse 1.4s ease-in-out infinite",
                    animationDelay: "0.3s",
                  }}
                />
              </s-stack>
            </s-box>
          ))}
        </s-grid>
      </s-section>

      {/* Skeleton Content Section */}
      <s-section>
        <s-box
          padding="loose"
          borderRadius="base"
          borderWidth="base"
          background="subdued"
        >
          <s-stack direction="block" gap="base">
            <s-box
              inlinesize="35%"
              blocksize="22px"
              borderRadius="base"
              style={{
                backgroundColor: "rgba(0, 0, 0, 0.1)",
                animation: "zenspeed-pulse 1.4s ease-in-out infinite",
              }}
            />
            <s-box
              inlinesize="90%"
              blocksize="14px"
              borderRadius="base"
              style={{
                backgroundColor: "rgba(0, 0, 0, 0.06)",
                animation: "zenspeed-pulse 1.4s ease-in-out infinite",
                animationDelay: "0.15s",
              }}
            />
            <s-box
              inlinesize="80%"
              blocksize="14px"
              borderRadius="base"
              style={{
                backgroundColor: "rgba(0, 0, 0, 0.06)",
                animation: "zenspeed-pulse 1.4s ease-in-out infinite",
                animationDelay: "0.25s",
              }}
            />
            <s-box
              inlinesize="100%"
              blocksize="140px"
              borderRadius="base"
              style={{
                backgroundColor: "rgba(0, 0, 0, 0.05)",
                animation: "zenspeed-pulse 1.4s ease-in-out infinite",
                animationDelay: "0.35s",
              }}
            />
          </s-stack>
        </s-box>
      </s-section>
    </s-page>
  );
}

