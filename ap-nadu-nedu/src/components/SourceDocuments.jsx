import { Link } from 'react-router-dom'
import { useT } from '../i18n'

/**
 * "Source Documents" — the provenance section on a project/MoU/tender page.
 *
 * Every entry answers three questions a skeptical reader should ask:
 *   1. What is this document?    (title, type, reference number)
 *   2. Where did it come from?   (portal + the exact page it was collected from)
 *   3. When did we collect it?   (dated, so staleness is visible)
 *
 * Renders nothing when there are no documents — a citation section with
 * invented entries would defeat its own purpose.
 */

// Role badges: the label is a catalogue key, the icon never translates.
const ROLE_LABELS = {
  sanction_order: { key: 'sourceDocs.role.sanctionOrder', icon: 'gavel' },
  budget_allocation: { key: 'sourceDocs.role.budgetAllocation', icon: 'payments' },
  tender_notice: { key: 'sourceDocs.role.tenderNotice', icon: 'campaign' },
  progress_report: { key: 'sourceDocs.role.progressReport', icon: 'monitoring' },
  audit_finding: { key: 'sourceDocs.role.auditFinding', icon: 'fact_check' },
  agreement: { key: 'sourceDocs.role.agreement', icon: 'handshake' },
  clearance: { key: 'sourceDocs.role.clearance', icon: 'verified' },
  reference: { key: 'sourceDocs.role.reference', icon: 'description' },
}

const fmtDate = iso =>
  iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : null

export default function SourceDocuments({ documents = [] }) {
  const { t } = useT()
  if (!documents.length) return null

  return (
    <section className="bg-surface-container-lowest rounded-xl shadow-sm border border-surface-variant overflow-hidden">
      <div className="px-6 pt-5 pb-4 border-b border-surface-variant flex flex-col gap-1">
        <h3 className="text-headline-sm font-headline-sm text-on-surface flex items-center gap-2">
          <span className="material-symbols-outlined text-primary">folder_open</span>
          {t('sourceDocs.title')}
        </h3>
        <p className="text-label-md font-label-md text-on-surface-variant">
          {t('sourceDocs.intro')}
        </p>
      </div>

      <ul className="divide-y divide-surface-variant">
        {documents.map(doc => {
          const role = ROLE_LABELS[doc.role] || ROLE_LABELS.reference
          return (
            <li key={doc.id} className="px-6 py-4 flex flex-col gap-2">
              <div className="flex items-start gap-3">
                <span className="material-symbols-outlined text-outline mt-0.5 flex-shrink-0">{role.icon}</span>
                <div className="flex flex-col gap-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-label-sm font-label-sm bg-surface-container-high text-on-surface-variant px-2 py-0.5 rounded-full uppercase tracking-wide">
                      {t(role.key)}
                    </span>
                    {doc.referenceNumber && (
                      <span className="text-label-sm font-label-sm text-outline font-mono">{doc.referenceNumber}</span>
                    )}
                  </div>
                  <span className="text-body-md font-body-md text-on-surface font-semibold">{doc.title}</span>
                  {doc.note && (
                    <span className="text-body-md text-on-surface-variant">{doc.note}</span>
                  )}

                  {/* Provenance line — the heart of the section */}
                  <div className="text-label-sm font-label-sm text-on-surface-variant flex flex-wrap items-center gap-x-1.5 gap-y-0.5 mt-1">
                    <span className="text-outline">{t('sourceDocs.collectedFrom')}</span>
                    {doc.collectedFromUrl ? (
                      <a
                        href={doc.collectedFromUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline font-semibold inline-flex items-center gap-0.5 min-w-0"
                      >
                        {doc.collectedFromTitle || doc.sourcePortal}
                        <span className="material-symbols-outlined text-[13px]">open_in_new</span>
                      </a>
                    ) : (
                      <span className="font-semibold">{doc.sourcePortal}</span>
                    )}
                    {fmtDate(doc.collectedAt) && (
                      <>
                        <span className="text-outline">·</span>
                        <span>{t('sourceDocs.onDate', { date: fmtDate(doc.collectedAt) })}</span>
                      </>
                    )}
                  </div>
                </div>

                <div className="ms-auto flex flex-col items-end gap-1.5 flex-shrink-0">
                  {doc.sourceUrl && (
                    <a
                      href={doc.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      data-nowrap-en
                      className="text-label-sm font-label-sm text-primary hover:underline inline-flex items-center gap-1 whitespace-nowrap"
                    >
                      {t('sourceDocs.original')} <span className="material-symbols-outlined text-[14px]">open_in_new</span>
                    </a>
                  )}
                  <Link
                    to="/documents"
                    data-nowrap-en
                    className="text-label-sm font-label-sm text-on-surface-variant hover:text-primary hover:underline inline-flex items-center gap-1 whitespace-nowrap"
                  >
                    {t('sourceDocs.inLibrary')} <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
                  </Link>
                </div>
              </div>
            </li>
          )
        })}
      </ul>

      <div className="px-6 py-3 bg-surface-container-low border-t border-surface-variant">
        <p className="text-label-sm font-label-sm text-outline">
          {t('sourceDocs.footer.before')}{' '}
          <Link to="/documents" className="text-primary hover:underline">{t('sourceDocs.footer.libraryLink')}</Link>.
        </p>
      </div>
    </section>
  )
}
