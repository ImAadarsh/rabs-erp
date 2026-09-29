export function StatCard(props: { title: string; value: string; hint?: string; icon?: React.ReactNode }) {
  const { title, value, hint, icon } = props;
  return (
    <div className="group relative h-full">
      <div className="relative h-full p-6 rounded-2xl border border-border bg-card hover:border-primary/30 transition-all duration-300 overflow-hidden">
        {/* Subtle gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

        {/* Content */}
        <div className="relative space-y-3">
          {/* Title and Icon */}
          <div className="flex items-center justify-between">
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              {title}
            </div>
            {icon && (
              <div className="p-2 rounded-lg bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary transition-all duration-300">
                {icon}
              </div>
            )}
          </div>

          {/* Value */}
          <div className="text-3xl font-bold text-foreground tracking-tight">
            {value}
          </div>

          {/* Hint */}
          {hint && (
            <div className="flex items-center gap-1.5">
              <div className="h-1 w-1 rounded-full bg-primary/50" />
              <span className="text-xs text-muted-foreground">{hint}</span>
            </div>
          )}
        </div>

        {/* Bottom accent line */}
        <div className="absolute bottom-0 left-0 h-0.5 w-0 group-hover:w-full bg-primary transition-all duration-500" />
      </div>
    </div>
  );
}
