import { cn } from '../lib/utils';

interface DeployBadgeProps {
  status: string;
}

const statusConfig: Record<string, { className: string; label: string; dot?: boolean; spin?: boolean }> = {
  pending:     { className: 'bg-yellow-100 text-yellow-800 border-yellow-200', label: 'Pending',     spin: true },
  building:    { className: 'bg-blue-100 text-blue-800 border-blue-200',       label: 'Building',    spin: true },
  running:     { className: 'bg-green-100 text-green-800 border-green-200',    label: 'Running',     dot: true },
  failed:      { className: 'bg-red-100 text-red-800 border-red-200',          label: 'Failed' },
  rolled_back: { className: 'bg-orange-100 text-orange-800 border-orange-200', label: 'Rolled Back' },
  never:       { className: 'bg-muted text-muted-foreground border-border',    label: 'Never' },
};

export default function DeployBadge({ status }: DeployBadgeProps) {
  const config = statusConfig[status] || statusConfig.never;

  return (
    <span className={cn('inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border text-xs font-medium', config.className)}>
      {config.spin && (
        <span className="w-2.5 h-2.5 rounded-full border-2 border-current border-t-transparent animate-spin" />
      )}
      {config.dot && (
        <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
      )}
      {config.label}
    </span>
  );
}
