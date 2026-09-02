import { useEffect, useState } from 'react'
import { useT, makeDateFmt } from '../i18n'

/**
 * Photo gallery for a project.
 *
 * Renders NOTHING when the project has no photographs — no placeholder, no
 * stock image, no "image coming soon" panel. An invented picture of a public
 * works project is worse than no picture, so an empty gallery is silent.
 *
 * Images are ordered oldest-first so the strip reads as a progress record:
 * you can see what the site looked like over time.
 */

/* Photo kinds are API enum values. Known ones get a translated label; an
 * unknown kind simply shows no badge, exactly as `other` does today. */
const KIND_KEYS = {
  site: 'gallery.kind.site',
  progress: 'gallery.kind.progress',
  render: 'gallery.kind.render',
  map: 'gallery.kind.map',
  document_scan: 'gallery.kind.documentScan',
  event: 'gallery.kind.event',
  other: null,
}

export default function ProjectGallery({ images = [], projectTitle = '' }) {
  const { t, tn, isRTL } = useT()
  const fmtFull = makeDateFmt(t)
  const fmtDate = iso => (iso ? fmtFull(String(iso).slice(0, 10)) : null)
  const kindLabel = kind => (KIND_KEYS[kind] ? t(KIND_KEYS[kind]) : '')
  const photos = (images || []).filter(img => img && img.url)
  const [activeIndex, setActiveIndex] = useState(0)
  const [lightboxOpen, setLightboxOpen] = useState(false)

  // Keyboard navigation while the lightbox is open.
  useEffect(() => {
    if (!lightboxOpen) return
    function onKey(e) {
      if (e.key === 'Escape') setLightboxOpen(false)
      if (e.key === 'ArrowRight') setActiveIndex(i => (i + 1) % photos.length)
      if (e.key === 'ArrowLeft') setActiveIndex(i => (i - 1 + photos.length) % photos.length)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lightboxOpen, photos.length])

  // The whole point: no photos, no section.
  if (photos.length === 0) return null

  const sorted = [...photos].sort((a, b) => {
    const ad = a.capturedDate ? new Date(a.capturedDate).getTime() : 0
    const bd = b.capturedDate ? new Date(b.capturedDate).getTime() : 0
    return ad - bd
  })

  const active = sorted[Math.min(activeIndex, sorted.length - 1)]
  const dateSpan = (() => {
    const dated = sorted.filter(p => p.capturedDate)
    if (dated.length < 2) return null
    const first = fmtDate(dated[0].capturedDate)
    const last = fmtDate(dated[dated.length - 1].capturedDate)
    return first === last ? first : `${first} — ${last}`
  })()

  return (
    <section className="bg-surface-container-lowest rounded-xl shadow-sm border border-surface-variant overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-6 pt-5 pb-4 border-b border-surface-variant">
        <h3 className="text-headline-sm font-headline-sm text-on-surface flex items-center gap-2">
          <span className="material-symbols-outlined text-primary">photo_library</span>
          {t('gallery.title')}
        </h3>
        <span className="text-label-sm font-label-sm text-on-surface-variant text-end">
          {sorted.length} {tn('gallery.photos', sorted.length)}
          {dateSpan && <span className="hidden sm:inline"> · {dateSpan}</span>}
        </span>
      </div>

      {/* Main image */}
      <figure className="m-0">
        <button
          type="button"
          onClick={() => setLightboxOpen(true)}
          className="block w-full relative group cursor-zoom-in bg-surface-container-highest"
          aria-label={t('gallery.openLarger')}
        >
          <img
            src={active.url}
            alt={active.caption || projectTitle}
            className="w-full max-h-[420px] object-cover"
          />
          <span className="absolute top-3 end-3 bg-black/60 text-white rounded-full p-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <span className="material-symbols-outlined text-[18px] block">zoom_in</span>
          </span>
          {kindLabel(active.kind) && (
            <span className="absolute top-3 start-3 bg-black/65 text-white text-label-sm px-2 py-1 rounded">
              {kindLabel(active.kind)}
            </span>
          )}
        </button>

        <figcaption className="px-6 py-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          {active.caption && (
            <span className="text-body-md font-body-md text-on-surface">{active.caption}</span>
          )}
          {active.capturedDate && (
            <span className="text-label-sm font-label-sm text-on-surface-variant flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px]">calendar_month</span>
              {fmtDate(active.capturedDate)}
            </span>
          )}
          {active.credit && (
            <span className="text-label-sm font-label-sm text-outline ms-auto">
              © {active.credit}
              {active.sourceUrl && (
                <>
                  {' · '}
                  <a
                    href={active.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    {t('gallery.sourceLink')}
                  </a>
                </>
              )}
            </span>
          )}
        </figcaption>
      </figure>

      {/* Thumbnail strip — only when there's more than one */}
      {sorted.length > 1 && (
        <div className="px-6 pb-5 flex gap-2 overflow-x-auto">
          {sorted.map((img, i) => (
            <button
              key={img.url + i}
              type="button"
              onClick={() => setActiveIndex(i)}
              aria-label={img.caption || t('gallery.photoN', { n: i + 1 })}
              aria-current={i === activeIndex}
              className={`flex-shrink-0 w-24 h-16 rounded-md overflow-hidden border-2 transition-all ${
                i === activeIndex
                  ? 'border-primary opacity-100'
                  : 'border-transparent opacity-60 hover:opacity-100'
              }`}
            >
              <img
                src={img.thumbnailUrl || img.url}
                alt=""
                loading="lazy"
                className="w-full h-full object-cover"
              />
            </button>
          ))}
        </div>
      )}

      {/* Lightbox */}
      {lightboxOpen && (
        <div
          className="fixed inset-0 z-[100] bg-black/90 flex flex-col items-center justify-center p-4"
          onClick={() => setLightboxOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label={t('gallery.viewer')}
        >
          <button
            type="button"
            onClick={() => setLightboxOpen(false)}
            className="absolute top-4 end-4 text-white/80 hover:text-white p-2"
            aria-label={t('common.close')}
          >
            <span className="material-symbols-outlined text-3xl">close</span>
          </button>

          {sorted.length > 1 && (
            <>
              <button
                type="button"
                onClick={e => { e.stopPropagation(); setActiveIndex(i => (i - 1 + sorted.length) % sorted.length) }}
                className="absolute start-2 md:start-6 text-white/70 hover:text-white p-3"
                aria-label={t('gallery.previousPhoto')}
              >
                {/* the arrow follows the writing direction, not the screen */}
                <span className="material-symbols-outlined text-4xl">{isRTL ? 'chevron_right' : 'chevron_left'}</span>
              </button>
              <button
                type="button"
                onClick={e => { e.stopPropagation(); setActiveIndex(i => (i + 1) % sorted.length) }}
                className="absolute end-2 md:end-6 text-white/70 hover:text-white p-3"
                aria-label={t('gallery.nextPhoto')}
              >
                <span className="material-symbols-outlined text-4xl">{isRTL ? 'chevron_left' : 'chevron_right'}</span>
              </button>
            </>
          )}

          <img
            src={active.url}
            alt={active.caption || projectTitle}
            onClick={e => e.stopPropagation()}
            className="max-h-[80vh] max-w-full object-contain rounded"
          />

          <div className="mt-4 text-center max-w-2xl" onClick={e => e.stopPropagation()}>
            {active.caption && <p className="text-white text-body-md">{active.caption}</p>}
            <p className="text-white/55 text-label-sm mt-1">
              {[fmtDate(active.capturedDate), active.credit && `© ${active.credit}`]
                .filter(Boolean).join(' · ')}
              {sorted.length > 1 && ` · ${t('gallery.position', { n: activeIndex + 1, total: sorted.length })}`}
            </p>
          </div>
        </div>
      )}
    </section>
  )
}
