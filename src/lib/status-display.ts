export function statusDisplay(status: string) {
  return (
    (
      {
        draft: { name: "Draft", tone: "neutral" },
        sent: { name: "Sent", tone: "info" },
        viewed: { name: "Viewed", tone: "info" },
        signed_by_client: { name: "Won", tone: "success" },
        completed: { name: "Won", tone: "success" },
        declined: { name: "Lost", tone: "danger" },
        expired: { name: "Expired", tone: "neutral" },
        archived: { name: "Archived", tone: "neutral" },
      } as Record<string, { name: string; tone: string }>
    )[status] ?? { name: "Draft", tone: "neutral" }
  );
}
