from fastapi import APIRouter, Query
from datetime import datetime
from dateutil.relativedelta import relativedelta

router = APIRouter(prefix="/months", tags=["months"])

@router.get("")
async def get_months(limit: int = Query(36, ge=1, le=120)):
    """Return a list of months for dashboard charts."""
    today = datetime.today().replace(day=1)

    months = []
    for i in range(limit):
        dt = today - relativedelta(months=i)
        months.append({
            "year": dt.year,
            "month": dt.month,
            "label": dt.strftime("%b %Y")
        })

    return {"ok": True, "months": months}
