import { Link } from 'react-router-dom'
import { useT } from '../../i18n'

export default function Footer() {
  const { t } = useT()

  return (
    <footer className="bg-tertiary text-on-tertiary w-full py-8 px-4 md:px-8 border-t-4 border-secondary-container mt-auto">
      <div className="max-w-[1280px] mx-auto flex flex-col gap-6">
        <div className="flex flex-col md:flex-row justify-between items-start gap-6">
          <div className="flex flex-col gap-2 max-w-xl min-w-0">
            <h2 className="text-headline-sm font-headline-sm text-on-tertiary font-bold">AP Nadu Nedu</h2>
            <p className="text-label-sm font-label-sm text-on-tertiary-container">
              {t('footer.tagline')}
            </p>
            <p className="text-label-sm font-label-sm text-on-tertiary-container/90 leading-relaxed mt-1">
              {t('footer.disclaimer')}
            </p>
            <p className="text-label-sm font-label-sm text-on-tertiary-container/70 leading-relaxed">
              {t('footer.disclaimerTe')}
            </p>
          </div>
          <nav className="flex flex-wrap gap-x-4 gap-y-2 text-label-sm font-label-sm md:justify-end">
            <Link to="/about" className="text-on-tertiary-container hover:text-on-tertiary hover:underline transition-all">{t('footer.links.about')}</Link>
            <Link to="/sources" className="text-on-tertiary-container hover:text-on-tertiary hover:underline transition-all">{t('footer.links.sources')}</Link>
            <Link to="/updates" className="text-on-tertiary-container hover:text-on-tertiary hover:underline transition-all">{t('footer.links.updates')}</Link>
            <Link to="/disclaimer" className="text-on-tertiary-container hover:text-on-tertiary hover:underline transition-all">{t('footer.links.disclaimer')}</Link>
            <Link to="/community?correct=1" className="text-on-tertiary-container hover:text-on-tertiary hover:underline transition-all">{t('footer.links.correction')}</Link>
            <a
              href="https://rtionline.ap.gov.in"
              target="_blank"
              rel="noopener noreferrer"
              className="text-on-tertiary-container hover:text-on-tertiary hover:underline transition-all"
            >
              {t('footer.links.rti')}
            </a>
          </nav>
        </div>
        <div className="w-full h-px bg-on-tertiary-container/30" />
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-2">
          <p className="text-label-sm font-label-sm text-on-tertiary-container min-w-0">
            {t('footer.copyright')}
          </p>
          <p className="text-label-sm font-label-sm text-on-tertiary-container opacity-70 min-w-0">
            {t('footer.copyrightAct')}
          </p>
        </div>
      </div>
    </footer>
  )
}
