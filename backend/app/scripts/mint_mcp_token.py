"""Mint a personal MCP token from the command line (inside the backend container), e.g. to bootstrap automation:

    podman exec monolith_backend python -m app.scripts.mint_mcp_token --email you@example.com --name "Claude Code"

Prints only the token, so it can be captured straight into an environment variable.
"""
import argparse
import asyncio
import sys

from sqlalchemy import select


async def _main(email: str, name: str, days: int | None) -> int:
    from app import models  # noqa: F401  (register every mapper)
    from app.core.mcp_tokens import mint_token
    from app.db.session import AsyncSessionLocal, engine
    from app.models.user import User

    try:
        async with AsyncSessionLocal() as db:
            user = (await db.execute(select(User).where(User.email == email))).scalar_one_or_none()
            if not user or not user.is_active:
                print(f"No active user with e-mail {email}", file=sys.stderr)
                return 1
            _, raw = await mint_token(db, user, name, days)
            await db.commit()
        print(raw)
        return 0
    finally:
        await engine.dispose()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--email", required=True)
    parser.add_argument("--name", default="CLI token")
    parser.add_argument("--expires-in-days", type=int, default=None)
    args = parser.parse_args()
    sys.exit(asyncio.run(_main(args.email, args.name, args.expires_in_days)))


if __name__ == "__main__":
    main()
