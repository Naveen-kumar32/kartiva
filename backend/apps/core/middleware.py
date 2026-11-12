import uuid

from .logging import request_id_var


class RequestIdMiddleware:
    """Keeps the client's X-Request-ID (axios sends one) or makes one; echoed back and put on every log line."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        rid = request.headers.get("X-Request-ID") or uuid.uuid4().hex
        token = request_id_var.set(rid[:64])
        try:
            response = self.get_response(request)
        finally:
            request_id_var.reset(token)
        response["X-Request-ID"] = rid[:64]
        return response
