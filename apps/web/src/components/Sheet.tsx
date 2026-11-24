import { useCallback, useEffect, useRef, type ReactNode } from "react";
import { Icon } from "./Icon";
export type DismissSheet = (afterClose?: () => void) => void;
const HISTORY_KEY = "anisongSheet";
let sheetSequence = 0;
export function Sheet({
  title,
  onClose,
  children,
  className = "",
  backButton = false,
  alertDialog = false,
  dismissDisabled = false,
  closeLabel,
  headerAction,
  subtitle,
  onNavigateBack,
}: {
  className?: string;
  backButton?: boolean;
  alertDialog?: boolean;
  dismissDisabled?: boolean;
  closeLabel?: string;
  headerAction?: ReactNode;
  subtitle?: string;
  onNavigateBack?: () => boolean;
  title: string;
  onClose: () => void;
  children: ReactNode | ((dismiss: DismissSheet) => ReactNode);
}) {
  const ref = useRef<HTMLElement>(null),
    close = useRef(onClose);
  close.current = onClose;
  const locked = useRef(dismissDisabled);
  locked.current = dismissDisabled;
  const navigateBack = useRef(onNavigateBack);
  navigateBack.current = onNavigateBack;
  const navigation = useRef<{
    id: string;
    url: string;
    closing: boolean;
    popped: boolean;
    after?: () => void;
  } | null>(null);
  const dismiss = useCallback<DismissSheet>((afterClose) => {
    if (locked.current && !afterClose) return;
    if (!afterClose && navigateBack.current?.()) return;
    const entry = navigation.current;
    if (entry?.closing) return;
    if (
      entry &&
      location.href === entry.url &&
      history.state?.[HISTORY_KEY] === entry.id
    ) {
      entry.closing = true;
      entry.after = afterClose;
      history.back();
      return;
    }
    close.current();
    afterClose?.();
  }, []);
  useEffect(() => {
    ref.current?.focus();
  }, [title]);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const entry = {
      // A navigation marker, not a security token. HTTP development previews
      // do not expose randomUUID, but must still open and dismiss panels.
      id: crypto.randomUUID?.() ?? `sheet-${Date.now()}-${++sheetSequence}`,
      url: location.href,
      closing: false,
      popped: false,
      after: undefined as (() => void) | undefined,
    };
    try {
      history.pushState(
        { ...history.state, [HISTORY_KEY]: entry.id },
        "",
        entry.url,
      );
      navigation.current = entry;
    } catch {
      /* Embedded contexts that disallow history can still close explicitly. */
    }
    const back = () => {
      if (history.state?.[HISTORY_KEY] === entry.id || entry.popped) return;
      entry.popped = true;
      close.current();
      // Consume the panel history entry before a menu action changes the route.
      entry.after?.();
    };
    window.addEventListener("popstate", back);
    ref.current?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        dismiss();
      }
      if (e.key === "Tab") {
        const nodes = Array.from(ref.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]',
        ) ?? []).filter((node) => !node.closest("[hidden]"));
        if (!nodes.length) return;
        const first = nodes[0],
          last = nodes[nodes.length - 1];
        if (
          e.shiftKey &&
          (document.activeElement === first ||
            document.activeElement === ref.current)
        ) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      window.removeEventListener("popstate", back);
      if (
        !entry.popped &&
        history.state?.[HISTORY_KEY] === entry.id &&
        location.href === entry.url
      )
        history.back();
      navigation.current = null;
      if (previous?.isConnected) previous.focus();
    };
  }, [dismiss]);
  return (
    <div
      className="sheet-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) dismiss();
      }}
    >
      <section
        ref={ref}
        tabIndex={-1}
        role={alertDialog ? "alertdialog" : "dialog"}
        aria-modal="true"
        aria-label={title}
        className={`app-sheet ${className}`}
      >
        <div className={`sheet-title ${backButton ? "sheet-title-back" : ""}`}>
          {backButton && <button aria-label={closeLabel ?? `关闭${title}`} disabled={dismissDisabled} onClick={() => dismiss()}><Icon name="back" /></button>}
          <div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>
          {headerAction}
          {!backButton && <button aria-label={closeLabel ?? `关闭${title}`} disabled={dismissDisabled} onClick={() => dismiss()}><Icon name="close" /></button>}
        </div>
        {typeof children === "function" ? children(dismiss) : children}
      </section>
    </div>
  );
}
