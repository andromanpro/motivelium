import {localeTag} from './locale.ts';
import {ui} from './i18n.ts';
import { useState, type ReactNode } from 'react';
import { ExampleGallery } from './ExampleGallery.tsx';
import { TemplateGallery } from './TemplateGallery.tsx';
import type { ProjectSummary } from './api.ts';
import { CommandMenu } from './CommandMenu.tsx';
import { Icon } from './Icon.tsx';
import { MATTER_PREFIX } from '../../domain/matter.ts';
import { ENERGY_PREFIX } from '../../domain/energy.ts';
import { SHOWCASE_PREFIX } from '../../domain/showcase.ts';
export type HomeSection = 'projects' | 'templates' | 'examples';
export function ProjectHome({ brand, projects, loading, opening, notice, onOpen, onNew, onImport, onDemo, section, onSection, onSettings, onHelp, onAction, onDownload, onTemplateCreated, children }: {
    brand: ReactNode;
    projects: ProjectSummary[];
    loading: boolean;
    opening: boolean;
    notice: ReactNode;
    onOpen: (id: string) => void;
    onNew: () => void;
    onImport: () => void;
    onDemo: (preset: string) => void;
    section: HomeSection;
    onSection: (s: HomeSection) => void;
    onSettings: () => void;
    onHelp: () => void;
    onAction: (kind: 'rename' | 'copy', p: ProjectSummary) => void;
    onDownload: (id: string) => void;
    onTemplateCreated: (id: string, frame: number) => Promise<void>;
    children: ReactNode;
}) {
    const [query, setQuery] = useState('');
    const filtered = projects.filter(p => p.title.toLocaleLowerCase(localeTag()).includes(query.trim().toLocaleLowerCase(localeTag()))).sort((a, b) => a.title.localeCompare(b.title, localeTag()));
    return <div className="project-home workspace-home"><aside className="home-sidebar"><div className="home-brand">{brand}</div><nav aria-label={ui("Разделы студии")}>{([['projects', 'folder', ui("Проекты")], ['templates', 'layers', ui("Шаблоны")], ['examples', 'play', ui("Примеры")]] as const).map(([id, icon, label]) => <button key={id} aria-current={section === id ? 'page' : undefined} disabled={opening} onClick={() => onSection(id)}><Icon name={icon}/><span>{label}</span></button>)}</nav><nav className="home-service" aria-label={ui("Служебные разделы")}><button aria-label={ui("Настройки")} title={ui("Настройки")} onClick={onSettings} disabled={opening}><Icon name="settings"/><span>{ui("Настройки")}</span></button><button aria-label={ui("Справка")} title={ui("Справка")} onClick={onHelp} disabled={opening}><Icon name="help"/><span>{ui("Справка")}</span></button><small><i className="live-dot"/>{ui("Локальная студия")}</small></nav></aside><main className="home-content">
 <div className="project-shelf-heading"><div><span className="eyebrow">{ui("MOTIVELIUM / СТУДИЯ")}</span><h1>{{ projects: ui("Проекты"), templates: ui("Шаблоны"), examples: ui("Примеры") }[section]} {section === 'projects' && <small>{loading ? '…' : projects.length}</small>}</h1><p>{{ projects: ui("Продолжите работу или начните с пустой сцены."), templates: ui("Заготовки для новых роликов."), examples: ui("Готовые ролики, которые можно разобрать и изменить.") }[section]}</p></div><div className="shelf-actions"><button className="text-button" disabled={opening} onClick={onImport}><Icon name="folder" size={17}/>{ui("Импортировать")}</button><button className="primary" disabled={opening} onClick={onNew}><Icon name="plus" size={17}/>{ui("Новый проект")}</button></div></div>{notice}
 {section === 'projects' && <><div className="project-shelf-tools"><label className="project-search"><Icon name="search" size={17}/><input type="search" aria-label={ui("Поиск проектов")} placeholder={ui("Поиск проектов")} value={query} onChange={e => setQuery(e.target.value)}/></label><span className="project-sort">{ui("По названию")}</span></div>{loading ? <p className="loading" role="status">{ui("Загружаются проекты…")}</p> : filtered.length ? <div className="project-grid">{filtered.map((p, i) => { const matter = p.id.startsWith(MATTER_PREFIX + '-'), energy = p.id.startsWith(ENERGY_PREFIX + '-'), showcase = p.id.startsWith(SHOWCASE_PREFIX + '-'); return <article className="project-card has-actions" key={p.id}><CommandMenu appearance="more" label={ui("Действия с проектом") + " " + p.title} disabled={opening} commands={[{ label: ui("Переименовать…"), icon: 'text', action: () => onAction('rename', p) }, { label: ui("Создать копию…"), icon: 'layers', action: () => onAction('copy', p) }, { label: ui("Скачать проект…"), hint: ui("ZIP со всеми ресурсами"), icon: 'download', divider: true, action: () => onDownload(p.id) }]}/><button className="project-open" aria-label={ui("Открыть проект") + " " + p.title} onClick={() => onOpen(p.id)} disabled={opening}><div className={'project-art ' + (matter ? 'matter-art' : energy ? 'energy-art' : showcase ? 'showcase-art' : 'art-' + i % 3)}>{matter && <div className="matter-cover"><i /><i /><b>{ui("МАТЕРИЯ.")}</b></div>}{energy && <div className="energy-cover"><i /><b>{ui("РАЗРЯД.")}</b></div>}{showcase && <img src="/showcase/assets/kinetic-sculpture.png" alt=""/>}<span>{String(i + 1).padStart(2, '0')}</span>{!matter && !energy && !showcase && <div className="art-shape"/>}<small>{matter || energy || showcase ? ui("ДЕМОПРОЕКТ") : ui("ПРОЕКТ")}</small></div><div className="project-card-info"><h3>{p.title}</h3><p><span>{p.updatedAt ? new Date(p.updatedAt).toLocaleDateString(localeTag()) : ''}</span><span>{ui("Версия") + " "}{p.revision}</span></p><Icon name="arrow" size={18}/></div></button></article>; })}</div> : <div className="shelf-empty"><Icon name="folder" size={30}/><h2>{query ? ui("Проекты не найдены") : ui("Пока нет проектов")}</h2><p>{query ? ui("Измените запрос или очистите поиск.") : ui("Создайте проект, импортируйте ZIP или откройте пример.")}</p>{query && <button className="text-button" onClick={() => setQuery('')}>{ui("Очистить поиск")}</button>}</div>}</>}
 {section === 'examples' && <ExampleGallery disabled={opening} onDemo={onDemo}/>}
 {section === 'templates' && <TemplateGallery disabled={opening} onCreated={onTemplateCreated}/>}
 </main>{children}</div>;
}
