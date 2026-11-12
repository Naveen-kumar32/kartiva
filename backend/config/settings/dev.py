from .base import *  # noqa: F401,F403

DEBUG = True

# Local development: browsing quickly fires many public calls (ads per slot etc.) — keep throttling loose.
REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"] = {"anon": "5000/min", "user": "10000/min", "auth": "100/min"}  # noqa: F405
