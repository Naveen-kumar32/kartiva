import json
import logging
from contextvars import ContextVar

request_id_var = ContextVar("request_id", default="-")


class JsonFormatter(logging.Formatter):
    """One JSON object per line (structured logging → journald / CloudWatch / Render logs)."""

    def format(self, record):
        out = {"level": record.levelname, "logger": record.name, "msg": record.getMessage(), "req_id": request_id_var.get(), "time": self.formatTime(record)}
        if record.exc_info:
            out["exc"] = self.formatException(record.exc_info)
        return json.dumps(out, ensure_ascii=False)
