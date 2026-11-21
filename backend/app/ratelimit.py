"""Request throttling for the authentication endpoints.

Counters live in process memory, which is fine for a single instance. With several
instances, point slowapi at a shared store such as Redis.
"""

from slowapi import Limiter
from slowapi.util import get_remote_address

from app.config import get_settings

limiter = Limiter(key_func=get_remote_address, enabled=get_settings().rate_limit_enabled)
