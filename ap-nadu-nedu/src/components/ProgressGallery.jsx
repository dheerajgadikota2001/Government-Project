import { useState } from 'react'
import { useT, makeDateFmt } from '../i18n'

/**
 * A project's photographs as a progress record, grouped by the year each one
 * was taken: cover first, then "2023 · 2024 · 2025" so a reader can watch the
 * same site change.
 *
 * Renders NOTHING when a project has no photographs. An invented or borrowed
 * picture of a public works project is worse than no picture, so an empty
 * gallery is silent — and every photograph that IS shown carries its date,
 * its credit and its licence, because a photo without provenance is not
 * evidence.
 */

/* Photo kinds are API enum values. Known ones get a translated label; an
 * unknown kind shows nothing, exactly as `other` does today. */
const KIND_KEYS = {
  site: 'progressGallery.kind.site', progress: 'progressGallery.kind.progress',
  render: 'progressGallery.kind.render', map: 'progressGallery.kind.map',
  document_scan: 'progressGallery.kind.documentScan',
  event: 'progressGallery.kind.event', other: null,
}

export default function ProgressGallery({ images = [], projectTitle = '' }) {
  const { t, tn } = useT()
  const fmtFull = makeDateFmt(t)
  const fmtDate = iso => (iso ? fmtFull(String(iso).slice(0, 10)) : null)
  const kindLabel = kind => (KIND_KEYS[kind] ? t(KIND_KEYS[kind]) : '')
  const photos = (images || []).filter(i => i && i.url)
  const [open, setOpen] = useState(null)   // index into `ordered`
  if (!photos.length) return null

  const cover = photos.find(p => p.isCover) || null
  const rest = photos.filter(p => p !== cover)

  // group the rest by the year the photo was taken; undated go last
  const byYear = {}
  const undated = []
  rest.forEach(p => {
    const y = p.capturedDate ? new Date(p.capturedDate).getFullYear() : null
    if (y) (byYear[y] = byYear[y] || []).push(p)
    else undated.push(p)
  })
  const years = Object.keys(byYear).map(Number).sort((a, b) => a - b)
  const ordered = [cover, ...years.flatMap(y => byYear[y]), ...undated].filter(Boolean)
  const idxOf = p => ordered.indexOf(p)

  const Credit = ({ p }) => (
    <p className="text-label-sm text-on-surface-variant mt-1">
      {p.credit ? `© ${p.credit}` : t('progressGallery.creditNotRecorded')}
      {p.license ? ` · ${p.license}` : ''}
      {p.sourceUrl && (
        <>
          {' · '}
          <a className="text-primary" href={p.sourceUrl} target="_blank" rel="noreferrer">{t('progressGallery.sourceLink')}</a>
        </>
      )}
    </p>
  )

  const Thumb = ({ p }) => (
    <button onClick={() => setOpen(idxOf(p))}
      className="text-start group border border-surface-variant rounded-lg overflow-hidden bg-surface-container-lowest hover:shadow-md transition-shadow">
      <span className="block h-28 bg-surface-container-highest overflow-hidden">
        <img src={p.thumbnailUrl || p.url} alt={p.caption || projectTitle} loading="lazy"
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
      </span>
      <span className="block px-2 py-1.5">
        <span className="block text-label-sm text-on-surface-variant">
          {kindLabel(p.kind)}{p.capturedDate ? ` · ${fmtDate(p.capturedDate)}` : ''}
        </span>
      </span>
    </button>
  )

  const shot = open != null ? ordered[open] : null

  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-title-md font-bold text-on-surface">{t('progressGallery.title')}</h2>
        <p className="text-label-sm text-on-surface-variant">
          {years.length > 1
            ? t('progressGallery.acrossYears', { years: years.length })
            : t('progressGallery.everyPhoto')}
        </p>
      </div>

      {cover && (
        <figure className="border border-surface-variant rounded-xl overflow-hidden bg-surface-container-lowest">
          <button onClick={() => setOpen(0)} className="block w-full">
            <img src={cover.url} alt={cover.caption || projectTitle}
              className="w-full max-h-[380px] object-cover" />
          </button>
          <figcaption className="px-4 py-3">
            <p className="text-body-md text-on-surface">{cover.caption || projectTitle}</p>
            <Credit p={cover} />
          </figcaption>
        </figure>
      )}

      {years.map(y => (
        <div key={y}>
          <p className="text-label-md font-bold text-on-surface border-b border-surface-variant pb-1 mb-2">
            {y}
            <span className="font-normal text-on-surface-variant"> · {tn('progressGallery.photographs', byYear[y].length)}</span>
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {byYear[y].map(p => <Thumb key={p.id ?? p.url} p={p} />)}
          </div>
        </div>
      ))}

      {undated.length > 0 && (
        <div>
          <p className="text-label-md font-bold text-on-surface border-b border-surface-variant pb-1 mb-2">
            {t('progressGallery.dateNotRecorded')}
            <span className="font-normal text-on-surface-variant"> · {undated.length}</span>
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {undated.map(p => <Thumb key={p.id ?? p.url} p={p} />)}
          </div>
          <p className="text-label-sm text-on-surface-variant mt-1">
            {t('progressGallery.undatedNote')}
          </p>
        </div>
      )}

      {shot && (
        <div className="fixed inset-0 z-[100] bg-black/85 flex flex-col items-center justify-center p-4"
          role="dialog" aria-modal="true" onClick={() => setOpen(null)}>
          <img src={shot.url} alt={shot.caption || projectTitle}
            className="max-h-[78vh] max-w-full object-contain rounded-lg"
            onClick={e => e.stopPropagation()} />
          <div className="mt-3 max-w-2xl text-center text-white/90" onClick={e => e.stopPropagation()}>
            <p className="text-body-md">{shot.caption || projectTitle}</p>
            <p className="text-label-sm text-white/70 mt-1">
              {shot.capturedDate ? fmtDate(shot.capturedDate) : t('progressGallery.dateNotRecordedInline')}
              {shot.credit ? ` · © ${shot.credit}` : ''}
              {shot.license ? ` · ${shot.license}` : ''}
            </p>
            {shot.sourceUrl && (
              <a className="text-label-sm text-white underline" href={shot.sourceUrl} target="_blank" rel="noreferrer">
                {t('progressGallery.whereFrom')}
              </a>
            )}
          </div>
          <div className="mt-3 flex gap-2" onClick={e => e.stopPropagation()}>
            <button onClick={() => setOpen(o => Math.max(0, o - 1))} disabled={open === 0}
              className="px-4 py-2 rounded-lg bg-white/15 text-white text-label-md disabled:opacity-40">{t('progressGallery.previous')}</button>
            <button onClick={() => setOpen(null)} className="px-4 py-2 rounded-lg bg-white/15 text-white text-label-md">{t('common.close')}</button>
            <button onClick={() => setOpen(o => Math.min(ordered.length - 1, o + 1))} disabled={open === ordered.length - 1}
              className="px-4 py-2 rounded-lg bg-white/15 text-white text-label-md disabled:opacity-40">{t('progressGallery.next')}</button>
          </div>
        </div>
      )}
    </section>
  )
}
