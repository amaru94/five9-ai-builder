"""Background processing of queued DNC adds during Pacific after-hours window."""

import asyncio
import traceback

from app.core.config import get_settings
from app.core.logging import get_logger
from app.services import dnc_queue_store as store
from app.services.dnc_five9_soap import add_numbers_to_dnc
from app.services.dnc_pt_window import is_dnc_add_allowed_now_pt

logger = get_logger(__name__)

POLL_SECONDS = 90


async def dnc_queue_worker_loop() -> None:
    """Poll for pending jobs; run adds only when Pacific window allows."""
    store.init_db()
    while True:
        try:
            if is_dnc_add_allowed_now_pt():
                mocked = get_settings().execution_mode == "mocked"
                while True:
                    jobs = store.fetch_pending_add_jobs(limit=10)
                    if not jobs:
                        break
                    for job in jobs:
                        jid = job["id"]
                        numbers = job["numbers"]
                        store.mark_running(jid)
                        try:
                            add_numbers_to_dnc(numbers, mocked=mocked)
                            store.mark_completed(jid)
                            logger.info(
                                "dnc_job_completed",
                                extra={"job_id": jid, "count": len(numbers)},
                            )
                        except Exception as e:
                            logger.exception("dnc_job_failed", extra={"job_id": jid})
                            store.mark_failed(
                                jid,
                                f"{e}\n{traceback.format_exc()[:1500]}",
                            )
            await asyncio.sleep(POLL_SECONDS)
        except asyncio.CancelledError:
            break
        except Exception:
            logger.exception("dnc_worker_iteration_error")
            await asyncio.sleep(POLL_SECONDS)
