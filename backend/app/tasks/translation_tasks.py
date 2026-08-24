"""
Translation Celery tasks — async Telugu translation for documents and data items.
"""

import asyncio
from app.tasks.celery_app import celery_app
from app.utils.logger import logger


def run_async(coro):
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


@celery_app.task(name="app.tasks.translation_tasks.translate_document_task", bind=True, max_retries=2)
def translate_document_task(self, doc_id: int):
    """Translate a single document to Telugu asynchronously."""
    async def _translate():
        from sqlalchemy import select
        from app.database import get_db_context
        from app.models.document import Document, DocumentTranslationStatus
        from app.services.translation import TranslationService

        async with get_db_context() as db:
            result = await db.execute(select(Document).where(Document.id == doc_id))
            doc = result.scalar_one_or_none()
            if not doc:
                return

            # Mark as in progress
            doc.translation_status = DocumentTranslationStatus.IN_PROGRESS

        async with get_db_context() as db:
            result = await db.execute(select(Document).where(Document.id == doc_id))
            doc = result.scalar_one_or_none()

            translator = TranslationService()
            try:
                # Translate title
                if doc.title:
                    doc.title_telugu = await translator.translate_to_telugu(doc.title)

                # Translate description
                if doc.description:
                    doc.description_telugu = await translator.translate_to_telugu(doc.description)

                doc.translation_status = DocumentTranslationStatus.COMPLETED
                logger.info(f"Document {doc_id} translated successfully")

            except Exception as e:
                doc.translation_status = DocumentTranslationStatus.FAILED
                logger.error(f"Document {doc_id} translation failed: {e}")

    try:
        run_async(_translate())
        return {"status": "success", "doc_id": doc_id}
    except Exception as exc:
        raise self.retry(exc=exc, countdown=300)


@celery_app.task(name="app.tasks.translation_tasks.translate_pending_items")
def translate_pending_items():
    """
    Batch translate all untranslated projects, tenders, MoUs.
    Runs every hour via Celery Beat.
    Processes 50 items at a time to stay within API rate limits.
    """
    async def _batch_translate():
        from sqlalchemy import select
        from app.database import get_db_context
        from app.models.project import Project
        from app.models.tender import Tender
        from app.models.mou import MOU
        from app.services.translation import TranslationService

        translator = TranslationService()
        translated = 0

        async with get_db_context() as db:
            # Translate untranslated projects (batch of 20)
            projects = (await db.execute(
                select(Project).where(Project.is_translated == False).limit(20)
            )).scalars().all()

            for p in projects:
                if p.title and not p.title_telugu:
                    p.title_telugu = await translator.translate_to_telugu(p.title)
                if p.description and not p.description_telugu:
                    p.description_telugu = await translator.translate_to_telugu(p.description[:2000])
                p.is_translated = True
                translated += 1

            # Translate untranslated tenders (batch of 20)
            tenders = (await db.execute(
                select(Tender).where(Tender.is_translated == False).limit(20)
            )).scalars().all()

            for t in tenders:
                if t.title and not t.title_telugu:
                    t.title_telugu = await translator.translate_to_telugu(t.title)
                t.is_translated = True
                translated += 1

        logger.info(f"Batch translation: {translated} items translated")
        return translated

    count = run_async(_batch_translate())
    return {"translated": count}
