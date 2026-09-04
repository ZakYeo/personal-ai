export function EmptyState({ subject }: { readonly subject: string }) {
  return (
    <div className="empty-state">
      <span>Quiet for now</span>
      <p>No {subject.toLowerCase()} information is available.</p>
    </div>
  );
}
