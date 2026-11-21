"""Domain exceptions. The HTTP layer decides how each one is reported to the client."""


class ApplicationNotFoundError(Exception):
    """The application does not exist or belongs to another user."""


class EmailAlreadyRegisteredError(Exception):
    """An account with this email already exists."""


class InvalidTokenError(Exception):
    """The access token is malformed, expired or badly signed."""
