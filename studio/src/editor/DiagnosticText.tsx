import { ui } from './i18n.ts';
export const DETAIL_SEPARATOR = '\n[details]\n';
export function DiagnosticText({ message: input }: {
    message?: string;
}) {
    const message = input ?? '';
    const at = message.indexOf(DETAIL_SEPARATOR);
    if (at < 0)
        return <>{message}</>;
    return <>{message.slice(0, at)}<details className="diagnostic-details"><summary>{ui('Технические подробности')}</summary><pre>{message.slice(at + DETAIL_SEPARATOR.length)}</pre></details></>;
}
