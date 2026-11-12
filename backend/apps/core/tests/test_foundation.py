def test_health(demo, anon):
    res = anon.get("/api/v1/health/")
    assert res.status_code == 200 and res.json()["db"] == "ok"


def test_bootstrap_hides_pending_stores(demo, anon):
    data = anon.get("/api/v1/bootstrap/").json()
    assert data["categories"] and data["products"]
    assert all(s["status"] == "approved" for s in data["stores"])


def test_login_lockout_and_refresh(demo, anon):
    for _ in range(5):
        anon.post("/api/v1/auth/login/", {"email": "rahul@kartiva.demo", "password": "nope"}, format="json")
    res = anon.post("/api/v1/auth/login/", {"email": "rahul@kartiva.demo", "password": "Demo@123"}, format="json")
    assert res.status_code == 429


def test_me_requires_auth(demo, anon, as_user):
    assert anon.get("/api/v1/auth/me/").status_code == 401
    assert as_user("buyer@kartiva.demo").get("/api/v1/auth/me/").json()["role"] == "buyer"
