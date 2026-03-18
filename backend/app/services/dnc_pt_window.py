"""Pacific-time window when Five9 allows addNumbersToDnc (after hours)."""

from datetime import datetime
from zoneinfo import ZoneInfo

PT = ZoneInfo("America/Los_Angeles")

# Per Five9 docs: add to domain DNC is allowed 11:00 PM – 6:00 AM Pacific.


def is_dnc_add_allowed_now_pt(now: datetime | None = None) -> bool:
    """True if current Pacific time is in the maintenance window for DNC adds."""
    t = (now or datetime.now(tz=PT)).astimezone(PT)
    h = t.hour
    # 23:00–23:59 and 00:00–05:59 (treat 6:00 AM as end of window, exclusive)
    return h == 23 or 0 <= h < 6
