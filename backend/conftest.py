import pytest


@pytest.fixture(scope="session")
def anyio_backend():
    # Silence anyio default backend selection issues in some environments.
    return "asyncio"
