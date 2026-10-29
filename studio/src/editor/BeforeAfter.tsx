import {ui} from './i18n.ts';
export function BeforeAfter({ before, onChange, disabled = false }: {
    before: boolean;
    onChange: (value: boolean) => void;
    disabled?: boolean;
}) {
    return <div className="before-after" role="group" aria-label={ui("Сравнение до и после")}><button type="button" aria-pressed={!disabled && before} disabled={disabled} onClick={() => onChange(true)}>{ui("До")}</button><button type="button" aria-pressed={!disabled && !before} disabled={disabled} onClick={() => onChange(false)}>{ui("После")}</button></div>;
}
