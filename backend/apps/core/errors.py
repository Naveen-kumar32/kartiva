"""Uniform API errors: every error response is {"detail": "..."} with a proper HTTP status (API docs §1)."""
import logging

from django.http import Http404
from rest_framework import status
from rest_framework.exceptions import APIException
from rest_framework.response import Response
from rest_framework.views import exception_handler as drf_handler

log = logging.getLogger("kartiva")


class ApiError(APIException):
    status_code = status.HTTP_400_BAD_REQUEST

    def __init__(self, detail, status_code=400):
        super().__init__(detail)
        self.status_code = status_code


def exception_handler(exc, context):
    if isinstance(exc, Http404):
        return Response({"detail": "Not found."}, status=404)
    response = drf_handler(exc, context)
    if response is None:
        log.exception("unhandled error", exc_info=exc)
        return Response({"detail": "Something went wrong. Please try again."}, status=500)
    data = response.data
    if isinstance(data, dict) and "detail" in data:
        response.data = {"detail": str(data["detail"])}
    elif isinstance(data, dict):
        first = next(iter(data.values()), "")
        response.data = {"detail": str(first[0] if isinstance(first, list) and first else first), "errors": data}
    elif isinstance(data, list):
        response.data = {"detail": str(data[0]) if data else "Invalid request."}
    return response
