import json
from pathlib import Path

import pytest
from django.core.management import call_command
from rest_framework.test import APIClient


@pytest.fixture
def demo(db):
    """Fresh copy of the demo dataset for a test."""
    call_command("seed_demo", "--reset", verbosity=0)


def _client_for(email, password="Demo@123"):
    client = APIClient()
    res = client.post("/api/v1/auth/login/", {"email": email, "password": password}, format="json")
    assert res.status_code == 200, res.content
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {res.json()['access']}")
    return client


@pytest.fixture
def as_user():
    """as_user("seller@kartiva.demo") → authenticated APIClient."""
    return _client_for


@pytest.fixture
def anon():
    return APIClient()
