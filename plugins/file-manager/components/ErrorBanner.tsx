import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { parseRpcError } from "../lib/errors";
import { defineMessages, useMessages } from "../lib/i18n";

const messages = defineMessages(
  { unknown: "Unknown error.", retry: "Retry", dismiss: "Dismiss" },
  { unknown: "Неизвестная ошибка.", retry: "Повторить", dismiss: "Закрыть" },
);

export interface ErrorBannerProps {
  error: unknown;
  title?: string;
  onRetry?: () => void;
  onDismiss?: () => void;
  tone?: "error" | "warning";
  className?: string;
}

export function ErrorBanner({
  error,
  title,
  onRetry,
  onDismiss,
  tone = "error",
  className,
}: ErrorBannerProps) {
  const t = useMessages(messages);
  const parsed = parseRpcError(error);
  const detail = parsed.message === "" ? t.unknown : parsed.message;

  return (
    <div
      role="alert"
      data-testid="fm-error-banner"
      data-error-code={parsed.code ?? ""}
      className={cn(
        "flex items-start gap-2 border-b px-3 py-2 text-sm",
        tone === "error"
          ? "border-surface-destructive-border bg-surface-destructive"
          : "border-border bg-surface-attention text-warning-text",
        className,
      )}
    >
      <Icon
        name="AlertTriangle"
        className={cn(
          "mt-0.5 size-4 shrink-0",
          tone === "error" && "text-destructive",
        )}
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        {title === undefined ? null : (
          <p
            className={cn(
              "font-medium",
              tone === "error" && "text-destructive",
            )}
          >
            {title}
          </p>
        )}
        <p className="break-words text-xs text-muted-foreground">{detail}</p>
      </div>
      {onRetry === undefined ? null : (
        <Button type="button" variant="outline" size="sm" onClick={onRetry}>
          {t.retry}
        </Button>
      )}
      {onDismiss === undefined ? null : (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="size-8 p-0"
          aria-label={t.dismiss}
          onClick={onDismiss}
        >
          <Icon name="X" className="size-4" aria-hidden="true" />
        </Button>
      )}
    </div>
  );
}
